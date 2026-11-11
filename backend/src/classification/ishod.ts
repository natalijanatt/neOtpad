/**
 * Did the dispatcher agree with the proposal.
 *
 * This is the whole measurement story. The classifier writes a proposal, the
 * dispatcher decides independently, and the comparison happens once, at triage,
 * against the version the proposal was computed for. Nothing extra has to be
 * labelled by hand, and "how often is it right" stops being an opinion.
 *
 * Only `tip` and `tip_obrade` count. They are the two fields that decide which
 * service goes out; size and priority are refinements a dispatcher adjusts
 * routinely, and treating every tweak as a disagreement would bury the signal.
 */
import type { AppIshodKlasifikacije } from '../database/generated/schema';

export interface PredlogZaPoredjenje {
  predlozeni_tip: string | null;
  predlozeni_tip_obrade: string | null;
}

export interface OdlukaDispecera {
  /** False for a rejection or a duplicate: the report is closed, not categorised. */
  potvrdjena: boolean;
  tip: string;
  tip_obrade: string | null;
}

export function uporediSaOdlukom(predlog: PredlogZaPoredjenje, odluka: OdlukaDispecera): AppIshodKlasifikacije {
  if (!odluka.potvrdjena) return 'odbacena';
  return predlog.predlozeni_tip === odluka.tip && predlog.predlozeni_tip_obrade === odluka.tip_obrade
    ? 'prihvacena'
    : 'izmenjena';
}
