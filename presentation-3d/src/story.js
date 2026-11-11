// The timeline. Everything the viewer sees is a pure function of t (seconds):
// camera, geometry state, overlay copy. No wall-clock, no randomness per frame,
// so the offline render and the live preview are the same film.

import * as T from 'three';
import { clamp, lerp, inv, smooth, smoother, ramp, win, track, easeOut, sr, levelColor } from './util.js';
import DATA from './data.js';

// reused every frame instead of allocated: applyMacro runs on every one of the
// 72 villages per rendered frame, and `new T.Color`/`new T.MeshBasicMaterial`
// there used to garbage-collect thousands of objects per second and stutter
// worse the longer playback ran.
const NEUTRAL_COV = new T.Color(0x2bd6a8);
const NEUTRAL_NOCOV = new T.Color(0x6f8a86);
const DIM_COLOR = new T.Color(0x45605c);
const TMP_COLOR = new T.Color();
const TMP_FILL_COLOR = new T.Color();

// last frame's caster positions, for deciding whether the micro shadow map is
// still valid; NaN so the very first frame always renders it
let prevCut = NaN, prevLid = NaN, prevLift = NaN, prevTip = NaN;

export const DUR = 72;                       // total seconds
const DEPTH_CM = 107;                        // configured container depth on the device

// ---------------------------------------------------------------------------
// shots: [t0, t1, kicker, headline, sub]
export const SHOTS = [
  [4.6, 11.0, 'Zajedničko sabirno mesto', 'Kontejner ne zna\nda je pun.',
   'Fiksni kalendar odvoza: isto selo se obilazi na isti dan, bez obzira na to koliko je otpada zaista unutra.'],
  [11.2, 19.0, 'Senzor pod poklopcem', 'Ultrazvuk meri\nprazan prostor.',
   'Milesight EM310-UDL: dva ultrazvučna pretvarača mere razdaljinu do otpada, uređaj sam računa popunjenost iz podešene dubine kontejnera.'],
  [19.2, 27.4, 'Prognoza popunjenosti', 'Model vidi\nprelivanje unapred.',
   'Popunjenost + sezonalnost (vikend, praznik, slava, vašar) → procena trenutka kada kontejner prelazi kritičan nivo.'],
  [27.6, 31.3, 'LoRaWAN uplink', 'Jedna poruka\nna 60 minuta.',
   'EU868, Class A, baterija do 10 godina. Bez mobilne mreže i bez pretplate — vazduh je besplatan.'],
  [32.6, 39.0, 'Opština Pirot', '72 naselja,\n1.232 km².',
   'Grad i 71 okolno naselje, raštrkano po kotlini i dolinama. Organizovan odvoz pokriva 24 naselja — 48 je još van sistema.'],
  [39.2, 45.4, 'Pokrivenost', 'Jedan gateway\nvidi mnogo sela.',
   'Crni vrh na Vidliču (1.152 m) ima postojeći RTS toranj sa strujom i optičku vidljivost nad celom Pirotskom kotlinom.'],
  [45.6, 51.0, 'Mapa rizika', '52 evidentirane\ndivlje deponije.',
   'Javni registri 2018–2024: 30 lokacija se ponavlja i posle čišćenja. Tu prelivanje kontejnera najskuplje košta.'],
  [51.2, 59.8, 'Optimizacija rute', 'Kamion ide tamo\ngde je potreban.',
   'Ista odluka rešava dva cilja: manje kilometara i manje prelivanja. Rizik od divlje deponije ulazi u funkciju cilja, pa udaljeno selo ne pada sa liste.'],
  [60.2, 67.0, 'Zatvorena petlja', 'Prelivanje\nsprečeno.',
   'Senzor prijavljuje pražnjenje (tilt = emptying) — potvrda da je ruta odvezena i tačka na kojoj kriva popunjenosti počinje iznova.'],
];

