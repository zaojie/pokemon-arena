// Run against the local arena with Playwright on NODE_PATH.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

async function enterWith(page, species) {
  const radio = page.locator('input[data-starter="' + species + '"]');
  await page.locator('label').filter({has:radio}).click();
  assert.ok(await radio.isChecked());
  await page.locator('#start').click();
  await page.waitForFunction(id => mode === 'play' && player.id === id && run.species === id, species);
  assert.ok(await page.evaluate(() => player.formId === run.species && run.stage === 0 && player.hp === 100 && run.level === 1 && run.xp === 0 && experienceDrops.length === 0 && player.dodgeCooldown === 0 && Object.values(run.levels).every(n => n === 0)));
}

async function checkFriendlyIdentity(page) {
  const result = await page.evaluate(() => {
    const twin = foes.find(a => a.hp && a.id === player.id);
    clearProjectiles();
    pos(player).set(0,0,16);
    pos(twin).set(0,0,12);
    const hit = (source,target) => {
      const before = target.hp;
      const aim = pos(target).clone().setY(targetHeight(target));
      launch(source,aim,target);
      for(let i=0;i<40 && target.hp===before;i++) stepShots(1/60);
      return before-target.hp;
    };
    const hp = player.hp;
    const dealt = hit(player,twin);
    const selfDamage = hp-player.hp;
    const returned = hit(twin,player);
    return {dealt,selfDamage,returned};
  });
  assert.ok(result.dealt > 0 && result.returned > 0, JSON.stringify(result));
  assert.equal(result.selfDamage,0);
}

async function checkStackEffect(page, species) {
  const effects = await page.evaluate(id=>{
    const results=[];
    for(const level of [0,1,2]){
      reset();
      const targets=foes.filter(e=>e.hp);
      targets.forEach((e,i)=>{
        pos(e).set(i*2,0,12);
        e.hp=100;e.cd=20;
      });
      const target=targets[0];
      run.levels[id===4?'kindle':'bounce']=level;
      launch(player,pos(target).clone().setY(targetHeight(target)),target);
      for(let n=0;n<80;n++)stepShots(1/60);
      if(id===4){
        const hp=target.hp;
        for(let n=0;n<40;n++)updateEnemies(1/60);
        results.push(hp-target.hp);
      }else{
        results.push(targets.filter(e=>e.hp<100 && e.slowTime>0).length);
      }
    }
    reset();
    return results;
  },species);
  assert.deepEqual(effects,species===4?[3,6,9]:[2,3,4]);
}

async function checkEvasion(page) {
  await page.keyboard.down('d');
  await page.keyboard.press('Shift');
  await page.keyboard.up('d');
  const result=await page.evaluate(()=>{
    const hp=player.hp, start=pos(player).clone(), active=player.dodgeLeft>0;
    damageActor(player,9);
    const evaded=player.hp===hp;
    for(let n=0;n<30;n++)update(1/60);
    const distance=pos(player).distanceTo(start);
    const cooling=player.dodgeCooldown>0;
    performDodge();
    const blocked=player.dodgeLeft<=0;
    damageActor(player,9);
    const vulnerable=player.hp<hp;
    reset();
    return {active,evaded,distance,cooling,blocked,vulnerable};
  });
  assert.ok(result.active && result.evaded && result.distance>1 && result.cooling && result.blocked && result.vulnerable, JSON.stringify(result));
}

async function takeDraft(page,species) {
  const cards=page.locator('#choices button');
  const offers=await cards.locator('strong').allTextContents();
  const deck=await page.evaluate(id=>relicsFor(id).map(card=>card.name),species);
  assert.equal(new Set(offers).size,3);
  assert.ok(offers.every(name=>deck.includes(name)));
  const before=await page.evaluate(()=>{
    const key=run.offers[0].key;
    return {key,level:run.levels[key],reason:run.draftReason,wave:run.wave,kills,spawned,playerLevel:run.level};
  });
  await cards.first().click();
  assert.deepEqual(await page.evaluate(key=>[run.levels[key],run.wave,kills],before.key),
    [before.level+1,before.wave+(before.reason==='wave'?1:0),before.kills]);
  if(before.reason==='level'){
    const state=await page.evaluate(()=>({spawned,playerLevel:run.level}));
    assert.ok(state.spawned>=before.spawned && state.playerLevel===before.playerLevel);
  }
  return before.reason;
}

