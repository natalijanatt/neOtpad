/**
 * Keyword classification, in Serbian.
 *
 * Not a stand-in for the model: it is what answers when there is no API key (CI,
 * a laptop with no network, a demo on conference wifi), and what answers after
 * the model has failed its retries. A dispatcher queue with no proposal at all
 * is the one outcome this feature cannot have, because then the SMS path has
 * nothing to put a `tip` on.
 *
 * It is honest about being weak: nothing here scores above 0.6, and
 * `docs/report-classification.md` sets the threshold under which a proposal is
 * advisory only.
 */
import { Injectable } from '@nestjs/common';
import type { AppPodkategorijaPrijave, AppTipPrijave, AppVelicinaProblema } from '../database/generated/schema';
import type { ResponseType } from '../reports/vocabulary';
import type { ClassifierPort, KlasifikacijaPredlog, KlasifikacijaUlaz } from './classifier.port';
import { normalizuj, sadrzi } from './text';

interface Pravilo {
  podkategorija: AppPodkategorijaPrijave;
  tip: AppTipPrijave;
  odgovor: ResponseType;
  prioritet: number;
  /** Forced when the category implies it - asbestos is never a "small" problem. */
  velicina?: AppVelicinaProblema;
  reci: readonly string[];
}

/**
 * Order matters: the first match wins, so the categories that route somewhere
 * unusual are tested before the generic ones. "gori kontejner" is a fire before
 * it is a container problem.
 */
const PRAVILA: readonly Pravilo[] = [
  {
    podkategorija: 'paljenje_otpada', tip: 'drugo', odgovor: 'ciscenje', prioritet: 1, velicina: 'srednja',
    reci: ['gori', 'zapalj', 'pozar', 'dim se', 'pale smece', 'pale otpad', 'zapalili'],
  },
  {
    podkategorija: 'opasan_otpad', tip: 'divlja_deponija', odgovor: 'ciscenje', prioritet: 1, velicina: 'srednja',
    reci: ['azbest', 'eternit', 'salonit', 'akumulator', 'motorno ulje', 'rastvarac', 'hemikalij',
      'medicinski otpad', 'sprice', 'ampule', 'lekovi', 'pesticid', 'boje i lakovi'],
  },
  {
    podkategorija: 'uginula_zivotinja', tip: 'drugo', odgovor: 'ciscenje', prioritet: 1,
    reci: ['uginul', 'lesina', 'strvina', 'mrtav pas', 'mrtva zivotinja', 'zivotinjski ostaci'],
  },
  {
    // Not the utility's job, but somebody still has to be told - today this ends
    // as `odbijena` and the citizen's problem simply disappears.
    podkategorija: 'van_nadleznosti', tip: 'drugo', odgovor: 'provera_lokacije', prioritet: 4,
    reci: ['fekal', 'kanalizacij', 'septick', 'ambrozij', 'rupa na putu', 'javna rasveta',
      'ulicna rasveta', 'sijalica', 'vodovod', 'pukla cev'],
  },
  {
    podkategorija: 'komunalni_otpad', tip: 'nedostaje_kontejner', odgovor: 'odrzavanje', prioritet: 2,
    reci: ['nema kontejner', 'nestao kontejner', 'odnet kontejner', 'ukraden kontejner', 'nema kante'],
  },
  {
    podkategorija: 'komunalni_otpad', tip: 'ostecen_kontejner', odgovor: 'odrzavanje', prioritet: 3,
    reci: ['polomljen', 'ostecen', 'probusen', 'razvaljen', 'nema poklopac', 'pokvaren',
      'izgoreo kontejner', 'tocak', 'prevrnut kontejner'],
  },
  {
    podkategorija: 'gradjevinski_sut', tip: 'divlja_deponija', odgovor: 'ciscenje', prioritet: 3, velicina: 'srednja',
    reci: ['sut', 'beton', 'cigl', 'crep', 'malter', 'gradjevinsk', 'sljunak', 'armatur'],
  },
  {
    podkategorija: 'kabasti_otpad', tip: 'divlja_deponija', odgovor: 'ciscenje', prioritet: 3, velicina: 'srednja',
    reci: ['kabast', 'namestaj', 'kauc', 'sofa', 'dusek', 'orman', 'sporet', 'frizider',
      'ves masina', 'bela tehnika', 'gume', 'sudopera'],
  },
  {
    podkategorija: 'zeleni_otpad', tip: 'divlja_deponija', odgovor: 'ciscenje', prioritet: 4,
    reci: ['grane', 'granje', 'lisce', 'pokosen', 'trava', 'basta', 'vinograd', 'kukuruzovin', 'seno'],
  },
  {
    podkategorija: 'komunalni_otpad', tip: 'divlja_deponija', odgovor: 'ciscenje', prioritet: 3, velicina: 'srednja',
    reci: ['deponij', 'smetliste', 'bacaju smece', 'izbacuju smece', 'pored puta', 'u potok',
      'u reku', 'u jarugu', 'nagomilan', 'gomila smeca'],
  },
  {
    podkategorija: 'komunalni_otpad', tip: 'prelivanje', odgovor: 'odvoz', prioritet: 2,
    reci: ['preliva', 'prepun', 'rasuto', 'oko kontejnera', 'pored kontejnera', 'ne moze da stane',
      'izlazi iz kontejnera', 'na zemlji oko'],
  },
  {
    podkategorija: 'komunalni_otpad', tip: 'pun_kontejner', odgovor: 'odvoz', prioritet: 3,
    reci: ['pun kontejner', 'kontejner je pun', 'kontejner pun', 'puna kanta', 'nije ispraznjen',
      'nisu odneli', 'ne dolaze', 'nisu dosli'],
  },
];

