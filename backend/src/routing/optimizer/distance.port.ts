import type { Tacka } from '../../common/geo';

/** Phase 1 estimates from coordinates; phase 3 asks OSRM behind the same token. */
export const DISTANCE_PROVIDER = Symbol('DISTANCE_PROVIDER');

export interface DistanceProvider {
  /** What `rastojanje.izvor` will record: `haversine` | `osrm`. */
  readonly izvor: string;
  /**
   * Full pairwise matrix in metres, `matrix[i][j]` from `points[i]` to
   * `points[j]`. `faktorPuta` is the straight-line-to-road multiplier; a provider
   * that measures real roads ignores it.
   */
  matrix(points: readonly Tacka[], faktorPuta: number): Promise<number[][]>;
}

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM(a: Tacka, b: Tacka): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Straight line times a road factor. Symmetric, so only half the pairs are
 * measured; the municipality is small enough that the error against real roads
 * is a constant the factor absorbs, not a shape the optimiser would get wrong.
 */
export class HaversineRoadDistance implements DistanceProvider {
  readonly izvor = 'haversine';

  async matrix(points: readonly Tacka[], faktorPuta: number): Promise<number[][]> {
    const n = points.length;
    const m: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = Math.round(haversineM(points[i], points[j]) * faktorPuta);
        m[i][j] = d;
        m[j][i] = d;
      }
    }
    return m;
  }
}
