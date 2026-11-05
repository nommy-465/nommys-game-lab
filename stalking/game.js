'use strict';
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
const W=390,H=690,T=30,C=26,R=46,world={width:780,height:1380};
const grid=Array.from({length:R},(_,y)=>Array.from({length:C},(_,x)=>+(x===0||y===0||x===C-1||y===R-1)));
// Broad connected passages, with openings in each garden wall.
for(const [y,a,b,gap] of [[7,3,22,18],[15,1,20,5],[23,5,24,19],[31,1,20,7],[39,4,24,18]])for(let x=a;x<=b;x++)if(Math.abs(x-gap)>1)grid[y][x]=1;
for(const [x,a,b,gap] of [[9,3,12,10],[17,17,28,21],[10,33,43,37]])for(let y=a;y<=b;y++)if(Math.abs(y-gap)>1)grid[y][x]=1;
let children=[],rescued=[],sheep,wolves=[],elapsed=0,state='ready',last=0,steps=0,keys=new Set(),drag=null,vector={x:0,y:0},sprites=[];
const WOLF_RULES={limit:15,interval:4,spawnMin:T,spawnMax:3*T,despawnMargin:4*T,despawnDelay:5,exitRadius:4*T};
let spawnClock=0,sheepIdleTime=0,dashClock=0,dashWolf=null;
const DASH={interval:12,duration:1,speed:152};
const goal={x:22*T+15,y:3*T+15};
function reset(){sheep={x:5*T+15,y:40*T+15,dir:0};children=createChildren();rescued=[];document.querySelector("#rescued").textContent="子羊 0 / 5";wolves=[];spawnClock=0;sheepIdleTime=0;dashClock=0;dashWolf=null;elapsed=0;steps=0;keys.clear();vector={x:0,y:0};}
function blocked(x,y){return x<0||y<0||x>=world.width||y>=world.height||grid[Math.floor(y/T)][Math.floor(x/T)]===1;}
function valid(x,y){return ![[-8,-8],[8,-8],[-8,8],[8,8]].some(([a,b])=>blocked(x+a,y+b));}
function move(p,dx,dy){const ox=p.x,oy=p.y;if(valid(p.x+dx,p.y))p.x+=dx;if(valid(p.x,p.y+dy))p.y+=dy;if(Math.abs(dx)>Math.abs(dy))p.dir=dx<0?1:3;else if(dy)p.dir=dy<0?2:0;p.moving=p.x!==ox||p.y!==oy;}
function path(from,to,directions=[[1,0],[-1,0],[0,1],[0,-1]]){const sx=Math.floor(from.x/T),sy=Math.floor(from.y/T),tx=Math.floor(to.x/T),ty=Math.floor(to.y/T),start=sy*C+sx,end=ty*C+tx,q=[start],prev=new Map([[start,-1]]);for(let i=0;i<q.length;i++){const n=q[i];if(n===end)break;const x=n%C,y=Math.floor(n/C);for(const [a,b] of directions){const nx=x+a,ny=y+b,k=ny*C+nx;if(nx>=0&&nx<C&&ny>=0&&ny<R&&!grid[ny][nx]&&!prev.has(k)){prev.set(k,n);q.push(k);}}}if(!prev.has(end))return [];let out=[],k=end;while(k!==start){out.push({x:k%C*T+15,y:Math.floor(k/C)*T+15});k=prev.get(k);}return out.reverse();}
// Keep choices for several seconds, rather than jittering every frame.
function planWolf(wolf,dt){
 wolf.thinkTime=(wolf.thinkTime??0)-dt;
 if(wolf.thinkTime<=0){
  wolf.angle=Math.random()*Math.PI*2;wolf.flankRadius=45+Math.random()*45;
  wolf.directions=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let i=3;i>0;i--){const j=Math.floor(Math.random()*(i+1));[wolf.directions[i],wolf.directions[j]]=[wolf.directions[j],wolf.directions[i]];}
  wolf.thinkTime=2+Math.random()*3;
 }
 let target=sheep;
 if(Math.hypot(wolf.x-sheep.x,wolf.y-sheep.y)>150){
  const flank={x:Math.floor((sheep.x+Math.cos(wolf.angle)*wolf.flankRadius)/T)*T+T/2,y:Math.floor((sheep.y+Math.sin(wolf.angle)*wolf.flankRadius)/T)*T+T/2};
  if(valid(flank.x,flank.y)&&path(flank,sheep).length)target=flank;
 }
 const route=path(wolf,target,wolf.directions);
 return route.length?route:path(wolf,sheep,wolf.directions);
}
function advanceWolf(wolf,travelTime,pace=76){
 const target=wolf.route[0];if(!target||travelTime<=0)return;
 const x=target.x-wolf.x,y=target.y-wolf.y,d=Math.hypot(x,y),speed=pace*travelTime;
 let sx=0,sy=0;
 for(const other of wolves){if(other===wolf)continue;const dx=wolf.x-other.x,dy=wolf.y-other.y,dist=Math.hypot(dx,dy);
  if(dist<30){const angle=wolf.angle??0;sx+=(dist>.01?dx/dist:Math.cos(angle))*(1-dist/30);sy+=(dist>.01?dy/dist:Math.sin(angle))*(1-dist/30);}
 }
 // Blend spacing into the intended direction without exceeding normal speed.
 let vx=(d?x/d:0)+sx*.65,vy=(d?y/d:0)+sy*.65,len=Math.hypot(vx,vy),step=Math.min(speed,d);
 const ox=wolf.x,oy=wolf.y;
 if(len)move(wolf,vx/len*step,vy/len*step);
 if(wolf.x===ox&&wolf.y===oy&&d)move(wolf,x/d*step,y/d*step);
 if(Math.hypot(target.x-wolf.x,target.y-wolf.y)<3)wolf.route.shift();
}
// Distance from the camera rectangle, measured in world pixels.
function offscreenDistance(p){return Math.hypot(Math.max(0,Math.abs(p.x-sheep.x)-W/2),Math.max(0,Math.abs(p.y-sheep.y)-H/2));}
function spawnWolf(){
 if(wolves.length>=WOLF_RULES.limit)return false;
 const candidates=[];
 for(let y=1;y<R-1;y++)for(let x=1;x<C-1;x++){
  const p={x:x*T+T/2,y:y*T+T/2};const distance=offscreenDistance(p);
  if(distance<WOLF_RULES.spawnMin||distance>WOLF_RULES.spawnMax||!valid(p.x,p.y))continue;
  if(Math.hypot(p.x-goal.x,p.y-goal.y)<WOLF_RULES.exitRadius||wolves.some(w=>Math.hypot(w.x-p.x,w.y-p.y)<T))continue;
  candidates.push(p);
 }
 while(candidates.length){
  const i=Math.floor(Math.random()*candidates.length),p=candidates.splice(i,1)[0],route=path(p,sheep);
  if(!route.length)continue;
  wolves.push({...p,dir:0,route,routeClock:.45,outsideTime:0,moving:false});return true;
 }
 return false; // No safe position: skip this interval, never force a visible spawn.
}
function updateWolfPopulation(dt){
 wolves=wolves.filter(w=>{
  w.outsideTime=offscreenDistance(w)>=WOLF_RULES.despawnMargin?w.outsideTime+dt:0;
  return w.outsideTime<WOLF_RULES.despawnDelay;
 });
 spawnClock+=dt;
 if(spawnClock>=WOLF_RULES.interval){spawnClock%=WOLF_RULES.interval;spawnWolf();}
}
function modal(title,message,label){document.querySelector('#modal').classList.remove('title-screen');document.querySelector('#heading').textContent=title;document.querySelector('#message').textContent=message;document.querySelector('#start').textContent=label;document.querySelector('#modal').classList.remove('hidden');keys.clear();vector={x:0,y:0};}
function end(win){state=win?'won':'lost';modal(win?'Home, at last.':'Caught you…',win?'子羊5匹と一緒に森を抜けられました！ '+Math.floor(elapsed)+'秒で脱出。':'狼につかまってしまいました。石壁を利用して距離を取りましょう。','もう一度遊ぶ');}
// All wolves share the stop/approach cycle, including newly spawned wolves.
function wolfTravelTime(dt){
 if(sheep.moving){sheepIdleTime=0;return dt;}
 const slowTime=t=>Math.floor(t/3)+Math.max(0,t%3-1)/2;
 const travel=slowTime(sheepIdleTime+dt)-slowTime(sheepIdleTime);
 sheepIdleTime+=dt;return travel;
}
function updateDash(dt,travelTime){
 dashClock=Math.min(DASH.interval,dashClock+dt);
 if(dashWolf&&!wolves.includes(dashWolf))dashWolf=null;
 if(dashWolf||dashClock<DASH.interval||travelTime<=0)return;
 // Require the whole sprite to be inside the viewport at activation.
 const visible=wolves.filter(w=>Math.abs(w.x-sheep.x)<W/2-20&&Math.abs(w.y-sheep.y)<H/2-32);
 if(!visible.length)return;
 dashWolf=visible[Math.floor(Math.random()*visible.length)];
 dashWolf.dashLeft=DASH.duration;dashWolf.routeClock=0;dashClock=0;
}
function clearPassage(a,b){
 const d=Math.hypot(a.x-b.x,a.y-b.y),n=Math.max(1,Math.ceil(d/4));
 for(let i=0;i<=n;i++)if(!valid(a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n))return false;
 return true;
}
function createChildren(){
 const spots=[];
 for(let y=1;y<R-1;y++)for(let x=1;x<C-1;x++){
  const p={x:x*T+15,y:y*T+15};
  if(valid(p.x,p.y)&&Math.hypot(p.x-sheep.x,p.y-sheep.y)>120&&path(sheep,p).length)spots.push(p);
 }
 for(let i=spots.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[spots[i],spots[j]]=[spots[j],spots[i]];}
 const result=[];
 for(const p of spots){
  if(result.some(c=>Math.hypot(c.x-p.x,c.y-p.y)<90))continue;
  result.push({...p,dir:0,found:false,route:[],routeClock:0,wanderTarget:null,wanderWait:Math.random()});
  if(result.length===5)break;
 }
 return result;
}
function wanderChild(child,dt){
 if(dt<=0)return;
 child.moving=false;
 if(!child.wanderTarget){
  child.wanderWait-=dt;if(child.wanderWait>0)return;
  const options=[[T,0],[-T,0],[0,T],[0,-T]].map(([dx,dy])=>({x:child.x+dx,y:child.y+dy})).filter(p=>valid(p.x,p.y)&&clearPassage(child,p));
  if(!options.length){child.wanderWait=.5;return;}
  child.wanderTarget=options[Math.floor(Math.random()*options.length)];
 }
 const target=child.wanderTarget,dx=target.x-child.x,dy=target.y-child.y,d=Math.hypot(dx,dy),step=Math.min(d,25*dt);
 if(d)move(child,dx/d*step,dy/d*step);
 if(Math.hypot(target.x-child.x,target.y-child.y)<.001){child.wanderTarget=null;child.wanderWait=.3+Math.random()*1.2;}
}
function updateChildren(dt){
 for(const child of children){
  if(!child.found&&Math.hypot(child.x-sheep.x,child.y-sheep.y)<32&&clearPassage(child,sheep)){
   child.found=true;child.wanderTarget=null;rescued.push(child);
  }
 }
 for(const child of children)if(!child.found)wanderChild(child,dt);
 for(let i=0;i<rescued.length;i++){
  const child=rescued[i],leader=i?rescued[i-1]:sheep;
  child.moving=false;child.routeClock-=dt;
  const distance=Math.hypot(child.x-leader.x,child.y-leader.y);
  if(distance<=23&&clearPassage(child,leader))continue;
  let target;
  if(clearPassage(child,leader))target=leader;
  else{if(child.routeClock<=0){child.route=path(child,leader);child.routeClock=.25;}target=child.route[0];}
  if(!target)continue;
  const dx=target.x-child.x,dy=target.y-child.y,d=Math.hypot(dx,dy),step=Math.min(120*dt,target===leader?Math.max(0,d-23):d);
  if(d&&step)move(child,dx/d*step,dy/d*step);
  if(target!==leader&&Math.hypot(target.x-child.x,target.y-child.y)<2)child.route.shift();
 }
 document.querySelector('#rescued').textContent='子羊 '+rescued.length+' / 5';
}
function drawChild(child){
 if(!childImg.complete||!childImg.naturalWidth)return;
 const row=child.dir===3?1:child.dir,[sx,sy,sw,sh]=childRects[row],scale=15/235;
 ctx.save();ctx.translate(Math.round(child.x),Math.round(child.y));if(child.dir===3)ctx.scale(-1,1);
 ctx.drawImage(childImg,sx,sy,sw,sh,Math.round(-sw*scale/2),Math.round(5-sh*scale),Math.round(sw*scale),Math.round(sh*scale));ctx.restore();
 if(!child.found){ctx.fillStyle='#ffe6a0';ctx.textAlign='center';ctx.font='11px sans-serif';ctx.fillText('?',child.x,child.y-19);}
}
function update(dt){if(state!=='playing')return;elapsed+=dt;sheep.moving=false;for(const wolf of wolves)wolf.moving=false;let dx=(keys.has('right')?1:0)-(keys.has('left')?1:0)+vector.x,dy=(keys.has('down')?1:0)-(keys.has('up')?1:0)+vector.y,n=Math.hypot(dx,dy);if(n){move(sheep,dx/n*100*dt,dy/n*100*dt);steps+=dt*9;}
updateChildren(dt);
const travelTime=wolfTravelTime(dt);
updateWolfPopulation(dt);
updateDash(dt,travelTime);
for(const wolf of wolves){
 const running=wolf===dashWolf;
 wolf.routeClock-=dt;
 if(wolf.routeClock<=0){wolf.route=running?path(wolf,sheep):planWolf(wolf,.45);wolf.routeClock=running?.12:.35+Math.random()*.3;}
 if(running){
  const dashDt=Math.min(dt,wolf.dashLeft);advanceWolf(wolf,dashDt,DASH.speed);wolf.dashLeft-=dashDt;
  if(wolf.dashLeft<=1e-9){wolf.dashLeft=0;dashWolf=null;wolf.routeClock=0;}
 }else advanceWolf(wolf,travelTime);
 if(Math.hypot(sheep.x-wolf.x,sheep.y-wolf.y)<22){end(false);return;}
}

if(rescued.length===5&&Math.hypot(sheep.x-goal.x,sheep.y-goal.y)<24&&rescued.every(c=>Math.hypot(c.x-goal.x,c.y-goal.y)<150))end(true);
document.querySelector('#time').textContent=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(Math.floor(elapsed%60)).padStart(2,'0');document.querySelector('#status').textContent=wolves.some(wolf=>Math.hypot(sheep.x-wolf.x,sheep.y-wolf.y)<180)?'狼が近づいている！':(rescued.length<5?'迷える子羊をあと'+(5-rescued.length)+'匹探そう':'みんなでゴールへ！');}
function sprite(p,isWolf){
 const cycle=[0,1,2,1],frame=p.moving?cycle[Math.floor(isWolf?elapsed*8:steps)%4]:1;
 const running=isWolf&&p===dashWolf&&p.moving&&runImg.complete&&runImg.naturalWidth>0;
 const row=p.dir===3?1:p.dir,rect=isWolf?(running?runRects[row*3+Math.floor(elapsed*12)%3]:coatRects[row*3+frame]):sprites[row*3+frame];
 if(!rect||(isWolf&&(!runImg.complete||!runImg.naturalWidth)))return;
 const [sx,sy,sw,sh]=rect,scale=isWolf?32/216:30/134;
 ctx.save();ctx.translate(Math.round(p.x),Math.round(p.y));if(p.dir===3)ctx.scale(-1,1);
 ctx.drawImage(isWolf?runImg:img,sx,sy,sw,sh,Math.round(-sw*scale/2),Math.round(8-sh*scale),Math.round(sw*scale),Math.round(sh*scale));ctx.restore();
}
function render(){ctx.imageSmoothingEnabled=false;ctx.fillStyle='#17291f';ctx.fillRect(0,0,W,H);ctx.save();ctx.translate(W/2-sheep.x,H/2-sheep.y);for(let y=0;y<R;y++)for(let x=0;x<C;x++){const px=x*T,py=y*T;if(px<sheep.x-W/2-T||px>sheep.x+W/2||py<sheep.y-H/2-T||py>sheep.y+H/2)continue;ctx.fillStyle=(x*7+y*13)%5===0?'#354e32':'#30492f';ctx.fillRect(px,py,T,T);ctx.fillStyle='#61734644';ctx.fillRect(px+((x*17+y*3)%24),py+((y*11+x)%24),2,3);if(grid[y][x]){ctx.fillStyle='#16291c';ctx.fillRect(px,py+7,T,T);ctx.fillStyle='#667060';ctx.fillRect(px+1,py+1,T-2,T-4);ctx.fillStyle='#89917a';ctx.fillRect(px+2,py+1,T-4,3);ctx.fillStyle='#444f42';ctx.fillRect(px+2,py+T-7,T-4,4);ctx.fillStyle='#788064';ctx.fillRect(px+4,py+9,10,2);ctx.fillStyle='#344637';ctx.fillRect(px+21,py+3,5,6);}}
ctx.shadowColor='#d3e8a1';ctx.shadowBlur=18;ctx.fillStyle='#c9df91';ctx.fillRect(goal.x-21,goal.y-24,7,48);ctx.fillRect(goal.x+14,goal.y-24,7,48);ctx.fillRect(goal.x-21,goal.y-27,42,7);ctx.shadowBlur=0;ctx.fillStyle='#eef6cc';ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText(rescued.length===5?'EXIT':'子羊 '+rescued.length+'/5',goal.x,goal.y-34);for(const child of children)drawChild(child);for(const wolf of wolves)sprite(wolf,true);sprite(sheep,false);ctx.restore();
// Goal bearing only: no map or offscreen enemy positions are revealed.
ctx.save();ctx.translate(W/2,126);
ctx.fillStyle='#10241ee8';ctx.beginPath();ctx.arc(0,0,25,0,Math.PI*2);ctx.fill();
ctx.strokeStyle='#c9df9166';ctx.lineWidth=1;ctx.stroke();
ctx.save();ctx.rotate(Math.atan2(goal.y-sheep.y,goal.x-sheep.x)+Math.PI/2);
ctx.fillStyle='#e2edb6';ctx.beginPath();ctx.moveTo(0,-17);ctx.lineTo(11,9);ctx.lineTo(0,4);ctx.lineTo(-11,9);ctx.closePath();ctx.fill();ctx.restore();
ctx.fillStyle='#e2edb6';ctx.textAlign='center';ctx.font='10px sans-serif';ctx.fillText('ゴール',0,40);ctx.restore();}

