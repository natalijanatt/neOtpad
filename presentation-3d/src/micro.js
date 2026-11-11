// Close-up stage: one rural collection point (sabirno mesto) in metres.
// Geometry follows the real hardware so the slide survives a technical question:
// container = DIN EN 840 four-wheel 1.1 m3 (1370 x 1200 x 1460 mm, 200 mm castors),
// sensor = Milesight EM310-UDL (111 x 62 x 40 mm, IP67, ultrasonic, mounted with
// screws on the flat underside of the lid).

import * as T from 'three';
import { rng, fbm, lerp, clamp, smooth, levelColor } from './util.js';

const CONT = { w: 1.37, d: 1.20, h: 1.05, lid: 0.11, depth: 1.10 }; // depth = configured container depth
const SENSOR = { w: 0.111, d: 0.062, h: 0.040 };

/** Box with a smaller bottom than top — how a real container tapers for nesting. */
function taperedBox(wTop, dTop, wBot, dBot, h) {
  const xt = wTop / 2, zt = dTop / 2, xb = wBot / 2, zb = dBot / 2;
  const v = [
    [-xb, 0, -zb], [xb, 0, -zb], [xb, 0, zb], [-xb, 0, zb],       // 0..3 bottom
    [-xt, h, -zt], [xt, h, -zt], [xt, h, zt], [-xt, h, zt],       // 4..7 top
  ];
  const quads = [
    [3, 2, 6, 7], [1, 0, 4, 5], [2, 1, 5, 6], [0, 3, 7, 4],        // front, back, right, left
    [0, 1, 2, 3].reverse(),                                       // bottom; open top
  ];
  const pos = [];
  for (const [a, b, c, d] of quads) {
    for (const i of [a, b, c, a, c, d]) pos.push(...v[i]);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Convex lid: a shallow arc in the z/y plane, extruded across the container width. */
function convexLid(w, d, rise) {
  const s = new T.Shape();
  const n = 14;
  s.moveTo(-d / 2, 0);
  for (let i = 0; i <= n; i++) {
    const z = -d / 2 + (d * i) / n;
    s.lineTo(z, rise * Math.max(0, Math.cos((z / (d / 2)) * (Math.PI / 2))) ** 1.4);
  }
  s.lineTo(d / 2, 0);
  s.lineTo(d / 2, -0.035); s.lineTo(-d / 2, -0.035); // skirt, so the lid reads as a shell
  const g = new T.ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
  g.rotateY(Math.PI / 2);          // profile was built in z/y, extrusion becomes width
  g.translate(-w / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

const M = {
  steel: () => new T.MeshStandardMaterial({ color: 0x9caaa6, metalness: 0.78, roughness: 0.30 }),
  steelDark: () => new T.MeshStandardMaterial({ color: 0x74807d, metalness: 0.8, roughness: 0.3 }),
  plastic: (c) => new T.MeshStandardMaterial({ color: c, metalness: 0.06, roughness: 0.55 }),
  rubber: () => new T.MeshStandardMaterial({ color: 0x1b1f1e, metalness: 0.1, roughness: 0.85 }),
  white: () => new T.MeshStandardMaterial({ color: 0xf2f4f2, metalness: 0.05, roughness: 0.45 }),
};

let wasteTexture = null;
function packedWasteTexture() {
  if (wasteTexture) return wasteTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'), random = rng(73);
  ctx.fillStyle = '#554f43'; ctx.fillRect(0, 0, 256, 256);
  const colors = ['#292e2c', '#3b4039', '#777163', '#969080', '#55584a', '#353934'];
  for (let i = 0; i < 2200; i++) {
    const x = random() * 256, y = random() * 256, size = 2 + random() * 13;
    ctx.fillStyle = colors[Math.floor(random() * colors.length)];
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + size, y + size * 0.25);
    ctx.lineTo(x + size * 0.7, y + size * 0.8);
    ctx.lineTo(x - size * 0.2, y + size * 0.6); ctx.closePath(); ctx.fill();
  }
  wasteTexture = new T.CanvasTexture(canvas);
  wasteTexture.colorSpace = T.SRGBColorSpace;
  wasteTexture.wrapS = wasteTexture.wrapT = T.RepeatWrapping;
  return wasteTexture;
}

/** A 1.1 m3 four-wheel container. `lidColor` distinguishes mixed waste from recycling. */
export function buildContainer(lidColor = 0x1d6b3f, seed = 7) {
  const g = new T.Group();
  const bodyY = 0.20;                                    // castor + frame height
  const shell = [];       // panels the cutaway turns to glass
  const trim = [];        // ribs and fittings: hidden outright, they read as bars

  const body = new T.Mesh(taperedBox(CONT.w, CONT.d, CONT.w * 0.86, CONT.d * 0.88, CONT.h), M.steel());
  body.position.y = bodyY; body.castShadow = true; body.receiveShadow = true;
  g.add(body); shell.push(body);
  const edges = new T.LineSegments(
    new T.EdgesGeometry(body.geometry, 25),
    new T.LineBasicMaterial({ color: 0xd8fff0, transparent: true, opacity: 0 }));
  edges.position.y = bodyY; g.add(edges);

  // vertical corrugation: what makes a galvanised container read as one at a glance
  for (let i = 0; i < 9; i++) {
    const x = lerp(-CONT.w / 2 + 0.10, CONT.w / 2 - 0.10, i / 8);
    for (const sz of [-1, 1]) {
      const rib = new T.Mesh(new T.BoxGeometry(0.05, CONT.h * 0.90, 0.03), M.steelDark());
      rib.position.set(x, bodyY + CONT.h * 0.5, sz * (CONT.d / 2 - 0.035 * (1 - 0)) * 0.985);
      rib.rotation.x = sz > 0 ? 0.055 : -0.055;          // follow the taper
      rib.castShadow = true; g.add(rib); trim.push(rib);
    }
  }
  // top rim
  for (const side of [-1, 1]) {
    const front = new T.Mesh(new T.BoxGeometry(CONT.w + 0.04, 0.05, 0.045), M.steelDark());
    front.position.set(0, bodyY + CONT.h, side * CONT.d / 2);
    const lateral = new T.Mesh(new T.BoxGeometry(0.045, 0.05, CONT.d), M.steelDark());
    lateral.position.set(side * CONT.w / 2, bodyY + CONT.h, 0);
    for (const rim of [front, lateral]) { rim.castShadow = true; g.add(rim); trim.push(rim); }
  }

  // DIN EN 840 lifting comb on the front face + side trunnions for the truck's arms
  const combY = bodyY + CONT.h * 0.93;
  for (const dy of [0, -0.13]) {
    const bar = new T.Mesh(new T.BoxGeometry(0.66, 0.045, 0.05), M.steelDark());
    bar.position.set(0, combY + dy, CONT.d / 2 + 0.035); bar.castShadow = true;
    g.add(bar); trim.push(bar);
  }
  for (const sx of [-1, 0, 1]) {
    const tab = new T.Mesh(new T.BoxGeometry(0.05, 0.19, 0.045), M.steelDark());
    tab.position.set(sx * 0.28, combY - 0.065, CONT.d / 2 + 0.035); g.add(tab); trim.push(tab);
  }
  for (const sx of [-1, 1]) {
    const pin = new T.Mesh(new T.CylinderGeometry(0.028, 0.028, 0.10, 12), M.steelDark());
    pin.rotation.z = Math.PI / 2;
    pin.position.set(sx * (CONT.w / 2 + 0.04), bodyY + CONT.h * 0.62, 0); g.add(pin);
  }

  // castors: 200 mm rubber wheels in steel yokes
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const yoke = new T.Mesh(new T.BoxGeometry(0.10, 0.10, 0.07), M.steelDark());
    yoke.position.set(sx * (CONT.w / 2 - 0.16), 0.15, sz * (CONT.d / 2 - 0.14)); g.add(yoke);
    const wheel = new T.Mesh(new T.CylinderGeometry(0.10, 0.10, 0.055, 18), M.rubber());
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx * (CONT.w / 2 - 0.16), 0.10, sz * (CONT.d / 2 - 0.14));
    wheel.castShadow = true; g.add(wheel);
  }

  // ---- lid, hinged at the back edge ----------------------------------------
  const lidPivot = new T.Group();
  lidPivot.position.set(0, bodyY + CONT.h + 0.025, -CONT.d / 2 - 0.02);
  const lid = new T.Mesh(convexLid(CONT.w + 0.06, CONT.d + 0.06, CONT.lid), M.plastic(lidColor));
  lid.position.z = CONT.d / 2 + 0.02; lid.castShadow = true; lid.receiveShadow = true;
  lidPivot.add(lid);
  g.add(lidPivot);

  const floor = new T.Mesh(new T.BoxGeometry(CONT.w * 0.86, 0.04, CONT.d * 0.88),
    new T.MeshStandardMaterial({ color: 0x4d5653, metalness: 0.5, roughness: 0.6 }));
  floor.position.y = bodyY + 0.04; floor.receiveShadow = true; g.add(floor);

  // ---- waste heap: a displaced surface that rises with the fill level -------
  const heapGeo = new T.PlaneGeometry(CONT.w * 0.86, CONT.d * 0.88, 30, 28);
  heapGeo.rotateX(-Math.PI / 2);
  const base = heapGeo.attributes.position.array.slice();
  const heap = new T.Mesh(heapGeo, new T.MeshStandardMaterial({
    color: 0x585047, roughness: 0.92, metalness: 0.02, flatShading: true,
  }));
  heap.receiveShadow = true; g.add(heap);

  // Close the heap down to the floor. Its upper rim follows the actual displaced
  // surface vertices, so the cutaway never shows a floating sheet or an air gap.
  const columns = 30, rows = 28, layers = 8;
  const perimeter = [];
  for (let x = 0; x <= columns; x++) perimeter.push(x);
  for (let z = 1; z <= rows; z++) perimeter.push(z * (columns + 1) + columns);
  for (let x = columns - 1; x >= 0; x--) perimeter.push(rows * (columns + 1) + x);
  for (let z = rows - 1; z > 0; z--) perimeter.push(z * (columns + 1));
  const ringSize = perimeter.length + 1; // duplicate the UV seam
  const volumePositions = new Float32Array((ringSize * (layers + 1) + 1) * 3);
  const volumeUvs = new Float32Array((ringSize * (layers + 1) + 1) * 2);
  const volumeIndices = [];
  for (let layer = 0; layer <= layers; layer++) {
    for (let j = 0; j < ringSize; j++) {
      const id = layer * ringSize + j;
      volumeUvs[id * 2] = j / perimeter.length * 4;
      if (layer < layers && j < perimeter.length) {
        const next = id + 1, above = id + ringSize;
        volumeIndices.push(id, above, above + 1, id, above + 1, next);
      }
    }
  }
  const bottomCenter = ringSize * (layers + 1);
  const wasteFloor = bodyY + 0.06;
  volumePositions[bottomCenter * 3 + 1] = wasteFloor;
  for (let j = 0; j < perimeter.length; j++) volumeIndices.push(bottomCenter, j, j + 1);
  const volumeGeo = new T.BufferGeometry();
  volumeGeo.setAttribute('position', new T.BufferAttribute(volumePositions, 3).setUsage(T.DynamicDrawUsage));
  volumeGeo.setAttribute('uv', new T.BufferAttribute(volumeUvs, 2).setUsage(T.DynamicDrawUsage));
  volumeGeo.setIndex(volumeIndices);
  const wasteVolume = new T.Mesh(volumeGeo, new T.MeshStandardMaterial({
    map: packedWasteTexture(), roughness: 0.96, metalness: 0, side: T.DoubleSide,
  }));
  wasteVolume.receiveShadow = true;
  // The bounding volume changes with fill; do not reuse a stale culling sphere.
  wasteVolume.frustumCulled = false;
  g.add(wasteVolume);

  // a few bags sitting on the heap, so the surface reads as rubbish and not terrain
  const r = rng(seed);
  const bags = [];
  const bagCols = [0x22272b, 0x1a1f22, 0x2e3a42, 0x8f8b7e, 0x3a3f36, 0x262b2e];
  for (let i = 0; i < 18; i++) {
    const geo = new T.IcosahedronGeometry(lerp(0.11, 0.20, r()), 2);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {                   // gentle crumple: a bag, not a shard
      // Coincident vertices must move together, otherwise non-indexed faces split.
      const s = 0.92 + 0.16 * fbm(p.getX(k) * 18 + i, p.getZ(k) * 18 + p.getY(k) * 7, 2, seed);
      p.setXYZ(k, p.getX(k) * s, p.getY(k) * s * 0.66, p.getZ(k) * s);
    }
    geo.computeVertexNormals();
    const m = new T.Mesh(geo, new T.MeshStandardMaterial({
      color: bagCols[i % bagCols.length], roughness: 0.62, metalness: 0.02,
    }));
    m.userData = { u: r() - 0.5, v: r() - 0.5, rise: r(), rot: r() * Math.PI };
    m.rotation.set(r(), r() * Math.PI, r() * 0.4);
    m.castShadow = true;
    g.add(m); bags.push(m);
  }

  // ---- state ---------------------------------------------------------------
  const api = {
    group: g, lidPivot, lid, heap, wasteVolume, bags, body, shell, trim,
    bodyY,
    /** v 0..1 — dissolves the steel shell so the interior, sensor and beam read.
     *  A real cutaway beats an open lid here: the lid is where the sensor lives,
     *  so swinging it open would carry the sensor out of the container. */
    setCutaway(v) {
      for (const m of trim) { m.visible = v < 0.35; }
      edges.material.opacity = 0.55 * v;
      for (const m of shell) {
        m.material.transparent = v > 0.01;
        m.material.opacity = 1 - v * 0.72;
        m.material.side = v > 0.01 ? T.DoubleSide : T.FrontSide;
        m.material.depthWrite = v < 0.5;
        m.castShadow = v < 0.5;
      }
      lid.material.transparent = v > 0.01;
      lid.material.opacity = 1 - v * 0.68;
      lid.castShadow = v < 0.5;
    },
    /** pct 0..100 — moves the heap surface and lifts the bags with it. */
    setFill(pct) {
      const f = clamp(pct / 100);
      const top = bodyY + 0.08 + f * (CONT.h - 0.10);
      const pos = heapGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], z = base[i * 3 + 2];
        const n = fbm(x * 2.1 + 3, z * 2.1 + 7, 3, seed) - 0.5;
        const edge = 1 - Math.max(Math.abs(x) / (CONT.w * 0.42), Math.abs(z) / (CONT.d * 0.43)) ** 3;
        pos.setY(i, top + n * 0.28 * f * edge + f * 0.06 * edge);
      }
      pos.needsUpdate = true; heapGeo.computeVertexNormals();
      const wide = lerp(0.88, 1.0, f);                   // the body tapers inward at the base
      heap.scale.set(wide, 1, wide);
      heap.visible = f > 0.02;
      for (let layer = 0; layer <= layers; layer++) {
        const fraction = layer / layers;
        const width = lerp(0.88, wide, fraction);
        for (let j = 0; j < ringSize; j++) {
          const surfaceId = perimeter[j % perimeter.length];
          const id = layer * ringSize + j;
          const y = lerp(wasteFloor, pos.getY(surfaceId), fraction);
          volumePositions[id * 3] = base[surfaceId * 3] * width;
          volumePositions[id * 3 + 1] = y;
          volumePositions[id * 3 + 2] = base[surfaceId * 3 + 2] * width;
          volumeUvs[id * 2 + 1] = (y - wasteFloor) * 1.5;
        }
      }
      volumeGeo.attributes.position.needsUpdate = true;
      volumeGeo.attributes.uv.needsUpdate = true;
      volumeGeo.computeVertexNormals();
      wasteVolume.visible = heap.visible;
      for (const b of api.bags) {
        const d = b.userData;
        const bx = d.u * CONT.w * 0.66, bz = d.v * CONT.d * 0.66;
        const n = fbm(bx * 2.1 + 3, bz * 2.1 + 7, 3, seed) - 0.5;
        b.position.set(bx, top + n * 0.10 * f - 0.04, bz);
        b.visible = f > 0.10 && d.rise < f * 1.25;        // fewer bags show when near empty
      }
      return top;
    },
    /** radians — 0 closed, ~1.9 fully open. */
    setLid(a) { lidPivot.rotation.x = -a; },
  };
  api.setFill(0);
  return api;
}

