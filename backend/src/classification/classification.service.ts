/**
 * Turning an incoming report into a proposal a dispatcher can act on.
 *
 * Three things happen here that the classifier itself must not be trusted with:
 * the context is assembled from the database (a model that is told nothing
 * guesses), identifiers are checked against the candidates that were actually
 * offered, and the proposed response is re-validated against
 * `reports/response-rules.ts`. A proposal the dispatcher could not have saved is
 * worse than none - it gets offered, clicked, and rejected by the API.
 */
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Selectable } from 'kysely';
import { fromPoint } from '../common/geo';
import type { DB, Json } from '../database/generated/schema';
import { proveriOdgovor } from '../reports/response-rules';
import { KLASIFIKATOR, type ClassifierPort, type KlasifikacijaPredlog, type KlasifikacijaUlaz } from './classifier.port';
import { ClassificationRepository, type KlasifikacijaRed, type PreuzetRed } from './classification.repository';
import { RuleClassifier } from './rule.classifier';

type PrijavaRed = Selectable<DB['app.prijava']>;

/** What the proposal was grounded in. Written by the API, never by the model. */
export interface Signali {
  najblizi_kontejner_id: string | null;
  najblizi_kontejner_m: number | null;
  najblizi_kontejner_punjenje: number | null;
  broj_kandidata_kontejnera: number;
  pokrivenost: string | null;
  crna_tacka_m: number | null;
  kanonska_deponija_m: number | null;
  broj_fotografija: number;
  kandidata_za_duplikat: number;
}

export interface ObradaRezultat {
  obradjeno: number;
  uspesno: number;
  odlozeno: number;
  /** The report moved on before its turn came: neither a success nor a failure. */
  zastarelo: number;
  neuspesno: number;
}

/**
 * A container further than this from the report is not silently adopted as its
 * subject. Inside it, one candidate is "the container in the photograph";
 * outside, choosing one would invent the fact that routing then acts on.
 */
const PRIHVATLJIVO_RASTOJANJE_M = 30;

@Injectable()
export class ClassificationService {
  private readonly logger = new Logger(ClassificationService.name);
  private readonly maxPokusaja: number;

  constructor(
    private readonly repository: ClassificationRepository,
    @Inject(KLASIFIKATOR) private readonly klasifikator: ClassifierPort,
    /** Always the rule classifier, even when it is also the primary one: the last attempt must answer. */
    private readonly rezervni: RuleClassifier,
    private readonly config: ConfigService,
  ) {
    this.maxPokusaja = this.config.get<number>('CLASSIFY_MAX_ATTEMPTS', 3);
  }

  /** One sweep of the queue. Returns counts so the runner and the CLI can report them. */
  async obradiRed(limit: number): Promise<ObradaRezultat> {
    const redovi = await this.repository.preuzmi(limit);
    const rezultat: ObradaRezultat = { obradjeno: 0, uspesno: 0, odlozeno: 0, zastarelo: 0, neuspesno: 0 };

    for (const red of redovi) {
      rezultat.obradjeno += 1;
      const ishod = await this.obradi(red, red.pokusaj >= this.maxPokusaja);
      rezultat[ishod] += 1;
    }

    return rezultat;
  }

  /**
   * Classifies one report now and returns the proposal.
   *
   * The dispatcher's "reclassify" button. Final on the first attempt on purpose:
   * somebody is waiting for the answer, so a failed model call falls straight
   * through to the rules rather than leaving a spinner and a pending row.
   */
  async klasifikujSada(prijavaId: string): Promise<KlasifikacijaRed> {
    const prijava = await this.repository.prijava(prijavaId);
    if (!prijava) throw new NotFoundException('Report not found');

    const id = await this.repository.postaviURed(prijavaId, prijava.verzija);
    // Claim it the way the worker would. Without this, both could be
    // classifying the same row: two model calls and two writes for one answer.
    if (await this.repository.preuzmiJedan(id)) {
      await this.obradi({ id, prijava_id: prijavaId, prijava_verzija: prijava.verzija, pokusaj: 1 }, true);
    }

    const redovi = await this.repository.zaPrijave([prijavaId]);
    const red = redovi.find((kandidat) => kandidat.id === id);
    if (!red) throw new NotFoundException('Classification disappeared during processing');
    return red;
  }