// ---------------------------------------------------------------------------
// hero container fill level over the film
export function fillAt(t) {
  if (t < 11) return 34;
  if (t < 19) return lerp(34, 44, smooth(inv(11, 19, t)));
  if (t < 27.4) {
    // time-lapse: uplinks arrive hourly, the level climbs in visible steps
    const p = inv(19, 27.4, t);
    const smoothPart = lerp(44, 93, smoother(p));
    const step = Math.sin(p * Math.PI * 9) * 1.1 * (1 - p);
    return clamp(smoothPart + step, 0, 99);
  }
  if (t < 64.2) return 93 + Math.sin(t * 0.7) * 0.6;
  if (t < 65.4) return lerp(93, 0, smoother(inv(64.2, 65.4, t)));  // tipped into the truck
  return lerp(0, 5, smooth(inv(65.4, 67, t)));
}

/** Measured distance in cm for a given fill — what the device actually reports. */
export const distFor = (fill) => Math.round(DEPTH_CM * (1 - fill / 100));

// deterministic fill history for the forecast chart (hourly, ~5 days)
const HIST = (() => {
  const out = [];
  let v = 6;
  for (let i = 0; i < 120; i++) {
    const hour = i % 24, day = Math.floor(i / 24);
    let rate = 0.55;
    if (hour >= 7 && hour <= 20) rate = 1.05;             // households put waste out by day
    if (day >= 4) rate *= 1.9;                            // weekend + returnees: the real spike
    v = Math.min(99, v + rate * (0.7 + 0.6 * ((i * 37) % 10) / 10));
    out.push(v);
  }
  return out;
})();

// ---------------------------------------------------------------------------
export function cameraMicro(t, cam) {
  const pos = new T.Vector3(), tgt = new T.Vector3();
  const set = (p, g, fov = 34) => { pos.set(...p); tgt.set(...g); cam.fov = fov; };

  if (t < 4.6) {                                   // opening: slow dolly over the pad
    const p = smoother(inv(0, 4.6, t));
    set([lerp(8.6, 7.2, p), lerp(3.0, 2.5, p), lerp(10.4, 8.8, p)], [-0.4, 1.5, 0], 32);
  } else if (t < 11.0) {                           // orbit the collection point
    const p = smoother(inv(4.6, 11.0, t));
    const a = lerp(-0.70, 0.28, p), rad = lerp(6.4, 5.4, p);
    set([Math.sin(a) * rad + 1.7, lerp(2.6, 2.2, p), Math.cos(a) * rad],
        [lerp(-0.9, -0.8, p), lerp(1.25, 1.15, p), 0], lerp(33, 34, p));
  } else if (t < 19.0) {                           // into the cutaway, onto the sensor
    const p = smoother(inv(11.0, 19.0, t));
    set([lerp(3.2, 2.15, p), lerp(2.5, 1.95, p), lerp(3.6, 2.6, p)],
        [lerp(-1.15, -1.22, p), lerp(1.02, 0.95, p), lerp(0.0, -0.02, p)], lerp(34, 31, p));
  } else if (t < 27.4) {                           // hold on the rising level
    const p = smoother(inv(19.0, 27.4, t));
    set([lerp(2.05, 3.0, p), lerp(1.72, 2.15, p), lerp(2.5, 3.5, p)],
        [lerp(-1.25, -1.15, p), lerp(0.88, 1.05, p), 0], lerp(31, 33, p));
  } else {                                         // lift off toward the hill
    const p = smoother(inv(27.4, 31.4, t));
    set([lerp(3.0, 7.5, p), lerp(2.7, 17.0, p), lerp(4.2, 13.0, p)],
        [lerp(-0.55, 0.5, p), lerp(1.45, 5.0, p), 0], lerp(34, 40, p));
  }

  if (t >= 59.9) {                                 // closing shot: truck at the pad
    const p = smoother(inv(60.2, 66.6, t));
    set([lerp(8.2, 6.4, p), lerp(3.1, 2.5, p), lerp(9.0, 7.0, p)],
        [lerp(-0.4, -1.1, p), lerp(1.5, 1.3, p), lerp(-1.2, -1.0, p)], lerp(35, 34, p));
    if (t > 66.6) {                                // ease out wide under the end card
      const q = smoother(inv(66.6, DUR, t));
      set([lerp(6.4, 10.4, q), lerp(2.5, 4.6, q), lerp(7.0, 12.4, q)],
          [lerp(-1.1, -1.0, q), lerp(1.3, 1.6, q), -1.0], lerp(34, 36, q));
    }
  }
  cam.position.copy(pos);
  cam.lookAt(tgt);
  cam.updateProjectionMatrix();
  return { pos, tgt };
}

