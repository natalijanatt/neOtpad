/**
 * The settlement layer as the rest of the system talks about it.
 *
 * These are the row types with the database's own encodings taken off: a
 * coordinate instead of an EWKB string, a number instead of the string `pg`
 * delivers for `numeric`, a `YYYY-MM-DD` instead of a `Date` sitting at local
 * midnight. Field names stay the column names, so a model field can still be
 * traced back to the CSV it came from (`docs/domain-glossary.md`, naming rule).
 *
 * They are not DTOs: a model may carry anything a service needs, while the
 * contract only ever shows what a DTO declares (`api-use-dto-serialization`).
 */
import type { Tacka } from '../common/geo';
import type { AppTipOtpada, AppTrojstvo } from '../database/generated/schema';

export interface MesnaZajednica {
  id: string;
  naziv: string;
  opstina: string;
}

export interface Naselje {
  id: string;
  naziv: string;
  /** SEPA place code; the registry publishes one for five of the 72 settlements. */
  sifra_mesta: string | null;
  mesna_zajednica_id: string | null;
  opstina: string;
  centroid: Tacka;
  broj_domacinstava: number | null;
  /** LPUO size class I/II/III/IV; the only size signal for 49 of the settlements. */
  kategorija_naselja: string | null;
  /**
   * Three-state on purpose. `nepoznato` means no source discussed collection
   * here, which is not the same as `ne` — and `ne` is the strongest predictor of
   * a dump in the whole dataset, so the two must never collapse.
   */
  organizovano_prikupljanje: AppTrojstvo;
  pristup_kamionu: string | null;
  udaljenost_od_baze_km: number | null;
}

/**
 * `naselje.granica` is deliberately absent: it is a polygon, and a mapper that
 * decoded it would be hiding a payload of a different order from every caller
 * that only wanted a settlement's name. Whoever renders borders selects it as
 * GeoJSON, in the one query that needs it.
 */

/** Coverage as a dated observation: a 2026 answer lands beside the 2018 one, not over it. */
export interface PokrivenostNaselja {
  id: string;
  naselje_id: string;
  izvor: string;
  izvor_url: string | null;
  godina: number;
  organizovano: AppTrojstvo;
  odvoz_nedeljno: number | null;
  broj_domacinstava: number | null;
  broj_stanovnika: number | null;
  broj_kontejnera_1100l: number | null;
  napomena: string | null;
}

/** `'selo sukovo'` → Sukovo. Import resolves through these; it never invents a settlement. */
export interface NaseljeAlias {
  id: string;
  naselje_id: string;
  alias: string;
  izvor: string;
}

/**
 * The published fixed schedule — the answer to "when does the truck come" for
 * settlements with no sensors, and the fallback whenever optimisation is
 * unavailable. A weekday alone is not the answer: the round is fortnightly, and
 * monthly for Selo Izvor and Selo Krupac, so the cycle and its anchor date are
 * part of the model.
 */
export interface PlanOdvoza {
  id: string;
  naselje_id: string;
  /** Street or part of a settlement; null covers the whole settlement. */
  zona: string | null;
  tip_otpada: AppTipOtpada;
  /** ISO weekday, 1 = Monday. */
  dan_u_nedelji: number;
  /** 7 | 14 | 21 | 28. */
  ciklus_dana: number;
  /** A known collection date the cycle counts from; required whenever it is not weekly. */
  referentni_datum: string | null;
  izvor: string | null;
  izvor_url: string | null;
  vazi_od: string;
  vazi_do: string | null;
}
