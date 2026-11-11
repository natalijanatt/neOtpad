import { fromPoint } from './geo';

/**
 * K-04 Mali Jovanovac from `pirot_divlje_deponije_kanonske.csv`
 * (43.10622, 22.668432), as `SELECT tacka` returns it: EWKB, SRID 4326.
 */
const MALI_JOVANOVAC = '0101000020E610000091990B5C1EAB36402F17F19D988D4540';
/** The same point written big-endian, which a non-x86 server would send. */
const MALI_JOVANOVAC_BE = '0020000001000010E64036AB1E5C0B999140458D989DF1172F';

describe('fromPoint', () => {
  it('decodes the EWKB hex a geography column selects as', () => {
    const tacka = fromPoint(MALI_JOVANOVAC)!;

    expect(tacka.lat).toBeCloseTo(43.10622, 5);
    expect(tacka.lon).toBeCloseTo(22.668432, 5);
  });

  it('reads latitude and longitude in the order PostGIS wrote them', () => {
    // A swap lands in Bulgaria and still renders as a point, so it is asserted
    // rather than assumed: Pirot is ~43 N, ~22 E.
    const tacka = fromPoint(MALI_JOVANOVAC)!;

    expect(tacka.lat).toBeGreaterThan(tacka.lon);
  });

  it('reads a big-endian point as the same place', () => {
    expect(fromPoint(MALI_JOVANOVAC_BE)).toEqual(fromPoint(MALI_JOVANOVAC));
  });

  it('treats a NULL geometry as an absent point, not as 0,0', () => {
    expect(fromPoint(null)).toBeNull();
  });

  it('refuses a geometry that is not a point', () => {
    // A LineString where a point was expected means the column changed shape.
    expect(() => fromPoint('0102000020E610000000000000000000000000000000000000')).toThrow(
      /geometry type 2/,
    );
  });
});
