/**
 * LoRaWAN units and where each one is currently mounted.
 *
 * Identity belongs to the container, not to the device: a swapped unit must
 * leave the container's fill history intact, so the device is an attachment with
 * a validity period rather than a column on `kontejner`.
 */

export interface Uredjaj {
  id: string;
  /** LoRaWAN device identity; the join key for anything the network server sends. */
  dev_eui: string;
  model: string | null;
  proizvodjac: string | null;
  aktiviran: string | null;
  status: string;
}

/**
 * One mounting of one device on one container. Overlaps are impossible by
 * constraint, in both directions, which is what makes "which container did this
 * reading belong to at `measured_at`" a question with exactly one answer.
 */
export interface UredjajMontaza {
  id: string;
  uredjaj_id: string;
  kontejner_id: string;
  /**
   * Lives here and not on `kontejner`: fill % is computed from the depth
   * configured on this unit, so correcting a mis-entered depth is a new mounting
   * and a recompute of that window, never an edit that rewrites history.
   */
  konfigurisana_dubina_cm: number;
  montiran_od: Date;
  /** Null while the device is still on the container. */
  montiran_do: Date | null;
}
