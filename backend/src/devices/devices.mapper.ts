import type { Selectable } from 'kysely';
import { toInstant, toInstantOrNull, toIsoDateOrNull } from '../common/row-values';
import type { DB } from '../database/generated/schema';
import type { Uredjaj, UredjajMontaza } from './devices.model';

type UredjajRow = Selectable<DB['app.uredjaj']>;
type MontazaRow = Selectable<DB['app.uredjaj_montaza']>;

export function toUredjaj(row: UredjajRow): Uredjaj {
  return {
    id: row.id,
    dev_eui: row.dev_eui,
    model: row.model,
    proizvodjac: row.proizvodjac,
    // `aktiviran` is a date, not an instant: the day a unit went into service.
    aktiviran: toIsoDateOrNull(row.aktiviran),
    status: row.status,
  };
}

export function toUredjajMontaza(row: MontazaRow): UredjajMontaza {
  return {
    id: row.id,
    uredjaj_id: row.uredjaj_id,
    kontejner_id: row.kontejner_id,
    konfigurisana_dubina_cm: row.konfigurisana_dubina_cm,
    montiran_od: toInstant(row.montiran_od),
    montiran_do: toInstantOrNull(row.montiran_do),
  };
}
