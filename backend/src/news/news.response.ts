import type { Selectable } from 'kysely';
import type { DB } from '../database/generated/schema';
import { toInstant } from '../common/row-values';
import type { NewsResponseDto } from './dto/news.dto';

/**
 * Row to response. `objavio_korisnik_id` is deliberately not here: the post is
 * signed by a service (`autor`), and which staff member typed it is internal
 * (`security-sanitize-output`).
 */
export function newsResponse(row: Selectable<DB['app.vest']>): NewsResponseDto {
  return {
    id: row.id,
    naslov: row.naslov,
    sadrzaj: row.sadrzaj,
    slika_url: row.slika_url,
    kategorija: row.kategorija,
    naselje_id: row.naselje_id,
    zakacena: row.zakacena,
    sms_tekst: row.sms_tekst,
    autor: row.autor,
    objavljena_at: toInstant(row.objavljena_at).toISOString(),
    azurirana_at: row.azurirana_at === null ? null : toInstant(row.azurirana_at).toISOString(),
    verzija: row.verzija,
  };
}
