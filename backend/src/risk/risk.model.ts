/**
 * Risk, black spots and the clean-up actions they produce.
 *
 * The product claim is that cost optimisation and the ecological goal are one
 * objective. That only holds if a score can be explained, which is why
 * `komponente` is part of the model and not a debugging detail: a village that
 * outranks a closer one has to be able to show why.
 */
import type { Tacka } from '../common/geo';
import type { AppSubjekatRizika } from '../database/generated/schema';

/**
 * Every contributing term of a score, keyed by name — overflow forecast,
 * recurrence history, coverage gap, confirmed reports. Kept open rather than
 * enumerated: the weights are admitted to be unvalidated (`docs/backend-
 * architecture.md`, open questions), so terms will come and go before they settle.
 */
export type RizikKomponente = Record<string, number>;

export interface Rizik {
  id: string;
  subjekat_tip: AppSubjekatRizika;
  /** The id of a container, collection point, canonical dump or settlement. */
  subjekat_id: string;
  izracunato_at: Date;
  skor: number;
  komponente: RizikKomponente;
  /** nizak | srednji | visok | crna_tacka. */
  klasifikacija: string;
}

/**
 * A recurring location, and what to do about it. The LPUO finding that a cleared
 * site refills unless a container is placed is exactly the `dodati_kontejner`
 * recommendation — so a black spot carries an action, never only a colour on a map.
 */
export interface CrnaTacka {
  id: string;
  naselje_id: string | null;
  tacka: Tacka | null;
  kanonska_id: string | null;
  prvi_put: string | null;
  poslednji_put: string | null;
  broj_ponavljanja: number;
  /** cesci_odvoz | dodati_kontejner | premestiti_kontejner | akcija_ciscenja. */
  preporuka: string;
  /** Why this recommendation, in words a dispatcher can argue with. */
  obrazlozenje: string;
  status: string;
  sprovedeno_at: Date | null;
}

/**
 * A clean-up. An action followed by a later observation at the same spot is how
 * the system measures whether its own recommendation worked.
 */
export interface AkcijaCiscenja {
  id: string;
  kanonska_id: string | null;
  mesna_zajednica_id: string | null;
  datum: string;
  organizator: string | null;
  broj_ucesnika: number | null;
  uklonjeno_t: number | null;
  /** Machinery was needed — the difference between a volunteer day and a works order. */
  mehanizacija: boolean;
  status: string;
}