/** Position of the truck glyph on the optimised route at time t. */
export function truckAt(t, M) {
  const u = clamp(inv(55.8, 59.9, t) * 0.98 + 0.005);
  return M.newRoute.curve.getPointAt(clamp(u));
}

export function cameraMacro(t, cam, M) {
  const gw = M.gateways[0];
  const pos = new T.Vector3(), tgt = new T.Vector3();
  const orbit = (cx, cz, cy, rad, az, h, fov = 32) => {
    pos.set(cx + Math.sin(az) * rad, h, cz + Math.cos(az) * rad);
    tgt.set(cx, cy, cz);
    cam.fov = fov;
  };

  if (t < 39.0) {                                  // descend onto the basin
    const p = smoother(inv(31.4, 39.0, t));
    orbit(0, 2, lerp(3.0, 1.6, p), lerp(46, 33, p), lerp(-0.55, -0.18, p), lerp(62, 26, p),
          lerp(38, 34, p));
  } else if (t < 45.4) {                           // swing to Crni vrh
    const p = smoother(inv(39.0, 45.4, t));
    orbit(lerp(0, gw.x * 0.5, p), lerp(2, gw.z * 0.5, p), lerp(1.6, 2.2, p),
          lerp(33, 28, p), lerp(-0.18, 0.58, p), lerp(26, 21, p), 34);
  } else if (t < 51.0) {                           // whole municipality, risk layer
    const p = smoother(inv(45.4, 51.0, t));
    orbit(lerp(gw.x * 0.5, 0, p), lerp(gw.z * 0.5, 1, p), lerp(2.2, 1.4, p),
          lerp(28, 32, p), lerp(0.58, 0.06, p), lerp(21, 30, p), 34);
  } else if (t < 56.6) {                           // top-down-ish: routes must be legible
    const p = smoother(inv(51.0, 56.6, t));
    orbit(0, lerp(1, 0, p), 1.4, lerp(32, 25, p), lerp(0.06, -0.3, p), lerp(30, 34, p), 34);
  } else {                                         // follow the truck
    const p = smoother(inv(56.6, 60.0, t));
    const tr = truckAt(t, M);
    orbit(lerp(0, tr.x, p), lerp(0, tr.z, p), lerp(1.4, tr.y + 0.3, p),
          lerp(25, 10, p), lerp(-0.3, -0.95, p), lerp(34, tr.y + 6.0, p), 34);
  }
  cam.position.copy(pos);
  cam.lookAt(tgt);
  cam.updateProjectionMatrix();
  return { pos, tgt };
}

// ---------------------------------------------------------------------------
/** Which stage is on screen, and how much of a fade covers the cut. */
export function stageAt(t) {
  const CUT = 31.4, BACK = 59.9;
  const stage = t < CUT || t >= BACK ? 'micro' : 'macro';
  // a short dip to near-black hides the scale jump between metres and kilometres
  const dip = Math.max(
    1 - Math.abs(t - CUT) / 0.75,
    1 - Math.abs(t - BACK) / 0.6,
    t < 0.9 ? 1 - t / 0.9 : 0,
    t > DUR - 1.2 ? inv(DUR - 1.2, DUR, t) : 0,
  );
  return { stage, dip: clamp(dip) };
}

