'use strict';
const T=THREE, el=id=>document.getElementById(id), canvas=el('arena');
const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.toneMapping=T.ACESFilmicToneMapping;
renderer.toneMappingExposure=.9;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=T.PCFSoftShadowMap;
const scene=new T.Scene(), camera=new T.PerspectiveCamera(56,1,.12,175);
scene.background=new T.Color(0xbacbd3);
scene.fog=new T.FogExp2(0xb7c6c9,.010);
scene.add(new T.HemisphereLight(0xdceaff,0xb39a77,.65));
const sun=new T.DirectionalLight(0xffe5bd,3.35);
const sunOffset=new T.Vector3(-38,42,-35);
sun.position.copy(sunOffset);
sun.castShadow=true;
Object.assign(sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18,near:38,far:94});
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.mapSize.set(1024,1024);
sun.shadow.normalBias=.022;
scene.add(sun,sun.target);
new T.TextureLoader().load('assets/highland-sky.webp',sky=>{
 sky.colorSpace=T.SRGBColorSpace;
 sky.mapping=T.EquirectangularReflectionMapping;
 scene.background=sky;
 // Rough surfaces only need a small copy of the panorama for reflected light.
 const probe=document.createElement('canvas');
 probe.width=256;probe.height=128;
 probe.getContext('2d').drawImage(sky.image,0,0,probe.width,probe.height);
 const reflection=new T.CanvasTexture(probe,T.EquirectangularReflectionMapping);
 reflection.colorSpace=T.SRGBColorSpace;
 scene.environment=reflection;
});
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const obstacles=buildForest(scene,renderer);
const battleFX=makeBattleFeedback(scene);
function model(id){
 const actor=makePokemon(id,true);scene.add(actor.root);
 actor.shadowParts=[];
 actor.ready=actor.ready.then(()=>actor.root.traverse(part=>{
   if(part.castShadow){
     actor.shadowParts.push(part);
     part.castShadow=quality>=.8;
   }
 }));
 return Object.assign(actor,{id,hp:id===25?100:36,cd:0});
}
// Keep a separate, reusable rig for each playable partner. Foes may be the same species.
const starters = new Map([4, 7, 25].map(id => [id, makeStarter(id, scene)]));
let player = starters.get(4);
const evolutionShowcase = makeEvolutionShowcase();
for (const actor of starters.values()) actor.root.visible = actor === player;

function selectStarter(id) {
  if (!starters.has(id) || !['ready','win','lose'].includes(mode)) return;
  if (player.id === id && mode === 'ready') return;
  player.root.visible = false;
  player = starters.get(id);
  prepareSelection();
}

