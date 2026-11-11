/**
 * Fill forecasting: the stored forecast and the freshness question that decides
 * when a new one is computed. The curve itself lives in `model/fill-model.ts`,
 * which knows nothing about the database.
 */
import type { Pouzdanost, SerijaTacka } from './model/fill-model';

/** A row of `prognoza_punjenja` with the storage encodings off. */
export interface Prognoza {
  id: string;
  kontejner_id: string;
  izracunata_at: Date;
  horizont_do: Date;
  /** Last reading that fed it. A forecast older than the data is a stale forecast. */
  ulazni_podaci_do: Date;
  serija: SerijaTacka[];
  vreme_kriticnog: Date | null;
  ima_rupu: boolean;
  model_verzija: string;
  pouzdanost: Pouzdanost;
}

/**
 * What is known about one container without reading its history: when it last
 * reported, when it was last emptied, and what its newest forecast already
 * covers. Enough to decide whether that forecast still stands.
 */
export interface Svezina {
  kontejner_id: string;
  poslednje_ocitavanje: Date | null;
  poslednje_praznjenje: Date | null;
  izracunata_at: Date | null;
  ulazni_podaci_do: Date | null;
}

/** A forecast older than this is recomputed even when nothing new arrived. */
export const MAX_STAROST_SATI = 12;

/**
 * How far back the model reads. The generated history covers 45 days
 * (`docs/sensor-telemetry.md`), which at a weekly collection cycle is around six
 * closed cycles — exactly what the historical median wants.
 */
export const ISTORIJSKI_PROZOR_DANA = 45;

/**
 * Does this container need a new forecast?
 *
 * The emptying check is the one that matters most: an emptying resets the curve,
 * so a forecast computed before it is not merely old, it describes a container
 * that no longer exists. The others are ordinary staleness.
 */
export function jeZastarela(s: Svezina, sada: Date, maxStarostSati = MAX_STAROST_SATI): boolean {
  if (s.izracunata_at === null) return true;

  const izracunata = s.izracunata_at.getTime();
  if (s.poslednje_praznjenje !== null && s.poslednje_praznjenje.getTime() > izracunata) return true;
  if (
    s.poslednje_ocitavanje !== null &&
    (s.ulazni_podaci_do === null || s.poslednje_ocitavanje.getTime() > s.ulazni_podaci_do.getTime())
  ) {
    return true;
  }

  return sada.getTime() - izracunata > maxStarostSati * 3_600_000;
}
