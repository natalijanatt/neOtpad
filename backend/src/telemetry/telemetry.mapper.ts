import type { Selectable } from 'kysely';
import { toId, toInstant, toInstantOrNull, toNumberOrNull } from '../common/row-values';
import type { DB } from '../database/generated/schema';
import type { Alarm, Ocitavanje, Praznjenje } from './telemetry.model';

type OcitavanjeRow = Selectable<DB['app.ocitavanje']>;
type AlarmRow = Selectable<DB['app.alarm']>;
type PraznjenjeRow = Selectable<DB['app.praznjenje']>;

export function toOcitavanje(row: OcitavanjeRow): Ocitavanje {
  return {
    id: toId(row.id),
    uredjaj_id: row.uredjaj_id,
    kontejner_id: row.kontejner_id,
    measured_at: toInstant(row.measured_at),
    received_at: toInstant(row.received_at),
    distance_cm: row.distance_cm,
    fill_percent: row.fill_percent,
    fill_percent_izracunat: row.fill_percent_izracunat,
    temperature_c: toNumberOrNull(row.temperature_c),
    orientation: row.orientation,
    battery_mv: row.battery_mv,
    battery_percent: row.battery_percent,
    status: row.status,
    rssi: row.rssi,
    snr: toNumberOrNull(row.snr),
    gateway_id: row.gateway_id,
    // The generated column is typed nullable, and an unknown reliability is not
    // a reliable reading: defaulting to false keeps a doubtful measurement out
    // of the forecast rather than into it.
    pouzdano: row.pouzdano ?? false,
  };
}

export function toAlarm(row: AlarmRow): Alarm {
  return {
    id: row.id,
    kontejner_id: row.kontejner_id,
    uredjaj_id: row.uredjaj_id,
    tip: row.tip,
    nastao_at: toInstant(row.nastao_at),
    potvrdjen_at: toInstantOrNull(row.potvrdjen_at),
    zatvoren_at: toInstantOrNull(row.zatvoren_at),
    prioritet: row.prioritet,
    detalji: row.detalji,
  };
}

export function toPraznjenje(row: PraznjenjeRow): Praznjenje {
  return {
    id: row.id,
    kontejner_id: row.kontejner_id,
    detektovano_at: toInstant(row.detektovano_at),
    izvor: row.izvor,
    stajaliste_rute_id: row.stajaliste_rute_id,
  };
}