  private async obradi(red: PreuzetRed, konacni: boolean): Promise<'uspesno' | 'odlozeno' | 'zastarelo' | 'neuspesno'> {
    const prijava = await this.repository.prijava(red.prijava_id);
    if (!prijava) {
      await this.repository.upisiGresku(red.id, 'Prijava vise ne postoji', true);
      return 'neuspesno';
    }
    // The dispatcher edited the report while this row waited. Its proposal would
    // describe content that is no longer on screen, which is worse than silence.
    if (prijava.verzija !== red.prijava_verzija) {
      await this.repository.oznaciZastarele(prijava.id, prijava.verzija);
      return 'zastarelo';
    }

    const { ulaz, signali } = await this.ulaz(prijava);

    try {
      const predlog = await this.klasifikator.klasifikuj(ulaz);
      await this.upisi(red.id, this.klasifikator, predlog, ulaz, signali, null);
      return 'uspesno';
    } catch (error) {
      const poruka = error instanceof Error ? error.message : String(error);
      this.logger.warn(`klasifikacija ${prijava.kratki_kod}: ${poruka}`);

      if (!konacni) {
        await this.repository.upisiGresku(red.id, poruka, false);
        return 'odlozeno';
      }

      // Last attempt: the queue resolves with the weaker classifier rather than
      // leaving the dispatcher with nothing and the SMS path with no `tip`.
      try {
        const predlog = await this.rezervni.klasifikuj(ulaz);
        await this.upisi(red.id, this.rezervni, predlog, ulaz, signali, poruka);
        return 'uspesno';
      } catch (rezervnaGreska) {
        const detalj = rezervnaGreska instanceof Error ? rezervnaGreska.message : String(rezervnaGreska);
        await this.repository.upisiGresku(red.id, `${poruka} | rezervni: ${detalj}`, true);
        return 'neuspesno';
      }
    }
  }

  /** Assembles the report, its photos and the surroundings a dispatcher would look up. */
  private async ulaz(prijava: PrijavaRed): Promise<{ ulaz: KlasifikacijaUlaz; signali: Signali }> {
    const tacka = fromPoint(prijava.tacka);
    const [fotografije, naselje, kontejneri, crnaTackaM, deponijaM, duplikati] = await Promise.all([
      this.repository.fotografije(prijava.id),
      prijava.naselje_id ? this.repository.naselje(prijava.naselje_id) : Promise.resolve(undefined),
      this.repository.kandidatiKontejneri(prijava.kontejner_id, tacka, prijava.naselje_id),
      this.repository.rastojanjeDoCrneTacke(tacka),
      this.repository.rastojanjeDoDeponije(tacka),
      this.repository.kandidatiDuplikati(prijava.id, tacka, prijava.naselje_id),
    ]);

    const najblizi = kontejneri[0] ?? null;

    return {
      ulaz: {
        prijava: {
          kratki_kod: prijava.kratki_kod,
          kanal: prijava.kanal,
          tip: prijava.tip,
          opis: prijava.opis,
          opis_lokacije: prijava.opis_lokacije,
          velicina: prijava.velicina,
          preciznost_lokacije: prijava.preciznost_lokacije,
          tacka,
          kontejner_id: prijava.kontejner_id,
        },
        fotografije,
        kontekst: {
          naselje: naselje ? { naziv: naselje.naziv, pokrivenost: naselje.organizovano_prikupljanje } : null,
          kontejneri,
          duplikati,
          crna_tacka_m: crnaTackaM,
          kanonska_deponija_m: deponijaM,
        },
      },
      signali: {
        najblizi_kontejner_id: najblizi?.id ?? null,
        najblizi_kontejner_m: najblizi?.rastojanje_m ?? null,
        najblizi_kontejner_punjenje: najblizi?.punjenje_percent ?? null,
        broj_kandidata_kontejnera: kontejneri.length,
        pokrivenost: naselje?.organizovano_prikupljanje ?? null,
        crna_tacka_m: crnaTackaM,
        kanonska_deponija_m: deponijaM,
        broj_fotografija: fotografije.length,
        kandidata_za_duplikat: duplikati.length,
      },
    };
  }

