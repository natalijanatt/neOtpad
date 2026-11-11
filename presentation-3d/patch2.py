import io

# ---------------------------------------------------------------- story.js
p = 'src/story.js'
s = io.open(p, encoding='utf8').read()

# markers: apply the constant-screen-size factor computed from the camera
s = s.replace("""    v.node.visible = appear > 0.02;
    v.node.scale.setScalar(easeOut(appear));""",
"""    v.node.visible = appear > 0.02;
    v.node.scale.setScalar(easeOut(appear) * (v.screen || 1));""")
s = s.replace("""    const pulse = v.fill >= 85 ? 1 + Math.sin(t * 5 + i) * 0.13 * byFill : 1;
    v.head.scale.setScalar((v.city ? 1.7 : 1) * pulse);
    v.halo.material.opacity = 0.22 * (0.6 + 0.4 * pulse);""",
"""    const pulse = v.fill >= 85 ? 1 + Math.sin(t * 5 + i) * 0.16 * byFill : 1;
    v.head.scale.setScalar((v.city ? 1.7 : 1) * pulse);
    v.halo.material.opacity = 0.55 * (0.6 + 0.4 * pulse);""")

s = s.replace("""    g.node.visible = up > 0.02;
    g.node.scale.set(1, easeOut(up), 1);""",
"""    g.node.visible = up > 0.02;
    const gs = g.screen || 1;
    g.node.scale.set(gs, gs * easeOut(up), gs);""")

# dumps also need the screen-size treatment, or they vanish from altitude
s = s.replace("""    m.scale.setScalar(easeOut(w) * (1 + 0.12 * Math.sin(t * 4 + i)));""",
"""    m.scale.setScalar(easeOut(w) * (1 + 0.12 * Math.sin(t * 4 + i)) * (M.dumpScreen || 1));""")

# the gateway callout should quote the documented summit height
s = s.replace("""    co('g1', 'macro', [g1.x, g1.y + 2.2, g1.z], 'T1 · Crni vrh (Vidlič)',
       `${sr(Math.round(g1.elev))} m · postojeći RTS toranj`, win(t, 40.4, 50.2, 0.7, 0.6));
    co('g3', 'macro', [g3.x, g3.y + 2.0, g3.z], 'T3 · Belava',
       'zapadna sela, dolina Nišave', win(t, 42.0, 50.2, 0.6, 0.6), 'left');
    co('g4', 'macro', [g4.x, g4.y + 2.0, g4.z], 'T4 · Vlaška planina',
       'Krupac, Barje, jug kotline', win(t, 43.4, 50.2, 0.6, 0.6), 'left');""",
"""    co('g1', 'macro', [g1.x, g1.y + 1.1, g1.z], 'T1 · Crni vrh (Vidlič)',
       `${sr(g1.elevLabel)} m · postojeći RTS toranj · domet ${sr(g1.r, 1)} km`,
       win(t, 40.4, 50.2, 0.7, 0.6));
    co('g3', 'macro', [g3.x, g3.y + 0.9, g3.z], 'T3 · Belava',
       'zapadna sela, dolina Nišave', win(t, 42.0, 50.2, 0.6, 0.6), 'left');
    co('g4', 'macro', [g4.x, g4.y + 0.9, g4.z], 'T4 · Vlaška planina',
       'Krupac, Barje, jug kotline', win(t, 43.4, 50.2, 0.6, 0.6), 'left');""")
s = s.replace("""      co('v' + i, 'macro', [v.x, v.y + v.hgt + 0.35, v.z], v.n,""",
"""      co('v' + i, 'macro', [v.x, v.y + 0.45, v.z], v.n,""")

