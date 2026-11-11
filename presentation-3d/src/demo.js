import * as T from 'three';
import { buildMicro, buildContainer, buildTruck } from './micro.js';
import { buildMacro } from './macro.js';
import { applyMicro, cameraMicro } from './story.js';
import { clamp, lerp, smooth, inv } from './util.js';

const W=1920,H=1080,DURATION=44;
// Editorial timing: keep every action, with the largest cut in planning. The
// sensor-to-server hop runs at 1.5x rather than 3x: it is the step nobody can
// see in the field, so the packet has to be followable along the way.
// Geometry continues to use the original source timeline.
const EDIT = [
 [0,8,0,14],       // measurement: 14 -> 8 seconds
 [8,16,14,26],     // server: 12 -> 8 seconds
 [16,21,26,40],    // planning: 14 -> 5 seconds
 [21,33,40,61],    // collection route: 21 -> 12 seconds
 [33,41,61,73],    // emptying and confirmation: 12 -> 8 seconds
 [41,44,73,78],    // closing: 5 -> 3 seconds
];
function sourceTime(seconds) {
 const time=clamp(seconds,0,DURATION);
 const [start,end,sourceStart,sourceEnd]=EDIT.find(s=>time<s[1])||EDIT.at(-1);
 return lerp(sourceStart,sourceEnd,inv(start,end,time));
}
const $=id=>document.getElementById(id);
const renderer=new T.WebGLRenderer({canvas:$('c'),antialias:true,powerPreference:'high-performance',logarithmicDepthBuffer:true});
renderer.setSize(W,H);renderer.setPixelRatio(1);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
renderer.outputColorSpace=T.SRGBColorSpace;
const preview=new URLSearchParams(location.search).has('play');
function fit(){const s=Math.min(innerWidth/W,innerHeight/H);$('stage').style.transform=`scale(${s})`;$('stage').style.left=`${(innerWidth-W*s)/2}px`;$('stage').style.top=`${(innerHeight-H*s)/2}px`;if(preview)renderer.setPixelRatio(Math.min(1,s));}
addEventListener('resize',fit);fit();
const micro=buildMicro(renderer);
const box=(scene,w,h,d,x,y,z,color)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.38,metalness:.35}));m.position.set(x,y,z);scene.add(m);return m;};

