/**
 * Intra-route improvement on index tours.
 *
 * A tour is `[depot, s1, s2, ..., sn, depot]` as indices into a distance matrix.
 * Both endpoints are fixed. Service time is the same in every order, so
 * shortening distance is the same as shortening the day.
 */
export type Matrix = readonly (readonly number[])[];

export function tourLength(tour: readonly number[], d: Matrix): number {
  let total = 0;
  for (let i = 1; i < tour.length; i++) {
    total += d[tour[i - 1]][tour[i]];
  }
  return total;
}

/**
 * 2-opt: reverse the segment between two edges whenever the two new edges are
 * shorter than the two old ones. Uncrosses the routes an insertion heuristic
 * leaves behind. First-improvement, restarted until a full pass changes nothing.
 */
export function twoOpt(tour: readonly number[], d: Matrix): number[] {
  const t = [...tour];
  const n = t.length;
  if (n < 5) return t;

  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < n - 2; i++) {
      for (let j = i + 1; j < n - 1; j++) {
        const a = t[i - 1];
        const b = t[i];
        const c = t[j];
        const e = t[j + 1];
        const delta = d[a][c] + d[b][e] - d[a][b] - d[c][e];
        if (delta < 0) {
          reverse(t, i, j);
          improved = true;
        }
      }
    }
  }
  return t;
}

/**
 * Or-opt: move a segment of one to three consecutive stops elsewhere in the
 * tour, in either orientation, when that shortens it. Catches what 2-opt cannot:
 * a single stop stranded on the wrong side of a village.
 */
export function orOpt(tour: readonly number[], d: Matrix): number[] {
  let t = [...tour];
  const n = t.length;
  if (n < 5) return t;

  let improved = true;
  while (improved) {
    improved = false;
    outer: for (let len = 1; len <= 3; len++) {
      for (let i = 1; i + len <= n - 1; i++) {
        const prev = t[i - 1];
        const first = t[i];
        const last = t[i + len - 1];
        const next = t[i + len];
        const removeGain = d[prev][first] + d[last][next] - d[prev][next];

        for (let j = 0; j < n - 1; j++) {
          // Insertion between t[j] and t[j+1]; skip positions inside or adjacent to the segment.
          if (j >= i - 1 && j <= i + len - 1) continue;
          const p = t[j];
          const q = t[j + 1];
          const forward = d[p][first] + d[last][q] - d[p][q];
          const backward = d[p][last] + d[first][q] - d[p][q];
          const best = Math.min(forward, backward);
          if (best < removeGain) {
            t = moveSegment(t, i, len, j, backward < forward);
            improved = true;
            break outer;
          }
        }
      }
    }
  }
  return t;
}

/** 2-opt followed by Or-opt, repeated while either still finds something. */
export function improveTour(tour: readonly number[], d: Matrix): number[] {
  let current = [...tour];
  let length = tourLength(current, d);
  for (;;) {
    const next = orOpt(twoOpt(current, d), d);
    const nextLength = tourLength(next, d);
    if (nextLength >= length) return current;
    current = next;
    length = nextLength;
  }
}

function reverse(t: number[], i: number, j: number): void {
  while (i < j) {
    const tmp = t[i];
    t[i] = t[j];
    t[j] = tmp;
    i++;
    j--;
  }
}

function moveSegment(t: readonly number[], i: number, len: number, j: number, reversed: boolean): number[] {
  const segment = t.slice(i, i + len);
  if (reversed) segment.reverse();
  const without = [...t.slice(0, i), ...t.slice(i + len)];
  // Removing the segment shifts every index after it left by `len`.
  const insertAfter = j < i ? j : j - len;
  return [...without.slice(0, insertAfter + 1), ...segment, ...without.slice(insertAfter + 1)];
}
