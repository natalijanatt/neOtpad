import type { Selectable } from 'kysely';
import { fromPoint } from '../common/geo';
import {
  toInstant,
  toInstantOrNull,
  toIsoDate,
  toIsoDateOrNull,
  toNumberOrNull,
} from '../common/row-values';
import type { DB } from '../database/generated/schema';
import type { Kontejner, KontejnerStanje, SabirnoMesto } from './containers.model';

type SabirnoMestoRow = Selectable<DB['app.sabirno_mesto']>;
type KontejnerRow = Selectable<DB['app.kontejner']>;
type KontejnerStanjeRow = Selectable<DB['app.kontejner_stanje']>;

export function toSabirnoMesto(row: SabirnoMestoRow): SabirnoMesto {
  const lokacija = fromPoint(row.lokacija);

  if (lokacija === null) {
    // NOT NULL in the schema: a collection point with no location cannot be
    // routed to, and a silently dropped stop is exactly how a village stops
    // being visited.
    throw new Error(`sabirno mesto ${row.id} has no lokacija`);
  }

  return {
    id: row.id,
    naselje_id: row.naselje_id,
    naziv: row.naziv,
    lokacija,
    broj_domacinstava: row.broj_domacinstava,
    pristup: row.pristup,
    aktivno_od: toIsoDate(row.aktivno_od),
    aktivno_do: toIsoDateOrNull(row.aktivno_do),
  };
}

export function toKontejner(row: KontejnerRow): Kontejner {
  return {
    id: row.id,
    oznaka: row.oznaka,
    sabirno_mesto_id: row.sabirno_mesto_id,
    tip_otpada: row.tip_otpada,
    zapremina_l: row.zapremina_l,
    postavljen_datum: toIsoDate(row.postavljen_datum),
    uklonjen_datum: toIsoDateOrNull(row.uklonjen_datum),
    status: row.status,
  };
}

export function toKontejnerStanje(row: KontejnerStanjeRow): KontejnerStanje {
  return {
    kontejner_id: row.kontejner_id,
    fill_percent: row.fill_percent,
    measured_at: toInstantOrNull(row.measured_at),
    trend_pp_po_danu: toNumberOrNull(row.trend_pp_po_danu),
    baterija_percent: row.baterija_percent,
    aktivni_status: row.aktivni_status,
    tih_od: toInstantOrNull(row.tih_od),
    azurirano_at: toInstant(row.azurirano_at),
  };
}
