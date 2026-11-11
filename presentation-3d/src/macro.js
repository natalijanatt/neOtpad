// Wide stage: the Pirot basin as a digital twin. 1 world unit = 1 km.
//
// Nothing here is invented geography. The relief is an SRTM-derived elevation
// grid (terrain.json, fetched from the public terrarium tiles), the 72
// settlements carry their real coordinates, household counts and container
// counts from waste-scraper/data/pirot_naselja.csv, and the illegal dumps are
// the canonical records - minus the Eko Alert default coordinate, which means
// "location unknown" and would otherwise pile 20 dumps onto one pixel
// (docs/data-sources.md).

import * as T from 'three';
import DATA from './data.js';
import { rng, clamp, lerp, inv, levelColor } from './util.js';

export const VEXAG = 2.1;          // vertical exaggeration; relief is unreadable at 1:1
const LATC = 43.17, LONC = 22.615; // scene origin, roughly the middle of the basin

/** Proposed gateway sites from the research: high points with line of sight. */
// Coordinates are the nearest summit in the elevation grid to each site the
// research proposes; elevLabel keeps the documented height, because SRTM at this
// zoom smooths a peak by a few tens of metres.
const GW = [
  { id: 'T1', name: 'Crni vrh (Vidlič)', lat: 43.1832, lon: 22.6551, r: 12.5, primary: true,
    elevLabel: 1152, note: 'postojeći RTS toranj · struja na licu mesta' },
  { id: 'T3', name: 'Belava (zapad)', lat: 43.1600, lon: 22.4110, r: 9.0,
    elevLabel: 962, note: 'zapadna sela i dolina Nišave' },
  { id: 'T4', name: 'Vlaška planina (jugozapad)', lat: 43.0267, lon: 22.4975, r: 9.5,
    elevLabel: 1224, note: 'Krupac, Barje, jug kotline' },
];

export function project(lat, lon) {
  const x = (lon - LONC) * 111.320 * Math.cos((LATC * Math.PI) / 180);
  const z = -(lat - LATC) * 110.574;
  return [x, z];
}

/** Hypsometric tint in the spirit of the municipal map, darkened for the twin look. */
function tint(e) {
  const stops = [
    [250, 0x2e5a36], [420, 0x3d6b39], [650, 0x5c7a3c], [850, 0x8a8145],
    [1100, 0xa9834c], [1400, 0x9c6f4b], [1750, 0x8a6252], [2200, 0xa89a93],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (e <= stops[i][0]) {
      const t = inv(stops[i - 1][0], stops[i][0], e);
      return new T.Color(stops[i - 1][1]).lerp(new T.Color(stops[i][1]), t);
    }
  }
  return new T.Color(stops[stops.length - 1][1]);
}

let GLOW = null;
/** Soft radial dot used for every marker halo. */
function glowTexture() {
  if (GLOW) return GLOW;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  GLOW = new T.CanvasTexture(c);
  return GLOW;
}

