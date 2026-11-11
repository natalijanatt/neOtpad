import { Injectable, Logger } from '@nestjs/common';
import { ISTORIJSKI_PROZOR_DANA, jeZastarela, type Prognoza } from './forecasting.model';
import { stanjePouzdano, toFaktor, toPrognoza, toSvezina } from './forecasting.mapper';
import {
  ForecastingRepository,
  type NovaPrognoza,
  type OcitavanjeRow,
  type PraznjenjeRow,
} from './forecasting.repository';
import { prognozaOf, type Ciklus, type KalendarskiFaktor, type Merenje } from './model/fill-model';

const DAY_MS = 86_400_000;

/**
 * Containers per pass. The readings query is the expensive one — 45 days at a
 * six-hour cadence is ~180 rows per container — so it runs in batches rather
 * than pulling the whole fleet's history into one result set.
 */
const SERIJA_KONTEJNERA = 50;

export interface IzracunRezultat {
  /** Containers that were looked at. */
  razmatrano: number;
  /** Forecasts written. Lower than `razmatrano`: some containers have nothing to forecast from. */
  upisano: number;
  /** Of those, how many reach the critical level within 48 h — the line worth logging. */
  kriticnoU48h: number;
}

@Injectable()
export class ForecastingService {
  private readonly logger = new Logger(ForecastingService.name);

  constructor(private readonly repository: ForecastingRepository) {}

  /**
   * Recompute every container whose forecast no longer stands. Called before
   * route planning and by the nightly runner; on a freshly reset database the
   * first call does the whole fleet, afterwards usually a handful or none.
   */
  async osveziZastarele(sada = new Date()): Promise<IzracunRezultat> {
    const svezina = (await this.repository.svezina()).map(toSvezina);
    const zastareli = svezina.filter((s) => jeZastarela(s, sada)).map((s) => s.kontejner_id);

    return this.izracunaj(zastareli, sada);
  }

  /** Recompute the whole sensored fleet regardless of freshness. */
  async osveziSve(sada = new Date()): Promise<IzracunRezultat> {
    const svezina = await this.repository.svezina();

    return this.izracunaj(
      svezina.map((s) => s.kontejner_id),
      sada,
    );
  }

  async poslednja(kontejnerId: string): Promise<Prognoza | null> {
    const row = await this.repository.poslednja(kontejnerId);

    return row === undefined ? null : toPrognoza(row);
  }

  async kontejnerPostoji(kontejnerId: string): Promise<boolean> {
    return this.repository.postoji(kontejnerId);
  }

