const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const elements=new Map();function el(k){if(!elements.has(k))elements.set(k,{textContent:'',classList:{add(){},remove(){}},getContext(){return {}}});return elements.get(k)}
const s={document:{querySelector:el,querySelectorAll:()=>[],addEventListener(){}},Image:class{},requestAnimationFrame(){},addEventListener(){},console};vm.createContext(s);vm.runInContext(fs.readFileSync(__dirname+'/game.js','utf8'),s);
const run=x=>vm.runInContext(x,s);
assert.equal(run('world.width*world.height/(W*H)'),4);
assert.ok(run('path(sheep,goal).length')>0);
assert.equal(run('valid(15,15)'),false);
run('sheep.x=39;sheep.y=1200;move(sheep,-20,0)');assert.equal(run('sheep.x'),39);
run('reset();state="playing";for(let i=0;i<3600&&state==="playing";i++)update(1/60)');assert.equal(run('state'),'lost');
run('reset();state="playing";sheep.x=goal.x;sheep.y=goal.y;rescued=children;children.forEach(c=>{c.found=true;c.x=goal.x;c.y=goal.y});update(1/60)');assert.equal(run('state'),'won');
run('reset()');assert.equal(run('elapsed'),0);assert.equal(run('sheep.x'),165);
console.log('PASS: four-screen area, exit route, wall collisions, wolf capture, clear and reset.');


assert.equal(run('wolves.length'),0);
run('state="playing";update(3.99)');assert.equal(run('wolves.length'),0);
run('update(.01)');assert.equal(run('wolves.length'),1);
run('reset();for(let i=0;i<30;i++)spawnWolf()');assert.equal(run('wolves.length'),15);
assert.equal(run('wolves.every(w=>valid(w.x,w.y)&&path(w,sheep).length>0&&offscreenDistance(w)>=30&&offscreenDistance(w)<=90&&Math.hypot(w.x-goal.x,w.y-goal.y)>=120)'),true);
// Returning to the camera margin clears the continuous outside countdown.
run('reset();wolves=[{x:735,y:45,outsideTime:0}];spawnClock=-100;updateWolfPopulation(4.9)');assert.equal(run('wolves.length'),1);
run('sheep.x=735;sheep.y=45;updateWolfPopulation(.01)');assert.equal(run('wolves[0].outsideTime'),0);
run('sheep.x=165;sheep.y=1215;updateWolfPopulation(4.9)');assert.equal(run('wolves.length'),1);
run('updateWolfPopulation(.11)');assert.equal(run('wolves.length'),0);
// Pause stops both lifecycle clocks.
run('reset();state="paused";update(20)');assert.equal(run('spawnClock'),0);
// Empty eligible area is skipped without placing inside the screen.
run('reset();var oldMin=WOLF_RULES.spawnMin;WOLF_RULES.spawnMin=10000');assert.equal(run('spawnWolf()'),false);
run('WOLF_RULES.spawnMin=oldMin;reset()');assert.equal(run('wolves.length'),0);
assert.equal(run('spawnClock'),0);
console.log('PASS: timed offscreen spawns, 15-wolf cap, valid reachable cells, exit exclusion, delayed despawn, return reset, pause and restart.');