// ---------------------------------------------------------------------------
export function applyMicro(t, S) {
  const fill = fillAt(t);
  const top = S.hero.setFill(fill);

  // The steel shell dissolves for the technical shots. The lid only cracks open
  // a little: the sensor is mounted on its underside, so throwing it wide would
  // carry the sensor out of the container and misrepresent the install.
  const cut = win(t, 11.4, 28.8, 1.6, 1.4);
  S.hero.setCutaway(cut);
  if (S.hero.inner) S.hero.inner.intensity = 2.6 * cut;
  let lidA = 0.035 * cut;
  if (t >= 59.9) lidA = 1.4 * smoother(inv(63.5, 64.4, t)) * (1 - smoother(inv(65.6, 66.6, t)));
  S.hero.setLid(lidA);

  // sensor beam + ping. One ping per second on screen stands in for one uplink
  // per hour on the device; the time-lapse shot is explicit about the rate.
  const dist = Math.max(0.10, S.sensorY - top - 0.02);
  const beamVis = win(t, 11.6, 31.0, 1.0, 0.8) * (t > 13 ? 1 : smoother(inv(11.6, 13, t)));
  const period = t < 19 ? 2.2 : 0.9;
  const ping = (t % period) / period;
  S.sensor.set(dist, ping, beamVis);

  // status ring above the container
  const badgeOp = win(t, 20.6, 31.2, 1.0, 0.6);
  S.badge.set(fill, clamp(badgeOp), t * 0.35);
  S.badge2.set(34, clamp(badgeOp) * 0.55, -t * 0.3);

  // tipping into the truck: the container rises and rotates on its trunnions,
  // which is exactly what the accelerometer reports as "emptying"
  const lift = win(t, 63.6, 66.0, 0.9, 1.0);
  const tip = smoother(inv(63.9, 64.6, t)) * (1 - smoother(inv(65.3, 66.2, t)));
  S.hero.group.position.y = 0.10 + lift * 0.62;
  S.hero.group.rotation.x = -tip * 1.0;
  S.hero.group.rotation.y = 0.18 - tip * 0.12;
  S.hero.group.position.z = 0.1 - lift * 0.8;

  // truck drive-in for the closing shot: it comes up the track from the left and
  // stops with its rear loader beside the container
  const tv = S.truck.group;
  if (t < 59.9) { tv.visible = false; } else {
    tv.visible = true;
    const p = smoother(inv(60.2, 63.3, t));
    tv.position.set(lerp(-16.5, -1.15, p), 0, lerp(-4.6, -4.2, p));
    tv.rotation.y = Math.PI * 0.5 + lerp(0.07, 0, p);
    S.truck.wheels.forEach((w) => { w.rotation.x = t * 5.5 * (1 - p * 0.99); });
    S.truck.beacon.material.color.setHex(Math.floor(t * 4) % 2 ? 0xffc23a : 0x6b4a10);
  }

  // The shadow map is frozen by default (see buildMicro). These four values plus
  // the truck fully determine where every moving caster stands, so comparing
  // them against the previous frame is enough to know whether it has to be
  // re-rendered - which, over the film, is a minority of frames.
  if (cut !== prevCut || lidA !== prevLid || lift !== prevLift || tip !== prevTip
      || tv.visible) {
    S.sun.shadow.needsUpdate = true;
    prevCut = cut; prevLid = lidA; prevLift = lift; prevTip = tip;
  }
}