/** Words that override the size the citizen did or did not give. */
const VELIKO = ['ogromn', 'velika gomila', 'kamion', 'prikolic', 'tona', 'godinama', 'ceo plac'];
const MALO = ['par kesa', 'nekoliko kesa', 'jedna kesa', 'mala kolicina', 'sitno'];

/** Container-shaped problems default to no size at all; a dump is at least medium. */
const KONTEJNERSKI: readonly AppTipPrijave[] = ['pun_kontejner', 'prelivanje', 'ostecen_kontejner', 'nedostaje_kontejner'];

@Injectable()
export class RuleClassifier implements ClassifierPort {
  readonly izvor = 'pravila' as const;
  readonly model = 'pravila-v1';

  klasifikuj(ulaz: KlasifikacijaUlaz): Promise<KlasifikacijaPredlog> {
    const tekst = normalizuj([ulaz.prijava.opis, ulaz.prijava.opis_lokacije].filter(Boolean).join(' '));
    const pravilo = PRAVILA.find((kandidat) => sadrzi(tekst, kandidat.reci)) ?? null;

    const tip = pravilo?.tip ?? ulaz.prijava.tip;
    const velicina = this.velicina(tekst, pravilo?.velicina ?? ulaz.prijava.velicina ?? null, tip);

    return Promise.resolve({
      tip,
      podkategorija: pravilo?.podkategorija ?? this.podrazumevanaPodkategorija(tip),
      velicina,
      tip_obrade: pravilo?.odgovor ?? this.podrazumevaniOdgovor(tip),
      prioritet: pravilo?.prioritet ?? 3,
      // A rule has no way to tell which of several nearby bins the citizen meant,
      // so it only ever repeats the one the report already named. Picking the
      // nearest would fabricate a fact and send a truck to the wrong bin.
      kontejner_id: ulaz.prijava.kontejner_id,
      duplikat_od: null,
      pouzdanost: this.pouzdanost(pravilo, tekst, ulaz),
      obrazlozenje: pravilo
        ? `Prepoznato po kljucnim recima u opisu (${pravilo.podkategorija}). Bez modela, predlog je orijentacioni.`
        : 'Nema prepoznatih kljucnih reci; zadrzan tip koji je prijavio gradjanin. Predlog je orijentacioni.',
    });
  }

  private velicina(tekst: string, polazna: AppVelicinaProblema | null, tip: AppTipPrijave): AppVelicinaProblema | null {
    if (sadrzi(tekst, VELIKO)) return 'velika';
    if (sadrzi(tekst, MALO)) return 'mala';
    if (polazna) return polazna;
    // A dump with no stated size is not "small": a crew that arrives with the
    // wrong vehicle drives back empty, and that is the expensive failure here.
    return KONTEJNERSKI.includes(tip) ? null : 'srednja';
  }

  private podrazumevanaPodkategorija(tip: AppTipPrijave): AppPodkategorijaPrijave {
    return tip === 'drugo' ? 'nepoznato' : 'komunalni_otpad';
  }

  private podrazumevaniOdgovor(tip: AppTipPrijave): ResponseType {
    if (tip === 'pun_kontejner' || tip === 'prelivanje') return 'odvoz';
    if (tip === 'ostecen_kontejner' || tip === 'nedostaje_kontejner') return 'odrzavanje';
    if (tip === 'divlja_deponija') return 'ciscenje';
    return 'provera_lokacije';
  }

  /**
   * Deliberately capped below the model's range. 0.6 when a keyword matched and
   * the citizen's own type agrees, 0.5 for a bare keyword hit, and 0.25 with no
   * text at all - which is "I repeated the form, I did not classify anything".
   */
  private pouzdanost(pravilo: Pravilo | null, tekst: string, ulaz: KlasifikacijaUlaz): number {
    if (!pravilo) return tekst.length === 0 ? 0.25 : 0.3;
    return pravilo.tip === ulaz.prijava.tip ? 0.6 : 0.5;
  }
}