function loop(t){const dt=Math.min((t-last)/1000,.04);last=t;update(dt);render();requestAnimationFrame(loop);}
const map={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'};addEventListener('keydown',e=>{if(map[e.key]){e.preventDefault();keys.add(map[e.key]);}});addEventListener('keyup',e=>keys.delete(map[e.key]));
for(const b of document.querySelectorAll('[data-dir]')){b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.dir);};const release=()=>keys.delete(b.dataset.dir);b.onpointerup=release;b.onpointercancel=release;b.onlostpointercapture=release;}
canvas.onpointerdown=e=>{if(state!=='playing')return;canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY};};canvas.onpointermove=e=>{if(!drag)return;const x=e.clientX-drag.x,y=e.clientY-drag.y,d=Math.hypot(x,y);vector=d>8?{x:x/d,y:y/d}:{x:0,y:0};};canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;vector={x:0,y:0};};
function pause(){if(state==='playing'){state='paused';modal('Take a breath.','準備ができたら再開しましょう。','再開');}}
document.querySelector('#pause').onclick=pause;addEventListener('blur',()=>{keys.clear();drag=null;vector={x:0,y:0};pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});document.querySelector('#start').onclick=()=>{if(state!=='paused')reset();state='playing';document.querySelector('#modal').classList.add('hidden');};
// Transparent source frames: no baked-in or runtime character shadow.
const frameRects=[[251, 39, 106, 132], [575, 39, 104, 132], [898, 39, 105, 132], [260, 239, 82, 134], [587, 239, 80, 129], [913, 239, 80, 132], [251, 428, 106, 129], [575, 428, 104, 129], [898, 428, 105, 129], [266, 629, 72, 147], [590, 629, 73, 147], [915, 629, 73, 147], [256, 828, 103, 141], [579, 828, 93, 141], [902, 828, 103, 141], [267, 1040, 72, 149], [589, 1040, 74, 149], [915, 1040, 72, 149]];
const coatRects=[[142, 26, 106, 215], [459, 27, 105, 211], [772, 26, 108, 216], [142, 274, 135, 206], [449, 274, 121, 206], [758, 274, 131, 206], [141, 517, 116, 217], [460, 517, 104, 217], [768, 517, 116, 217], [138, 792, 132, 219], [456, 792, 111, 208], [753, 792, 133, 219], [124, 1047, 168, 202], [437, 1046, 151, 196], [742, 1046, 168, 203], [135, 1291, 132, 224], [453, 1291, 122, 207], [761, 1291, 125, 224]];
const runRects=coatRects.slice(9);
const runImg=new Image();runImg.src="assets/wolf-trench-v2.png";
const childRects=[[234,693,248,234],[659,692,193,235],[1048,692,248,235]];
const childImg=new Image();childImg.src="assets/lambie-child-concept-v1.png";
reset();const img=new Image();img.onload=()=>{sprites=frameRects;document.querySelector('#start').disabled=false;document.querySelector('#start').textContent='タップしてスタート';};img.onerror=()=>{document.querySelector('#modal').classList.remove('title-screen');document.querySelector('#message').textContent='画像を読み込めません。ページを再読み込みしてください。';};img.src='assets/stalking-walk-v2.png';requestAnimationFrame(loop);