  private async izracunaj(kontejnerIds: string[], sada: Date): Promise<IzracunRezultat> {
    const rezultat: IzracunRezultat = { razmatrano: kontejnerIds.length, upisano: 0, kriticnoU48h: 0 };
    if (kontejnerIds.length === 0) return rezultat;

    const od = new Date(sada.getTime() - ISTORIJSKI_PROZOR_DANA * DAY_MS);
    // The horizon is the same for every container in the pass, so the calendar
    // is read once rather than per batch.
    const dogadjaji = await this.repository.dogadjaji(od, new Date(sada.getTime() + 8 * DAY_MS));

    for (let i = 0; i < kontejnerIds.length; i += SERIJA_KONTEJNERA) {
      const grupa = kontejnerIds.slice(i, i + SERIJA_KONTEJNERA);
      const [ocitavanja, praznjenja, stanja, pripadnost] = await Promise.all([
        this.repository.ocitavanja(grupa, od),
        this.repository.praznjenja(grupa, od),
        this.repository.stanja(grupa),
        this.repository.pripadnost(grupa),
      ]);

      const poKontejneru = grupisi(ocitavanja, praznjenja);
      const stanjePo = new Map(stanja.map((s) => [s.kontejner_id, s]));
      const pripadnostPo = new Map(pripadnost.map((p) => [p.kontejner_id, p]));
      const nove: NovaPrognoza[] = [];

      for (const kontejnerId of grupa) {
        const podaci = poKontejneru.get(kontejnerId);
        if (podaci === undefined) continue;

        const mesto = pripadnostPo.get(kontejnerId);
        const faktori: KalendarskiFaktor[] = dogadjaji
          .filter(
            (d) =>
              (d.naselje_id === null && d.mesna_zajednica_id === null) ||
              (mesto !== undefined && d.naselje_id === mesto.naselje_id) ||
              (mesto !== undefined && d.mesna_zajednica_id !== null && d.mesna_zajednica_id === mesto.mesna_zajednica_id),
          )
          .map(toFaktor);

        const prognoza = prognozaOf({
          sada,
          ciklusi: podaci,
          faktori,
          stanjePouzdano: stanjePouzdano(stanjePo.get(kontejnerId)),
        });
        if (prognoza === null) continue;

        nove.push({
          kontejner_id: kontejnerId,
          izracunata_at: sada,
          horizont_do: prognoza.horizontDo,
          ulazni_podaci_do: prognoza.ulazniPodaciDo,
          serija: prognoza.serija,
          vreme_kriticnog: prognoza.vremeKriticnog,
          ima_rupu: prognoza.imaRupu,
          model_verzija: prognoza.modelVerzija,
          pouzdanost: prognoza.pouzdanost,
        });

        if (
          prognoza.vremeKriticnog !== null &&
          prognoza.vremeKriticnog.getTime() - sada.getTime() <= 48 * 3_600_000
        ) {
          rezultat.kriticnoU48h += 1;
        }
      }

      await this.repository.upisi(nove);
      rezultat.upisano += nove.length;
    }

    this.logger.log(
      `prognoza: ${rezultat.upisano}/${rezultat.razmatrano} kontejnera, kriticno u 48h: ${rezultat.kriticnoU48h}`,
    );

    return rezultat;
  }
}

/**
 * Readings cut into cycles at each emptying.
 *
 * The emptying is the reset point of the curve, and the reading that reports it
 * already shows the container empty — the generator writes `orientation =
 * 'emptying'` on the step that follows the collection — so a reading at or after
 * an emptying belongs to the new cycle.
 */
export function grupisi(ocitavanja: OcitavanjeRow[], praznjenja: PraznjenjeRow[]): Map<string, Ciklus[]> {
  const merenjaPo = new Map<string, Merenje[]>();
  for (const o of ocitavanja) {
    const lista = merenjaPo.get(o.kontejner_id) ?? [];
    lista.push({ at: new Date(o.measured_at), fillPercent: o.fill_percent_izracunat });
    merenjaPo.set(o.kontejner_id, lista);
  }

  const granicePo = new Map<string, Date[]>();
  for (const p of praznjenja) {
    const lista = granicePo.get(p.kontejner_id) ?? [];
    lista.push(new Date(p.detektovano_at));
    granicePo.set(p.kontejner_id, lista);
  }

  const rezultat = new Map<string, Ciklus[]>();

  for (const [kontejnerId, merenja] of merenjaPo) {
    merenja.sort((a, b) => a.at.getTime() - b.at.getTime());
    const granice = (granicePo.get(kontejnerId) ?? []).sort((a, b) => a.getTime() - b.getTime());

    // The first cycle starts at the window edge rather than at an emptying: it
    // is a partial cycle, and a partial cycle still has a slope.
    const pocetci = [merenja[0].at, ...granice.filter((g) => g > merenja[0].at)];
    const ciklusi: Ciklus[] = pocetci.map((pocetak, i) => ({
      pocetak,
      kraj: i + 1 < pocetci.length ? pocetci[i + 1] : null,
      merenja: [],
    }));

    let idx = 0;
    for (const m of merenja) {
      while (idx + 1 < ciklusi.length && m.at >= ciklusi[idx + 1].pocetak) idx += 1;
      ciklusi[idx].merenja.push(m);
    }

    rezultat.set(
      kontejnerId,
      ciklusi.filter((c) => c.merenja.length > 0),
    );
  }

  return rezultat;
}