async function checkCrystalDraft(page,species) {
  const survivor=await page.evaluateHandle(()=>{
    reset();
    const first=foes.filter(e=>e.hp);
    const last=first.pop();
    player.cd=10;
    first.slice(0,run.nextXp).forEach((enemy,i)=>{
      pos(enemy).copy(pos(player));pos(enemy).x+=2+i*.2;
      damageActor(enemy,enemy.hp);
    });
    return last;
  });
  const transition=await page.evaluate(last=>{
    const xpBefore=run.xp,drop=experienceDrops[0];
    const distance=drop.distanceTo(pos(player));
    updateCrystals(1/60);
    const pulled=drop.distanceTo(pos(player)) < distance;
    for(let n=0;n<120 && mode==='play';n++)update(1/60);
    return {before:xpBefore,pulled,reason:run.draftReason,level:run.level,hp:last.hp,count:spawned};
  },survivor);
  assert.ok(transition.before===0 && transition.pulled && transition.reason==='level' && transition.level===2,JSON.stringify(transition));
  await takeDraft(page,species);
  assert.ok(await page.evaluate(last=>foes.includes(last) && last.hp>0 && last.root.visible,survivor));
  await survivor.dispose();
  await page.evaluate(()=>reset());
}

async function checkSurvivorRun(page,species) {
  await checkStackEffect(page,species);
  await checkFriendlyIdentity(page);
  await checkEvasion(page);
  await checkCrystalDraft(page,species);
  const gap=await page.evaluate(()=>{
    reset();
    // Defeating the first group does not end the wave while reinforcements are due.
    const first=foes.filter(e=>e.hp);
    const initial=first.length;
    first.forEach(e=>damageActor(e,e.hp));
    update(1/60);
    const pending=mode==='play' && run.wave===1;
    for(let n=0;n<360 && !foes.some(e=>e.hp);n++)update(1/60);
    const reinforcements=foes.filter(e=>e.hp).length;
    reset();
    return {initial,pending,reinforcements,budget:waveSpec().count};
  });
  assert.ok(gap.pending && gap.initial<gap.budget && gap.reinforcements>0,JSON.stringify(gap));
  let leveled=false;
  for(let draft=0;draft<20;draft++){
    const outcome=await page.evaluate(()=>{
      // Walk between pickups and opponents; send no firing input to the game.
      keys.clear();held=false;
      for(let n=0;n<9000 && mode==='play';n++){
        keys.clear();
        const target=foes.find(e=>e.hp);
        const point=experienceDrops[0] || (target && pos(target));
        if(point){
          const x=point.x-pos(player).x,z=point.z-pos(player).z;
          yaw=0;
          if(Math.abs(x)>.6)keys.add(x>0?'d':'a');
          if(Math.abs(z)>.6)keys.add(z<0?'w':'s');
        }
        update(1/60);
      }
      return {mode,hp:player.hp,kills,wave:run.wave};
    });
    assert.equal(outcome.mode,'upgrade',JSON.stringify(outcome));
    const reason=await takeDraft(page,species);
    if(reason==='level'){leveled=true;continue;}
    assert.equal(reason,'wave');
    assert.ok(leveled,'XP should offer a card within the first wave');
    return;
  }
  assert.fail('First wave did not finish');
}