  private async upisi(
    id: string,
    klasifikator: ClassifierPort,
    sirov: KlasifikacijaPredlog,
    ulaz: KlasifikacijaUlaz,
    signali: Signali,
    greska: string | null,
  ): Promise<void> {
    const predlog = this.uskladi(sirov, ulaz);
    await this.repository.upisiRezultat(id, {
      izvor: klasifikator.izvor,
      model: klasifikator.model,
      predlozeni_tip: predlog.tip,
      predlozena_podkategorija: predlog.podkategorija,
      predlozena_velicina: predlog.velicina,
      predlozeni_tip_obrade: predlog.tip_obrade,
      predlozeni_prioritet: predlog.prioritet,
      predlozeni_kontejner_id: predlog.kontejner_id,
      predlozeni_duplikat_od: predlog.duplikat_od,
      pouzdanost: predlog.pouzdanost,
      obrazlozenje: predlog.obrazlozenje,
      signali: signali as unknown as Json,
      // Kept even on success: "the model timed out and the rules answered" is
      // the difference between a 0.5 proposal and a broken integration.
      greska,
    });
  }

  /**
   * The proposal, made safe.
   *
   * Everything the classifier returns is treated as a claim to be checked: an
   * identifier it did not get from us is dropped, and a response the API would
   * refuse becomes `provera_lokacije` - which is exactly what a dispatcher does
   * when they cannot tell either.
   */
  uskladi(predlog: KlasifikacijaPredlog, ulaz: KlasifikacijaUlaz): KlasifikacijaPredlog {
    const napomene: string[] = [];

    let kontejnerId = ulaz.kontekst.kontejneri.some((kandidat) => kandidat.id === predlog.kontejner_id)
      ? predlog.kontejner_id
      : null;
    if (predlog.kontejner_id && !kontejnerId) napomene.push('Predlozeni kontejner nije bio medju ponudjenima i zanemaren je.');

    const duplikatOd = ulaz.kontekst.duplikati.some((kandidat) => kandidat.id === predlog.duplikat_od)
      ? predlog.duplikat_od
      : null;

    // A collection round needs a bin. When the report already names one, that is
    // the answer; otherwise a single candidate standing right there may be
    // adopted, and anything vaguer may not.
    if (predlog.tip_obrade === 'odvoz' && !kontejnerId) {
      const jedini = ulaz.kontekst.kontejneri.length === 1 ? ulaz.kontekst.kontejneri[0] : null;
      if (ulaz.prijava.kontejner_id) kontejnerId = ulaz.prijava.kontejner_id;
      else if (jedini && jedini.rastojanje_m !== null && jedini.rastojanje_m <= PRIHVATLJIVO_RASTOJANJE_M) kontejnerId = jedini.id;
    }

    let tipObrade = predlog.tip_obrade;
    const greska = proveriOdgovor(tipObrade, {
      tip: predlog.tip,
      velicina: predlog.velicina,
      imaKontejner: Boolean(kontejnerId ?? ulaz.prijava.kontejner_id),
      imaLokaciju: Boolean(ulaz.prijava.tacka || kontejnerId || ulaz.prijava.kontejner_id || ulaz.prijava.opis_lokacije),
    });
    if (greska) {
      tipObrade = 'provera_lokacije';
      napomene.push(`Predlozena obrada nije dozvoljena (${greska}); prebaceno na proveru lokacije.`);
    }

    return {
      ...predlog,
      kontejner_id: kontejnerId,
      duplikat_od: duplikatOd,
      tip_obrade: tipObrade,
      prioritet: Math.min(5, Math.max(1, Math.round(predlog.prioritet))),
      // A corrected proposal is by definition one the classifier got partly
      // wrong, and the number a dispatcher reads has to say so.
      pouzdanost: napomene.length === 0
        ? Math.min(1, Math.max(0, predlog.pouzdanost))
        : Math.min(0.5, Math.max(0, predlog.pouzdanost)),
      obrazlozenje: [predlog.obrazlozenje, ...napomene].filter(Boolean).join(' ').slice(0, 1000),
    };
  }
}
