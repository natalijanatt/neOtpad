import io

p = 'src/macro.js'
s = io.open(p, encoding='utf8').read()

s = s.replace("""const GW = [
  { id: 'T1', name: 'Crni vrh (Vidlič)', lat: 43.198, lon: 22.636, r: 12.5, primary: true,
    note: 'postojeći RTS toranj · struja na licu mesta' },
  { id: 'T3', name: 'Belava (zapad)', lat: 43.133, lon: 22.452, r: 9.0,
    note: 'zapadna sela i dolina Nišave' },
  { id: 'T4', name: 'Vlaška planina (jug)', lat: 43.045, lon: 22.560, r: 9.5,
    note: 'južna sela: Krupac, Barje' },
];""",
"""// Coordinates are the nearest summit in the elevation grid to each site the
// research proposes; elevLabel keeps the documented height, because SRTM at this
// zoom smooths a peak by a few tens of metres.
const GW = [
  { id: 'T1', name: 'Crni vrh (Vidlič)', lat: 43.1832, lon: 22.6551, r: 12.5, primary: true,
    elevLabel: 1152, note: 'postojeći RTS toranj · struja na licu mesta' },
  { id: 'T3', name: 'Belava (zapad)', lat: 43.1600, lon: 22.4110, r: 9.0,
    elevLabel: 962, note: 'zapadna sela i dolina Nišave' },
  { id: 'T4', name: 'Vlaška planina (jugozapad)', lat: 43.0267, lon: 22.4975, r: 9.5,
    elevLabel: 1224, note: 'Krupac, Barje, jug kotline' },
];""")

s = s.replace("color: 0x7fe0c0, wireframe: true, transparent: true, opacity: 0.055,",
              "color: 0x7fe0c0, wireframe: true, transparent: true, opacity: 0.028,")

s = s.replace("""  // --- light ----------------------------------------------------------------""",
"""  // Side walls down to a base plane: without them the relief is a floating sheet
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

  // --- light ----------------------------------------------------------------""")

s = s.replace("""    // a glow sprite makes the pin readable against bright relief
    const halo = new T.Mesh(new T.CircleGeometry(0.42, 20), new T.MeshBasicMaterial({
      color: 0x2bd6a8, transparent: true, opacity: 0.22, blending: T.AdditiveBlending,
      depthWrite: false,
    }));
    halo.position.y = hgt; g.add(halo);""",
"""    // a camera-facing glow keeps the pin readable against bright relief
    const halo = new T.Sprite(new T.SpriteMaterial({
      map: glowTexture(), color: 0x2bd6a8, transparent: true, opacity: 0.6,
      blending: T.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(0.55); halo.position.y = hgt; g.add(halo);""")

s = s.replace("const hgt = v.city ? 1.5 : 0.85 + clamp((v.hh || 60) / 900) * 0.9;",
              "const hgt = v.city ? 0.62 : 0.34 + clamp((v.hh || 60) / 900) * 0.34;")
s = s.replace("const pinGeo = new T.CylinderGeometry(0.055, 0.055, 1, 8);",
              "const pinGeo = new T.CylinderGeometry(0.022, 0.022, 1, 8);")
s = s.replace("const headGeo = new T.SphereGeometry(0.17, 14, 12);",
              "const headGeo = new T.SphereGeometry(0.07, 14, 12);")
s = s.replace("const ringGeo = new T.RingGeometry(0.26, 0.34, 28);",
              "const ringGeo = new T.RingGeometry(0.11, 0.145, 28);")

s = s.replace("""    const mast = new T.Mesh(new T.CylinderGeometry(0.05, 0.14, 1.5, 6),""",
              """    const mast = new T.Mesh(new T.CylinderGeometry(0.018, 0.05, 0.55, 6),""")
s = s.replace("mast.position.y = 0.75; node.add(mast);", "mast.position.y = 0.275; node.add(mast);")
s = s.replace("""      const br = new T.Mesh(new T.TorusGeometry(0.1 - i * 0.015, 0.012, 6, 12),
        new T.MeshBasicMaterial({ color: 0x9fd8c8 }));
      br.rotation.x = Math.PI / 2; br.position.y = 0.25 + i * 0.35; node.add(br);""",
"""      const br = new T.Mesh(new T.TorusGeometry(0.038 - i * 0.006, 0.005, 6, 12),
        new T.MeshBasicMaterial({ color: 0x9fd8c8 }));
      br.rotation.x = Math.PI / 2; br.position.y = 0.09 + i * 0.13; node.add(br);""")
s = s.replace("""      const a = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.55, 8),
        new T.MeshBasicMaterial({ color: 0xe8fff6 }));
      a.position.set(sx * 0.1, 1.65, 0); node.add(a);""",
"""      const a = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.2, 8),
        new T.MeshBasicMaterial({ color: 0xe8fff6 }));
      a.position.set(sx * 0.035, 0.63, 0); node.add(a);""")
s = s.replace("""    const lamp = new T.Mesh(new T.SphereGeometry(0.09, 12, 10),
      new T.MeshBasicMaterial({ color: 0x8ff0c0 }));
    lamp.position.y = 2.0; node.add(lamp);""",
"""    const lamp = new T.Mesh(new T.SphereGeometry(0.035, 12, 10),
      new T.MeshBasicMaterial({ color: 0x8ff0c0 }));
    lamp.position.y = 0.75; node.add(lamp);
    const gHalo = new T.Sprite(new T.SpriteMaterial({
      map: glowTexture(), color: g.primary ? 0xffc46a : 0x7fe6ff, transparent: true,
      opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false }));
    gHalo.scale.setScalar(0.9); gHalo.position.y = 0.62; node.add(gHalo);""")

s = s.replace("""    const linked = villages.filter((v) => Math.hypot(v.x - x, v.z - z) < g.r);
    for (const v of linked) {""",
"""    const linked = villages.filter((v) => Math.hypot(v.x - x, v.z - z) < g.r);
    for (const v of linked.filter((_, i) => i % 2 === 0)) {""")
s = s.replace("""      const mid = new T.Vector3((v.x + x) / 2, Math.max(v.y, y) + 1.4, (v.z + z) / 2);
      const curve = new T.QuadraticBezierCurve3(
        new T.Vector3(v.x, v.y + v.hgt, v.z), mid, new T.Vector3(x, y + 1.9, z));""",
"""      const mid = new T.Vector3((v.x + x) / 2, Math.max(v.y, y) + 1.1, (v.z + z) / 2);
      const curve = new T.QuadraticBezierCurve3(
        new T.Vector3(v.x, v.y + 0.2, v.z), mid, new T.Vector3(x, y + 0.7, z));""")
s = s.replace("          color: 0x8ff0c0, transparent: true, opacity: 0.30,",
              "          color: 0x8ff0c0, transparent: true, opacity: 0.22,")
s = s.replace("const dim = new T.Color(0x45605c);", "const dim = new T.Color(0x5d7873);")

s = s.replace("""  return {
    scene, camera, terrain, wire, markers, dumps, gateways, villages, depot,""",
"""  /** Keep pins and masts at a roughly constant screen size. A pin sized in
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
    scene, camera, terrain, wire, markers, dumps, gateways, villages, depot, scaleNodes,""")

s = s.replace("""export async function buildMacro() {""",
"""let GLOW = null;
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

export async function buildMacro() {""")

io.open(p, 'w', encoding='utf8').write(s)
print('macro patched')
