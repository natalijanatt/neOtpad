import type { Selectable } from 'kysely';
import type { DB } from '../database/generated/schema';
import { toOcitavanje } from './telemetry.mapper';

const reading = (
  over: Partial<Selectable<DB['app.ocitavanje']>> = {},
): Selectable<DB['app.ocitavanje']> => ({
  id: '9007199254740993',
  uredjaj_id: '55555555-5555-5555-5555-555555555555',
  kontejner_id: '44444444-4444-4444-4444-444444444444',
  measured_at: new Date('2026-09-18T04:00:00.000Z'),
  received_at: new Date('2026-09-18T04:02:00.000Z'),
  distance_cm: 30,
  fill_percent: 75,
  fill_percent_izracunat: 75,
  temperature_c: '21.5',
  orientation: 'upright',
  battery_mv: 3600,
  battery_percent: 82,
  status: [],
  rssi: -104,
  snr: '7.5',
  gateway_id: 'gw-pirot-01',
  raw_payload: null,
  pouzdano: true,
  ...over,
});

describe('toOcitavanje', () => {
  it('keeps the bigserial id exact instead of rounding it into a double', () => {
    expect(toOcitavanje(reading()).id).toBe('9007199254740993');
  });

  it('keeps the device clock and the arrival time apart', () => {
    // A reading held by store-and-forward is still worth its measured_at; using
    // received_at on a fill curve would flatten the very gap it documents.
    const ocitavanje = toOcitavanje(reading());

    expect(ocitavanje.measured_at).toEqual(new Date('2026-09-18T04:00:00.000Z'));
    expect(ocitavanje.received_at).toEqual(new Date('2026-09-18T04:02:00.000Z'));
  });

  it('reads numeric temperature and SNR as numbers', () => {
    const ocitavanje = toOcitavanje(reading());

    expect(ocitavanje.temperature_c).toBe(21.5);
    expect(ocitavanje.snr).toBe(7.5);
  });

  it('treats an unknown reliability as unreliable', () => {
    // Blocked optics read as "full". A doubtful reading must not be able to
    // reach routing as a priority just because the flag arrived null.
    expect(toOcitavanje(reading({ pouzdano: null })).pouzdano).toBe(false);
  });

  it('carries every status code, not just the first', () => {
    const ocitavanje = toOcitavanje(reading({ status: ['optika_blokirana', 'baterija_niska'] }));

    expect(ocitavanje.status).toEqual(['optika_blokirana', 'baterija_niska']);
  });
});
