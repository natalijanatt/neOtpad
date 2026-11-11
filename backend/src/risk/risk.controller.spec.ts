import { Test } from '@nestjs/testing';
import { StaffGuard } from '../auth/auth.guard';
import { RiskController } from './risk.controller';
import { RiskRepository, type CrnaTackaRedRow } from './risk.repository';
import { RiskService } from './risk.service';
import type { BlackSpotQueryDto } from './dto/risk.dto';

/** `extensions.st_setsrid(st_makepoint(22.595668, 43.168282), 4326)` as pg returns it. */
const TACKA = '0101000020E61000001346B3B27D983640B340BB438A954540';

function red(over: Partial<CrnaTackaRedRow> = {}): CrnaTackaRedRow {
  return {
    id: 'dddddddd-0001-4000-8000-000000000001',
    naselje_id: 'aaaaaaaa-0002-4000-8000-000000000002',
    naselje_naziv: 'Krupac',
    kanonska_id: null,
    tacka: null,
    kanonska_tacka: null,
    kanonska_geo_preciznost: null,
    prvi_put: new Date(2019, 3, 11),
    poslednji_put: new Date(2026, 6, 2),
    broj_ponavljanja: 4,
    preporuka: 'dodati_kontejner',
    obrazlozenje: 'Ponovo se stvara posle čišćenja.',
    status: 'predlozeno',
    sprovedeno_at: null,
    rizik_skor: null,
    rizik_klasifikacija: null,
    rizik_komponente: null,
    rizik_izracunato_at: null,
    rizik_subjekat_tip: null,
    ...over,
  };
}

const upit = (over: Partial<BlackSpotQueryDto> = {}): BlackSpotQueryDto => ({ page: 1, limit: 25, ...over });

describe('RiskController', () => {
  const build = async (repository: Partial<RiskRepository>) => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RiskController],
      providers: [RiskService, { provide: RiskRepository, useValue: repository }],
    })
      // The guard is exercised by the auth tests; here it would only demand a token.
      .overrideGuard(StaffGuard)
      .useValue({ canActivate: () => true })
      .compile();

    return moduleRef.get(RiskController);
  };

  it('returns a page and reports that more exist', async () => {
    // Two rows for a page size of one: the extra row is how hasMore is known.
    const crneTacke = jest.fn(async () => [red(), red({ id: 'dddddddd-0002-4000-8000-000000000002' })]);
    const controller = await build({ crneTacke });

    const result = await controller.listBlackSpots(upit({ limit: 1 }));

    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(true);
  });

  it('hides closed spots unless sve is asked for', async () => {
    const crneTacke = jest.fn(async () => []);
    const controller = await build({ crneTacke });

    await controller.listBlackSpots(upit({ preporuka: 'cesci_odvoz', min_ponavljanja: 2 }));

    // The status filter belongs to the repository; the controller only has to
    // hand the query over untouched.
    expect(crneTacke).toHaveBeenCalledWith(upit({ preporuka: 'cesci_odvoz', min_ponavljanja: 2 }));
  });

  it('carries the recommendation and its reasoning, not only a score', async () => {
    const controller = await build({ crneTacke: jest.fn(async () => [red()]) });

    const [spot] = (await controller.listBlackSpots(upit())).items;

    expect(spot.preporuka).toBe('dodati_kontejner');
    expect(spot.obrazlozenje).toBe('Ponovo se stvara posle čišćenja.');
    expect(spot.prvi_put).toBe('2019-04-11');
    expect(spot.poslednji_put).toBe('2026-07-02');
  });

  it('reports an unlocated spot as nepoznato rather than inventing a point', async () => {
    const controller = await build({ crneTacke: jest.fn(async () => [red()]) });

    const [spot] = (await controller.listBlackSpots(upit())).items;

    expect(spot.lokacija).toBeNull();
    expect(spot.geo_preciznost).toBe('nepoznato');
  });

  it('takes the point and its precision from the canonical dump when there is one', async () => {
    const controller = await build({
      crneTacke: jest.fn(async () => [
        red({ kanonska_id: 'eeeeeeee-0001-4000-8000-000000000001', kanonska_tacka: TACKA, kanonska_geo_preciznost: 'centroid_naselja' }),
      ]),
    });

    const [spot] = (await controller.listBlackSpots(upit())).items;

    expect(spot.lokacija?.lat).toBeCloseTo(43.168282, 5);
    expect(spot.lokacija?.lon).toBeCloseTo(22.595668, 5);
    // A centroid stays a centroid: the map must not draw it as a surveyed point.
    expect(spot.geo_preciznost).toBe('centroid_naselja');
  });

  it('does not claim registry precision for a spot that only has its own point', async () => {
    const controller = await build({ crneTacke: jest.fn(async () => [red({ tacka: TACKA })]) });

    const [spot] = (await controller.listBlackSpots(upit())).items;

    expect(spot.lokacija?.lat).toBeCloseTo(43.168282, 5);
    expect(spot.geo_preciznost).toBe('geokodirano');
  });

  it('exposes the score components, so the list can say why a spot is on it', async () => {
    const controller = await build({
      crneTacke: jest.fn(async () => [
        red({
          rizik_skor: '74.500',
          rizik_klasifikacija: 'crna_tacka',
          rizik_komponente: { prelivanje: 0.6, ponavljanje: 0.9 },
          rizik_izracunato_at: new Date('2026-09-19T03:00:00.000Z'),
          rizik_subjekat_tip: 'kanonska_deponija',
        }),
      ]),
    });

    const [spot] = (await controller.listBlackSpots(upit())).items;

    expect(spot.rizik?.skor).toBe(74.5);
    expect(spot.rizik?.komponente).toEqual({ prelivanje: 0.6, ponavljanje: 0.9 });
    expect(spot.rizik?.subjekat_tip).toBe('kanonska_deponija');
  });

  it('returns a spot the recalculator has not scored yet, with a null score', async () => {
    // Dropping it would hide exactly the settlements nobody has looked at.
    const controller = await build({ crneTacke: jest.fn(async () => [red()]) });

    const [spot] = (await controller.listBlackSpots(upit())).items;

    expect(spot.rizik).toBeNull();
  });
});
