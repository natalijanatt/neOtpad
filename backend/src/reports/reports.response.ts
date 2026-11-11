import type { Selectable } from 'kysely';
import type { DB } from '../database/generated/schema';
import { fromPoint } from '../common/geo';
import { toInstant, toInstantOrNull, toNumberOrNull } from '../common/row-values';
import type { PhotoDto, ReportResponseDto, ReportStatus, ResponseType } from './dto/reports.dto';

export function reportResponse(row: Selectable<DB['app.prijava']>): ReportResponseDto {
  return {
    id: row.id,
    kratki_kod: row.kratki_kod,
    kanal: row.kanal,
    tip: row.tip,
    opis: row.opis,
    tacka: fromPoint(row.tacka),
    naselje_id: row.naselje_id,
    kontejner_id: row.kontejner_id,
    kanonska_id: row.kanonska_id,
    posrednik_id: row.posrednik_id,
    opis_lokacije: row.opis_lokacije,
    preciznost_lokacije: row.preciznost_lokacije,
    velicina: row.velicina,
    status: row.status as ReportStatus,
    tip_obrade: row.tip_obrade as ResponseType | null,
    prioritet: toNumberOrNull(row.prioritet),
    duplikat_od: row.duplikat_od,
    verzija: row.verzija,
    primljena_at: toInstant(row.primljena_at).toISOString(),
    azurirana_at: toInstant(row.azurirana_at).toISOString(),
    potvrdjena_at: row.potvrdjena_at === null ? null : toInstant(row.potvrdjena_at).toISOString(),
    resena_at: row.resena_at === null ? null : toInstant(row.resena_at).toISOString(),
  };
}

export function photoResponse(row: Selectable<DB['app.prijava_foto']>): PhotoDto {
  return {
    id: row.id,
    // The stored URL is served as-is. It was built once, at upload, from the
    // bucket configured then -- rebuilding it here from the current bucket would
    // silently repoint every historical photo the day that setting changes.
    javni_url: row.javni_url,
    mime_tip: row.mime_tip,
    velicina_bajt: row.velicina_bajt,
    snimljeno_at: toInstantOrNull(row.snimljeno_at)?.toISOString() ?? null,
    otpremljena_at: toInstant(row.otpremljena_at).toISOString(),
  };
}
