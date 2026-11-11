// Small deterministic helpers. Nothing here may read the wall clock: every frame
// has to be reproducible from the timeline position alone, or the offline render
// and the live preview drift apart.

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => (b === a ? 0 : clamp((v - a) / (b - a)));
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = (t) => Math.pow(clamp(t), 3);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Ramp from 0 to 1 over [a,b] with smootherstep — the workhorse for reveals. */
export const ramp = (t, a, b) => smoother(inv(a, b, t));
/** 0 → 1 → 0 window: fades in over `fi`, holds, fades out over `fo` before `b`. */
export const win = (t, a, b, fi = 0.5, fo = 0.5) =>
  Math.min(smoother(inv(a, a + fi, t)), 1 - smoother(inv(b - fo, b, t)));

/** Mulberry32 — seeded PRNG so every generated prop lands in the same place. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap 2D value noise, good enough for waste heaps and terrain jitter. */
export function noise2(x, y, seed = 1) {
  const h = (i, j) => {
    let n = Math.imul(i * 374761393 + j * 668265263 + seed * 1274126177, 1);
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  return lerp(
    lerp(h(xi, yi), h(xi + 1, yi), xf),
    lerp(h(xi, yi + 1), h(xi + 1, yi + 1), xf),
    yf,
  );
}
export const fbm = (x, y, oct = 4, seed = 1) => {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f, seed + i); n += a; a *= 0.5; f *= 2; }
  return s / n;
};

// ---- number formatting (Serbian: comma decimal separator, dot thousands) ----
export const sr = (v, d = 0) =>
  v.toLocaleString('sr-RS', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Interpolate a value across an array of [time, value] keyframes. */
export function track(t, keys, ease = smoother) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      return lerp(v0, v1, ease(inv(t0, t1, t)));
    }
  }
  return keys[keys.length - 1][1];
}

/** Colour ramp for fill level, using the app's own level tokens. */
export const LEVEL = { low: 0x3fc168, mid: 0xecbe24, high: 0xfa7c20, crit: 0xe62c2c };
export const levelColor = (pct) =>
  pct >= 85 ? LEVEL.crit : pct >= 70 ? LEVEL.high : pct >= 45 ? LEVEL.mid : LEVEL.low;
export const levelCss = (pct) => '#' + levelColor(pct).toString(16).padStart(6, '0');
