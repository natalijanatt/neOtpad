import { improveTour, orOpt, tourLength, twoOpt } from './local-search';

/** Euclidean matrix over plain x/y points; the geometry is what matters here. */
function matrix(points: readonly [number, number][]): number[][] {
  return points.map(([x1, y1]) => points.map(([x2, y2]) => Math.hypot(x2 - x1, y2 - y1)));
}

describe('twoOpt', () => {
  it('uncrosses a tour whose edges intersect', () => {
    // Depot at origin, four corners of a square visited in an X.
    const d = matrix([
      [0, 0],
      [0, 10],
      [10, 0],
      [10, 10],
      [0, 10.1],
    ]);
    const crossed = [0, 1, 2, 3, 4, 0];
    const fixed = twoOpt(crossed, d);

    expect(tourLength(fixed, d)).toBeLessThan(tourLength(crossed, d));
    expect(fixed[0]).toBe(0);
    expect(fixed[fixed.length - 1]).toBe(0);
    expect([...fixed.slice(1, -1)].sort()).toEqual([1, 2, 3, 4]);
  });

  it('leaves a tour with fewer than three stops alone', () => {
    const d = matrix([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    expect(twoOpt([0, 1, 2, 0], d)).toEqual([0, 1, 2, 0]);
  });
});

describe('orOpt', () => {
  it('moves a stranded stop next to its neighbours and never lengthens the tour', () => {
    // Two clusters; stop 3 belongs with 1 and 2 but was visited last.
    const d = matrix([
      [0, 0],
      [10, 0],
      [11, 0],
      [12, 0],
      [0, 10],
      [0, 11],
    ]);
    const before = [0, 1, 2, 4, 5, 3, 0];
    const after = orOpt(before, d);

    expect(tourLength(after, d)).toBeLessThan(tourLength(before, d));
    // Either direction of travel is fine; what matters is that 3 rejoined its cluster.
    expect(Math.abs(after.indexOf(3) - after.indexOf(2))).toBe(1);
    expect(after[0]).toBe(0);
    expect(after[after.length - 1]).toBe(0);
  });
});

describe('improveTour', () => {
  it('keeps every stop exactly once with the depot at both ends', () => {
    const pts: [number, number][] = [[0, 0]];
    let seed = 7;
    for (let i = 0; i < 25; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const x = (seed / 233280) * 100;
      seed = (seed * 9301 + 49297) % 233280;
      pts.push([x, (seed / 233280) * 100]);
    }
    const d = matrix(pts);
    const naive = [0, ...pts.slice(1).map((_, i) => i + 1), 0];
    const improved = improveTour(naive, d);

    expect(improved[0]).toBe(0);
    expect(improved[improved.length - 1]).toBe(0);
    expect([...improved.slice(1, -1)].sort((a, b) => a - b)).toEqual(naive.slice(1, -1));
    expect(tourLength(improved, d)).toBeLessThanOrEqual(tourLength(naive, d));
  });
});
