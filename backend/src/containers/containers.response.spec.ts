import type { KontejnerRedRow } from './containers.repository';
import { toListItem, toReading } from './containers.response';

const SADA = new Date('2026-09-19T06:00:00.000Z');
const HOUR_MS = 3_600_000;

function serija(pocetak: Date, odNivoa: number, ppDan: number, tacaka = 29): unknown {
  return Array.from({ length: tacaka }, (_, i) => {
    const p50 = Math.min(100, odNivoa + (ppDan * i * 6) / 24);
    return { t: new Date(pocetak.getTime() + i * 6 * HOUR_MS).toISOString(), p10: p50 - 5, p50, p90: p50 + 5 };
  });
}

function red(over: Partial<KontejnerRedRow> = {}): KontejnerRedRow {
  return {
    id: 'cccccccc-0001-4000-8000-000000000001',
    oznaka: 'PI-KRU-004',
    tip_otpada: 'komunalni',
    zapremina_l: 1100,
    sabirno_mesto_id: 'bbbbbbbb-0001-4000-8000-000000000001',
    mesto_naziv: 'Krupac - centar sela',
    naselje_id: 'aaaaaaaa-0002-4000-8000-000000000002',
    lat: 43.116004,
    lon: 22.675066,
    ima_senzor: true,
    fill_percent: 40,
    measured_at: new Date('2026-09-19T00:00:00.000Z'),
    trend_pp_po_danu: '12.40',
    baterija_percent: 92,
    aktivni_status: ['ok'],
    tih_od: null,
    poslednje_praznjenje: new Date('2026-09-16T05:00:00.000Z'),
    prelivanja_90d: '2',
    prognoza_izracunata_at: new Date('2026-09-19T02:00:00.000Z'),
    prognoza_ulazni_podaci_do: new Date('2026-09-19T00:00:00.000Z'),
    prognoza_vreme_kriticnog: new Date('2026-09-22T14:20:00.000Z'),
    prognoza_pouzdanost: 'visoka',
    prognoza_ima_rupu: false,
    prognoza_serija: serija(new Date('2026-09-19T02:00:00.000Z'), 41, 10) as never,
    ...over,
  };
}

describe('toListItem', () => {
  it('returns only the reference shape without sa_stanjem', () => {
    // The report wizard reads this endpoint while filing a report; it must not
    // start downloading the fleet's telemetry because containers grew a state.
    expect(toListItem(red(), false, SADA)).toEqual({
      id: 'cccccccc-0001-4000-8000-000000000001',
      naziv: 'PI-KRU-004',
      naselje_id: 'aaaaaaaa-0002-4000-8000-000000000002',
    });
  });

  it('adds location, state and forecast summary with sa_stanjem', () => {
    const item = toListItem(red(), true, SADA);

    expect(item.lokacija).toEqual({ lat: 43.116004, lon: 22.675066 });
    expect(item.stanje?.fill_percent).toBe(40);
    expect(item.stanje?.trend_pp_po_danu).toBe(12.4);
    expect(item.prelivanja_90d).toBe(2);
    expect(item.prognoza?.vreme_kriticnog).toBe('2026-09-22T14:20:00.000Z');
  });

  it('never ships the curve in the list', () => {
    expect(toListItem(red(), true, SADA).prognoza).not.toHaveProperty('serija');
  });

  it('reads the expected levels off the stored series', () => {
    const item = toListItem(red(), true, SADA);

    // 41 % at the time of computation, 10 pp/day.
    expect(item.prognoza?.ocekivano_24h).toBe(51);
    expect(item.prognoza?.ocekivano_48h).toBe(61);
  });

  it('counts the hours to critical from now, not from when it was computed', () => {
    const item = toListItem(red(), true, SADA);
    const ocekivano = (Date.parse('2026-09-22T14:20:00.000Z') - SADA.getTime()) / HOUR_MS;

    expect(item.prognoza?.sati_do_kriticnog).toBeCloseTo(ocekivano, 1);
  });

  it('reports a container already over the threshold with negative hours', () => {
    const item = toListItem(red({ prognoza_vreme_kriticnog: new Date('2026-09-19T00:00:00.000Z') }), true, SADA);

    expect(item.prognoza?.sati_do_kriticnog).toBe(-6);
  });

  it('marks the state unreliable when the device carries a fault code', () => {
    expect(toListItem(red({ aktivni_status: ['optics_blocked'] }), true, SADA).stanje?.pouzdano).toBe(false);
  });

  it('marks the state unreliable when the device is silent', () => {
    expect(toListItem(red({ tih_od: new Date('2026-09-18T00:00:00.000Z') }), true, SADA).stanje?.pouzdano).toBe(false);
  });

  it('leaves the forecast out for a container that has none', () => {
    const item = toListItem(
      red({
        prognoza_izracunata_at: null,
        prognoza_ulazni_podaci_do: null,
        prognoza_vreme_kriticnog: null,
        prognoza_pouzdanost: null,
        prognoza_ima_rupu: null,
        prognoza_serija: null,
      }),
      true,
      SADA,
    );

    expect(item.prognoza).toBeUndefined();
    // Still a container with a location and a state: "no forecast" is not "no data".
    expect(item.lokacija).toBeDefined();
  });

  it('keeps a null fill level null instead of turning it into an empty container', () => {
    const item = toListItem(red({ fill_percent: null, measured_at: null }), true, SADA);

    expect(item.stanje?.fill_percent).toBeNull();
    expect(item.stanje?.measured_at).toBeNull();
  });
});

describe('toReading', () => {
  it('passes an unreliable reading through, flagged', () => {
    const reading = toReading({
      measured_at: new Date('2026-09-19T00:00:00.000Z'),
      fill_percent_izracunat: 98,
      pouzdano: false,
      orientation: 'upright',
      battery_percent: 90,
    });

    expect(reading).toEqual({
      measured_at: '2026-09-19T00:00:00.000Z',
      fill_percent: 98,
      pouzdano: false,
      orientation: 'upright',
      baterija_percent: 90,
    });
  });

  it('keeps the emptying marker, which is where the curve resets', () => {
    const reading = toReading({
      measured_at: new Date('2026-09-16T05:00:00.000Z'),
      fill_percent_izracunat: 4,
      pouzdano: true,
      orientation: 'emptying',
      battery_percent: 91,
    });

    expect(reading.orientation).toBe('emptying');
  });
});