export function applyMacro(t, M) {
  // settlements: first every settlement in neutral, then coloured by predicted fill
  const revealAll = ramp(t, 32.0, 36.5);
  const covOnly = ramp(t, 36.6, 38.6);
  const byFill = ramp(t, 51.4, 53.4);
  M.villages.forEach((v, i) => {
    const order = (i * 17) % M.villages.length / M.villages.length;
    const appear = clamp((revealAll - order * 0.55) / 0.45);
    v.node.visible = appear > 0.02;
    v.node.scale.setScalar(easeOut(appear) * (v.screen || 1));
    const neutral = v.cov ? NEUTRAL_COV : NEUTRAL_NOCOV;
    TMP_COLOR.copy(neutral).lerp(v.cov ? neutral : DIM_COLOR, covOnly);
    if (byFill > 0) TMP_COLOR.lerp(TMP_FILL_COLOR.setHex(levelColor(v.fill)), byFill);
    if (!v.pinMaterial) v.pinMaterial = new T.MeshBasicMaterial();
    v.pinMaterial.color.copy(TMP_COLOR);
    v.stem.material = v.head.material = v.pinMaterial;
    v.ring.material.color.copy(TMP_COLOR); v.halo.material.color.copy(TMP_COLOR);
    const pulse = v.fill >= 85 ? 1 + Math.sin(t * 5 + i) * 0.16 * byFill : 1;
    v.head.scale.setScalar((v.city ? 1.7 : 1) * pulse);
    v.halo.material.opacity = 0.55 * (0.6 + 0.4 * pulse);
  });

  // gateways: T1 first (it is the primary site), then the two secondary ones
  M.gateways.forEach((g, i) => {
    const t0 = 39.4 + i * 1.5;
    const up = ramp(t, t0, t0 + 1.2);
    g.node.visible = up > 0.02;
    const gs = g.screen || 1;
    g.node.scale.set(gs, gs * easeOut(up), gs);
    const grow = ramp(t, t0 + 0.6, t0 + 2.4);
    g.dome.scale.set(grow, 0.30 * grow, grow);
    g.dome.visible = grow > 0.02;
    g.dome.material.opacity = 0.055 * grow * (1 - ramp(t, 50.4, 51.6) * 0.55);
    g.circle.visible = grow > 0.02;
    g.circle.material.opacity = 0.85 * grow * (1 - ramp(t, 50.4, 51.6) * 0.5);
    g.circle.scale.setScalar(lerp(0.15, 1, grow));
    g.circle.position.set(g.x * (1 - g.circle.scale.x), 0, g.z * (1 - g.circle.scale.x));
    g.lamp.material.color.setHex(Math.floor(t * 3) % 2 ? 0x8ff0c0 : 0x2a6b52);

    // uplink fan: arcs light up in sequence, then fade before the risk layer
    const fan = win(t, t0 + 1.4, 50.6, 1.6, 1.0);
    g.links.visible = fan > 0.02;
    g.links.children.forEach((l, k) => {
      const w = clamp((fan * 1.5 - (k % 9) * 0.07));
      l.material.opacity = 0.34 * w * (0.55 + 0.45 * Math.sin(t * 3 - k));
    });
  });

  // risk layer
  const riskIn = ramp(t, 45.8, 48.6);
  M.dumps.visible = riskIn > 0.02;
  M.dumps.children.forEach((m, i) => {
    const w = clamp((riskIn * 1.4 - ((i * 13) % 52) / 52 * 0.4));
    m.scale.setScalar(easeOut(w) * (1 + 0.12 * Math.sin(t * 4 + i)) * (M.dumpScreen || 1));
    if (m.material.transparent) m.material.opacity = 0.30 * w;
  });

  // routes: the fixed calendar first, then the optimised one drawn over it
  const oldIn = ramp(t, 53.2, 55.4);
  M.oldRoute.mesh.visible = oldIn > 0.02;
  M.oldRoute.mesh.geometry.setDrawRange(0, Math.round(M.oldRoute.total * oldIn));
  M.oldRoute.mesh.material.opacity = 0.55 * oldIn * (1 - ramp(t, 55.6, 57.0) * 0.45);

  const newIn = ramp(t, 55.6, 58.6);
  M.newRoute.mesh.visible = newIn > 0.02;
  M.newRoute.mesh.geometry.setDrawRange(0, Math.round(M.newRoute.total * newIn));

  // truck glyph rides the optimised route
  M.truck.visible = newIn > 0.05;
  if (M.truck.visible) {
    const u = clamp(inv(55.8, 59.9, t) * 0.98 + 0.005);
    const p = truckAt(t, M);
    const q = M.newRoute.curve.getPointAt(clamp(u + 0.004));
    M.truck.position.copy(p);
    M.truck.lookAt(q);
    const s = lerp(0.5, 1, ramp(t, 55.8, 56.6)) * clamp((M.truckScreen || 1), 0.5, 2.2);
    M.truck.scale.setScalar(s);
  }
}