// Abstract infrastructure scene: physical container -> gateway -> application server.
function buildNetwork(){
 const scene=new T.Scene();scene.background=new T.Color('#071a18');scene.fog=new T.Fog('#071a18',22,55);
 scene.add(new T.HemisphereLight(0xcaffef,0x122d26,2));const key=new T.DirectionalLight(0xffffff,3);key.position.set(3,8,7);scene.add(key);
 const floor=box(scene,35,.1,28,0,-.1,0,0x102b24);floor.receiveShadow=true;
 const grid=new T.GridHelper(32,32,0x356354,0x1b3b32);grid.position.y=.01;scene.add(grid);
 const bin=buildContainer();bin.group.position.set(-5,.1,0);bin.setFill(93);scene.add(bin.group);
 box(scene,.15,3,.15,-.7,1.5,0,0x819c93);box(scene,.8,.5,.42,-.7,2.6,0,0xe0eee8);
 const dish=new T.Mesh(new T.TorusGeometry(.6,.035,8,36,Math.PI*1.3),new T.MeshBasicMaterial({color:0x7cfac2}));dish.position.set(-.7,3.1,0);scene.add(dish);
 box(scene,1.65,3.1,1.1,4,1.6,0,0x233c38);
 const leds=[];for(let i=0;i<6;i++){box(scene,1.44,.34,.10,4,.4+i*.45,.61,0x101f1c);for(let j=0;j<3;j++)leds.push(box(scene,.075,.075,.07,3.47+j*.17,.4+i*.45,.69,0x70ffbd));box(scene,.48,.045,.08,4.35,.4+i*.45,.69,0x557a69);}
 const curves=[new T.QuadraticBezierCurve3(new T.Vector3(-5,1.5,0),new T.Vector3(-3,4.4,0),new T.Vector3(-.7,2.6,0)),new T.QuadraticBezierCurve3(new T.Vector3(-.7,2.6,0),new T.Vector3(1.5,4.6,0),new T.Vector3(4,2,0))];
 const dots=[];curves.forEach(curve=>{scene.add(new T.Mesh(new T.TubeGeometry(curve,64,.022,6,false),new T.MeshBasicMaterial({color:0x317c63})));for(let j=0;j<4;j++){const dot=new T.Mesh(new T.SphereGeometry(.095,12,8),new T.MeshBasicMaterial({color:0x83ffd0}));scene.add(dot);dots.push({dot,curve,j});}});
 const camera=new T.PerspectiveCamera(37,W/H,.1,100);
 return{scene,camera,leds,dots};
}
const network=buildNetwork();
// Rear-loader geometry in world units, for the emptying shot. BAR is the bar on
// the tailgate that a DIN EN 840 comb hangs from, COMB_LOCAL is that comb in the
// bin's own frame (0.2 is the castor/frame height buildContainer sits the body
// on), GROUND is where the bin waits before it is picked up.
const BAR=new T.Vector3(-.82,2.55,-.95);
const COMB_LOCAL=new T.Vector3(0,.2+micro.CONT.h*.93,micro.CONT.d/2);
const BIN_GROUND=new T.Vector3(-.82,.1,.45);
let macro,route,stops,routeTruck,mapBins=[],routeLine,baselineLine;
// The only text in the film: a settlement name and its container reading.
let labels=[];
function label(text,position,status=''){labels.push({text,position,status});}
function drawLabels(camera){camera.updateMatrixWorld(true);const placed=[],lines=[];const html=labels.map(l=>{const v=l.position.clone().project(camera);if(v.z>1)return '';let x=(v.x*.5+.5)*W,y=(-v.y*.5+.5)*H;const anchorY=y;for(let i=0;i<8&&placed.some(p=>Math.abs(x-p.x)<210&&Math.abs(y-p.y)<52);i++)y-=54;placed.push({x,y});if(y!==anchorY)lines.push(`<path d="M${x},${y} L${x},${anchorY+20}" stroke="#b4ead1" stroke-opacity=".6" stroke-dasharray="4 4"/>`);return `<div class="maplabel ${l.status}" style="left:${x}px;top:${y}px">${l.text}</div>`;}).join('');$('labels').innerHTML=`<svg width="1920" height="1080" style="position:absolute">${lines.join('')}</svg>`+html;}
// Must-visit threshold; below it a container is only collected when it costs
// almost nothing, i.e. the tour already passes it. Kilometres are scene units.
const MUST_VISIT=80,DETOUR_LIMIT=1.5;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const length=nodes=>nodes.slice(1).reduce((sum,n,i)=>sum+distance(nodes[i],n),0);
function permutations(items){return items.length?items.flatMap((v,i)=>permutations(items.filter((_,j)=>i!==j)).map(rest=>[v,...rest])):[[]];}
function lineFor(nodes,color,radius){
 const points=[];nodes.slice(1).forEach((b,i)=>{const a=nodes[i];for(let j=0;j<40;j++){const u=j/40,x=lerp(a.x,b.x,u),z=lerp(a.z,b.z,u);points.push(new T.Vector3(x,macro.hAt(x,z)+.18,z));}});
 const last=nodes.at(-1);points.push(new T.Vector3(last.x,macro.hAt(last.x,last.z)+.18,last.z));
 const curve=new T.CatmullRomCurve3(points,false,'centripetal');
 const geo=new T.TubeGeometry(curve,600,radius,6,false);const mesh=new T.Mesh(geo,new T.MeshBasicMaterial({color,transparent:true,opacity:.9}));mesh.frustumCulled=false;macro.scene.add(mesh);return{mesh,total:geo.index.count};
}
function setupMap(){
 macro.oldRoute.mesh.visible=macro.newRoute.mesh.visible=macro.truck.visible=macro.dumps.visible=false;
 macro.gateways.forEach(g=>{g.node.visible=g.circle.visible=g.links.visible=false;});
 // Trnjana and Blato read almost the same, but they sit differently: Trnjana is
 // between two urgent stops, Blato is on the opposite side of the basin.
 const readings={'Berilovac':93,'Izvor':87,'Krupac':96,'Poljska Ržana':91,'Trnjana':18,'Blato':20};
 stops=Object.entries(readings).map(([name,fill])=>({...macro.villages.find(v=>v.n===name),fill}));
 const urgent=stops.filter(v=>v.fill>=MUST_VISIT);
 // Small deterministic demonstration, not a claim of solving the production road CVRP.
 const candidates=permutations(urgent).map(p=>[macro.depot,...p,macro.depot]);
 route=candidates.reduce((best,next)=>length(next)<length(best)?next:best);
 baselineLine=lineFor([macro.depot,urgent[2],urgent[0],urgent[3],urgent[1],macro.depot],0x8aa7a0,.033);
 // A low container is not dropped on its reading alone. The question is what it
 // costs: if the truck drives past it anyway the extra kilometres are near zero
 // and emptying it now prevents a dedicated trip later, so it is taken along.
 // One that needs a real detour keeps waiting, however similar its fill level.
 for(const v of stops.filter(s=>s.fill<MUST_VISIT)){
  let best={cost:Infinity,at:-1};
  for(let i=1;i<route.length;i++){
   const cost=distance(route[i-1],v)+distance(v,route[i])-distance(route[i-1],route[i]);
   if(cost<best.cost)best={cost,at:i};
  }
  v.detour=best.cost;v.onRoute=best.cost<=DETOUR_LIMIT;
  if(v.onRoute)route.splice(best.at,0,v);
 }
 routeLine=lineFor(route,0xffba58,.075);
 macro.villages.forEach(v=>{v.node.visible=!!readings[v.n]||v.city;v.node.scale.setScalar(.9);});
 routeTruck=buildTruck();routeTruck.group.scale.setScalar(.24);macro.scene.add(routeTruck.group);
 stops.forEach(v=>{const bin=buildContainer();bin.group.scale.setScalar(.32);bin.group.position.set(v.x+.35,v.y+.1,v.z+.2);macro.scene.add(bin.group);mapBins.push({v,bin});});
}
function travel(t){
 // Each leg includes a visible dwell at its destination; one pickup per stop and
 // a final leg back to the depot, so the leg count follows the planned route.
 const legs=route.length-1,pickups=legs-1;
 const p=clamp((t-40)/21)*legs,leg=Math.min(legs-1,Math.floor(p)),phase=p-leg;
 const move=clamp(phase/.72),a=route[leg],b=route[leg+1];
 const x=lerp(a.x,b.x,move),z=lerp(a.z,b.z,move);
 return{leg,legs,pickups,phase,move,x,z,a,b,collected:Math.min(pickups,leg+(phase>.82?1:0))};
}
function mapFrame(t){
 const tr=travel(t),cam=macro.camera;
 // Wide enough to hold both sides of the basin at once: the route east of Pirot
 // and Blato on the opposite side, whose 20% is the stop the plan leaves out.
 const center=new T.Vector3(-0.9,1,3.6);
 cam.position.set(-9.5+Math.sin((t-26)*.025)*1.3,14.4,18.2);cam.fov=42;cam.lookAt(center);cam.updateProjectionMatrix();
 baselineLine.mesh.visible=t>=32&&t<39;
 baselineLine.mesh.material.opacity=.5*(1-inv(36,39,t));
 routeLine.mesh.visible=t>=34;
 routeLine.mesh.geometry.setDrawRange(0,Math.floor(routeLine.total*inv(34,39,t)/3)*3);
 routeTruck.group.visible=t>=40;
 routeTruck.group.position.set(tr.x,macro.hAt(tr.x,tr.z)+.2,tr.z);
 routeTruck.group.rotation.y=Math.atan2(tr.b.x-tr.a.x,tr.b.z-tr.a.z);
 routeTruck.wheels.forEach(w=>{w.rotation.x=tr.move<1?t*8:0;});
 const cleared=new Set(route.slice(1,1+tr.collected).map(v=>v.n));
 for(const{v,bin}of mapBins){
  const done=cleared.has(v.n),active=t>=40&&tr.b.n===v.n&&tr.phase>=.72;
  const lift=active?Math.sin(inv(.72,.96,tr.phase)*Math.PI):0;
  bin.group.position.y=v.y+.1+lift*.4;bin.group.rotation.x=-lift*1.1;bin.setLid(lift);bin.setFill(done?0:v.fill);
  const skipped=v.fill<MUST_VISIT&&!v.onRoute;
  const node=macro.villages.find(q=>q.n===v.n);const color=done?0x74ffc0:skipped?0x6f9c8c:0xffac55;
  if(!node.demoMat)node.demoMat=new T.MeshBasicMaterial();node.demoMat.color.setHex(color);node.head.material=node.stem.material=node.demoMat;node.ring.material.color.setHex(color);node.halo.material.color.setHex(color);
  label(`${v.n}<em>${done?'✓ 0%':v.fill+'%'}</em>`,new T.Vector3(v.x,v.y+1.2,v.z),done?'done':skipped?'skip':'');
 }
 label('Pirot <em>BAZA</em>',new T.Vector3(macro.depot.x,macro.depot.y+1.1,macro.depot.z));
 return cam;
}

