import io

p = 'src/story.js'
s = io.open(p, encoding='utf8').read()

# shot 1: the pair was cropping at the bottom of frame
s = s.replace("""    const a = lerp(-0.72, 0.30, p), rad = lerp(5.4, 4.3, p);
    set([Math.sin(a) * rad + 1.5, lerp(2.15, 1.7, p), Math.cos(a) * rad],
        [lerp(-0.9, -0.75, p), lerp(1.35, 1.25, p), 0], lerp(33, 35, p));""",
"""    const a = lerp(-0.70, 0.28, p), rad = lerp(6.4, 5.4, p);
    set([Math.sin(a) * rad + 1.7, lerp(2.6, 2.2, p), Math.cos(a) * rad],
        [lerp(-0.9, -0.8, p), lerp(1.25, 1.15, p), 0], lerp(33, 34, p));""")

# the truck now waits behind the collection point, so the tipping container stays
# in clear view instead of disappearing behind the hopper
s = s.replace("""    const p = smoother(inv(60.2, 63.3, t));
    tv.position.set(lerp(-15.5, -5.15, p), 0, lerp(0.6, 0.1, p));
    tv.rotation.y = -Math.PI * 0.5 - lerp(0.09, 0, p);""",
"""    const p = smoother(inv(60.2, 63.3, t));
    tv.position.set(lerp(-16.5, -1.15, p), 0, lerp(-4.6, -4.2, p));
    tv.rotation.y = Math.PI * 0.5 + lerp(0.07, 0, p);""")

# tip backwards, towards the truck standing behind the pad
s = s.replace("""  S.hero.group.position.y = 0.10 + lift * 0.55;
  S.hero.group.rotation.z = tip * 1.05;
  S.hero.group.rotation.y = 0.18 - tip * 0.14;
  S.hero.group.position.x = -0.82 - lift * 0.55;""",
"""  S.hero.group.position.y = 0.10 + lift * 0.62;
  S.hero.group.rotation.x = -tip * 1.0;
  S.hero.group.rotation.y = 0.18 - tip * 0.12;
  S.hero.group.position.z = 0.1 - lift * 0.8;""")

# the flat status ring reads as a green bar from the low closing angle; the card
# already carries the payoff there
s = s.replace("""  const badgeOp = win(t, 20.6, 31.2, 1.0, 0.6) + win(t, 60.4, 67.2, 0.8, 0.8);""",
"""  const badgeOp = win(t, 20.6, 31.2, 1.0, 0.6);""")

# closing camera: a touch wider, and centred between pad and truck
s = s.replace("""    set([lerp(7.4, 5.6, p), lerp(2.8, 2.2, p), lerp(8.2, 6.2, p)],
        [lerp(-0.2, -1.5, p), lerp(1.45, 1.2, p), lerp(-0.4, 0, p)], lerp(35, 34, p));""",
"""    set([lerp(8.2, 6.4, p), lerp(3.1, 2.5, p), lerp(9.0, 7.0, p)],
        [lerp(-0.4, -1.1, p), lerp(1.5, 1.3, p), lerp(-1.2, -1.0, p)], lerp(35, 34, p));""")
s = s.replace("""      set([lerp(5.6, 9.2, q), lerp(2.2, 4.1, q), lerp(6.2, 11.4, q)],
          [lerp(-1.5, -1.2, q), lerp(1.2, 1.5, q), 0], lerp(34, 36, q));""",
"""      set([lerp(6.4, 10.4, q), lerp(2.5, 4.6, q), lerp(7.0, 12.4, q)],
          [lerp(-1.1, -1.0, q), lerp(1.3, 1.6, q), -1.0], lerp(34, 36, q));""")
io.open(p, 'w', encoding='utf8').write(s)
print('ok')
