/**
 * Collection points, the containers standing on them, and each container's
 * current state. Models, not DTOs — see `src/geo/geo.model.ts` for the rule.
 */
import type { Tacka } from '../common/geo';
import type { AppTipOtpada } from '../database/generated/schema';

/**
 * A place several households share, which is the unit the whole system senses:
 * `broj_domacinstava` is what makes one point outrank another when both are
 * predicted to overflow on the same day.
 */
export interface SabirnoMesto {
  id: string;
  naselje_id: string;
  naziv: string;
  lokacija: Tacka;
  broj_domacinstava: number | null;
  pristup: string | null;
  aktivno_od: string;
  aktivno_do: string | null;
}

export interface Kontejner {
  id: string;
  /** The label on the physical unit, e.g. `PI-KRU-004`. */
  oznaka: string;
  sabirno_mesto_id: string;
  tip_otpada: AppTipOtpada;
  zapremina_l: number;
  postavljen_datum: string;
  uklonjen_datum: string | null;
  status: string;
}

/**
 * One row per container, overwritten on ingest: what the map and the dashboard
 * read, so that nothing scans `ocitavanje` to answer "how full is it now".
 */
export interface KontejnerStanje {
  kontejner_id: string;
  /**
   * Null means no reliable reading, not an empty container. Together with
   * `tih_od` it is how the UI can show "no data" instead of a reassuring 0%.
   */
  fill_percent: number | null;
  measured_at: Date | null;
  /** Percentage points per day; the slope routing extrapolates from. */
  trend_pp_po_danu: number | null;
  baterija_percent: number | null;
  /** A list: one unit can be dirty *and* low on battery at the same time. */
  aktivni_status: string[];
  /** Since when the device has been silent. Prolonged silence is a data gap. */
  tih_od: Date | null;
  azurirano_at: Date;
}