function frame(seconds){
 const playbackTime=clamp(seconds,0,DURATION),t=sourceTime(playbackTime);
 labels=[];let scene,cam;
 micro.arms.forEach(a=>a.visible=false);micro.second.group.visible=t<61;
 micro.sensor.group.traverse(o=>{if(o.material){o.material.depthTest=!(t>=4&&t<14);o.renderOrder=t>=4&&t<14?10:0;}});
 if(t<14){
  const mt=t<4?lerp(5,10,t/4):lerp(11.5,26.8,inv(4,14,t));
  applyMicro(mt,micro);cameraMicro(mt,micro.camera);scene=micro.scene;cam=micro.camera;
  if(t>=4){cam.position.set(2.7,2.1,4.7);cam.lookAt(-.55,1,0);cam.updateProjectionMatrix();}
  const fill=Math.round(lerp(34,93,smooth(inv(4,12,t))));const top=micro.hero.setFill(fill);micro.sensor.set(Math.max(.08,micro.sensorY-top-.02),(t%1.6)/1.6,t>4?1:0);micro.badge.set(fill,0,t*.4);
  if(t>4)label(`Berilovac<em>${fill}%</em>`,new T.Vector3(-.82,1.78,.1));
 }else if(t<26){
  scene=network.scene;cam=network.camera;cam.position.set(7-2*inv(14,26,t),6.4,17.5);cam.lookAt(1.6,1.6,0);cam.updateProjectionMatrix();
  network.dots.forEach(({dot,curve,j},i)=>{const u=((t-14)*.48+j*.25)%1;dot.position.copy(curve.getPoint(u));dot.visible=t>=15+(i>=4?2:0);});network.leds.forEach((l,i)=>l.material.emissive.setHex((Math.floor(t*4)+i)%3?0x0b241b:0x63e7a0));
 }else if(t<61){
  scene=macro.scene;cam=mapFrame(t);
 }else{
  const mt=lerp(60,67,inv(61,73,t));applyMicro(mt,micro);cameraMicro(mt,micro.camera);
  // Align rear loader with the bin: truck faces away, rear comb is at z=-1.
  const arrival=smooth(inv(61,64,t));micro.truck.group.position.set(-.82,0,lerp(-16,-5.2,arrival));micro.truck.group.rotation.y=Math.PI;
  // A bin is emptied comb first: it stands with its lifting comb towards the
  // tailgate (the half turn on Y), is raised until the comb rests on the bar, and
  // only then turns about that bar so its mouth ends up over the hopper. The turn
  // is negative for the same reason as in story.js - turning the other way tips
  // the waste onto the road behind the truck instead of into it.
  const engage=smooth(inv(64.6,66.4,t))-smooth(inv(70.8,72.4,t));
  const turn=-2.4*(smooth(inv(66.4,68.2,t))-smooth(inv(69.2,70.8,t)));
  const bin=micro.hero.group;bin.rotation.set(turn,Math.PI,0);
  // The group origin is the bin's base, so the comb is held on the bar explicitly:
  // the bin swings about the bar, not about its own foot.
  const comb=COMB_LOCAL.clone().applyQuaternion(bin.quaternion);
  bin.position.lerpVectors(BIN_GROUND,BAR.clone().sub(comb),engage);
  // Past the tipping point gravity takes the lid; it hangs down, it is not held open.
  micro.hero.setLid(clamp(-turn-1,0,1.8));
  bin.updateMatrixWorld(true);
  const fill=lerp(93,0,smooth(inv(67.4,69.2,t)));micro.hero.setFill(fill);micro.hero.setCutaway(0);micro.sensor.set(.8,0,0);micro.badge.set(fill,0,0);
  label(`${Math.round(fill)}%`,new T.Vector3(bin.position.x,bin.position.y+1.3,bin.position.z),fill<20?'value done':'value');
  cam=micro.camera;cam.position.set(-9,6.6,11.4);cam.lookAt(-.6,2.7,-1.1);cam.fov=37;cam.updateProjectionMatrix();
  // The lifting arms end on the bin's side trunnions, which is what they hold.
  micro.arms.forEach((arm,i)=>{const s=i?1:-1,a=new T.Vector3(-.82+s*.78,1.3,-2.05),b=bin.localToWorld(new T.Vector3(s*(micro.CONT.w/2+.04),.2+micro.CONT.h*.62,0));arm.visible=engage>.02;arm.position.copy(a).add(b).multiplyScalar(.5);arm.scale.y=a.distanceTo(b);arm.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.sub(a).normalize());});
  micro.sun.shadow.needsUpdate=true;scene=micro.scene;cam=micro.camera;
 }
 const cuts=[8,16,33];const fade=Math.max(1-inv(0,.4,playbackTime),inv(DURATION-.6,DURATION,playbackTime),...cuts.map(c=>Math.max(0,1-Math.abs(playbackTime-c)/.2)));$('fade').style.opacity=fade;
 drawLabels(cam);
 renderer.render(scene,cam);
}