export async function buildMacro() {
  const grid = await fetch('terrain.json').then((r) => r.json());
  const [lon0, lat0, lon1, lat1] = grid.bbox;
  const [xW, zN] = project(lat1, lon0);   // north-west corner
  const [xE, zS] = project(lat0, lon1);   // south-east corner
  const W = xE - xW, D = zS - zN;

  /** Bilinear elevation in metres at scene x/z; clamped at the edges. */
  const elevAt = (x, z) => {
    const u = clamp((x - xW) / W) * (grid.nx - 1);
    const v = clamp((z - zN) / D) * (grid.ny - 1);
    const i0 = Math.floor(u), j0 = Math.floor(v);
    const i1 = Math.min(i0 + 1, grid.nx - 1), j1 = Math.min(j0 + 1, grid.ny - 1);
    const fu = u - i0, fv = v - j0;
    const e = grid.elev;
    return lerp(lerp(e[j0][i0], e[j0][i1], fu), lerp(e[j1][i0], e[j1][i1], fu), fv);
  };
  /** Scene height (km, exaggerated) at x/z. */
  const hAt = (x, z) => (elevAt(x, z) / 1000) * VEXAG;

  const scene = new T.Scene();
  scene.background = new T.Color(0x060f14);
  scene.fog = new T.FogExp2(0x07141a, 0.0075);

  // --- relief ---------------------------------------------------------------
  const geo = new T.PlaneGeometry(W, D, grid.nx - 1, grid.ny - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new T.Color();
  let eMin = Infinity, eMax = -Infinity;
  for (let j = 0; j < grid.ny; j++) {
    for (let i = 0; i < grid.nx; i++) {
      const k = j * grid.nx + i;
      const e = grid.elev[j][i];
      if (e < eMin) eMin = e;
      if (e > eMax) eMax = e;
      pos.setY(k, (e / 1000) * VEXAG);
      c.copy(tint(e));
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
  }
  geo.setAttribute('color', new T.BufferAttribute(col, 3));
  pos.needsUpdate = true; geo.computeVertexNormals();
  const terrain = new T.Mesh(geo, new T.MeshStandardMaterial({
    vertexColors: true, roughness: 0.94, metalness: 0.02, flatShading: false,
  }));
  terrain.position.set(xW + W / 2, 0, zN + D / 2);
  terrain.receiveShadow = true;
  scene.add(terrain);

  // Isolines over the relief: reads as "survey model", not photo.
  //
  // This used to be `wireframe: true` on a clone of the relief, which drew every
  // triangle edge of the 192x192 grid - 220k line segments per frame for a layer
  // that was all but invisible at 0.028 opacity, and the single largest item in
  // the frame budget on an integrated GPU. Contours carry the information the
  // wireframe only hinted at, in one draw call and an order of magnitude fewer
  // segments. Every point on an isoline sits at the same elevation by
  // definition, so only x/z need interpolating.
  const CONTOUR_STEP = 200;    // metres between isolines
  const CONTOUR_INDEX = 1000;  // every fifth line drawn brighter, as on a survey map
  const contours = (() => {
    const verts = [], cols = [];
    const base = new T.Color(0x9fe8cf);
    const cx = [0, 0], cz = [0, 0];

    /** Crossings of level L through one triangle: 0 or exactly 2, never ambiguous. */
    const cross = (x0, z0, e0, x1, z1, e1, x2, z2, e2, L) => {
      let n = 0;
      const edge = (xa, za, ea, xb, zb, eb) => {
        if ((ea >= L) === (eb >= L) || n === 2) return;
        const t = (L - ea) / (eb - ea);
        cx[n] = xa + (xb - xa) * t; cz[n] = za + (zb - za) * t; n++;
      };
      edge(x0, z0, e0, x1, z1, e1);
      edge(x1, z1, e1, x2, z2, e2);
      edge(x2, z2, e2, x0, z0, e0);
      return n === 2;
    };

    for (let L = Math.ceil(eMin / CONTOUR_STEP) * CONTOUR_STEP; L <= eMax; L += CONTOUR_STEP) {
      const lit = L % CONTOUR_INDEX === 0 ? 1 : 0.45;
      const y = (L / 1000) * VEXAG + 0.014;  // clear of the surface it is drawn on
      for (let j = 0; j < grid.ny - 1; j++) {
        const z0 = zN + (j / (grid.ny - 1)) * D, z1 = zN + ((j + 1) / (grid.ny - 1)) * D;
        for (let i = 0; i < grid.nx - 1; i++) {
          const x0 = xW + (i / (grid.nx - 1)) * W, x1 = xW + ((i + 1) / (grid.nx - 1)) * W;
          const eA = grid.elev[j][i], eB = grid.elev[j + 1][i];
          const eC = grid.elev[j + 1][i + 1], eD = grid.elev[j][i + 1];
          // same split as PlaneGeometry, so the lines lie on the drawn surface
          for (const tri of [
            [x0, z0, eA, x0, z1, eB, x1, z0, eD],
            [x0, z1, eB, x1, z1, eC, x1, z0, eD],
          ]) {
            if (!cross(tri[0], tri[1], tri[2], tri[3], tri[4], tri[5],
              tri[6], tri[7], tri[8], L)) continue;
            verts.push(cx[0], y, cz[0], cx[1], y, cz[1]);
            for (let v = 0; v < 2; v++) cols.push(base.r * lit, base.g * lit, base.b * lit);
          }
        }
      }
    }

    const cg = new T.BufferGeometry();
    cg.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    cg.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    const lines = new T.LineSegments(cg, new T.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false,
    }));
    lines.frustumCulled = false;
    return lines;
  })();
  scene.add(contours);

  // Side walls down to a base plane: without them the relief is a floating sheet
  // and the camera keeps catching its cut edge.
  {
    const base = -1.2;
    const ring = [];
    for (let i = 0; i < grid.nx; i++) ring.push([xW + (i / (grid.nx - 1)) * W, zN]);
    for (let j = 0; j < grid.ny; j++) ring.push([xE, zN + (j / (grid.ny - 1)) * D]);
    for (let i = grid.nx - 1; i >= 0; i--) ring.push([xW + (i / (grid.nx - 1)) * W, zS]);
    for (let j = grid.ny - 1; j >= 0; j--) ring.push([xW, zN + (j / (grid.ny - 1)) * D]);
    const wall = [];
    for (let k = 0; k < ring.length - 1; k++) {
      const [ax, az] = ring[k], [bx, bz] = ring[k + 1];
      const ay = hAt(ax, az), by = hAt(bx, bz);
      wall.push(ax, ay, az, bx, by, bz, ax, base, az);
      wall.push(bx, by, bz, bx, base, bz, ax, base, az);
    }
    const wg = new T.BufferGeometry();
    wg.setAttribute('position', new T.Float32BufferAttribute(wall, 3));
    wg.computeVertexNormals();
    scene.add(new T.Mesh(wg, new T.MeshStandardMaterial({
      color: 0x16241f, roughness: 0.9, metalness: 0.1, side: T.DoubleSide })));
    const bottom = new T.Mesh(new T.PlaneGeometry(W, D),
      new T.MeshBasicMaterial({ color: 0x0a1210 }));
    bottom.rotation.x = Math.PI / 2;
    bottom.position.set(xW + W / 2, base, zN + D / 2);
    scene.add(bottom);
  }

  // --- light ----------------------------------------------------------------
  const sun = new T.DirectionalLight(0xffe9c8, 2.3);
  sun.position.set(-26, 26, 14);
  scene.add(sun);
  scene.add(new T.HemisphereLight(0x8fd8ff, 0x0a1a14, 0.75));
  const rim = new T.DirectionalLight(0x5fd0ff, 0.5);
  rim.position.set(20, 8, -22); scene.add(rim);

  // --- settlements ----------------------------------------------------------
  // Priority is derived, not decorated: households per documented container is
  // the load an actual collection point carries, and a settlement with no
  // organised collection and a recorded dump nearby is exactly the case the
  // system exists for.
  const dumpsByVillage = {};
  for (const d of DATA.dumps) dumpsByVillage[d.n] = (dumpsByVillage[d.n] || 0) + 1;

  const villages = DATA.villages.map((v, i) => {
    const [x, z] = project(v.lat, v.lon);
    const y = hAt(x, z);
    const dumps = dumpsByVillage[v.n] || 0;
    const load = v.k ? (v.hh || 0) / v.k : null;         // households per container
    return { ...v, i, x, z, y, dumps, load };
  });

  // a deterministic "predicted fill" per settlement for the forecast shot:
  // high where load per container is high, where dumps recur, and where the
  // weekly interval is long - the three things the real model would weigh.
  const r = rng(42);
  for (const v of villages) {
    let s = 0.30 + 0.5 * r();
    if (v.load) s += clamp((v.load - 25) / 60) * 0.35;
    if (v.dumps) s += clamp(v.dumps / 3) * 0.22;
    if (v.w) s += clamp((3 - v.w) / 3) * 0.12;
    if (!v.cov) s += 0.10;
    if (v.city) s = 0.55 + 0.1 * r();
    v.fill = clamp(s) * 100;
  }

  const markers = new T.Group(); scene.add(markers);
  const markerMat = new Map();
  const matFor = (hex) => {
    if (!markerMat.has(hex)) markerMat.set(hex, new T.MeshBasicMaterial({ color: hex }));
    return markerMat.get(hex);
  };

  const pinGeo = new T.CylinderGeometry(0.022, 0.022, 1, 8);
  pinGeo.translate(0, 0.5, 0);
  const headGeo = new T.SphereGeometry(0.07, 14, 12);
  const ringGeo = new T.RingGeometry(0.11, 0.145, 28);

  for (const v of villages) {
    const g = new T.Group();
    g.position.set(v.x, v.y, v.z);
    const hgt = v.city ? 0.62 : 0.34 + clamp((v.hh || 60) / 900) * 0.34;
    const stem = new T.Mesh(pinGeo, matFor(0x2bd6a8));
    stem.scale.y = hgt; g.add(stem);
    const head = new T.Mesh(headGeo, matFor(0x2bd6a8));
    head.position.y = hgt; head.scale.setScalar(v.city ? 1.7 : 1); g.add(head);
    // depthWrite off: a translucent ring that writes depth makes the sort order
    // between neighbouring pins visible, and they flicker as the camera moves
    const ring = new T.Mesh(ringGeo, new T.MeshBasicMaterial({
      color: 0x2bd6a8, transparent: true, opacity: 0.5, side: T.DoubleSide,
      depthWrite: false,
    }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
    ring.scale.setScalar(v.city ? 2.4 : 1); g.add(ring);
    // a camera-facing glow keeps the pin readable against bright relief
    const halo = new T.Sprite(new T.SpriteMaterial({
      map: glowTexture(), color: 0x2bd6a8, transparent: true, opacity: 0.38,
      blending: T.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(0.32); halo.position.y = hgt; g.add(halo);
    markers.add(g);
    v.node = g; v.stem = stem; v.head = head; v.ring = ring; v.halo = halo; v.hgt = hgt;
  }

  // --- recorded illegal dumps ----------------------------------------------
  const dumps = new T.Group(); dumps.visible = false; scene.add(dumps);
  const dumpGeo = new T.TetrahedronGeometry(0.2);
  const softGeo = new T.CircleGeometry(0.55, 18);
  for (const d of DATA.dumps) {
    const [x, z] = project(d.lat, d.lon);
    const y = hAt(x, z);
    const precise = d.prec === 'registarska_tacka';
    if (precise) {
      const m = new T.Mesh(dumpGeo, new T.MeshBasicMaterial({ color: d.rec ? 0xff5a4a : 0xff9a6a }));
      m.position.set(x, y + 0.22, z); m.rotation.y = 0.6; dumps.add(m);
    } else {
      // settlement-centroid precision: draw it as a blur, never as a surveyed point
      const m = new T.Sprite(new T.SpriteMaterial({
        map: glowTexture(), color: d.rec ? 0xff4a38 : 0xff9a6a, transparent: true,
        opacity: 0.45, blending: T.AdditiveBlending, depthWrite: false,
      }));
      m.scale.setScalar(0.9); m.position.set(x, y + 0.12, z); dumps.add(m);
    }
  }

  // --- gateways and coverage ------------------------------------------------
  const gateways = GW.map((g) => {
    let [x, z] = project(g.lat, g.lon);
    // snap to the highest point within 1.2 km: a gateway goes on the summit,
    // not on the coordinate someone typed
    let best = elevAt(x, z), bx = x, bz = z;
    for (let i = 0; i < 400; i++) {
      const a = (i / 400) * Math.PI * 2, rr = 0.15 + 1.05 * ((i * 37) % 100) / 100;
      const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      const e = elevAt(px, pz);
      if (e > best) { best = e; bx = px; bz = pz; }
    }
    x = bx; z = bz;
    const y = (best / 1000) * VEXAG;
    const node = new T.Group(); node.position.set(x, y, z); scene.add(node);

    // lattice mast
    const mast = new T.Mesh(new T.CylinderGeometry(0.018, 0.05, 0.55, 6),
      new T.MeshStandardMaterial({ color: 0xcfe6df, metalness: 0.6, roughness: 0.4 }));
    mast.position.y = 0.275; node.add(mast);
    for (let i = 0; i < 4; i++) {
      const br = new T.Mesh(new T.TorusGeometry(0.038 - i * 0.006, 0.005, 6, 12),
        new T.MeshBasicMaterial({ color: 0x9fd8c8 }));
      br.rotation.x = Math.PI / 2; br.position.y = 0.09 + i * 0.13; node.add(br);
    }
    // LoRa antennas
    for (const sx of [-1, 1]) {
      const a = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.2, 8),
        new T.MeshBasicMaterial({ color: 0xe8fff6 }));
      a.position.set(sx * 0.035, 0.63, 0); node.add(a);
    }
    const lamp = new T.Mesh(new T.SphereGeometry(0.035, 12, 10),
      new T.MeshBasicMaterial({ color: 0x8ff0c0 }));
    lamp.position.y = 0.75; node.add(lamp);
    const gHalo = new T.Sprite(new T.SpriteMaterial({
      map: glowTexture(), color: g.primary ? 0xffc46a : 0x7fe6ff, transparent: true,
      opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false }));
    gHalo.scale.setScalar(0.9); gHalo.position.y = 0.62; node.add(gHalo);

    // coverage: translucent dome + a circle draped on the relief at radius r
    const dome = new T.Mesh(
      new T.SphereGeometry(g.r, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
      new T.MeshBasicMaterial({
        color: g.primary ? 0xffb347 : 0x5fd0ff, transparent: true, opacity: 0.055,
        side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending,
      }));
    dome.scale.y = 0.30; node.add(dome);

    const pts = [];
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      const px = x + Math.cos(a) * g.r, pz = z + Math.sin(a) * g.r;
      pts.push(new T.Vector3(px, hAt(px, pz) + 0.09, pz));
    }
    const circle = new T.Line(new T.BufferGeometry().setFromPoints(pts),
      new T.LineBasicMaterial({
        color: g.primary ? 0xffb347 : 0x5fd0ff, transparent: true, opacity: 0.85,
      }));
    scene.add(circle);

    // the fan of uplinks this gateway receives, one thin arc per covered village
    const links = new T.Group(); scene.add(links);
    const linked = villages.filter((v) => Math.hypot(v.x - x, v.z - z) < g.r);
    for (const v of linked.filter((_, i) => i % 2 === 0)) {
      const mid = new T.Vector3((v.x + x) / 2, Math.max(v.y, y) + 1.1, (v.z + z) / 2);
      const curve = new T.QuadraticBezierCurve3(
        new T.Vector3(v.x, v.y + 0.2, v.z), mid, new T.Vector3(x, y + 0.7, z));
      const l = new T.Line(new T.BufferGeometry().setFromPoints(curve.getPoints(24)),
        new T.LineBasicMaterial({
          color: 0x8ff0c0, transparent: true, opacity: 0.22,
        }));
      links.add(l);
    }

    return { ...g, x, y, z, elev: best, node, dome, circle, links, lamp, linked };
  });

  // --- routes ---------------------------------------------------------------
  const depot = villages.find((v) => v.city) || villages[0];

  /** Nearest-neighbour tour from the depot — a stand-in for the CVRP solver. */
  const tour = (set) => {
    const left = set.slice(); const out = [depot]; let cur = depot;
    while (left.length) {
      let bi = 0, bd = Infinity;
      left.forEach((v, i) => {
        const d = Math.hypot(v.x - cur.x, v.z - cur.z);
        if (d < bd) { bd = d; bi = i; }
      });
      cur = left.splice(bi, 1)[0]; out.push(cur);
    }
    out.push(depot);
    return out;
  };

  /** Drape a tour on the relief and turn it into a tube we can reveal gradually. */
  const routeMesh = (nodes, color, radius, lift) => {
    const pts = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const steps = Math.max(3, Math.round(Math.hypot(b.x - a.x, b.z - a.z) * 1.6));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t);
        pts.push(new T.Vector3(x, hAt(x, z) + lift, z));
      }
    }
    const last = nodes[nodes.length - 1];
    pts.push(new T.Vector3(last.x, hAt(last.x, last.z) + lift, last.z));
    const curve = new T.CatmullRomCurve3(pts, false, 'catmullrom', 0.25);
    const tube = new T.TubeGeometry(curve, Math.min(1400, pts.length * 3), radius, 7, false);
    const mesh = new T.Mesh(tube, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    mesh.frustumCulled = false;
    return { mesh, curve, total: tube.index.count, length: curve.getLength() };
  };

  const covered = villages.filter((v) => v.cov && !v.city);
  const critical = villages.filter((v) => !v.city && v.fill >= 72)
    .sort((a, b) => b.fill - a.fill).slice(0, 11);

  const oldRoute = routeMesh(tour(covered), 0x7d8f93, 0.055, 0.1);
  const newRoute = routeMesh(tour(critical), 0xffb347, 0.085, 0.14);
  oldRoute.mesh.visible = false; newRoute.mesh.visible = false;
  scene.add(oldRoute.mesh); scene.add(newRoute.mesh);

  // truck glyph running the optimised route (exaggerated: a real truck is 8 m)
  // A chevron rather than a model: at map scale a truck-shaped mesh is a blob,
  // while an arrow states direction of travel at a glance.
  const truck = new T.Group();
  const head = new T.Shape();
  head.moveTo(0, 0.55); head.lineTo(-0.32, -0.34); head.lineTo(0, -0.12);
  head.lineTo(0.32, -0.34); head.lineTo(0, 0.55);
  const chev = new T.Mesh(new T.ExtrudeGeometry(head, {
    depth: 0.07, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }),
    new T.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff8c1a, emissiveIntensity: 0.6,
      metalness: 0.2, roughness: 0.35 }));
  chev.rotation.x = -Math.PI / 2; chev.position.y = 0.16; truck.add(chev);
  const tGlow = new T.Sprite(new T.SpriteMaterial({
    map: glowTexture(), color: 0xffc46a, transparent: true, opacity: 0.6,
    blending: T.AdditiveBlending, depthWrite: false }));
  tGlow.scale.setScalar(1.3); tGlow.position.y = 0.2; truck.add(tGlow);
  truck.visible = false; scene.add(truck);

  const camera = new T.PerspectiveCamera(32, 16 / 9, 0.05, 400);

  /** Keep pins and masts at a roughly constant screen size. A pin sized in
   *  kilometres either dwarfs the relief up close or vanishes from altitude. */
  const scaleNodes = (camPos) => {
    for (const v of villages) {
      v.screen = clamp(camPos.distanceTo(v.node.position) * 0.030, 0.3, 2.4);
    }
    for (const g of gateways) {
      g.screen = clamp(camPos.distanceTo(g.node.position) * 0.034, 0.35, 2.8);
    }
  };

  return {
    scene, camera, terrain, contours, markers, dumps, gateways, villages, depot, scaleNodes,
    oldRoute, newRoute, truck, critical, covered, sun, hAt, elevAt, project,
    extent: { xW, zN, W, D },
  };
}