async function checkEvolutionRun(page, species) {
  const forms = species===25 ? [25,25,25] : [species,species+1,species+2];
  await page.evaluate(async () => { reset(); await player.ready; });
  for (let level=2; level<=6; level++) {
    const transition=await page.evaluate(()=>{
      keys.clear();
      held=false;
      player.hp=68;
      player.cd=15; // Keep this single simulation step free of unrelated attacks.
      const previous=player.activeRig;
      const position=pos(player).clone();
      const levels={...run.levels};
      const remaining=run.nextXp-run.xp;
      for(let i=0;i<remaining;i++) experienceDrops.push(position.clone());
      update(1/60);
      let meshCount=0;
      player.activeRig.root.traverseVisible(node=>{if(node.isSkinnedMesh)meshCount++;});
      return {
        mode, level:run.level, reason:run.draftReason, stage:run.stage, meshCount,
        species:run.species, form:player.formId, rig:player.activeRig.id,
        changed:previous!==player.activeRig,
        preserved:player.hp===68 && pos(player).distanceToSquared(position)<1e-8 &&
          Object.keys(levels).every(k=>run.levels[k]===levels[k]),
      };
    });
    const stage=species===25 ? 0 : Number(level>=3)+Number(level>=6);
    assert.equal(transition.mode,'upgrade');
    assert.equal(transition.reason,'level');
    assert.equal(transition.level,level);
    assert.equal(transition.species,species);
    assert.equal(transition.stage,stage);
    assert.equal(transition.form,forms[stage]);
    assert.equal(transition.rig,forms[stage]);
    assert.ok(transition.meshCount>0,'The active form has a rendered, skinned mesh');
    assert.equal(transition.changed,species!==25 && [3,6].includes(level));
    assert.ok(transition.preserved);
    await takeDraft(page,species);
  }
  if(species===25)return;

  const cleared=await page.evaluate(()=>{
    // Isolate one cast without relic bonuses against ordinary late-wave HP.
    clearProjectiles();
    for(const k of Object.keys(run.levels)) run.levels[k]=0;
    const targets=foes.filter(e=>e.hp);
    const hp=expeditionWaves.at(-1).health;
    pos(player).set(0,0,16);
    targets.forEach((e,i)=>{
      pos(e).set((i-(targets.length-1)/2)*.55,0,8);
      e.hp=hp;
    });
    const aim=pos(targets[Math.floor(targets.length/2)]).clone().setY(1.36);
    launch(player,aim,targets[Math.floor(targets.length/2)]);
    // Render one frame to compile the final move shader while the cast is visible.
    stepShots(1/60);
    renderer.render(scene,camera);
    for(let n=1;n<75;n++)stepShots(1/60);
    return {form:player.formId,dead:targets.filter(e=>e.hp===0).length,total:targets.length};
  });
  assert.ok(cleared.total>=3 && cleared.dead>=3,JSON.stringify(cleared));
  console.log('One unupgraded final-form cast:',cleared);
}

async function returnToStarters(page) {
  await page.keyboard.press('p');
  await page.locator('#returnToStarters').click();
  await page.waitForFunction(()=>mode==='ready');
}

(async()=>{
  const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
  try {
    const page=await browser.newPage({viewport:{width:960,height:600}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',entry=>{
      if(entry.type()==='error' && /Shader Error|WebGLProgram/.test(entry.text())) errors.push(entry.text());
    });
    await page.goto('http://127.0.0.1:8846');
    assert.equal(await page.locator('input[data-starter]').count(),3);
    await enterWith(page,4);
    await page.keyboard.down('w');
    await page.waitForFunction(()=>pos(player).z<15);
    await page.keyboard.up('w');
    await page.keyboard.down('ArrowLeft');
    await page.waitForFunction(()=>yaw>.15);
    await page.keyboard.up('ArrowLeft');
    await page.mouse.down();await page.waitForFunction(()=>shots.some(s=>s.owner===player));await page.mouse.up();
    await page.keyboard.press('p');
    await page.waitForFunction(()=>mode==='paused');
    await page.locator('#start').click();
    await checkSurvivorRun(page,4);
    await checkEvolutionRun(page,4);
    await returnToStarters(page);
    await enterWith(page,7);
    await checkSurvivorRun(page,7);
    await checkEvolutionRun(page,7);
    await returnToStarters(page);
    await enterWith(page,25);
    await checkEvolutionRun(page,25);
    const dirty=await page.evaluate(()=>{
      const enemy=foes.find(e=>e.hp);
      damageActor(enemy,enemy.hp);
      performDodge();
      return player.dodgeCooldown>0 && experienceDrops.length>0;
    });
    assert.ok(dirty);
    await returnToStarters(page);
    await enterWith(page,4);
    assert.deepEqual(errors,[]);
    console.log('Starter switching, same-species hits, both evolution lines, final-form area attacks, Pikachu progression, drafts and clean replay passed.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
