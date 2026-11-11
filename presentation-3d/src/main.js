// Renderer + overlay driver. Exposes window.ANIM for the offline frame grabber:
//   ANIM.ready   - resolves when both stages and the fonts are in place
//   ANIM.seek(t) - draws exactly the frame at t seconds (no animation loop)
// Open index.html?play=1 to watch it live instead.

import * as T from 'three';
import { buildMicro } from './micro.js';
import { buildMacro } from './macro.js';
import {
  DUR, applyMicro, applyMacro, cameraMicro, cameraMacro, stageAt, hud, chartSvg,
} from './story.js';
import { clamp, levelCss, sr } from './util.js';

const W = 1920, H = 1080, FPS = 30;

const canvas = document.getElementById('c');
// the macro camera spans 50 m to 400 km (near 0.05 / far 400 world units); a
// linear depth buffer runs out of precision at that range and the terrain's
// wireframe overlay z-fights with the relief underneath it, flickering as the
// camera moves.
const renderer = new T.WebGLRenderer({
  canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.96;
renderer.outputColorSpace = T.SRGBColorSpace;

// full-screen dip used to hide the metres → kilometres cut
const flash = document.createElement('div');
flash.style.cssText = 'position:absolute;inset:0;background:#040c09;opacity:0;pointer-events:none';
document.getElementById('ui').appendChild(flash);

const el = {
  stage: document.getElementById('stage'),
  title: document.getElementById('title'),
  kicker: document.querySelector('#kicker .tx'),
  headline: document.getElementById('headline'),
  sub: document.getElementById('sub'),
  tel: document.getElementById('telemetry'),
  json: document.getElementById('json'),
  pct: document.getElementById('meterPct'),
  eta: document.getElementById('meterEta'),
  fill: document.getElementById('meterFill'),
  chart: document.getElementById('chart'),
  chartSvg: document.getElementById('chartSvg'),
  stats: document.getElementById('stats'),
  legend: document.getElementById('legend'),
  clock: document.getElementById('clock'),
  clockD: document.querySelector('#clock .d'),
  clockH: document.querySelector('#clock .h'),
  brand: document.getElementById('brand'),
  card: document.getElementById('card'),
  cardKick: document.getElementById('cardKick'),
  cardTitle: document.getElementById('cardTitle'),
  cardSub: document.getElementById('cardSub'),
  callouts: document.getElementById('callouts'),
};
el.brand.innerHTML = '<b>Pametno upravljanje otpadom</b><br>Grad Pirot · podaci: JKP „Komunalac”, SEPA/NRIZ, Eko Alert';

const MICRO = buildMicro(renderer);
let MACRO = null;

// The offline grabber screenshots the page at a true 1920×1080 viewport, so it
// needs every pixel. The live preview does not: fitStage scales the stage down
// to the window, and rendering more pixels than the window can show is the
// second largest cost in the frame after the relief itself.
const PREVIEW = new URLSearchParams(location.search).has('play');

/** Scale the 1920×1080 stage to whatever window is showing it (preview only). */
function fitStage() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  el.stage.style.transform = `scale(${s})`;
  el.stage.style.left = `${(window.innerWidth - W * s) / 2}px`;
  el.stage.style.top = `${(window.innerHeight - H * s) / 2}px`;
  if (PREVIEW) renderer.setPixelRatio(Math.min(1, s));
}
window.addEventListener('resize', fitStage);
fitStage();

// --- overlay helpers --------------------------------------------------------
const setOp = (node, v) => { node.style.opacity = v.toFixed(3); };
const calloutNodes = new Map();
const TMP_VEC = new T.Vector3();

function renderCallouts(list, cam) {
  const seen = new Set();
  for (const c of list) {
    seen.add(c.id);
    let n = calloutNodes.get(c.id);
    if (!n) {
      n = document.createElement('div');
      n.className = 'callout';
      n.innerHTML = '<div class="row" style="display:flex;align-items:center">'
        + '<div class="lead"></div><div class="box"><div class="t"></div><div class="s"></div></div></div>';
      el.callouts.appendChild(n);
      calloutNodes.set(c.id, n);
      // everything that does not change with t is set once here: re-querying and
      // rewriting a full cssText per callout per frame is pure overlay cost
      const left = c.side === 'left';
      n.elLead = n.querySelector('.lead');
      n.elLead.style.cssText = 'height:1px;background:rgba(160,255,205,.55);'
        + `box-shadow:0 0 8px rgba(120,255,200,.6);flex:0 0 auto;order:${left ? 2 : 0}`;
      n.querySelector('.row').style.flexDirection = 'row';
      n.style.transform = left ? 'translate(-100%,-50%)' : 'translate(0,-50%)';
      n.querySelector('.t').textContent = c.title;
      n.querySelector('.s').textContent = c.sub;
    }
    const p = TMP_VEC.set(c.anchor[0], c.anchor[1], c.anchor[2]).project(cam);
    if (p.z > 1) { n.style.opacity = 0; continue; }
    const sx = (p.x * 0.5 + 0.5) * W, sy = (-p.y * 0.5 + 0.5) * H;
    n.elLead.style.width = `${56 * c.op}px`;
    n.style.left = `${sx}px`;
    n.style.top = `${sy}px`;
    n.style.opacity = c.op.toFixed(3);
    // anchor dot
    if (!n.dot) {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;width:9px;height:9px;border-radius:50%;'
        + 'background:#8ff0c0;box-shadow:0 0 12px #8ff0c0;transform:translate(-50%,-50%)';
      el.callouts.appendChild(d); n.dot = d;
    }
    n.dot.style.left = `${sx}px`; n.dot.style.top = `${sy}px`;
    n.dot.style.opacity = n.style.opacity;
  }
  for (const [id, n] of calloutNodes) {
    if (!seen.has(id)) { n.style.opacity = 0; if (n.dot) n.dot.style.opacity = 0; }
  }
}

let lastStats = '', lastLegend = '', lastChart = '';

function drawOverlay(o, cam) {
  setOp(el.title, o.titleOp);
  el.kicker.textContent = o.kicker;
  el.headline.innerHTML = o.headline.replace(/\n/g, '<br>');
  el.sub.textContent = o.sub;

  setOp(el.tel, o.telemetryOp);
  if (o.telemetryOp > 0.01) {
    el.json.innerHTML = o.json;
    el.pct.textContent = `${Math.round(o.pct)}%`;
    el.pct.style.color = levelCss(o.pct);
    el.fill.style.width = `${o.pct.toFixed(1)}%`;
    el.fill.style.background = levelCss(o.pct);
    el.fill.style.color = levelCss(o.pct);
    el.eta.textContent = o.eta;
    el.eta.style.color = o.pct >= 85 ? '#ff8b7a' : '#ecbe24';
  }

  setOp(el.chart, o.chartOp);
  if (o.chartOp > 0.01) {
    const svg = chartSvg(o.chart);
    if (svg !== lastChart) { el.chartSvg.innerHTML = svg; lastChart = svg; }
  }

  setOp(el.stats, o.statsOp);
  const statKey = JSON.stringify(o.stats);
  if (o.statsOp > 0.01 && statKey !== lastStats) {
    el.stats.innerHTML = o.stats
      .map(([v, l, c]) => `<div class="stat"><div class="v" style="color:${c}">${v}</div>`
        + `<div class="l">${l}</div></div>`).join('');
    lastStats = statKey;
  }

  setOp(el.legend, o.legendOp);
  const legKey = JSON.stringify(o.legend);
  if (o.legendOp > 0.01 && legKey !== lastLegend) {
    el.legend.innerHTML = o.legend
      .map(([c, l]) => `<div class="lg"><i style="color:${c}"></i>${l}</div>`).join('');
    lastLegend = legKey;
  }

  setOp(el.clock, o.clockOp);
  el.clockD.textContent = o.clockD; el.clockH.textContent = o.clockH;

  setOp(el.brand, o.brandOp);

  setOp(el.card, o.cardOp);
  if (o.cardOp > 0.01) {
    el.cardKick.textContent = o.cardKick;
    el.cardTitle.innerHTML = o.cardTitle.replace(/\n/g, '<br>');
    el.cardSub.textContent = o.cardSub;
  }

  renderCallouts(o.callouts, cam);
}

// --- the frame --------------------------------------------------------------
function frame(t) {
  t = clamp(t, 0, DUR);
  const { stage, dip } = stageAt(t);
  flash.style.opacity = dip.toFixed(3);

  applyMicro(t, MICRO);

  let cam;
  if (stage === 'macro' && MACRO) {
    // camera first: marker sizes are a function of camera distance, so the
    // screen-size pass needs this frame's eye position, not the last one's
    cameraMacro(t, MACRO.camera, MACRO);
    MACRO.scaleNodes(MACRO.camera.position);
    const d = MACRO.camera.position.length();
    MACRO.dumpScreen = Math.max(0.5, Math.min(2.6, d * 0.026));
    MACRO.truckScreen = Math.max(0.6, Math.min(3.0, d * 0.03));
    applyMacro(t, MACRO);
    cam = MACRO.camera;
    renderer.render(MACRO.scene, MACRO.camera);
  } else {
    if (MACRO) applyMacro(t, MACRO);
    cameraMicro(t, MICRO.camera);
    cam = MICRO.camera;
    renderer.render(MICRO.scene, MICRO.camera);
  }
  drawOverlay(hud(t, MACRO), cam);
}

// --- boot -------------------------------------------------------------------
const ready = (async () => {
  MACRO = await buildMacro();
  await document.fonts.ready;
  // warm the shader cache for both stages so the first captured frames are not blank
  renderer.compile(MICRO.scene, MICRO.camera);
  renderer.compile(MACRO.scene, MACRO.camera);
  frame(0);
  document.body.dataset.ready = '1';
})();

window.ANIM = {
  duration: DUR, fps: FPS, width: W, height: H,
  ready,
  seek(t) { frame(t); },
};

if (PREVIEW) {
  const t0 = performance.now();
  const loop = () => {
    const t = ((performance.now() - t0) / 1000) % DUR;
    frame(t);
    requestAnimationFrame(loop);
  };
  ready.then(loop);
} else {
  const q = new URLSearchParams(location.search).get('t');
  if (q !== null) ready.then(() => frame(parseFloat(q)));
}
