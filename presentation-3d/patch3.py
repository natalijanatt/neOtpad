import io

p = 'src/macro.js'
s = io.open(p, encoding='utf8').read()

# halos were reading as big translucent discs once the camera pulled back
s = s.replace("""      map: glowTexture(), color: 0x2bd6a8, transparent: true, opacity: 0.6,
      blending: T.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(0.55); halo.position.y = hgt; g.add(halo);""",
"""      map: glowTexture(), color: 0x2bd6a8, transparent: true, opacity: 0.38,
      blending: T.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(0.32); halo.position.y = hgt; g.add(halo);""")

# centroid-precision dumps: a soft red glow, not a beige disc
s = s.replace("""    } else {
      // settlement-centroid precision: draw it as a blur, never as a surveyed point
      const m = new T.Mesh(softGeo, new T.MeshBasicMaterial({
        color: d.rec ? 0xff5a4a : 0xff9a6a, transparent: true, opacity: 0.30,
        blending: T.AdditiveBlending, depthWrite: false,
      }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.05, z); dumps.add(m);
    }""",
"""    } else {
      // settlement-centroid precision: draw it as a blur, never as a surveyed point
      const m = new T.Sprite(new T.SpriteMaterial({
        map: glowTexture(), color: d.rec ? 0xff4a38 : 0xff9a6a, transparent: true,
        opacity: 0.45, blending: T.AdditiveBlending, depthWrite: false,
      }));
      m.scale.setScalar(0.9); m.position.set(x, y + 0.12, z); dumps.add(m);
    }""")

# the truck glyph read as a floating white box; a chevron on the route is clearer
s = s.replace("""  const truck = new T.Group();
  const cab = new T.Mesh(new T.BoxGeometry(0.34, 0.26, 0.34), new T.MeshStandardMaterial({
    color: 0xf2f4f2, metalness: 0.1, roughness: 0.4 }));
  cab.position.set(0, 0.16, 0.42); truck.add(cab);
  const box = new T.Mesh(new T.BoxGeometry(0.38, 0.36, 0.72), new T.MeshStandardMaterial({
    color: 0xe8761c, metalness: 0.1, roughness: 0.45 }));
  box.position.set(0, 0.22, -0.08); truck.add(box);
  const glow = new T.Mesh(new T.CircleGeometry(0.6, 20), new T.MeshBasicMaterial({
    color: 0xffb347, transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.02; truck.add(glow);
  truck.visible = false; scene.add(truck);""",
"""  // A chevron rather than a model: at map scale a truck-shaped mesh is a blob,
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
  truck.visible = false; scene.add(truck);""")
io.open(p, 'w', encoding='utf8').write(s)

# the chevron points along +z of its group, so keep lookAt but stop the extra spin
p = 'src/story.js'
s = io.open(p, encoding='utf8').read()
s = s.replace("""    const s = lerp(0.4, 1, ramp(t, 55.8, 56.6)) * clamp((M.truckScreen || 1), 0.5, 3);
    M.truck.scale.setScalar(s);""",
"""    const s = lerp(0.5, 1, ramp(t, 55.8, 56.6)) * clamp((M.truckScreen || 1), 0.5, 2.2);
    M.truck.scale.setScalar(s);""")
io.open(p, 'w', encoding='utf8').write(s)
print('ok')