function prepareSelection() {
  reset();
  screen('ready');
  renderStarter(player.id);
  portraitView();
}
const foes = [];
const pos = a => a.root.position;
const keys = new Set(), shots = [];
const boltGeo = new T.SphereGeometry(1, 8, 6);
// A branching silhouette keeps the player's shot readable against the grass.
const zigzag = new T.Shape();
zigzag.moveTo(-.22,-1);zigzag.lineTo(.64,.05);zigzag.lineTo(.18,.04);
zigzag.lineTo(.52,1);zigzag.lineTo(-.65,-.15);zigzag.lineTo(-.2,-.12);zigzag.closePath();
const electricBolt=new T.ExtrudeGeometry(zigzag,{depth:.22,bevelEnabled:false});
electricBolt.rotateX(Math.PI/2);
const boltMat = {
  25:new T.MeshBasicMaterial({color:0xffed76}),
  4:new T.ShaderMaterial({
    uniforms:{clock:{value:0}},transparent:true,depthWrite:false,
    vertexShader:`varying vec3 shell; varying float facing;
      void main(){
        shell=position;
        vec3 p=position;
        p.xy*=mix(.38,1.,smoothstep(-1.,.35,p.z));
        p.z-=.6*pow(max(0.,-p.z),2.);
        vec4 eye=modelViewMatrix*vec4(p,1.);
        facing=max(0.,dot(normalize(normalMatrix*normal),normalize(-eye.xyz)));
        gl_Position=projectionMatrix*eye;
      }`,
    fragmentShader:`uniform float clock; varying vec3 shell; varying float facing;
      void main(){
        float streak=.5+.5*sin(shell.x*11.+shell.z*13.+clock*26.+2.*sin(shell.y*8.-clock*14.));
        float heat=smoothstep(.03,.83,facing+shell.z*.23+streak*.23);
        vec3 flame=mix(vec3(1.9,.08,.008),vec3(3.9,1.85,.43),heat*heat);
        gl_FragColor=vec4(flame,smoothstep(-.10,.35,facing+.32*streak+min(shell.z,0.)*.4));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }),
  7:new T.MeshPhysicalMaterial({color:0x79d6e7,roughness:.13,clearcoat:.75,clearcoatRoughness:.08,transparent:true,opacity:.86})
};
const arcMaterial = new T.LineBasicMaterial({color:0xc4ffff, transparent:true, opacity:.95});
const arcs = [], boltPool = [], yAxis = V(0,1,0);
const bossWarning = new T.Group();
const warningColor = {color:0xff6853, transparent:true, depthWrite:false, side:T.DoubleSide};
const warningDisk = new T.Mesh(new T.CircleGeometry(2.7,48),new T.MeshBasicMaterial({...warningColor,opacity:.16}));
const warningEdge = new T.Mesh(new T.RingGeometry(2.6,2.7,48),new T.MeshBasicMaterial({...warningColor,opacity:.9}));
warningDisk.rotation.x = warningEdge.rotation.x = -Math.PI/2;
bossWarning.add(warningDisk,warningEdge);
bossWarning.visible = false;
scene.add(bossWarning);
let bossCast = 0;
let run, mode = 'ready', yaw = 0, pitch = -.12, held = false, elapsed = 0, kills = 0;
let waveSize = 0, spawned = 0, spawnClock = 0, leadSpecies = 4;
const experienceDrops = [];
const crystalBatch = new T.InstancedMesh(
  new T.OctahedronGeometry(.28),
  new T.MeshBasicMaterial({color:0x83ffe8}),
  expeditionWaves.reduce((total,wave) => total+wave.count,0)
);
crystalBatch.count=0;
crystalBatch.frustumCulled=false;
scene.add(crystalBatch);
const crystalPose = new T.Object3D();
const clamp = T.MathUtils.clamp;
const waveSpec = () => expeditionWaves[run.wave - 1];

function recycleShot(index) {
  const shot = shots[index];
  shot.mesh.visible = false;
  shot.struck.clear();
  boltPool.push(shot);
  shots[index] = shots[shots.length - 1];
  shots.pop();
}

function clearProjectiles() {
  evolvedJets.reset();
  bossCast = 0;
  bossWarning.visible = false;
  while (shots.length) recycleShot(shots.length - 1);
  for (const arc of arcs) {
    scene.remove(arc.line);
    arc.line.geometry.dispose();
  }
  arcs.length = 0;
}

function spawnWave() {
  clearProjectiles();
  const spec = waveSpec();
  waveSize = spec.count;
  for (const e of foes) {
    e.hp = 0;
    e.root.visible = false;
  }
  spawned = 0;
  spawnClock = 2.2;
  leadSpecies = Math.random() < .5 ? 4 : 7;
  spawnPack();
}

function spawnPack() {
  const living = foes.reduce((total,e) => total + Number(e.hp > 0), 0);
  const count = Math.min(waveSize - spawned, 5 + Math.floor(run.wave / 3), Math.min(17, 7 + run.wave * 2) - living);
  if (count <= 0) return;
  const spec = waveSpec();
  const flank = spawned === 0 ? 0 : Math.sin(spawned * 1.73) * 1.8;
  const approach = yaw + flank + (Math.random() - .5) * .4;
  for (let i = 0; i < count; i++) {
    const sequence = spawned++;
    const id = sequence % 2 ? 11 - leadSpecies : leadSpecies;
    let enemy = foes.find(e => e.id === id && !e.root.visible);
    if (!enemy) {
      enemy = model(id);
      foes.push(enemy);
    }
    const boss = run.wave === expeditionWaves.length && sequence === Math.floor(waveSize / 2);
    enemy.ranged = boss || sequence % 5 === 3;
    const scale = boss ? 1.65 : enemy.ranged ? 1 : .79;
    enemy.root.scale.setScalar(scale);
    enemy.elite = boss;
    enemy.castCooldown = 3;
    enemy.burnTicks = enemy.burnClock = enemy.slowTime = 0;
    enemy.recoil = 0;
    enemy.maxHp = boss ? 235 : spec.health + (enemy.ranged ? 5 : 0);
    enemy.hp = enemy.maxHp;
    enemy.cd = 1.6 + i * .53;
    enemy.dodge = Math.random() < .5 ? -1 : 1;
    enemy.root.visible = true;
    const spread = run.wave < 3 ? 1.8 : 3.1;
    const stagger = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1);
    const angle = approach + stagger * spread / count;
    const distance = 9 + Math.random() * 5;
    let placed = false;
    // Rotate away from the arena edge and solid obstacles.
    for (let j = 0; j < 36; j++) {
      const a = angle + j * .29;
      const x = pos(player).x - Math.sin(a) * distance;
      const z = pos(player).z - Math.cos(a) * distance;
      if (!free(x,z) || foes.some(other => other !== enemy && other.hp && (pos(other).x-x)**2+(pos(other).z-z)**2 < 5)) continue;
      pos(enemy).set(x,0,z);
      placed = true;
      break;
    }
    if (!placed) pos(enemy).set(-6 + i * 2.4,0,-5);
    enemy.root.rotation.y = Math.atan2(pos(enemy).x-pos(player).x,pos(enemy).z-pos(player).z);
  }
  hud();
}

function reset() {
  battleFX.reset();
  experienceDrops.length=0;
  crystalBatch.count=0;
  evolutionShowcase.stop();
  run = beginExpedition(player.id);
  setPartnerStage(player,0);
  pos(player).set(0,0,16);
  player.root.rotation.y = yaw = 0;
  pitch = -.12;
  elapsed = kills = 0;
  player.hp = 100;
  player.dodgeLeft=player.dodgeCooldown=player.dodgeInvulnerable=player.hitReaction=0;
  player.attackYaw=undefined;
  lastDodgeLabel='';
  updateDodgeHud();
  player.cd = 0;
  player.recoil = 0;
  player.root.visible = true;
  spawnWave();
}

function hud() {
  el('hp').style.width = player.hp + '%';
  el('life').textContent = 'HP ' + player.hp + ' / 100';
  const remaining = foes.reduce((n,e) => n + Number(e.hp > 0),0);
  el('score').textContent = '本波剩余 ' + (waveSize-spawned+remaining) + ' / ' + waveSize + '　·　击败 ' + kills;
  const nextForm = evolutionLines[player.id][run.stage+1];
  const nextGoal = nextForm ? '　·　Lv.' + nextForm.level + ' ' + nextForm.name : '';
  el('xpText').textContent = 'Lv.' + run.level + '　' + run.xp + ' / ' + run.nextXp + nextGoal;
  el('xpMeter').max = run.nextXp;
  el('xpMeter').value = run.xp;
  el('wave').textContent = '第 ' + run.wave + ' / 5 波　' + waveSpec().name;
  const dots = el('waveDots');
  if (!dots.children.length) dots.replaceChildren(...expeditionWaves.map(() => document.createElement('i')));
  Array.from(dots.children).forEach((dot,i) => {
    dot.className = i < run.wave - 1 ? 'cleared' : i === run.wave-1 ? 'current' : '';
  });
  el('build').textContent = relicsFor(run.species).filter(r => run.levels[r.key]).map(r => r.name + ' ' + run.levels[r.key]).join('　');
  const boss = foes.find(e => e.elite && e.hp > 0);
  const bar = el('boss');
  bar.hidden = !boss;
  if (boss) {
    const name = boss.id === 4 ? '小火龙' : '杰尼龟';
    bar.replaceChildren('霸主 · ' + name + '　' + boss.hp + ' / ' + boss.maxHp);
    const progress = document.createElement('progress');
    progress.max = boss.maxHp;
    progress.value = boss.hp;
    bar.append(progress);
  }
}

function screen(next) {
  if(next!=='upgrade')evolutionShowcase.stop();
  const evolving = next==='upgrade' && evolutionShowcase.active;
  document.body.classList.toggle('evolving',evolving);
  el('evolutionDraftHint').hidden=!evolving;
  el('panelLabel').textContent=next==='upgrade'?(run.draftReason==='level'?'经验突破  /  LV.'+run.level:'波次奖励  /  '+run.wave+' OF 4'):'VIRIDIAN FOREST';
  mode = next;
  document.body.dataset.mode = mode;
  keys.clear();
  held = false;
  el('panel').hidden = mode === 'play';
  el('choices').hidden = mode !== 'upgrade';
  el('start').hidden = mode === 'upgrade';
  if (mode === 'play') return;
  if (document.pointerLockElement) document.exitPointerLock();
  const summary = '本局击败 ' + kills + ' 只宝可梦，抵达第 ' + run.wave + ' 波。';
  const labels = {
    ready:['常青秘境','边走位边自动攻击，吸取晶石升级，冲破五波围攻。','进入战斗 ▸'],
    paused:['战斗暂停','返回森林，继续本次挑战。','继续战斗 ▸'],
    upgrade:['选择你的强化',run.draftReason==='level'?'经验晶石已充满。选一项强化，继续当前遭遇。':'第 ' + run.wave + ' 波通过，体力 +12。选一项带入下一波。',''],
    win:['秘境通关','森林霸主已倒下。' + summary,'再来一局 ▸'],
    lose:['本次探险结束',summary + '重新出发可获得另一组强化。','重新挑战 ▸'],
  };
  [el('title').textContent,el('note').textContent,el('start').textContent] = labels[mode];
  if (mode === 'upgrade') {
    if(evolving){
      const line=evolutionLines[player.id], form=line[run.stage];
      el('panelLabel').textContent='Lv.'+run.level+'　'+line[run.stage-1].name+' 进化';
      el('title').textContent=form.name;
      el('note').textContent='习得「'+form.move+'」。'+form.detail;
    }
    el('choices').replaceChildren(...run.offers.map((relic,index) => {
      const button = document.createElement('button');
      button.className = 'upgrade-card choice';
      const glyph=document.createElement('i');
      glyph.className='relic-glyph';
      glyph.setAttribute('aria-hidden','true');
      glyph.textContent={
        chain:'ϟ',volley:'⋔',pierce:'➶',charge:'✧',tempo:'»',sap:'✚',
        kindle:'♨',burst:'✹',fan:'⋔',cinder:'◈',flare:'✦',stoke:'»',
        bounce:'⤴',frost:'❄',wave:'≋',breaker:'➶',foam:'◌',stream:'»'
      }[relic.key];
      const family = document.createElement('small'), name = document.createElement('strong'), detail = document.createElement('span');
      family.textContent = '0' + (index+1) + '　' + relic.family + '　Lv.' + (run.levels[relic.key]+1);
      name.textContent = relic.name;
      detail.textContent = relic.description;
      button.append(family,glyph,name,detail);
      button.onclick = () => chooseUpgrade(index);
      return button;
    }));
  }
}

function endWave() {
  clearProjectiles();
  if (run.wave === expeditionWaves.length) {
    screen('win');
    return;
  }
  player.hp = Math.min(100,player.hp + 12);
  run.draftReason = 'wave';
  run.offers = drawRelics(run);
  hud();
  screen('upgrade');
}

function chooseUpgrade(index) {
  if (mode !== 'upgrade' || !run.offers[index]) return;
  const relic = run.offers[index];
  run.levels[relic.key]++;
  if (relic.key === 'sap') player.hp = Math.min(100,player.hp + 22);
  if (run.draftReason === 'wave') {
    run.wave++;
    spawnWave();
  } else hud();
  run.draftReason = null;
  run.offers = [];
  screen('play');
  lock();
}

function free(x,z) {
  return x*x+z*z < 31*31 && !obstacles.some(o => (x-o.x)**2+(z-o.z)**2 < (o.r+.56)**2);
}

function move(actor,dx,dz) {
  const p = pos(actor);
  if (free(p.x+dx,p.z)) p.x += dx;
  if (free(p.x,p.z+dz)) p.z += dz;
}
const dodgeDuration=.40, dodgeRecovery=2.1;
const dodgeDirection=V();
const motionInput={dodgeProgress:-1,hit:0,side:0,forward:0,charge:0};
let lastDodgeLabel='';
function updateDodgeHud() {
  const wait=player.dodgeCooldown;
  const label=wait>0 ? wait.toFixed(1)+' 秒' : '就绪';
  if(label===lastDodgeLabel)return;
  lastDodgeLabel=label;
  el('dodgeTime').textContent=label;
  el('dodgeGauge').style.transform='scaleX('+clamp(1-wait/dodgeRecovery,0,1)+')';
  el('dodgeState').classList.toggle('cooldown',wait>0);
}
function performDodge(){
  if(mode!=='play'||player.dodgeCooldown>0)return false;
  const side=Number(keys.has('d'))-Number(keys.has('a'));
  let forward=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown'));
  if(!side&&!forward)forward=1;
  dodgeDirection.set(Math.cos(yaw)*side-Math.sin(yaw)*forward,0,-Math.sin(yaw)*side-Math.cos(yaw)*forward).normalize();
  player.dodgeYaw=player.root.rotation.y;
  const relative=Math.atan2(-dodgeDirection.x,-dodgeDirection.z)-player.dodgeYaw;
  player.dodgeSide=-Math.sin(relative);
  player.dodgeForward=Math.cos(relative);
  player.dodgeLeft=dodgeDuration;player.dodgeInvulnerable=.31;player.dodgeCooldown=dodgeRecovery;
  battleFX.dodge(player);updateDodgeHud();return true;
}
function stepDodge(dt){
  player.dodgeCooldown=Math.max(0,player.dodgeCooldown-dt);
  player.dodgeInvulnerable=Math.max(0,player.dodgeInvulnerable-dt);
  player.hitReaction=Math.max(0,player.hitReaction-dt*4);
  updateDodgeHud();
  if(player.dodgeLeft<=0)return false;
  const step=Math.min(dt,player.dodgeLeft), t=player.dodgeLeft/dodgeDuration;
  player.dodgeLeft=Math.max(0,player.dodgeLeft-step);
  const stride=(5+16*t)*step;
  move(player,dodgeDirection.x*stride,dodgeDirection.z*stride);
  return true;
}
function animatePlayer(dt,strafe,forward,dodging){
  const moving=!!(strafe||forward);
  const moveYaw=moving?yaw+Math.atan2(-strafe,forward):yaw;
  const aimed=held?yaw:player.attackYaw;
  const target=dodging?player.dodgeYaw:
    (aimed!==undefined && (player.cd>0||held))?aimed:moveYaw;
  const current=player.root.rotation.y;
  const turn=Math.atan2(Math.sin(target-current),Math.cos(target-current));
  player.root.rotation.y+=turn*(1-Math.exp(-dt*(dodging?22:16)));
  const local=moveYaw-player.root.rotation.y;
  motionInput.dodgeProgress=dodging?1-player.dodgeLeft/dodgeDuration:-1;
  motionInput.hit=player.hitReaction;
  motionInput.side=dodging?player.dodgeSide:moving?-Math.sin(local):0;
  motionInput.forward=dodging?player.dodgeForward:moving?Math.cos(local):0;
  motionInput.charge=player.cd>0&&player.cd<.10?1-player.cd/.10:0;
  player.animate(dt,Number(moving),player.recoil,motionInput);
}
const desiredEye=V(), look=V(), direction=V(), cameraRay=V();
let cameraSnap=true;
function view(dt=1/60){
 const p=pos(player);
 direction.set(-Math.sin(yaw),0,-Math.cos(yaw));
 desiredEye.copy(p).addScaledVector(direction,-8.5-run.stage*.9);
 // Give the larger forms room to show their muzzle and shoulder cannons.
 const shoulderOffset=1.15+run.stage*.525;
 desiredEye.x+=Math.cos(yaw)*shoulderOffset;
 desiredEye.z-=Math.sin(yaw)*shoulderOffset;
 desiredEye.y=3.95+run.stage*.38;
 cameraRay.copy(desiredEye).sub(p);const length=cameraRay.length();
 for(let t=.1;t<=1;t+=.05){
   const x=p.x+cameraRay.x*t,z=p.z+cameraRay.z*t;
   if(obstacles.some(o=>(x-o.x)**2+(z-o.z)**2<(o.r+.28)**2&&o.h>1.65+(cameraRay.y-1.65)*t)){
     const keep=Math.max(.03,t-.5/length);desiredEye.x=p.x+cameraRay.x*keep;desiredEye.z=p.z+cameraRay.z*keep;desiredEye.y=1.65+(cameraRay.y-1.65)*keep;break;
   }
 }
 if(cameraSnap||camera.position.distanceTo(desiredEye)>5)camera.position.copy(desiredEye);
 else camera.position.lerp(desiredEye,1-Math.exp(-20*dt));
 cameraSnap=false;
 look.copy(camera.position).add(direction);look.y+=Math.tan(pitch);
 camera.lookAt(look);camera.updateMatrixWorld();
}
const aimRay = new T.Raycaster();
const centreScreen = new T.Vector2();
const aimSphere = new T.Sphere();
const hitPoint = V(), aimPoint = V(), sidePoint = V(), shotDirection = V(), shotOrigin = V();
const targetHeight = a => (a.elite ? 2.05 : 1.36);

function nearestFoe(origin, excluded, maxDistance = Infinity, requireClearPath = false) {
  let best = null, bestDistance = maxDistance * maxDistance;
  for (const e of foes) {
    if (!e.hp || excluded.has(e)) continue;
    const distance = pos(e).distanceToSquared(origin);
    if (distance < bestDistance && (!requireClearPath || !blockedBetween(origin, pos(e)))) {
      best = e;
      bestDistance = distance;
    }
  }
  return best;
}

const evolvedJets = makeEvolvedJets(scene);
const jetDirection = V(), jetOrigin = V(), jetTip = V(), jetOffset = V();
const jetCentre = V(), muzzleBase = V(), muzzleOffset = V();

// Clip each real stream to the first solid cylinder or the ground. Height matters for elevated cannons.
function jetReach(origin, direction, limit) {
  let reach = limit;
  if (direction.y < -.0001) reach = Math.min(reach, Math.max(0,(origin.y-.06)/-direction.y));
  const horizontal = direction.x ** 2 + direction.z ** 2;
  for (const o of obstacles) {
    const x = origin.x-o.x, z = origin.z-o.z;
    let near = 0, far = reach;
    if (horizontal > .000001) {
      const dot = x*direction.x+z*direction.z;
      const disc = dot*dot-horizontal*(x*x+z*z-o.r*o.r);
      if (disc < 0) continue;
      const root = Math.sqrt(disc);
      near = Math.max(near,(-dot-root)/horizontal);
      far = Math.min(far,(-dot+root)/horizontal);
    } else if (x*x+z*z > o.r*o.r) continue;
    if (Math.abs(direction.y) < .0001) {
      if (origin.y > o.h) continue;
    } else {
      const bottom = -origin.y/direction.y, top = (o.h-origin.y)/direction.y;
      near = Math.max(near,Math.min(bottom,top));
      far = Math.min(far,Math.max(bottom,top));
    }
    if (near <= far) reach = near;
  }
  return reach;
}

function streamFrom(origin, direction, isFire, base, tip) {
  const reach = jetReach(origin,direction,33);
  jetTip.copy(origin).addScaledVector(direction,reach);
  evolvedJets.draw(isFire,origin,jetTip,base,tip);
  return reach;
}

function positionMuzzle(side,height) {
  muzzleBase.copy(pos(player)).y+=height;
  muzzleOffset.set(side,0,-1).applyAxisAngle(yAxis,player.root.rotation.y);
  const length=muzzleOffset.length();
  muzzleOffset.divideScalar(length);
  jetOrigin.copy(muzzleBase).addScaledVector(muzzleOffset,length);
  return jetReach(muzzleBase,muzzleOffset,length)>=length-.01;
}

function flamethrower(target) {
  const stats = run.levels;
  if(!positionMuzzle(0,3.05))return;
  jetDirection.copy(target).sub(jetOrigin).normalize();
  const halfAngle = .42 + Math.min(stats.fan,5)*.055;
  for (let lane=-3;lane<=3;lane++) {
    const angle = halfAngle*lane/3;
    jetOffset.copy(jetDirection).applyAxisAngle(yAxis,angle);
    streamFrom(jetOrigin,jetOffset,true,.10,lane===0?2.5:2.1);
  }
  for (const enemy of foes) {
    if (!enemy.hp) continue;
    jetCentre.copy(pos(enemy)).y+=targetHeight(enemy);
    jetOffset.copy(jetCentre).sub(jetOrigin);
    const distance=jetOffset.length();
    if (distance>33 || distance<.001) continue;
    jetOffset.divideScalar(distance);
    if (jetOffset.dot(jetDirection)<Math.cos(halfAngle)) continue;
    if (jetReach(jetOrigin,jetOffset,distance)<distance-.01) continue;
    const power=42+stats.fan*3+(enemy.burnTicks>0?stats.flare*6:0);
    damageActor(enemy,power,'fire');
    if(enemy.hp)ignite(enemy);
    if(stats.burst)splashHit(enemy,2+stats.burst,6*stats.burst,true);
  }
}

function hydroCannon(target) {
  const stats=run.levels, struck=new Set();
  const focus = target.clone();
  for(const side of [-1,1]) {
    if(!positionMuzzle(side*1.45,2.6))continue;
    jetDirection.copy(focus).sub(jetOrigin).normalize();
    const reach=streamFrom(jetOrigin,jetDirection,false,.26,1.25);
    for(const enemy of foes) {
      if (!enemy.hp || struck.has(enemy))continue;
      jetCentre.copy(pos(enemy)).y+=targetHeight(enemy);
      jetOffset.copy(jetCentre).sub(jetOrigin);
      const t=jetOffset.dot(jetDirection);
      if(t<0 || t>reach || jetOffset.addScaledVector(jetDirection,-t).lengthSq()>(1.45+t*.025)**2)continue;
      jetOffset.copy(jetCentre).sub(jetOrigin);
      const distance=jetOffset.length();
      if(jetReach(jetOrigin,jetOffset.normalize(),distance)<distance-.01)continue;
      struck.add(enemy);
      damageActor(enemy,38+(enemy.slowTime>0?4*stats.breaker:0),'water');
      if(enemy.hp)soak(enemy);
      splashHit(enemy,3.6+stats.wave,15+4*stats.wave,false);
    }
  }
  // Secondary bubbles carry the starter's ricochet and every-third-shot upgrades.
  if(struck.size){
    const first=struck.values().next().value;
    const next=nearestFoe(pos(first),struck,9,true);
    if(next){
      jetCentre.copy(pos(first)).y+=targetHeight(first);
      const shot=emitBolt(player,sidePoint.copy(pos(next)).setY(targetHeight(next)),0,22,0,0,jetCentre);
      shot.bounces=stats.bounce;
      for(const enemy of struck)shot.struck.add(enemy);
    }
  }
  emitFoam(focus,18);
}

function emitFoam(target,power) {
  run.waterCasts++;
  if(run.waterCasts%3===0) {
    for(let i=1;i<=run.levels.foam;i++)emitBolt(player,target,0,power,0,i*.09);
  }
}

function emitBolt(actor, target, angle, power, pierce = 0, delay = 0, origin = null) {
  let shot = boltPool.pop();
  if (!shot) {
    const mesh = new T.Mesh(boltGeo);
    scene.add(mesh);
    shot = {mesh, direction:V(), struck:new Set()};
  }
  if(origin)shotOrigin.copy(origin);
  else {
    shotOrigin.copy(pos(actor));
    shotOrigin.y+=targetHeight(actor);
  }
  shot.stage=actor===player?(run.stage || 0):0;
  shot.direction.copy(target).sub(shotOrigin).normalize().applyAxisAngle(yAxis,angle);
  shot.mesh.position.copy(shotOrigin);
  const electric = actor === player && actor.id === 25;
  shot.mesh.geometry = electric ? electricBolt : boltGeo;
  shot.mesh.material = boltMat[actor.id];
  const size = actor === player && actor.id === 4 ? .34 : actor.elite ? .29 : .16;
  const width=size*(1+shot.stage*.34);
  shot.mesh.scale.set(electric ? .42 : width,width,width*(actor.id===4 ? 1.6 : 3.5+shot.stage*1.4));
  shot.mesh.lookAt(shotDirection.copy(shotOrigin).add(shot.direction));
  shot.mesh.visible = delay === 0;
  shot.delay = delay;
  shot.bounces = actor === player && actor.id === 7 ? 1 + run.levels.bounce : 0;
  shot.speed = actor === player ? ({4:24, 7:36, 25:33})[actor.id] : actor.id === 7 ? 12 : 15;
  shot.owner = actor;
  shot.damage = power;
  shot.pierce = pierce;
  shot.life = 2.8;
  shots.push(shot);
  return shot;
}

function launch(actor, target, primary = null) {
  battleFX.fire(actor);
  actor.recoil = 1;
  if (actor !== player) {
    const spec = waveSpec();
    emitBolt(actor,target,0,actor.elite ? 12 : 5 + Math.floor(run.wave/2),0);
    if (actor.elite) {
      emitBolt(actor,target,.17,10,0);
      emitBolt(actor,target,-.17,10,0);
    }
    actor.cd = spec.recovery * (actor.elite ? .52 : actor.id === 4 ? .86 : 1.05);
    return;
  }

  player.attackYaw = Math.atan2(pos(actor).x-target.x,pos(actor).z-target.z);
  const stats = run.levels;
  if (actor.id === 4) {
    const stage=run.stage || 0;
    actor.cd = (stage===2?.70:.52) * .84 ** stats.stoke;
    if(stage===2){flamethrower(target);return;}
    emitBolt(actor,target,0,stage===1?21:13);
    const fans=stats.fan+stage;
    for(let i=1;i<=fans;i++){
      emitBolt(actor,target,i*.16,stage===1?12:5);
      emitBolt(actor,target,-i*.16,stage===1?12:5);
    }
    return;
  }
  if (actor.id === 7) {
    const stage=run.stage || 0;
    actor.cd=(stage===2?.55:.22)*.85**stats.stream;
    if(stage===2){hydroCannon(target);return;}
    const power=stage===1?14:8;
    emitBolt(actor,target,0,power,stage);
    emitFoam(target,power);
    return;
  }
  const damage = 14 + stats.charge * 5;
  emitBolt(actor,target,0,damage,1+stats.pierce);
  actor.cd = .32 * .82 ** stats.tempo;
  if (!stats.volley) return;
  const excluded = new Set();
  if (!primary) primary = nearestFoe(target,excluded,2.6);
  if (primary) excluded.add(primary);
  for (let i=0; i<stats.volley; i++) {
    const other = nearestFoe(pos(player),excluded,32);
    if (other) excluded.add(other);
    const sideAim = other ? sidePoint.copy(pos(other)).setY(targetHeight(other)) : target;
    emitBolt(actor,sideAim,other ? 0 : (i%2 ? -1 : 1)*.09,Math.ceil(damage*.6),1+stats.pierce);
  }
}

function manualTarget() {
  aimRay.setFromCamera(centreScreen,camera);
  let distance = 68;
  for (const e of foes) {
    if (!e.hp) continue;
    aimSphere.center.copy(pos(e)).y += targetHeight(e);
    aimSphere.radius = e.elite ? 1.45 : 1;
    if (aimRay.ray.intersectSphere(aimSphere,hitPoint)) distance = Math.min(distance,hitPoint.distanceTo(camera.position));
  }
  return aimRay.ray.at(distance,aimPoint);
}

function damageActor(actor, damage, kind) {
  if (!actor.hp || (actor===player && player.dodgeInvulnerable>0)) return;
  if (actor===player) actor.hitReaction=1;
  actor.hp = Math.max(0,actor.hp-damage);
  battleFX.hit(actor,damage,actor.hp===0,kind);
  if (!actor.hp && actor !== player) {
    actor.root.visible = false;
    if (actor.elite) {bossCast = 0; bossWarning.visible = false;}
    kills++;
    experienceDrops.push(pos(actor).clone());
    player.hp = Math.min(100,player.hp+3*(run.levels.sap || 0));
  }
  hud();
}

function blockedBetween(from, to) {
  const dx = to.x-from.x, dz = to.z-from.z, lengthSq = dx*dx+dz*dz;
  return obstacles.some(o => {
    const t = clamp(((o.x-from.x)*dx+(o.z-from.z)*dz)/(lengthSq||1),0,1);
    return o.h>1.4 && (from.x+t*dx-o.x)**2+(from.z+t*dz-o.z)**2 < o.r*o.r;
  });
}

function chainLightning(first, damage) {
  const visited = new Set([first]);
  let last = first;
  for (let jump=0; jump<run.levels.chain; jump++) {
    const other = nearestFoe(pos(last),visited,8.1);
    if (!other || blockedBetween(pos(last),pos(other))) break;
    const start = pos(last).clone().setY(targetHeight(last));
    const end = pos(other).clone().setY(targetHeight(other));
    const bend = start.clone().lerp(end,.52);
    bend.y += .6;
    const line = new T.Line(new T.BufferGeometry().setFromPoints([start,bend,end]),arcMaterial);
    scene.add(line);
    arcs.push({line,life:.13});
    damageActor(other,Math.max(1,Math.ceil(damage*.5)),'electric');
    visited.add(other);
    last = other;
  }
}

function ignite(enemy) {
  if (!enemy.burnTicks) enemy.burnClock = .6;
  enemy.burnTicks = 3 + 2 * run.levels.cinder;
}

function soak(enemy) {
  enemy.slowTime = 1.2 + .6 * run.levels.frost;
}

function splashHit(first, radius, damage, isFire) {
  battleFX.pulse(first, isFire ? 'blast' : 'water', radius);
  for (const other of foes) {
    if (other === first || !other.hp || pos(other).distanceToSquared(pos(first)) > radius * radius) continue;
    if (blockedBetween(pos(first), pos(other))) continue;
    damageActor(other, damage, isFire ? 'blast' : 'splash');
    if (other.hp) {
      if (isFire) ignite(other);
      else soak(other);
    }
  }
}

function playerImpact(shot, hit) {
  const stats = run.levels;
  if (player.id === 4) {
    damageActor(hit, shot.damage + (hit.burnTicks > 0 ? 6 * stats.flare : 0), 'fire');
    if (hit.hp) ignite(hit);
    splashHit(hit,2+shot.stage+stats.burst,3+shot.stage*5+6*stats.burst,true);
    return;
  }
  if (player.id === 7) {
    damageActor(hit, shot.damage + (hit.slowTime > 0 ? 4 * stats.breaker : 0), 'water');
    if (hit.hp) soak(hit);
    if (stats.wave || shot.stage) splashHit(hit,2.5+stats.wave,4*(stats.wave+shot.stage),false);
    return;
  }
  damageActor(hit, shot.damage, 'electric');
  if (stats.chain) chainLightning(hit, shot.damage);
}

function redirectBubble(shot) {
  if (!shot.bounces) return false;
  const p = shot.mesh.position;
  const next = nearestFoe(p, shot.struck, 9, true);
  if (!next) return false;
  shot.bounces--;
  shot.damage = Math.ceil(shot.damage * .8);
  const target = sidePoint.copy(pos(next)).setY(targetHeight(next));
  shot.direction.copy(target).sub(p).normalize();
  shot.mesh.lookAt(target);
  return true;
}

function stepShots(dt) {
  evolvedJets.step(dt);
  for (let i=shots.length-1; i>=0; i--) {
    const s = shots[i], p = s.mesh.position;
    if (s.delay > 0) {
      s.delay -= dt;
      if (s.delay > 0) continue;
      s.mesh.visible = true;
    }
    p.addScaledVector(s.direction, s.speed * dt);
    s.life -= dt;
    const blocked = p.y<.06 || obstacles.some(o => p.y<o.h && (p.x-o.x)**2+(p.z-o.z)**2 < o.r*o.r);
    if (blocked || s.life<=0) {
      recycleShot(i);
      continue;
    }
    const hitTest = a => a.hp>0 && !s.struck.has(a) && (p.x-pos(a).x)**2+(p.y-targetHeight(a))**2+(p.z-pos(a).z)**2 < (a.elite ? 2.1 : 1);
    const hit = s.owner===player ? foes.find(hitTest) : hitTest(player) && player;
    if (!hit) continue;
    if (s.owner === player) playerImpact(s, hit);
    else damageActor(hit, s.damage);
    s.struck.add(hit);
    if (s.pierce > 0) s.pierce--;
    else if (!redirectBubble(s)) recycleShot(i);
  }
  for (let i=arcs.length-1; i>=0; i--) {
    if ((arcs[i].life-=dt)>0) continue;
    scene.remove(arcs[i].line);
    arcs[i].line.geometry.dispose();
    arcs.splice(i,1);
  }
}

function updateBossCast(boss, dt) {
  if (bossCast > 0) {
    bossCast -= dt;
    warningDisk.material.opacity = .14 + .3 * (1 - Math.max(0,bossCast)/1.25);
    warningEdge.scale.setScalar(1 - .5 * Math.max(0,bossCast)/1.25);
    if (bossCast <= 0) {
      bossWarning.visible = false;
      if (pos(player).distanceToSquared(bossWarning.position) <= 2.7 ** 2) damageActor(player,23);
    }
  } else if ((boss.castCooldown -= dt) <= 0) {
    bossWarning.position.copy(pos(player)).y = .14;
    bossWarning.visible = true;
    bossCast = 1.25;
    boss.castCooldown = 4.2;
  }
}

function updateEnemies(dt) {
  const spec = waveSpec();
  for (let i=0; i<foes.length; i++) {
    const e = foes[i];
    if (!e.hp) continue;
    if (e.burnTicks > 0 && (e.burnClock -= dt) <= 0) {
      e.burnClock += .6;
      e.burnTicks--;
      damageActor(e, 3 + 3 * run.levels.kindle, 'burn');
      if (!e.hp) continue;
    }
    const slow = e.slowTime > 0 ? Math.max(.12, 1 - .28 - .10 * run.levels.frost) : 1;
    if (e.slowTime > 0) e.slowTime -= dt;
    if (e.elite) updateBossCast(e,dt);
    const p = pos(e), x = pos(player).x-p.x, z = pos(player).z-p.z;
    const distance = Math.hypot(x,z) || 1;
    const blocked = distance < 25 && blockedBetween(p,pos(player));
    const desired = e.ranged ? 13 : 1.15;
    const forward = distance>desired || blocked ? 1 : distance<desired-4 ? -.7 : 0;
    const side = blocked ? e.dodge : Math.sin(elapsed*.85+i) * (e.ranged ? .65 : .16);
    const pace = spec.pace * slow * (e.id===4 ? 1.15 : .93);
    const dx = (x*forward-z*side)/distance*pace*dt;
    const dz = (z*forward+x*side)/distance*pace*dt;
    const beforeX = p.x, beforeZ = p.z;
    move(e,dx,dz);
    if (Math.abs(p.x-beforeX)+Math.abs(p.z-beforeZ)<.002) move(e,-dz*e.dodge,dx*e.dodge);
    e.root.rotation.y = Math.atan2(-x,-z);
    e.cd -= dt;
    e.recoil = Math.max(0,(e.recoil||0)-dt*6);
    e.animate?.(dt,Math.min(1,Math.hypot(dx,dz)/dt/3),e.recoil);
    if (e.cd <= 0 && !blocked) {
      if (e.ranged && distance < 25) launch(e,aimPoint.copy(pos(player)).setY(targetHeight(player)));
      else if (!e.ranged && distance < 1.7) {
        damageActor(player, 3 + run.wave);
        e.recoil=1;
        e.cd=1.5;
      }
    }
  }
}

function updateCrystals(dt) {
  const at = pos(player);
  let gained = 0;
  for (let i=experienceDrops.length-1;i>=0;i--) {
    const drop = experienceDrops[i];
    const dx = at.x-drop.x, dz = at.z-drop.z, distance = Math.hypot(dx,dz);
    if (distance < .85) {
      experienceDrops.splice(i,1);
      gained++;
    } else if (distance < 6) {
      const factor = Math.min(1,dt*(19-distance)/distance);
      drop.x+=dx*factor;
      drop.z+=dz*factor;
    }
  }
  crystalBatch.count=experienceDrops.length;
  for (let i=0;i<experienceDrops.length;i++) {
    const drop=experienceDrops[i];
    crystalPose.position.set(drop.x,.52+Math.sin(elapsed*3+i)*.12,drop.z);
    crystalPose.rotation.y=elapsed*1.5+i;
    crystalPose.scale.set(1,1.45,1);
    crystalPose.updateMatrix();
    crystalBatch.setMatrixAt(i,crystalPose.matrix);
  }
  if (crystalBatch.count) crystalBatch.instanceMatrix.needsUpdate=true;
  if (gained) {run.xp+=gained;battleFX.pickup();hud();}
}

function levelUp() {
  run.xp-=run.nextXp;
  run.level++;
  const nextForm=evolutionLines[player.id][run.stage+1];
  if(nextForm && run.level>=nextForm.level){
    run.stage++;
    setPartnerStage(player,run.stage);
    evolutionShowcase.start(player);
    battleFX.evolve();
  }
  run.nextXp+=2;
  run.draftReason='level';
  run.offers=drawRelics(run);
  hud();
  screen('upgrade');
}

const noExclusions = new Set();
function update(dt) {
  elapsed += dt;
  yaw += (Number(keys.has('arrowleft'))-Number(keys.has('arrowright')))*1.8*dt;
  const strafe = Number(keys.has('d'))-Number(keys.has('a'));
  const forward = Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown'));
  const speed = 7*dt/(Math.hypot(strafe,forward)||1);
  const dodging=stepDodge(dt);
  if(!dodging) move(player,(Math.cos(yaw)*strafe-Math.sin(yaw)*forward)*speed,(-Math.sin(yaw)*strafe-Math.cos(yaw)*forward)*speed);
  player.recoil = Math.max(0,(player.recoil||0)-dt*6);
  animatePlayer(dt,strafe,forward,dodging);
  view();
  player.cd -= dt;
  if (player.cd<=0) {
    if (held) launch(player,manualTarget());
    else {
      const nearest = nearestFoe(pos(player),noExclusions,33,true);
      if (nearest) launch(player,aimPoint.copy(pos(nearest)).setY(targetHeight(nearest)),nearest);
    }
  }
  updateEnemies(dt);
  stepShots(dt);
  updateCrystals(dt);
  if (!player.hp) {screen('lose');return;}
  if (run.xp >= run.nextXp) {levelUp();return;}
  if (spawned < waveSize) {
    spawnClock -= dt;
    if (spawnClock <= 0 || foes.every(e=>!e.hp)) {
      spawnPack();
      spawnClock = Math.max(1.25,2.2-run.wave*.15);
    }
  } else if (foes.every(e=>!e.hp)) endWave();
}
const radar=el('map').getContext('2d');
function drawRadar(){
 radar.clearRect(0,0,120,120);radar.save();radar.translate(60,60);
 const dot=(p,r,color)=>{radar.fillStyle=color;radar.beginPath();radar.arc(p.x*1.7,p.z*1.7,r,0,Math.PI*2);radar.fill();};
 for(const o of obstacles)dot(o,1.5,'#a6bd91');
 for(const e of foes)if(e.hp)dot(pos(e),e.elite?4.5:3,'#ff9c7e');
 const p=pos(player);radar.translate(p.x*1.7,p.z*1.7);radar.rotate(-yaw);radar.fillStyle='#e5ff82';radar.beginPath();radar.moveTo(0,-5);radar.lineTo(4,4);radar.lineTo(-4,4);radar.closePath();radar.fill();
 radar.restore();
}
let quality=1,maximumRatio;
function resize(){
 maximumRatio=Math.min(devicePixelRatio,1.5,Math.sqrt(2073600/(innerWidth*innerHeight)));
 renderer.setPixelRatio(maximumRatio*quality);renderer.setSize(innerWidth,innerHeight,false);
 camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
 for(const foe of foes)for(const part of foe.shadowParts)part.castShadow=quality>=.8;
}
onresize=resize;
function lock(){if(matchMedia('(pointer:fine)').matches){try{canvas.requestPointerLock?.()?.catch(()=>{});}catch{}}}
el('start').onclick=()=>{if(mode!=='paused')reset();screen('play');cameraSnap=true;view();lock();};
el('returnToStarters').onclick=()=>{if(mode==='paused')prepareSelection();};
el('pauseGame').onclick=()=>{if(mode==='play')screen('paused');};
onkeydown=e=>{
 const k=e.key.toLowerCase();
 if(k==='shift'&&mode==='play'){e.preventDefault();if(!e.repeat)performDodge();return;}
 if(mode==='upgrade'&&['1','2','3'].includes(k)&&!e.repeat){chooseUpgrade(Number(k)-1);return;}
 if((k==='p'||k==='escape')&&mode==='play'){screen('paused');return;}
 if(mode==='play'){if(k.startsWith('arrow')||k===' ')e.preventDefault();keys.add(k);}
};
onkeyup=e=>keys.delete(e.key.toLowerCase());onblur=()=>{if(mode==='play')screen('paused');};
let dragging=false,lastX=0,lastY=0,wasLocked=false;
document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===canvas;if(wasLocked&&!locked&&mode==='play')screen('paused');wasLocked=locked;});
canvas.onpointerdown=e=>{if(mode!=='play')return;held=true;dragging=true;lastX=e.clientX;lastY=e.clientY;if(!document.pointerLockElement)canvas.setPointerCapture(e.pointerId);};
document.onpointermove=e=>{if(mode!=='play')return;const locked=document.pointerLockElement===canvas;if(locked||dragging){
 yaw-=(locked?e.movementX:e.clientX-lastX)*.0026;pitch=clamp(pitch-(locked?e.movementY:e.clientY-lastY)*.0023,-.65,.35);lastX=e.clientX;lastY=e.clientY;}};
document.onpointerup=document.onpointercancel=()=>{held=false;dragging=false;};
el('touchDodge').onpointerdown=e=>{e.preventDefault();performDodge();};
document.querySelectorAll('[data-key]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);};b.onpointerup=b.onpointercancel=()=>keys.delete(b.dataset.key);});
resize();prepareSelection();
function portraitView(){
 const p=pos(player), narrow=camera.aspect<1.15;
 const height=player.id===25?2.65:player.id===4?2.35:2.08;
 const scale=height/2.65;
 player.root.rotation.y=Math.PI-.48;
 camera.position.set(p.x+.25,1.65*scale,p.z+(narrow?6.5:5.8)*scale);
 look.set(p.x-(narrow?.8:2.25)*scale,1.34*scale,p.z);
 camera.lookAt(look);camera.updateMatrixWorld();
}
const startButton=el('start');
startButton.disabled=true;
const readyLabel=startButton.textContent;
startButton.textContent='准备伙伴…';
Promise.all([...starters.values(),...foes].map(actor=>actor.ready)).then(()=>{
 startButton.disabled=false;startButton.textContent=readyLabel;
}).catch(error=>{
 console.error(error);el('note').textContent='角色资源加载失败，请刷新页面重新进入。';
});
let lastDraw=0;
let last=performance.now(),acc=0,radarTime=0,frameTotal=0,frameCount=0,steadyFrames=0;
renderer.setAnimationLoop(now=>{
 if(document.hidden){last=now;return;}
 // The draft and pause overlays need only occasional renders; keep the battle uncapped.
 const interval=mode==='play'?0:(mode==='ready'||evolutionShowcase.active)?1000/30:180;
 if(now-lastDraw<interval)return;
 lastDraw=now;
 const elapsedFrame=Math.max(0,(now-last)/1000);last=now;
 const dt=Math.min(.1,elapsedFrame);
 if(mode==='play'){
   acc+=dt;while(acc>=1/60){if(mode==='play')update(1/60);acc-=1/60;}
   radarTime+=dt;if(radarTime>=.10){drawRadar();radarTime=0;}
   frameTotal+=dt;frameCount++;
   if(frameCount>=24){
     const average=frameTotal/frameCount;
     const old=quality;
     if(average>.023){quality=Math.max(.52,quality-.14);steadyFrames=0;}
     else if(average<.0178){if(++steadyFrames>=8){quality=Math.min(1,quality+.06);steadyFrames=0;}}
     else steadyFrames=0;
     if(old!==quality)resize();frameTotal=0;frameCount=0;
   }
 }else{
   acc=0;
   if(mode==='ready'){portraitView();player.animate?.(dt,0,0);}
 }
 battleFX.step(dt);
 boltMat[4].uniforms.clock.value=now*.001;
 if(evolutionShowcase.active)evolutionShowcase.render(renderer,dt);
 else {
   sun.target.position.copy(pos(player));
   sun.position.copy(sun.target.position).add(sunOffset);
   renderer.render(scene,camera);
 }
});
