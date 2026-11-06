'use strict';

function makeBattleFeedback(scene) {
  const capacity = 256;
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const velocity = new Float32Array(capacity * 3);
  const energy = new Float32Array(capacity);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('energy', new THREE.BufferAttribute(energy, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, vertexColors: true,
    blending: THREE.AdditiveBlending,
    vertexShader: `attribute float energy; varying vec3 tint; varying float strength;
    void main(){ tint=color; strength=clamp(energy*5.,0.,1.);
    vec4 p=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*p;
    gl_PointSize=clamp(110./max(1.,-p.z),2.,19.)*strength; }`,
    fragmentShader: `varying vec3 tint; varying float strength;
    void main(){vec2 p=abs(gl_PointCoord-.5); float d=p.x+p.y;
    if(d>.5 || strength<.01)discard; gl_FragColor=vec4(mix(tint,vec3(1.),(1.-smoothstep(.02,.25,d))),(1.-d)*strength);}`
  });
  const cloud = new THREE.Points(geometry,material);
  cloud.frustumCulled=false;cloud.visible=false;scene.add(cloud);
  const labels=Array.from({length:12},()=>{
    const node=document.createElement('span');
    node.className='hit-value';node.hidden=true;el('hud').append(node);
    return {node,where:new THREE.Vector3(),age:0};
  });
  const projected=new THREE.Vector3();
  let nextLabel=0,cursor=0,remaining=0,flash=0,ctx,enabled=true;
  const palette={25:[1,.76,.15],4:[1,.26,.06],7:[.10,.78,1]};
  const hitStyle = {
    burn: [1,.2,.025], blast: [1,.55,.06], fire: palette[4],
    water: palette[7], splash: [.35,.85,1], electric: palette[25]
  };
  // A fixed pool bounds overlapping area effects during rapid volleys.
  const ringGeometry=new THREE.RingGeometry(.92,1,48);
  const pulses=Array.from({length:8},()=>{
    const mesh=new THREE.Mesh(ringGeometry,new THREE.MeshBasicMaterial({
      transparent:true,depthWrite:false,side:THREE.DoubleSide
    }));
    mesh.rotation.x=-Math.PI/2;
    mesh.visible=false;
    scene.add(mesh);
    return {mesh,age:0,radius:0};
  });
  let nextPulse=0, streak=0, streakUntil=0,lastPickup=-1;
  const trailFrom=new THREE.Vector3();
  const trail=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({
    color:0xf3ffdd,side:THREE.DoubleSide,transparent:true,opacity:.32,depthWrite:false
  }));
  trail.rotation.x=-Math.PI/2;trail.visible=false;scene.add(trail);
  let trailLife=0;
  function burst(actor,count,spread,color=palette[actor.id],height=1.3) {
    const p=actor.root.position;
    for(let i=0;i<count;i++){
      const n=cursor;cursor=(cursor+1)%capacity;
      positions.set([p.x,p.y+height,p.z],n*3);
      colors.set(color,n*3);
      velocity.set([(Math.random()-.5)*spread,Math.random()*spread*.75,(Math.random()-.5)*spread],n*3);
      energy[n]=.12+Math.random()*.24;
    }
    remaining=.4;geometry.attributes.color.needsUpdate=true;cloud.visible=true;
  }
  function tone(from,to,duration,wave,volume){
    if(!enabled||ctx?.state!=='running')return;
    const oscillator=ctx.createOscillator(),gain=ctx.createGain(),time=ctx.currentTime;
    oscillator.type=wave;oscillator.frequency.setValueAtTime(from,time);oscillator.frequency.exponentialRampToValueAtTime(to,time+duration);
    gain.gain.setValueAtTime(volume,time);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
    oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(time);oscillator.stop(time+duration);
  }
  document.addEventListener('pointerdown',()=>{
    if(!ctx && window.AudioContext)ctx=new AudioContext();
    if(ctx && ctx.state==='suspended')ctx.resume().catch(()=>{});
  },{capture:true});
  el('sound').onclick=()=>{enabled=!enabled;el('sound').textContent=enabled?'音效 开':'音效 关';};
  return {
    reset(){
      for(const label of labels){label.age=0;label.node.hidden=true;}
      for(const pulse of pulses){pulse.age=0;pulse.mesh.visible=false;}
      energy.fill(0);remaining=flash=0;cloud.visible=false;
      streak=streakUntil=trailLife=0;lastPickup=-1;
      el('streak').hidden=true;trail.visible=false;
      el('damageFlash').style.opacity=0;
    },
    evolve(){
      tone(330,660,.33,'sine',.09);
      tone(496,990,.56,'triangle',.045);
    },
    pickup(){
      if(elapsed-lastPickup<.09)return;
      lastPickup=elapsed;tone(710,1220,.065,'sine',.04);
    },
    dodge(actor){
      trailFrom.copy(actor.root.position);trailLife=.49;
      burst(actor,12,4,[.85,1,.75],.2);
      tone(370,76,.16,'triangle',.06);
    },
    fire(actor){
      burst(actor,actor===player?6:3,2);
      if(actor!==player)return;
      if(actor.id===4)tone(180,47,.14,'sawtooth',.03);
      else if(actor.id===7)tone(310,740,.12,'sine',.065);
      else tone(680,170,.085,'triangle',.045);
    },
    pulse(actor,kind,radius){
      const pulse=pulses[nextPulse++ % pulses.length];
      pulse.mesh.position.copy(actor.root.position);
      pulse.mesh.position.y+=.1;
      pulse.mesh.material.color.setHex(kind==='blast'?0xff902a:0x88eaff);
      pulse.radius=radius;pulse.age=.25;
      pulse.mesh.visible=true;
    },
    hit(actor,damage,killed,kind){
      burst(actor,killed?23:kind==='burn'?4:9,killed?8:5,hitStyle[kind]);
      if(actor!==player){
        const label=labels[nextLabel++ % labels.length];
        label.where.copy(actor.root.position);label.where.y+=actor.elite?3.8:2.4;
        label.age=.55;label.node.textContent=kind==='burn'?'♨ '+damage:String(damage);
        label.node.style.color=kind==='burn'||kind==='blast'||kind==='fire'?'#ffca7b':
          kind==='water'||kind==='splash'?'#adf2ff':'#fff5a6';
      }
      if(actor===player){flash=.18;el('damageFlash').style.opacity=.7;tone(95,52,.14,'sine',.1);}
      else if(killed){
        streak=elapsed<=streakUntil?streak+1:1;streakUntil=elapsed+2.6;
        const badge=el('streak');badge.hidden=streak<3;
        if(!badge.hidden)badge.textContent=streak+' 连破';
        const note=310+Math.min(streak,8)*45;tone(note,note*1.7,.12,'triangle',.05);
      }
    },
    step(dt){
      if(streak && elapsed>streakUntil){streak=0;el('streak').hidden=true;}
      if(trailLife>0 && mode==='play'){
        trailLife=Math.max(0,trailLife-dt);
        const at=player.root.position;
        const dx=at.x-trailFrom.x,dz=at.z-trailFrom.z,length=Math.hypot(dx,dz);
        trail.visible=trailLife>0&&length>.08;
        trail.rotation.set(-Math.PI/2,0,Math.atan2(dx,dz));
        trail.scale.set(.26*trailLife+.06,Math.min(3,length),1);
        const back=Math.min(3,length)*.5/(length||1);
        trail.position.set(at.x-dx*back,.075,at.z-dz*back);
        trail.material.opacity=Math.min(.33,trailLife);
      }
      for(const pulse of pulses){
        if(pulse.age<=0)continue;
        pulse.age=Math.max(0,pulse.age-dt);
        const progress=1-pulse.age/.25;
        pulse.mesh.scale.setScalar(pulse.radius*(.12+.88*progress));
        pulse.mesh.material.opacity=.8*(1-progress);
        pulse.mesh.visible=pulse.age>0;
      }
      for(const label of labels){
        if(label.age<=0)continue;
        label.age=Math.max(0,label.age-dt);
        projected.copy(label.where).project(camera);
        label.node.hidden=mode!=='play'||label.age<=0||Math.abs(projected.z)>1;
        if(!label.node.hidden){
          label.node.style.transform='translate('+Math.round((projected.x+1)*innerWidth*.5)+'px,'+Math.round((1-projected.y)*innerHeight*.5-34*(.55-label.age))+'px)';
          label.node.style.opacity=Math.min(1,label.age*5);
        }
      }
      if(flash>0){flash-=dt;if(flash<=0)el('damageFlash').style.opacity=0;}
      if(remaining<=0){cloud.visible=false;return;}
      remaining-=dt;
      for(let i=0;i<capacity;i++){if(energy[i]<=0)continue;
        energy[i]=Math.max(0,energy[i]-dt);const n=i*3;
        for(let j=0;j<3;j++)positions[n+j]+=velocity[n+j]*dt;
        velocity[n+1]-=7*dt;
      }
      geometry.attributes.position.needsUpdate=true;geometry.attributes.energy.needsUpdate=true;
    }
  };
}
