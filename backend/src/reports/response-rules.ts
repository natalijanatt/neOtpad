/**
 * Which response may answer which problem.
 *
 * Extracted from `ReportsService` because it now has a second caller: the
 * automatic classifier proposes a `tip_obrade`, and a proposal the dispatcher
 * could not have saved is worse than no proposal — it would be offered, clicked
 * and rejected by the API. One function, so the two can never drift apart.
 *
 * Pure on purpose: no DI, no database, no exceptions. The caller decides whether
 * a violation is a 400 (staff triage) or a reason to fall back to
 * `provera_lokacije` (the classifier).
 */
import type { AppTipPrijave, AppVelicinaProblema } from '../database/generated/schema';
import type { ResponseType } from './vocabulary';

export interface OdgovorUlaz {
  tip: AppTipPrijave;
  velicina: AppVelicinaProblema | null;
  /** A `kontejner_id` is set — the report names a specific bin. */
  imaKontejner: boolean;
  /** Coordinates, a container or written directions: enough for a crew to find it. */
  imaLokaciju: boolean;
}

/** The problems a collection round can answer at all. */
export const ODVOZ_TIPOVI: readonly AppTipPrijave[] = ['pun_kontejner', 'prelivanje'];
export const CISCENJE_TIPOVI: readonly AppTipPrijave[] = ['divlja_deponija', 'prelivanje', 'drugo'];
export const ODRZAVANJE_TIPOVI: readonly AppTipPrijave[] = ['ostecen_kontejner', 'nedostaje_kontejner', 'drugo'];

/** Null when the pairing is allowed; otherwise the reason it is not. */
export function proveriOdgovor(odgovor: ResponseType, ulaz: OdgovorUlaz): string | null {
  // Verification is the answer *for* an unusable location, so it is the one
  // response that may be chosen before anybody knows where the problem is.
  if (odgovor === 'provera_lokacije') return null;

  if (!ulaz.imaLokaciju) return 'Location must be actionable or assigned for verification';

  if (odgovor === 'odvoz' && (!ODVOZ_TIPOVI.includes(ulaz.tip) || !ulaz.imaKontejner || ulaz.velicina === 'velika')) {
    return 'Collection requires a known full/overflowing container and cannot handle large problems';
  }
  if (odgovor === 'ciscenje' && !CISCENJE_TIPOVI.includes(ulaz.tip)) return 'Clean-up does not match this problem';
  if (odgovor === 'odrzavanje' && !ODRZAVANJE_TIPOVI.includes(ulaz.tip)) return 'Maintenance does not match this problem';

  return null;
}