# camera: every macro shot was framed far too tight for a 48 km wide map
s = s.replace("""  if (t < 39.0) {                                  // descend onto the basin
    const p = smoother(inv(31.4, 39.0, t));
    orbit(0, 2, lerp(3.0, 1.4, p), lerp(30, 21, p), lerp(-0.55, -0.15, p), lerp(46, 17.5, p),
          lerp(38, 33, p));
  } else if (t < 45.4) {                           // swing to Crni vrh
    const p = smoother(inv(39.0, 45.4, t));
    orbit(lerp(0, gw.x * 0.55, p), lerp(2, gw.z * 0.6, p), lerp(1.4, 2.4, p),
          lerp(21, 19, p), lerp(-0.15, 0.62, p), lerp(17.5, 14.5, p), 33);
  } else if (t < 51.0) {                           // whole municipality, risk layer
    const p = smoother(inv(45.4, 51.0, t));
    orbit(lerp(gw.x * 0.55, 0, p), lerp(gw.z * 0.6, 1, p), lerp(2.4, 1.2, p),
          lerp(19, 26, p), lerp(0.62, 0.05, p), lerp(14.5, 25, p), lerp(33, 34, p));
  } else if (t < 56.5) {                           // top-down-ish: routes must be legible
    const p = smoother(inv(51.0, 56.5, t));
    orbit(0, lerp(1, 0, p), 1.2, lerp(26, 22, p), lerp(0.05, -0.28, p), lerp(25, 27, p), 34);
  } else {                                         // follow the truck
    const p = smoother(inv(56.5, 60.0, t));
    const tr = M.truck.position;
    orbit(lerp(0, tr.x, p), lerp(0, tr.z, p), lerp(1.2, tr.y + 0.4, p),
          lerp(22, 7.5, p), lerp(-0.28, -0.9, p), lerp(27, tr.y + 4.2, p), 34);
  }""",
"""  if (t < 39.0) {                                  // descend onto the basin
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
  }""")

# one shared expression for where the truck is, so the camera does not depend on
# whether applyMacro has already run this frame
s = s.replace("""export function cameraMacro(t, cam, M) {""",
"""/** Position of the truck glyph on the optimised route at time t. */
export function truckAt(t, M) {
  const u = clamp(inv(55.8, 59.9, t) * 0.98 + 0.005);
  return M.newRoute.curve.getPointAt(clamp(u));
}

export function cameraMacro(t, cam, M) {""")
s = s.replace("""  M.truck.visible = newIn > 0.05;
  if (M.truck.visible) {
    const u = clamp(inv(55.8, 59.9, t) * 0.98 + 0.005);
    const p = M.newRoute.curve.getPointAt(clamp(u));
    const q = M.newRoute.curve.getPointAt(clamp(u + 0.004));
    M.truck.position.copy(p);
    M.truck.lookAt(q);
    M.truck.scale.setScalar(lerp(0.4, 1, ramp(t, 55.8, 56.6)));
  }""",
"""  M.truck.visible = newIn > 0.05;
  if (M.truck.visible) {
    const u = clamp(inv(55.8, 59.9, t) * 0.98 + 0.005);
    const p = truckAt(t, M);
    const q = M.newRoute.curve.getPointAt(clamp(u + 0.004));
    M.truck.position.copy(p);
    M.truck.lookAt(q);
    const s = lerp(0.4, 1, ramp(t, 55.8, 56.6)) * clamp((M.truckScreen || 1), 0.5, 3);
    M.truck.scale.setScalar(s);
  }""")

io.open(p, 'w', encoding='utf8').write(s)

# ---------------------------------------------------------------- main.js
p = 'src/main.js'
s = io.open(p, encoding='utf8').read()
s = s.replace("""  applyMicro(t, MICRO);
  if (MACRO) applyMacro(t, MACRO);

  let cam;
  if (stage === 'macro' && MACRO) {
    cameraMacro(t, MACRO.camera, MACRO);
    cam = MACRO.camera;
    renderer.render(MACRO.scene, MACRO.camera);
  } else {""",
"""  applyMicro(t, MICRO);

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
    if (MACRO) applyMacro(t, MACRO);""")
io.open(p, 'w', encoding='utf8').write(s)
print('ok')
