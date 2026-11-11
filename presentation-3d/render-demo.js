// Deterministic 1080p MP4 export. Start server.js, then npm run render:demo.
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const puppeteer=require('puppeteer-core');
const option=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i<0?fallback:process.argv[i+1];};
const OUT=path.join(__dirname,'out');
let browser,ff;
async function main(){
 fs.mkdirSync(OUT,{recursive:true});
 browser=await puppeteer.launch({
  executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless:!process.argv.includes('--headful'),
  args:['--window-position=-2400,-2400','--window-size=1960,1180','--hide-scrollbars','--mute-audio','--force-device-scale-factor=1','--enable-unsafe-swiftshader'],
  defaultViewport:{width:1920,height:1080,deviceScaleFactor:1},
 });
 const page=await browser.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await page.goto('http://localhost:5180/demo.html',{waitUntil:'networkidle0'});
 await page.waitForFunction('document.body.dataset.ready === "1"',{timeout:120000});
 const meta=await page.evaluate(()=>ANIM.inspect());
 console.log(JSON.stringify(meta));
 const draw=async t=>{await page.evaluate(t=>ANIM.seek(t),t);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));if(errors.length)throw new Error(errors.join('\n'));};
 if(option('at',null)){
  for(const value of option('at','').split(',')){await draw(Number(value));await page.screenshot({path:path.join(OUT,`demo-${value}s.png`),type:'png'});console.log('Still',value);}
  return;
 }
 const fps=Number(option('fps',24)),from=Number(option('from',0)),to=Number(option('to',meta.duration));
 if(!Number.isFinite(fps)||fps<=0||!Number.isFinite(from)||!Number.isFinite(to)||from<0||to>meta.duration||to<=from)throw new Error('Invalid frame rate or time range');
 const file=path.join(OUT,option('name','pirot-3d-demonstracija')+'.mp4');const frames=Math.round((to-from)*fps);
 ff=spawn(path.join(__dirname,'bin','ffmpeg.exe'),['-hide_banner','-y','-f','image2pipe','-vcodec','mjpeg','-framerate',String(fps),'-i','pipe:0','-an','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',file],{windowsHide:true,stdio:['pipe','ignore','pipe']});
 let stderr='',failure=null;
 ff.stderr.on('data',d=>stderr=(stderr+d).slice(-5000));ff.on('error',e=>failure=e);ff.stdin.on('error',e=>failure=e);
 const completion=once(ff,'close');const started=Date.now();
 for(let i=0;i<frames;i++){
  if(failure)throw failure;
  await draw(from+i/fps);const jpg=await page.screenshot({type:'jpeg',quality:94,optimizeForSpeed:true});
  if(!ff.stdin.write(jpg))await once(ff.stdin,'drain');
  if(i%120===0||i===frames-1){const sec=(Date.now()-started)/1000;console.log(`Frame ${i+1}/${frames}; ${((i+1)/sec).toFixed(1)} fps; remaining ${Math.round(sec/(i+1)*(frames-i-1))} s`);}
 }
 ff.stdin.end();const[code]=await completion;if(code!==0)throw new Error(stderr);
 console.log(`Wrote ${file} (${(fs.statSync(file).size/1048576).toFixed(1)} MB)`);
}
main().catch(e=>{console.error(e);process.exitCode=1;if(ff&&!ff.killed)ff.kill();}).finally(async()=>{if(browser)await browser.close();});
