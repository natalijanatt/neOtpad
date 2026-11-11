/**
 * The historical illegal-dump record: canonical sites, the source locations that
 * were merged into them, and the dated observations underneath both.
 *
 * `docs/data-sources.md` is the page these models exist to obey. The two traps
 * it names survive into the types: an unknown location is `tacka: null` with
 * `geo_preciznost: 'nepoznato'` and never a coordinate, and `broj_deponija`
 * makes every count derived from observations a lower bound.
 */
import type { Tacka } from '../common/geo';
import type {
  AppGeoPreciznost,
  AppPouzdanostSpajanja,
  AppTrojstvo,
} from '../database/generated/schema';

/** One real place, after the source rows describing it have been merged. */
export interface DeponijaKanonska {
  id: string;
  /** `K-01`: the identity the risk map and the UI quote. */
  kanonski_id: string;
  naziv: string | null;
  naselje_id: string | null;
  /**
   * Null exactly when `geo_preciznost` is `nepoznato`. A dump whose location was
   * never recorded must not be drawable, which is why the pair travels together
   * and is enforced as a constraint in the database.
   */
  tacka: Tacka | null;
  geo_preciznost: AppGeoPreciznost;
  prvi_put_zabelezena: number | null;
  poslednji_put_zabelezena: number | null;
  godine_evidentirana: number[];
  izvori: string[];
  broj_izvornih_redova: number;
  broj_opservacija: number;
  /** Recurrence after clean-up — the signal that turns a site into a black spot. */
  ponovo_se_stvara: AppTrojstvo;
  status: string | null;
  spajanje_pouzdanost: AppPouzdanostSpajanja | null;
}

/** One source row: a registry entry, a plan entry, a citizen-portal record. */
export interface DeponijaLokacija {
  id: string;
  /** `SEPA-01`: stable within its source, which is what makes re-import idempotent. */
  location_id: string;
  kanonska_id: string | null;
  naziv: string | null;
  naselje_id: string | null;
  tacka: Tacka | null;
  geo_preciznost: AppGeoPreciznost;
  katastarska_parcela: string | null;
  katastarska_opstina: string | null;
  prvi_put_zabelezena: number | null;
  poslednji_put_zabelezena: number | null;
  godine_evidentirana: number[];
  /** Registry prose, deliberately not the `tip_otpada` enum. */
  tip_otpada_opis: string | null;
  povrsina_m2: number | null;
  zapremina_m3: number | null;
  kolicina_t: number | null;
  ciscenja_godisnje: number | null;
  ociscena_datum: string | null;
  ponovo_se_stvara: AppTrojstvo;
  status: string | null;
  izvor: string;
  izvor_url: string | null;
  napomena: string | null;
  spajanje_pouzdanost: AppPouzdanostSpajanja | null;
  /** Verbatim: a `srednja` merge has to be explainable in the UI. */
  spajanje_razlog: string | null;
}

export interface DeponijaOpservacija {
  id: string;
  lokacija_id: string | null;
  kanonska_id: string | null;
  /** Often null: the registry gives a year and no day. */
  datum: string | null;
  godina: number;
  /** strateski_dokument | godisnja_evidencija | prijava | sanacija. */
  tip_dogadjaja: string;
  tacka: Tacka | null;
  povrsina_m2: number | null;
  zapremina_m3: number | null;
  kolicina_t: number | null;
  /**
   * "A dozen dumps near Izvor" is a single row. Any count summed from
   * observations is a lower bound, and this is the column that lets the UI say so.
   */
  broj_deponija: number;
  izvor: string;
  izvor_url: string | null;
  opis: string | null;
}

/**
 * The comparability group a source belongs to. The 2017/2018 break in the data
 * is methodological, not a trend, and an aggregation that ignores this draws one
 * confident line across two incompatible counting methods.
 */
export interface IzvornaSerija {
  id: string;
  izvor: string;
  godina_od: number;
  godina_do: number;
  grupa_uporedivosti: string;
  napomena: string;
}
