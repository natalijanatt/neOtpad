/**
 * What the sensors say: one reading, the alarms a reading raises, and the
 * emptyings it reveals. Field names follow `docs/sensor-telemetry.md`, which
 * documents the payload in English and is therefore the source for these names.
 */
import type { AppOrijentacija, AppTipAlarma } from '../database/generated/schema';

export interface Ocitavanje {
  /**
   * `bigserial`, kept as a string: this is the largest table in the system and
   * the id passes what a double can hold exactly long before the hardware is
   * retired. Nothing sorts or computes on it.
   */
  id: string;
  uredjaj_id: string;
  /** Resolved at ingest through the mounting valid at `measured_at`. */
  kontejner_id: string;
  /** The device clock — the only timestamp that belongs on a fill curve. */
  measured_at: Date;
  /** When we got it. Store-and-forward means this can be hours later. */
  received_at: Date;
  distance_cm: number;
  /** As sent by the device, using the depth configured on that unit. */
  fill_percent: number | null;
  /**
   * Recomputed server-side from `distance_cm` and the mounting's configured
   * depth. This is what forecasting and routing read — and only where
   * `pouzdano`, because a blocked sensor reads as a full container.
   */
  fill_percent_izracunat: number | null;
  temperature_c: number | null;
  orientation: AppOrijentacija | null;
  battery_mv: number | null;
  battery_percent: number | null;
  /** A list: a unit can be dirty *and* low on battery in the same reading. */
  status: string[];
  rssi: number | null;
  snr: number | null;
  gateway_id: string | null;
  /**
   * Whether the measurement may be believed, derived in the database from
   * `status`. A diagnostic code outranks the measurement, so an unreliable
   * reading raises a maintenance task and never a routing priority.
   */
  pouzdano: boolean;
}

/**
 * `raw_payload` is deliberately absent. It exists so that a decoder bug can be
 * re-run against the original bytes; it is ingest's business, not the domain's,
 * and nothing downstream should be tempted to read a field out of it.
 */

export interface Alarm {
  id: string;
  kontejner_id: string | null;
  uredjaj_id: string | null;
  tip: AppTipAlarma;
  nastao_at: Date;
  potvrdjen_at: Date | null;
  zatvoren_at: Date | null;
  /** Lower is more urgent; `pozar` never waits for the nightly optimisation. */
  prioritet: number;
  detalji: unknown;
}

/**
 * Ground truth that a truck actually serviced the container, and the reset point
 * of every fill curve. Free, because the sensor reports `emptying` from tilt.
 */
export interface Praznjenje {
  id: string;
  kontejner_id: string;
  detektovano_at: Date;
  /** senzor_tilt | senzor_pad_nivoa | vozac | rucno. */
  izvor: string;
  /** Set when the emptying confirms a planned stop. */
  stajaliste_rute_id: string | null;
}