// ---------------------------------------------------------------------------
// overlay copy
export function hud(t, M) {
  const fill = fillAt(t);
  const dist = distFor(fill);
  const o = {
    titleOp: 0, kicker: '', headline: '', sub: '',
    telemetryOp: 0, chartOp: 0, statsOp: 0, legendOp: 0, clockOp: 0, brandOp: 0,
    cardOp: 0, cardKick: '', cardTitle: '', cardSub: '',
    json: '', pct: fill, eta: '', clockD: '', clockH: '',
    stats: [], legend: [], chart: null, callouts: [],
  };

  // ---- shot titles --------------------------------------------------------
  for (const [a, b, k, h, s] of SHOTS) {
    const op = win(t, a, b, 0.7, 0.55);
    if (op > o.titleOp) { o.titleOp = op; o.kicker = k; o.headline = h; o.sub = s; }
  }

  // ---- opening / closing cards -------------------------------------------
  if (t < 4.4) {
    o.cardOp = win(t, 0.5, 4.4, 1.0, 0.7);
    o.cardKick = 'Grad Pirot · 72 naselja';
    o.cardTitle = 'Pametno upravljanje\notpadom u selima';
    o.cardSub = 'IoT senzori popunjenosti kontejnera i AI optimizacija odvoza';
    o.titleOp = 0;
  }
  if (t > 67.2) {
    o.cardOp = win(t, 67.6, DUR - 0.2, 0.9, 1.0);
    o.cardKick = 'Prevencija umesto reakcije';
    o.cardTitle = 'Manje kilometara.\nManje divljih deponija.';
    o.cardSub = 'Ista odluka o ruti rešava i trošak i ekologiju — jer prelivanje kontejnera je ono što stvara divlju deponiju.';
    o.titleOp = 0;
  }

  o.brandOp = clamp(win(t, 1.2, DUR, 1.5, 0.8) * 0.9);

  // ---- telemetry card ----------------------------------------------------
  const telIn = win(t, 12.4, 31.2, 0.9, 0.7) + win(t, 61.0, 67.0, 0.8, 0.8);
  o.telemetryOp = clamp(telIn);
  const emptying = t > 63.9 && t < 66.0;
  const orientation = emptying ? 'emptying' : 'upright';
  const crit = fill >= 85;
  o.json = [
    '{',
    `  <span class="k">"containerId"</span>: <span class="s">"PI-BER-003"</span>,`,
    `  <span class="k">"measuredAt"</span>: <span class="s">"2026-09-${19}T${clockOf(t).iso}Z"</span>,`,
    `  <span class="k">"distanceCm"</span>: <span class="n">${dist}</span>,`,
    `  <span class="k">"fillPercent"</span>: <span class="${crit ? 'crit' : 'n'}">${Math.round(fill)}</span>,`,
    `  <span class="k">"temperatureC"</span>: <span class="n">21.4</span>,`,
    `  <span class="k">"orientation"</span>: <span class="${emptying ? 'warn' : 's'}">"${orientation}"</span>,`,
    `  <span class="k">"batteryPercent"</span>: <span class="n">92</span>,`,
    `  <span class="k">"status"</span>: [<span class="s">"ok"</span>],`,
    `  <span class="k">"rssi"</span>: <span class="n">-108</span>, <span class="k">"snr"</span>: <span class="n">7.5</span>`,
    '}',
  ].join('\n');
  o.eta = emptying ? 'pražnjenje u toku'
    : fill >= 88 ? 'prelivanje za ~9 h'
    : fill >= 70 ? 'prelivanje za ~2 dana' : '';

  // ---- clock chip (the time-lapse) ---------------------------------------
  o.clockOp = win(t, 19.6, 27.2, 0.6, 0.5);
  const ck = clockOf(t);
  o.clockD = ck.day; o.clockH = ck.hm;

  // ---- forecast chart ----------------------------------------------------
  o.chartOp = win(t, 21.4, 31.2, 0.9, 0.7);
  o.chart = { now: clamp(inv(21.0, 27.0, t)), hist: HIST };

  // ---- stat strips (macro) -----------------------------------------------
  const pack = (a, b, items) => {
    const op = win(t, a, b, 0.7, 0.5);
    if (op > o.statsOp) { o.statsOp = op; o.stats = items; }
  };
  pack(33.4, 39.0, [
    ['72', 'naselja u opštini', '#fff'],
    ['24', 'sa organizovanim odvozom', '#3fc168'],
    ['48', 'još van sistema', '#fa7c20'],
  ]);
  pack(40.2, 45.4, [
    ['3', 'gateway tačke (T1, T3, T4)', '#fff'],
    ['12,5 km', 'domet sa Crnog vrha', '#ffb347'],
    ['0 €', 'trošak veze po senzoru', '#3fc168'],
  ]);
  pack(46.4, 51.0, [
    ['52', 'evidentirane divlje deponije', '#fff'],
    ['30', 'ponavljaju se posle čišćenja', '#e62c2c'],
    ['261', 'kontejnera 1,1 m³ na evidenciji', '#449ac0'],
  ]);
  pack(52.4, 59.6, [
    ['11', 'naselja u današnjoj ruti', '#ffb347'],
    ['−34 %', 'pređenih kilometara', '#3fc168'],
    ['0', 'prelivanja u planu', '#3fc168'],
  ]);

  // ---- legend -------------------------------------------------------------
  const leg = (a, b, items) => {
    const op = win(t, a, b, 0.6, 0.5);
    if (op > o.legendOp) { o.legendOp = op; o.legend = items; }
  };
  leg(36.8, 39.0, [['#3fc168', 'organizovan odvoz'], ['#6f8a86', 'van sistema']]);
  leg(47.0, 51.0, [['#e62c2c', 'ponavlja se posle čišćenja'], ['#ff9a6a', 'jednokratna prijava'],
                   ['#ffffff', 'tačka registra vs. centroid naselja']]);
  leg(53.6, 59.6, [['#7d8f93', 'fiksni kalendar: sva pokrivena naselja'],
                   ['#ffb347', 'optimizovana ruta: kritični kontejneri'],
                   ['#e62c2c', 'predviđeno prelivanje']]);
  if (t > 53.6 && t < 55.6) o.legendOp = Math.min(o.legendOp, win(t, 53.6, 59.6, 0.6, 0.5));

  // titles and legends share the lower-left corner; the legend wins in macro
  if (o.legendOp > 0.1 && o.titleOp > 0.1) o.titleOp *= 0.0;

  // ---- 3D-anchored callouts ----------------------------------------------
  const co = (id, stage, anchor, title, sub, op, side = 'right') => {
    if (op > 0.01) o.callouts.push({ id, stage, anchor, title, sub, op: clamp(op), side });
  };
  co('cont', 'micro', [-0.82, 1.5, 0.55], 'Kontejner 1,1 m³',
     'DIN EN 840 · ~15–25 domaćinstava', win(t, 6.0, 10.4, 0.7, 0.5), 'right');
  co('sens', 'micro', [-0.80, 1.30, -0.02], 'EM310-UDL',
     '111 × 62 × 40 mm · IP67 · 10 god.', win(t, 13.4, 18.8, 0.7, 0.5), 'right');
  co('dist', 'micro', [-0.82, 0.95, 0.02], `distanceCm ${dist}`,
     `fillPercent ${Math.round(fill)} %`, win(t, 15.0, 18.8, 0.7, 0.5), 'left');
  co('crit', 'micro', [-0.82, 2.35, 0.1], 'Kritičan nivo',
     'prioritet ulazi u sutrašnju rutu', win(t, 25.0, 27.2, 0.6, 0.4), 'right');
  co('empt', 'micro', [-0.82, 1.9, 0.1], 'orientation: emptying',
     'potvrda da je ruta odvezena', win(t, 64.4, 66.6, 0.5, 0.5), 'right');
  if (M) {
    const [g1, g3, g4] = M.gateways;
    co('g1', 'macro', [g1.x, g1.y + 1.1, g1.z], 'T1 · Crni vrh (Vidlič)',
       `${sr(g1.elevLabel)} m · postojeći RTS toranj · domet ${sr(g1.r, 1)} km`,
       win(t, 40.4, 50.2, 0.7, 0.6));
    co('g3', 'macro', [g3.x, g3.y + 0.9, g3.z], 'T3 · Belava',
       'zapadna sela, dolina Nišave', win(t, 42.0, 50.2, 0.6, 0.6), 'left');
    co('g4', 'macro', [g4.x, g4.y + 0.9, g4.z], 'T4 · Vlaška planina',
       'Krupac, Barje, jug kotline', win(t, 43.4, 50.2, 0.6, 0.6), 'left');
    const named = ['Pirot', 'Temska', 'Gostuša', 'Krupac', 'Berilovac', 'Dojkinci'];
    named.forEach((n, i) => {
      const v = M.villages.find((q) => q.n === n);
      if (!v) return;
      co('v' + i, 'macro', [v.x, v.y + 0.45, v.z], v.n,
         v.k ? `${v.k} kontejnera · ${sr(v.hh || 0)} domaćinstava`
             : (v.cov ? 'u sistemu odvoza' : 'van organizovanog odvoza'),
         win(t, 34.6 + i * 0.35, 38.8, 0.6, 0.5), i % 2 ? 'left' : 'right');
    });
  }
  return o;
}

