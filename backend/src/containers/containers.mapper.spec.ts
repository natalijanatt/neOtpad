import { toKontejnerStanje, toSabirnoMesto } from './containers.mapper';

describe('toSabirnoMesto', () => {
  it('decodes the location and keeps the household count that drives priority', () => {
    const mesto = toSabirnoMesto({
      id: '33333333-3333-3333-3333-333333333333',
      naselje_id: '11111111-1111-1111-1111-111111111111',
      naziv: 'Krupac - centar',
      lokacija: '0101000020E610000091990B5C1EAB36402F17F19D988D4540',
      broj_domacinstava: 40,
      pristup: null,
      aktivno_od: new Date(2024, 2, 1),
      aktivno_do: null,
      // Derived from the settlement centroid, which is all any source gives for a
      // collection point.
      geo_preciznost: 'centroid_naselja',
    });

    expect(mesto.lokacija.lat).toBeCloseTo(43.10622, 5);
    expect(mesto.broj_domacinstava).toBe(40);
    expect(mesto.aktivno_od).toBe('2024-03-01');
  });
});

describe('toKontejnerStanje', () => {
  it('keeps "no reading" as null instead of an empty container', () => {
    const stanje = toKontejnerStanje({
      kontejner_id: '44444444-4444-4444-4444-444444444444',
      fill_percent: null,
      measured_at: null,
      trend_pp_po_danu: null,
      baterija_percent: null,
      aktivni_status: [],
      tih_od: new Date('2026-09-10T06:00:00.000Z'),
      azurirano_at: new Date('2026-09-18T06:00:00.000Z'),
    });

    expect(stanje.fill_percent).toBeNull();
    expect(stanje.tih_od).toEqual(new Date('2026-09-10T06:00:00.000Z'));
  });

  it('reads the numeric trend as a number and keeps every active status flag', () => {
    const stanje = toKontejnerStanje({
      kontejner_id: '44444444-4444-4444-4444-444444444444',
      fill_percent: 72,
      measured_at: new Date('2026-09-18T05:00:00.000Z'),
      trend_pp_po_danu: '8.50',
      baterija_percent: 61,
      aktivni_status: ['optika_prljava', 'baterija_niska'],
      tih_od: null,
      azurirano_at: new Date('2026-09-18T05:00:10.000Z'),
    });

    expect(stanje.trend_pp_po_danu).toBe(8.5);
    expect(stanje.aktivni_status).toEqual(['optika_prljava', 'baterija_niska']);
  });
});