const ready=(async()=>{
 macro=await buildMacro();setupMap();
 micro.arms=[0,1].map(()=>{const arm=new T.Mesh(new T.CylinderGeometry(.055,.055,1,10),new T.MeshStandardMaterial({color:0x637970,metalness:.8,roughness:.3}));micro.scene.add(arm);return arm;});
 await document.fonts.ready;for(const s of [micro,network,macro])renderer.compile(s.scene,s.camera);
 frame(0);document.body.dataset.ready='1';
})();
window.ANIM={duration:DURATION,fps:24,width:W,height:H,ready,seek:frame,inspect:()=>({route:route.map(v=>v.n),stops:stops.map(v=>({name:v.n,fill:v.fill,onRoute:route.some(r=>r.n===v.n),detour:v.detour})),duration:DURATION,segments:EDIT.map(([start,end])=>({start,end}))})};
if(preview){
 $('controls').style.display='flex';$('seek').max=DURATION;let paused=false,position=0,previous=performance.now();
 $('toggle').onclick=()=>{paused=!paused;$('toggle').textContent=paused?'Pusti':'Pauza';};$('restart').onclick=()=>{position=0;};$('seek').oninput=e=>{position=Number(e.target.value);frame(position);};
 ready.then(()=>{previous=performance.now();function loop(now){if(!paused)position=(position+(now-previous)/1000)%DURATION;previous=now;frame(position);$('seek').value=position;$('time').textContent=`${Math.floor(position)} / ${DURATION} s`;requestAnimationFrame(loop);}requestAnimationFrame(loop);});
}else{ready.then(()=>frame(Number(new URLSearchParams(location.search).get('t')||0)));}
