import io

# ------------------------------------------------------------------ micro.js
p = 'src/micro.js'
s = io.open(p, encoding='utf8').read()

# the truck used to park between the camera and the container; stage it to the
# left instead, rear-loader facing the container it is about to tip
s = s.replace("""  truck.group.position.set(6.2, 0, -14);
  truck.group.rotation.y = Math.PI * 0.5;""",
"""  truck.group.position.set(-14, 0, 0.1);
  truck.group.rotation.y = -Math.PI * 0.5;""")

# darker, less milky grass: the daylight plate was blowing out to near white
s = s.replace("""  x.fillStyle = '#6f7a43'; x.fillRect(0, 0, 512, 512);""",
"""  x.fillStyle = '#56612f'; x.fillRect(0, 0, 512, 512);""")
s = s.replace("""    x.fillStyle = a < 0.4 ? '#7d8a4c' : a < 0.7 ? '#616b39' : a < 0.9 ? '#8b9557' : '#55603a';""",
"""    x.fillStyle = a < 0.4 ? '#65723a' : a < 0.7 ? '#48522a' : a < 0.9 ? '#72804a' : '#3d4724';""")
s = s.replace("""  grad.addColorStop(0, 'rgba(150,132,104,0)');
  grad.addColorStop(0.3, 'rgba(158,140,110,.95)');
  grad.addColorStop(0.7, 'rgba(158,140,110,.95)');
  grad.addColorStop(1, 'rgba(150,132,104,0)');""",
"""  grad.addColorStop(0, 'rgba(128,112,86,0)');
  grad.addColorStop(0.3, 'rgba(136,120,92,.95)');
  grad.addColorStop(0.7, 'rgba(136,120,92,.95)');
  grad.addColorStop(1, 'rgba(128,112,86,0)');""")

# ridges: pull them in and darken them, otherwise the haze eats the mountains
s = s.replace("scene.fog = new T.Fog(0xcdd9d4, 42, 200);", "scene.fog = new T.Fog(0xc4d2cc, 55, 300);")
s = s.replace("""  g.add(ridge(150, 46, 0x86a2a8, 5));
  g.add(ridge(112, 30, 0x7e9c95, 9));
  g.add(ridge(82, 18, 0x76907f, 13));""",
"""  g.add(ridge(148, 52, 0x6d8894, 5));
  g.add(ridge(104, 32, 0x5f7d78, 9));
  g.add(ridge(72, 19, 0x566f5b, 13));""")
io.open(p, 'w', encoding='utf8').write(s)

# ------------------------------------------------------------------ story.js
p = 'src/story.js'
s = io.open(p, encoding='utf8').read()

s = s.replace("""  // truck drive-in for the closing shot
  const tv = S.truck.group;
  if (t < 59.9) { tv.visible = false; } else {
    tv.visible = true;
    const p = smoother(inv(60.2, 63.2, t));
    tv.position.set(lerp(13.5, 3.05, p), 0, lerp(-3.2, -0.3, p));
    tv.rotation.y = Math.PI * 0.5 + lerp(0.12, 0, p);
    S.truck.wheels.forEach((w) => { w.rotation.x = -t * 6 * (1 - p * 0.98); });
    S.truck.beacon.material.color.setHex(Math.floor(t * 4) % 2 ? 0xffc23a : 0x6b4a10);
  }""",
"""  // truck drive-in for the closing shot: it comes up the track from the left and
  // stops with its rear loader beside the container
  const tv = S.truck.group;
  if (t < 59.9) { tv.visible = false; } else {
    tv.visible = true;
    const p = smoother(inv(60.2, 63.3, t));
    tv.position.set(lerp(-15.5, -5.15, p), 0, lerp(0.6, 0.1, p));
    tv.rotation.y = -Math.PI * 0.5 - lerp(0.09, 0, p);
    S.truck.wheels.forEach((w) => { w.rotation.x = t * 5.5 * (1 - p * 0.99); });
    S.truck.beacon.material.color.setHex(Math.floor(t * 4) % 2 ? 0xffc23a : 0x6b4a10);
  }""")

# tip toward the truck (-x), not backwards into the block wall
s = s.replace("""  S.hero.group.position.y = 0.10 + lift * 0.45;
  S.hero.group.rotation.x = -tip * 0.95;
  S.hero.group.rotation.y = 0.18 - tip * 0.1;
  S.hero.group.position.z = 0.1 - lift * 0.35;""",
"""  S.hero.group.position.y = 0.10 + lift * 0.55;
  S.hero.group.rotation.z = tip * 1.05;
  S.hero.group.rotation.y = 0.18 - tip * 0.14;
  S.hero.group.position.x = -0.82 - lift * 0.55;""")

# closing camera: keep the pad and the truck both in frame, then ease out wide
s = s.replace("""  if (t >= 59.9) {                                 // closing shot: truck at the pad
    const p = smoother(inv(60.2, 67.0, t));
    set([lerp(6.6, 4.7, p), lerp(2.5, 2.0, p), lerp(7.6, 5.6, p)],
        [lerp(0.4, -0.3, p), lerp(1.3, 1.15, p), lerp(-0.6, 0, p)], lerp(35, 33, p));
  }""",
"""  if (t >= 59.9) {                                 // closing shot: truck at the pad
    const p = smoother(inv(60.2, 66.6, t));
    set([lerp(7.4, 5.6, p), lerp(2.8, 2.2, p), lerp(8.2, 6.2, p)],
        [lerp(-0.2, -1.5, p), lerp(1.45, 1.2, p), lerp(-0.4, 0, p)], lerp(35, 34, p));
    if (t > 66.6) {                                // ease out wide under the end card
      const q = smoother(inv(66.6, DUR, t));
      set([lerp(5.6, 9.2, q), lerp(2.2, 4.1, q), lerp(6.2, 11.4, q)],
          [lerp(-1.5, -1.2, q), lerp(1.2, 1.5, q), 0], lerp(34, 36, q));
    }
  }""")
io.open(p, 'w', encoding='utf8').write(s)

# ------------------------------------------------------------------ index.html
p = 'index.html'
s = io.open(p, encoding='utf8').read()
s = s.replace("""  #card{ position:absolute; inset:0; display:flex; flex-direction:column;
    align-items:center; justify-content:center; text-align:center; gap:22px; }""",
"""  #card{ position:absolute; inset:0; display:flex; flex-direction:column;
    align-items:center; justify-content:center; text-align:center; gap:22px;
    /* a scrim, or the title sits unreadably on top of a bright daylight plate */
    background:radial-gradient(78% 62% at 50% 50%, rgba(3,12,9,.86) 0%,
      rgba(3,12,9,.62) 55%, rgba(3,12,9,.12) 100%); }""")
io.open(p, 'w', encoding='utf8').write(s)
print('ok')