run('reset();sheep.moving=false');
assert.equal(run('wolfTravelTime(1)'),0);
assert.equal(run('wolfTravelTime(2)'),1);
assert.equal(run('wolfTravelTime(1)'),0);
assert.equal(run('wolfTravelTime(2)'),1);
run('sheep.moving=true');assert.equal(run('wolfTravelTime(.25)'),.25);
assert.equal(run('sheepIdleTime'),0);
run('sheep.moving=false');assert.equal(run('wolfTravelTime(.75)'),0);
run('reset()');assert.equal(run('sheepIdleTime'),0);
// Verify actual wolf position remains still, then moves at half speed.
run('reset();state="playing";sheep={x:165,y:1215,dir:0};wolves=[{x:285,y:1215,dir:0,route:[],routeClock:0,outsideTime:0}];update(1)');
assert.equal(run('wolves[0].x'),285);
run('update(.25)');assert.equal(run('wolves[0].x'),275.5);
run('keys.add("left");update(.1)');assert.equal(run('sheepIdleTime'),0);
assert.ok(Math.abs(run('wolves[0].x')-267.9)<1e-8);
console.log('PASS: 1s stop / 2s half-speed repeating, actual movement and movement reset.');
// Distinct flank preferences choose different destinations in open space.
run('reset();sheep={x:375,y:315};var wa={x:105,y:315,angle:0,flankRadius:60,thinkTime:5,directions:[[1,0],[0,1],[-1,0],[0,-1]]};var wb={...wa,angle:Math.PI/2};var ra=planWolf(wa,.4),rb=planWolf(wb,.4)');
assert.notEqual(run('JSON.stringify(ra.at(-1))'),run('JSON.stringify(rb.at(-1))'));
assert.equal(run('[...ra,...rb].every(p=>valid(p.x,p.y))'),true);
run('wa={x:165,y:1215,angle:0,route:[{x:195,y:1215}]};wb={x:165,y:1225};wolves=[wa,wb];advanceWolf(wa,0)');assert.equal(run('wa.y'),1215);
run('advanceWolf(wa,.1)');assert.ok(run('wa.y')<1215);
assert.ok(run('Math.hypot(wa.x-165,wa.y-1215)')<=7.600001);
console.log('PASS: different flanking routes, traversable paths, spacing, stop phase and speed limit.');
run('reset();dashClock=12;wolves=[{x:735,y:45,route:[],routeClock:0,outsideTime:0}];updateDash(.1,.1)');assert.equal(run('dashWolf'),null);
run('wolves.push({x:330,y:1215,route:[],routeClock:0,outsideTime:0});updateDash(.1,0)');assert.equal(run('dashWolf'),null);
run('updateDash(.1,.1)');assert.equal(run('dashWolf===wolves[1]'),true);assert.equal(run('dashWolf.dashLeft'),1);
run('var selected=dashWolf;updateDash(.1,.1)');assert.equal(run('dashWolf===selected'),true);
run('state="playing";for(let i=0;i<9;i++)update(.1)');assert.equal(run('dashWolf===selected'),true);
run('update(.1)');assert.equal(run('dashWolf'),null);
run('reset()');assert.equal(run('dashClock'),0);assert.equal(run('dashWolf'),null);
console.log('PASS: visible-only selection, stop-phase gating, one runner, 1-second expiry and reset.');
run('reset()');assert.equal(run('children.length'),5);
assert.equal(run('children.every(c=>valid(c.x,c.y)&&path(sheep,c).length)'),true);
run('var waiting=children.map(c=>({x:c.x,y:c.y}));for(let i=0;i<120;i++)updateChildren(1/60)');assert.equal(run('children.some((c,i)=>Math.hypot(c.x-waiting[i].x,c.y-waiting[i].y)>1)'),true);
run('sheep.x=goal.x;sheep.y=goal.y;state="playing";update(.01)');assert.equal(run('state'),'playing');
run('reset();children[0].x=165;children[0].y=1095;sheep.x=165;sheep.y=1120;updateChildren(0)');assert.equal(run('rescued.length'),1);
run('updateChildren(0)');assert.equal(run('rescued.length'),1);
run('var cy=children[0].y;sheep.y+=25;updateChildren(.1)');assert.ok(run('children[0].y')>run('cy'));
assert.equal(run('children.every(c=>valid(c.x,c.y))'),true);
// A wall prevents recruitment even within the pickup distance.
run('reset();children[0].x=165;children[0].y=1161;sheep.x=165;sheep.y=1199;updateChildren(0)');assert.equal(run('rescued.length'),0);
run('reset();state="playing";wolves=[{x:children[0].x,y:children[0].y,route:[],routeClock:1,outsideTime:0}];update(.1)');assert.equal(run('state'),'playing');assert.equal(run('children.length'),5);
run('reset()');assert.equal(run('rescued.length'),0);
console.log('PASS: five reachable wandering lambs, recruitment, follow, exit gating, immunity and reset.');

run('var layouts=new Set();for(let k=0;k<10;k++){reset();layouts.add(JSON.stringify(children.map(c=>[c.x,c.y])));if(children.length!==5||children.some(c=>!valid(c.x,c.y)||!path(sheep,c).length))throw Error("Invalid spawn");for(let i=0;i<600;i++){updateChildren(1/60);if(children.some(c=>!valid(c.x,c.y)))throw Error("Wander crossed a wall");}}');
assert.ok(run('layouts.size')>1);
console.log('PASS: varied five-lamb placement and collision-safe wandering over ten restarts.');
