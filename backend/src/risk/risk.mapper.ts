import type { Selectable } from 'kysely';
import { fromPoint } from '../common/geo';
import {
  toInstant,
  toInstantOrNull,
  toIsoDate,
  toIsoDateOrNull,
  toNumber,
  toNumberOrNull,
} from '../common/row-values';
import type { DB } from '../database/generated/schema';
import type { AkcijaCiscenja, CrnaTacka, Rizik, RizikKomponente } from './risk.model';

type RizikRow = Selectable<DB['app.rizik']>;
type CrnaTackaRow = Selectable<DB['app.crna_tacka']>;
type AkcijaRow = Selectable<DB['app.akcija_ciscenja']>;

export function toRizik(row: RizikRow): Rizik {
  return {
    id: row.id,
    subjekat_tip: row.subjekat_tip,
    subjekat_id: row.subjekat_id,
    izracunato_at: toInstant(row.izracunato_at),
    skor: toNumber(row.skor),
    // `jsonb` is only as typed as whatever wrote it. The narrowing is stated
    // here, once, rather than repeated as a cast at every call site.
    komponente: row.komponente as RizikKomponente,
    klasifikacija: row.klasifikacija,
  };
}

export function toCrnaTacka(row: CrnaTackaRow): CrnaTacka {
  return {
    id: row.id,
    naselje_id: row.naselje_id,
    tacka: fromPoint(row.tacka),
    kanonska_id: row.kanonska_id,
    prvi_put: toIsoDateOrNull(row.prvi_put),
    poslednji_put: toIsoDateOrNull(row.poslednji_put),
    broj_ponavljanja: row.broj_ponavljanja,
    preporuka: row.preporuka,
    obrazlozenje: row.obrazlozenje,
    status: row.status,
    sprovedeno_at: toInstantOrNull(row.sprovedeno_at),
  };
}

export function toAkcijaCiscenja(row: AkcijaRow): AkcijaCiscenja {
  return {
    id: row.id,
    kanonska_id: row.kanonska_id,
    mesna_zajednica_id: row.mesna_zajednica_id,
    datum: toIsoDate(row.datum),
    organizator: row.organizator,
    broj_ucesnika: row.broj_ucesnika,
    uklonjeno_t: toNumberOrNull(row.uklonjeno_t),
    mehanizacija: row.mehanizacija,
    status: row.status,
  };
}
