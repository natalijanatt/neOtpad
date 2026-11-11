// Offline frame grabber. Drives ANIM.seek(t) in a real Chrome (GPU, not
// SwiftShader) and pipes the screenshots straight into ffmpeg.
//
//   node render.js                    full film -> out/pametan-otpad-pirot.mp4
//   node render.js --at 16,26,45      single stills -> out/still-*.png
//   node render.js --from 10 --to 20  a slice of the timeline
//
// Chrome is driven headful but positioned off-screen: headless Chrome falls
// back to software WebGL on this machine, which is ~20x slower per frame.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');

// ffmpeg binary vendored into bin/ (from the imageio-ffmpeg wheel) so the
// render does not depend on a system install.
const FFMPEG = path.join(__dirname, 'bin', 'ffmpeg.exe');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://localhost:5180/';
const OUT = path.join(__dirname, 'out');

const arg = (name, def = null) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : def;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    args: [
      '--window-position=-2400,-2400', '--window-size=1960,1180',
      '--hide-scrollbars', '--mute-audio', '--disable-infobars',
      '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required',
      '--enable-unsafe-swiftshader',
    ],
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.ANIM !== undefined', { timeout: 30000 });
  await page.evaluate('window.ANIM.ready');
  await page.waitForFunction('document.body.dataset.ready === "1"', { timeout: 60000 });
  const meta = await page.evaluate('({d: ANIM.duration, f: ANIM.fps})');
  console.log(`renderer up: ${meta.d}s @ ${meta.f}fps`);

  const shot = async (t) => {
    await page.evaluate((tt) => window.ANIM.seek(tt), t);
    // two rafs: let the browser flush the WebGL draw and the DOM overlay together
    await page.evaluate(() => new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r))));
    return page.screenshot({ type: 'png', optimizeForSpeed: true });
  };

  const at = arg('at');
  if (at) {
    for (const s of at.split(',')) {
      const t = parseFloat(s);
      fs.writeFileSync(path.join(OUT, `still-${s.replace('.', '_')}s.png`), await shot(t));
      console.log('still', t + 's');
    }
    await browser.close();
    return;
  }

  const fps = parseInt(arg('fps', meta.f), 10);
  const from = parseFloat(arg('from', 0));
  const to = parseFloat(arg('to', meta.d));
  const name = arg('name', 'pametan-otpad-pirot');
  const total = Math.round((to - from) * fps);
  const file = path.join(OUT, `${name}.mp4`);

  const ff = spawn(FFMPEG, [
    '-y', '-f', 'image2pipe', '-vcodec', 'png', '-r', String(fps), '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-vf', 'scale=1920:1080', file,
  ], { stdio: ['pipe', 'inherit', 'pipe'] });
  let ffErr = '';
  ff.stderr.on('data', (d) => { ffErr += d.toString(); });
  ff.on('exit', (code) => {
    if (code !== 0) console.error(ffErr.split('\n').slice(-25).join('\n'));
  });

  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    const t = from + i / fps;
    const png = await shot(t);
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 30 === 0 || i === total - 1) {
      const el = (Date.now() - t0) / 1000;
      const eta = i ? ((el / i) * (total - i)) : 0;
      process.stdout.write(
        `\rframe ${i + 1}/${total}  t=${t.toFixed(2)}s  ` +
        `${(i / Math.max(el, 0.001)).toFixed(1)} fps  eta ${Math.round(eta)}s      `);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(`\nwrote ${file}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