/** Clock shown during the time-lapse: Monday 06:00 → Saturday evening. */
function clockOf(t) {
  const days = ['Ponedeljak', 'Utorak', 'Sreda', 'Četvrtak', 'Petak', 'Subota'];
  const p = clamp(inv(19.4, 27.2, t));
  const hours = p * (5 * 24 + 12) + 6;
  const d = Math.min(5, Math.floor(hours / 24));
  const h = Math.floor(hours % 24), m = Math.floor((hours % 1) * 60);
  const hm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return { day: days[d], hm, iso: `${hm}:11` };
}

/** Builds the forecast SVG: measured curve, dashed forecast, 80% threshold. */
export function chartSvg(state) {
  if (!state) return '';
  const W = 466, H = 176, PADX = 22, PADB = 26, PADT = 12;
  const n = state.hist.length;
  const nowI = Math.max(2, Math.round(state.now * (n * 0.62)));
  const x = (i) => PADX + (i / (n - 1)) * (W - PADX * 2);
  const y = (v) => PADT + (1 - v / 100) * (H - PADT - PADB);

  const measured = state.hist.slice(0, nowI).map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const forecast = state.hist.slice(nowI - 1).map((v, i) => `${x(nowI - 1 + i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const cross = state.hist.findIndex((v) => v >= 80);
  const showCross = nowI > cross * 0.45 && cross > 0;

  return `
    <defs>
      <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3fc168" stop-opacity=".45"/>
        <stop offset="1" stop-color="#3fc168" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <line x1="${PADX}" y1="${y(80)}" x2="${W - PADX}" y2="${y(80)}"
      stroke="#fa7c20" stroke-width="1.5" stroke-dasharray="6 5" opacity=".85"/>
    <text x="${W - PADX}" y="${y(80) - 7}" text-anchor="end" fill="#fa7c20"
      font-family="JBMono" font-size="12">prag 80 %</text>
    <polygon points="${x(0).toFixed(1)},${y(0)} ${measured} ${x(nowI - 1).toFixed(1)},${y(0)}"
      fill="url(#fg)"/>
    <polyline points="${measured}" fill="none" stroke="#3fc168" stroke-width="2.6"
      stroke-linejoin="round"/>
    <polyline points="${forecast}" fill="none" stroke="#ffd98a" stroke-width="2.2"
      stroke-dasharray="7 6" opacity=".95"/>
    ${showCross ? `<circle cx="${x(cross).toFixed(1)}" cy="${y(80).toFixed(1)}" r="5.5"
      fill="#e62c2c" stroke="#fff" stroke-width="2"/>` : ''}
    <line x1="${PADX}" y1="${H - PADB}" x2="${W - PADX}" y2="${H - PADB}"
      stroke="#ffffff" stroke-opacity=".18"/>
    <text x="${PADX}" y="${H - 8}" fill="#7fb79c" font-family="JBMono" font-size="12">pon</text>
    <text x="${W / 2}" y="${H - 8}" text-anchor="middle" fill="#7fb79c" font-family="JBMono"
      font-size="12">sreda</text>
    <text x="${W - PADX}" y="${H - 8}" text-anchor="end" fill="#7fb79c" font-family="JBMono"
      font-size="12">subota</text>`;
}
