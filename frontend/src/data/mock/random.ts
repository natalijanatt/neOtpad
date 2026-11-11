/**
 * Deterministički generator pseudoslučajnih brojeva za mock podatke.
 * Isti seed uvek daje isti niz, pa demo izgleda isto pri svakom pokretanju.
 */
export function seeded(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** [0, 1) */
    next,
    /** Ceo broj u [min, max]. */
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    /** Realan broj u [min, max). */
    float: (min: number, max: number) => min + next() * (max - min),
    pick: <T>(items: readonly T[]): T => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error('pick() called on an empty list');
      return item;
    },
  };
}

export const DAY_MS = 86_400_000;

export function daysFromNow(days: number, hour = 6): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
