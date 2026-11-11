/**
 * The closed vocabularies of the report workflow.
 *
 * Their own file because both the report DTOs and the classification DTOs need
 * them, and importing one DTO module from the other is a cycle that survives
 * type-checking and then fails at runtime: decorators evaluate at module load,
 * so a half-initialised enum array becomes `undefined` in an `@ApiProperty`.
 *
 * Values only. Anything with a decorator on it belongs in a DTO.
 */
import type { AppTipPrijave } from '../database/generated/schema';

export const REPORT_TYPES: AppTipPrijave[] = ['pun_kontejner', 'prelivanje', 'divlja_deponija', 'ostecen_kontejner', 'nedostaje_kontejner', 'drugo'];
export const REPORT_STATUSES = ['nova', 'potvrdjena', 'odbijena', 'duplikat', 'resena'] as const;
export const RESPONSE_TYPES = ['odvoz', 'ciscenje', 'odrzavanje', 'provera_lokacije'] as const;

export type ReportStatus = typeof REPORT_STATUSES[number];
export type ResponseType = typeof RESPONSE_TYPES[number];