/** The EM310-UDL, screwed to the underside of the lid, plus its measuring beam. */
function buildSensor() {
  const g = new T.Group();
  const shell = new T.Mesh(new T.BoxGeometry(SENSOR.w, SENSOR.h, SENSOR.d), M.white());
  shell.castShadow = true; g.add(shell);
  // the two ultrasonic transducers on the bottom face
  for (const sx of [-1, 1]) {
    const t = new T.Mesh(new T.CylinderGeometry(0.0135, 0.0135, 0.008, 16),
      new T.MeshStandardMaterial({ color: 0x9aa3a6, metalness: 0.7, roughness: 0.35 }));
    t.position.set(sx * 0.026, -SENSOR.h / 2 - 0.003, 0); g.add(t);
  }
  // screw tabs, because "mounted on a flat surface with screws" is the real method
  for (const sx of [-1, 1]) {
    const tab = new T.Mesh(new T.BoxGeometry(0.014, 0.012, 0.030), M.white());
    tab.position.set(sx * (SENSOR.w / 2 + 0.006), SENSOR.h / 2 - 0.006, 0); g.add(tab);
  }
  const led = new T.Mesh(new T.SphereGeometry(0.0045, 10, 8),
    new T.MeshBasicMaterial({ color: 0x3fc168 }));
  led.position.set(0, -SENSOR.h / 2 - 0.001, SENSOR.d / 2 - 0.012); g.add(led);

  // measuring beam: a cone whose length is the measured distance
  const beamMat = new T.MeshBasicMaterial({
    color: 0x7cf0cc, transparent: true, opacity: 0.30, side: T.DoubleSide,
    blending: T.AdditiveBlending, depthWrite: false,
  });
  const beam = new T.Mesh(new T.ConeGeometry(0.17, 1, 32, 1, true), beamMat);
  beam.rotation.x = 0;                                    // apex at the sensor, opening downward
  g.add(beam);

  // three expanding wavefronts travelling down the beam during a ping
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const m = new T.Mesh(new T.RingGeometry(0.02, 0.05, 40),
      new T.MeshBasicMaterial({ color: 0x8ff0c0, transparent: true, opacity: 0,
        side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; g.add(m); rings.push(m);
  }

  // a measured-distance dimension line, offset from the beam axis so both read
  const dim = new T.Group();
  const dimMat = new T.MeshBasicMaterial({ color: 0xbdf5da });
  const stem = new T.Mesh(new T.BoxGeometry(0.010, 1, 0.010), dimMat);
  stem.position.y = -0.5; dim.add(stem);
  const ticks = [];
  for (const k of [0, 1]) {
    const tk = new T.Mesh(new T.BoxGeometry(0.13, 0.010, 0.010), dimMat);
    dim.add(tk); ticks.push(tk);
  }
  dim.position.set(0.36, 0, 0.1);
  g.add(dim);

  return {
    group: g, led, beam, rings, dim,
    /** dist in metres from the sensor head to the waste; ping 0..1 drives the wavefronts. */
    set(dist, ping, beamOpacity = 1) {
      stem.scale.y = dist; stem.position.y = -dist / 2;
      ticks[0].position.y = 0; ticks[1].position.y = -dist;
      dim.visible = beamOpacity > 0.05;
      dimMat.opacity = beamOpacity; dimMat.transparent = true;
      beam.scale.set(1, dist, 1);
      beam.position.y = -dist / 2;
      beam.material.opacity = 0.30 * beamOpacity;
      rings.forEach((m, i) => {
        const p = (ping * 1.5 - i * 0.22);
        const vis = p > 0 && p < 1;
        m.visible = vis && beamOpacity > 0.02;
        if (!vis) return;
        const y = -p * dist;
        m.position.y = y;
        const rr = 0.02 + (Math.abs(y) / dist) * 0.17;
        m.scale.setScalar(rr / 0.035);
        m.material.opacity = 0.95 * Math.sin(p * Math.PI) * beamOpacity;
      });
      led.material.color.setHex(ping > 0 && ping < 0.3 ? 0xffffff : 0x3fc168);
    },
  };
}

/** Status ring + pole light above a container: the fill state readable from afar. */
function buildBadge() {
  const g = new T.Group();
  const ring = new T.Mesh(new T.TorusGeometry(0.30, 0.035, 12, 40),
    new T.MeshBasicMaterial({ color: 0x3fc168, transparent: true, opacity: 0.95 }));
  ring.rotation.x = -Math.PI / 2; g.add(ring);
  const glow = new T.Mesh(new T.CircleGeometry(0.30, 40),
    new T.MeshBasicMaterial({ color: 0x3fc168, transparent: true, opacity: 0.18,
      blending: T.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; g.add(glow);
  const beam = new T.Mesh(new T.CylinderGeometry(0.30, 0.30, 1.0, 32, 1, true),
    new T.MeshBasicMaterial({ color: 0x3fc168, transparent: true, opacity: 0.07,
      blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
  beam.position.y = -0.5; g.add(beam);
  const badgeColor = new T.Color();
  return {
    group: g,
    set(pct, opacity, spin) {
      badgeColor.setHex(levelColor(pct));
      ring.material.color.copy(badgeColor);
      glow.material.color.copy(badgeColor);
      beam.material.color.copy(badgeColor);
      ring.material.opacity = 0.95 * opacity;
      glow.material.opacity = 0.20 * opacity;
      beam.material.opacity = 0.08 * opacity;
      g.rotation.y = spin;
      g.visible = opacity > 0.01;
    },
  };
}

/** Stylised rear-loader collection truck in the utility's orange. */
export function buildTruck() {
  const g = new T.Group();
  const orange = M.plastic(0xe8761c), white = M.plastic(0xeef1ee), glass =
    new T.MeshStandardMaterial({ color: 0x18323a, metalness: 0.5, roughness: 0.18 });

  const chassis = new T.Mesh(new T.BoxGeometry(2.45, 0.28, 7.6), M.steelDark());
  chassis.position.y = 0.78; chassis.castShadow = true; g.add(chassis);

  const cab = new T.Mesh(new T.BoxGeometry(2.42, 1.62, 2.2), white);
  cab.position.set(0, 1.72, 2.55); cab.castShadow = true; g.add(cab);
  const wind = new T.Mesh(new T.BoxGeometry(2.28, 0.86, 0.12), glass);
  wind.position.set(0, 2.06, 3.62); g.add(wind);
  for (const sx of [-1, 1]) {
    const side = new T.Mesh(new T.BoxGeometry(0.12, 0.74, 1.9), glass);
    side.position.set(sx * 1.2, 1.94, 2.5); g.add(side);
  }
  const hood = new T.Mesh(new T.BoxGeometry(2.3, 0.7, 0.9), white);
  hood.position.set(0, 1.2, 3.9); hood.castShadow = true; g.add(hood);

  const hopper = new T.Mesh(new T.BoxGeometry(2.5, 2.05, 4.9), orange);
  hopper.position.set(0, 2.0, -0.85); hopper.castShadow = true; g.add(hopper);
  const stripe = new T.Mesh(new T.BoxGeometry(2.54, 0.16, 4.94), white);
  stripe.position.set(0, 1.45, -0.85); g.add(stripe);
  const tail = new T.Mesh(new T.BoxGeometry(2.46, 1.7, 1.15), M.plastic(0xd06416));
  tail.position.set(0, 1.55, -3.6); tail.castShadow = true; g.add(tail);
  const comb = new T.Mesh(new T.BoxGeometry(1.5, 0.12, 0.5), M.steelDark());
  comb.position.set(0, 0.95, -4.15); g.add(comb);

  const wheels = [];
  for (const sx of [-1, 1]) for (const z of [2.5, -1.4, -2.5]) {
    const w = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 0.36, 20), M.rubber());
    w.rotation.z = Math.PI / 2; w.position.set(sx * 1.16, 0.55, z);
    w.castShadow = true; g.add(w); wheels.push(w);
  }
  const beacon = new T.Mesh(new T.SphereGeometry(0.1, 12, 10),
    new T.MeshBasicMaterial({ color: 0xffc23a }));
  beacon.position.set(0, 2.6, 1.6); g.add(beacon);

  return { group: g, wheels, beacon };
}

// ---------------------------------------------------------------------------
export function buildMicro(renderer) {
  const scene = new T.Scene();
  scene.background = skyTexture();
  scene.fog = new T.Fog(0xc4d2cc, 55, 300);

  // Galvanised steel is a metal: with no environment to reflect it renders
  // black, so the stage gets a prefiltered sky/ground probe.
  if (renderer) {
    const pmrem = new T.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(skyTexture()).texture;
    scene.environmentIntensity = 0.5;
    pmrem.dispose();
  }

  // --- light: late afternoon, sun from the west over the Pirot basin --------
  const sun = new T.DirectionalLight(0xfff2dc, 2.9);
  sun.position.set(-7.5, 9.5, 5.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -11; sun.shadow.camera.right = 11;
  sun.shadow.camera.top = 11; sun.shadow.camera.bottom = -11;
  sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 46;
  sun.shadow.bias = -0.0009; sun.shadow.normalBias = 0.018;
  // The sun never moves and neither do the houses, trees, fence or ground, so
  // the 2048² map is not re-rendered every frame. applyMicro raises needsUpdate
  // on the frames where a caster actually moves (cutaway, lid, tipping
  // container, truck); the camera may move freely without touching it.
  sun.shadow.autoUpdate = false;
  scene.add(sun);
  scene.add(new T.HemisphereLight(0xc8e4ff, 0x46502f, 0.42));
  const fillLight = new T.DirectionalLight(0xbfd8ff, 0.22);
  fillLight.position.set(6, 4, -6); scene.add(fillLight);

  // --- ground: grass with a gravel pad under the collection point -----------
  const gTex = groundTexture();
  const ground = new T.Mesh(new T.PlaneGeometry(320, 320, 1, 1),
    new T.MeshStandardMaterial({ map: gTex, roughness: 0.95, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const pad = new T.Mesh(new T.BoxGeometry(4.6, 0.10, 3.1),
    new T.MeshStandardMaterial({ color: 0x6e6b63, roughness: 0.96 }));
  pad.position.set(0, 0.05, 0); pad.receiveShadow = true; scene.add(pad);

  // low block wall behind the pad — how rural collection points are actually built
  for (let i = 0; i < 3; i++) {
    const w = new T.Mesh(new T.BoxGeometry(4.6, 0.22, 0.22),
      new T.MeshStandardMaterial({ color: 0xa79f8e, roughness: 0.92 }));
    w.position.set(0, 0.16 + i * 0.22, -1.62); w.castShadow = true; w.receiveShadow = true;
    scene.add(w);
  }

  // --- the containers -------------------------------------------------------
  const hero = buildContainer(0x1d6b3f, 7);            // mixed waste, green lid
  hero.group.position.set(-0.82, 0.10, 0.1);
  hero.group.rotation.y = 0.18;
  scene.add(hero.group);

  const second = buildContainer(0x2563a8, 21);         // dry recyclables, blue lid
  second.group.position.set(0.92, 0.10, -0.05);
  second.group.rotation.y = -0.1;
  second.setFill(34);
  scene.add(second.group);

  // The sensor is screwed to the flat underside of the lid, so it rides the lid
  // pivot; the beam therefore tilts with the lid exactly as it would in the field.
  // a soft lamp inside the hero container: without it the cutaway interior is a
  // black hole, since the only real light comes from above a closed lid
  const inner = new T.PointLight(0xfff0e0, 0, 3.0, 2);
  inner.position.set(0, hero.bodyY + CONT.h * 0.75, 0.15);
  hero.group.add(inner);
  hero.inner = inner;

  const sensor = buildSensor();
  hero.lidPivot.add(sensor.group);
  sensor.group.position.set(0, -0.032, CONT.d / 2 + 0.02 - 0.10);
  const sensorY = hero.bodyY + CONT.h + 0.025 - 0.032;   // local height of the sensor head

  const badge = buildBadge();
  badge.group.position.set(-0.82, 2.35, 0.1);
  scene.add(badge.group);

  const badge2 = buildBadge();
  badge2.group.position.set(0.92, 2.2, -0.05);
  scene.add(badge2.group);

  const truck = buildTruck();
  truck.group.position.set(-14, 0, 0.1);
  truck.group.rotation.y = -Math.PI * 0.5;
  scene.add(truck.group);

  // --- village dressing -----------------------------------------------------
  scene.add(villageProps());

  const camera = new T.PerspectiveCamera(34, 16 / 9, 0.05, 420);

  return { scene, camera, hero, second, sensor, badge, badge2, truck, sun,
           CONT, SENSOR, sensorY };
}

/** Equirectangular sky: warm horizon over the basin, cool zenith, olive ground. */
function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.00, '#2f6f9e');
  g.addColorStop(0.30, '#6ea9cd');
  g.addColorStop(0.45, '#a9cede');
  g.addColorStop(0.50, '#dcd7bd');   // horizon haze
  g.addColorStop(0.55, '#6c7a52');
  g.addColorStop(1.00, '#3d4630');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
  // a soft sun disc so the metal has a highlight to catch
  const sg = x.createRadialGradient(300, 190, 6, 300, 190, 150);
  sg.addColorStop(0, 'rgba(255,248,226,1)');
  sg.addColorStop(1, 'rgba(255,240,210,0)');
  x.fillStyle = sg; x.beginPath(); x.arc(300, 190, 150, 0, 7); x.fill();
  const tex = new T.CanvasTexture(c);
  tex.mapping = T.EquirectangularReflectionMapping;
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

/** Grass + dirt-track ground, painted once into a canvas so the plane has detail. */
function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#56612f'; x.fillRect(0, 0, 512, 512);
  const r = rng(3);
  for (let i = 0; i < 26000; i++) {
    const a = r();
    x.fillStyle = a < 0.4 ? '#65723a' : a < 0.7 ? '#48522a' : a < 0.9 ? '#72804a' : '#3d4724';
    const px = r() * 512, py = r() * 512;
    x.fillRect(px, py, 1 + r() * 2.5, 1 + r() * 2);
  }
  // a dirt track running past the collection point
  x.save();
  x.translate(256, 0); x.rotate(0.06);
  const grad = x.createLinearGradient(-60, 0, 60, 0);
  grad.addColorStop(0, 'rgba(128,112,86,0)');
  grad.addColorStop(0.3, 'rgba(136,120,92,.95)');
  grad.addColorStop(0.7, 'rgba(136,120,92,.95)');
  grad.addColorStop(1, 'rgba(128,112,86,0)');
  x.fillStyle = grad; x.fillRect(-60, -80, 120, 680);
  x.restore();
  const tex = new T.CanvasTexture(c);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.repeat.set(26, 26);
  tex.anisotropy = 8;
  return tex;
}

/** Houses, fence, poles, trees and the ridge line that place the scene in a village. */
function villageProps() {
  const g = new T.Group();
  const r = rng(11);
  const wall = [0xe8e0cf, 0xdcd3bd, 0xcfc4ad, 0xe3d8c4];
  const roof = [0xa3543a, 0x8f4a34, 0xb35e42];

  const house = (x, z, ry, w, d, h) => {
    const hg = new T.Group();
    const b = new T.Mesh(new T.BoxGeometry(w, h, d),
      new T.MeshStandardMaterial({ color: wall[(r() * 4) | 0], roughness: 0.88 }));
    b.position.y = h / 2; b.castShadow = true; b.receiveShadow = true; hg.add(b);
    const rf = new T.Mesh(new T.CylinderGeometry(0.02, Math.hypot(w, d) * 0.52, h * 0.55, 4, 1),
      new T.MeshStandardMaterial({ color: roof[(r() * 3) | 0], roughness: 0.85, flatShading: true }));
    rf.position.y = h + h * 0.275; rf.rotation.y = Math.PI / 4;
    rf.scale.set(1, 1, d / w > 1 ? 1 : 1);
    rf.castShadow = true; hg.add(rf);
    // a lit window or two, so the houses do not read as blank boxes
    for (let i = 0; i < 2; i++) {
      const win = new T.Mesh(new T.BoxGeometry(0.75, 0.85, 0.06),
        new T.MeshStandardMaterial({ color: 0x3a4348, roughness: 0.3, metalness: 0.4 }));
      win.position.set(-w / 4 + (i * w) / 2, h * 0.55, d / 2 + 0.02); hg.add(win);
    }
    hg.position.set(x, 0, z); hg.rotation.y = ry;
    return hg;
  };
  g.add(house(-11, -9.5, 0.22, 8.5, 6.5, 3.2));
  g.add(house(9.5, -12, -0.5, 7.5, 6, 3.0));
  g.add(house(-17, 4, 1.3, 7, 6, 2.9));
  g.add(house(16, 3, -1.15, 8, 6.5, 3.1));
  g.add(house(-4, -22, 0.1, 9, 7, 3.4));

  const tree = (x, z, s) => {
    const tg = new T.Group();
    const tr = new T.Mesh(new T.CylinderGeometry(0.11 * s, 0.16 * s, 1.5 * s, 8),
      new T.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.92 }));
    tr.position.y = 0.75 * s; tr.castShadow = true; tg.add(tr);
    for (let i = 0; i < 3; i++) {
      const bl = new T.Mesh(new T.IcosahedronGeometry(1.1 * s * (1 - i * 0.18), 1),
        new T.MeshStandardMaterial({ color: i % 2 ? 0x44622f : 0x4f6f36, roughness: 0.9, flatShading: true }));
      bl.position.set((r() - 0.5) * 0.4 * s, (1.7 + i * 0.75) * s, (r() - 0.5) * 0.4 * s);
      bl.castShadow = true; tg.add(bl);
    }
    tg.position.set(x, 0, z);
    return tg;
  };
  g.add(tree(-6.5, -6.2, 1.25)); g.add(tree(5.6, -7.4, 1.0));
  g.add(tree(-14, -3.5, 1.5)); g.add(tree(12, -4.5, 1.35)); g.add(tree(-2.5, -13, 1.1));

  // wooden fence along the track
  for (let i = 0; i < 22; i++) {
    const p = new T.Mesh(new T.BoxGeometry(0.09, 1.05, 0.09),
      new T.MeshStandardMaterial({ color: 0x8a7350, roughness: 0.95 }));
    p.position.set(-8.6 + (r() - 0.5) * 0.08, 0.52, -7 + i * 1.15);
    p.rotation.z = (r() - 0.5) * 0.06; p.castShadow = true; g.add(p);
  }
  for (let i = 0; i < 2; i++) {
    const rail = new T.Mesh(new T.BoxGeometry(0.06, 0.09, 24),
      new T.MeshStandardMaterial({ color: 0x8a7350, roughness: 0.95 }));
    rail.position.set(-8.6, 0.45 + i * 0.4, 5.1); rail.castShadow = true; g.add(rail);
  }

  // utility pole with a wire — the piece of infrastructure every village has
  const pole = new T.Mesh(new T.CylinderGeometry(0.11, 0.14, 8.2, 10),
    new T.MeshStandardMaterial({ color: 0x6f6355, roughness: 0.95 }));
  pole.position.set(4.6, 4.1, -3.4); pole.castShadow = true; g.add(pole);
  const arm = new T.Mesh(new T.BoxGeometry(1.5, 0.1, 0.1),
    new T.MeshStandardMaterial({ color: 0x6f6355, roughness: 0.95 }));
  arm.position.set(4.6, 7.7, -3.4); g.add(arm);

  // ridge line: Stara planina / Vidlic as a matte backdrop inside the fog
  const ridge = (dist, h, col, seed) => {
    const seg = 90, w = dist * 2.6;
    const geo = new T.PlaneGeometry(w, h, seg, 1);
    const p = geo.attributes.position;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const y = (fbm(u * 5.2, 0.5, 4, seed) * 0.8 + 0.35) * h;
      p.setY(i + seg + 1, y);                             // top row
    }
    p.needsUpdate = true; geo.computeVertexNormals();
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: col, fog: true }));
    m.position.set(0, 0, -dist);
    return m;
  };
  g.add(ridge(148, 52, 0x6d8894, 5));
  g.add(ridge(104, 32, 0x5f7d78, 9));
  g.add(ridge(72, 19, 0x566f5b, 13));
  return g;
}
