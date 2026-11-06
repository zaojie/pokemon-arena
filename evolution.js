'use strict';

const evolutionLines = {
  4: [
    {id:4, name:'小火龙', level:1, move:'火球'},
    {id:5, name:'火恐龙', level:3, move:'烈焰扇射', detail:'向前方散射火焰，同时点燃多只敌人。'},
    {id:6, name:'喷火龙', level:6, move:'喷射火焰', detail:'扇形烈焰扫过前方敌群，命中后继续灼烧。'}
  ],
  7: [
    {id:7, name:'杰尼龟', level:1, move:'水枪'},
    {id:8, name:'卡咪龟', level:3, move:'激流水枪', detail:'高压水流贯穿前排，再向邻近敌人弹跳。'},
    {id:9, name:'水箭龟', level:6, move:'双管水炮', detail:'双肩水炮同时开火，贯穿并冲击成群的敌人。'}
  ],
  25: [{id:25, name:'皮卡丘', level:1, move:'电击'}]
};

// The outer actor owns gameplay state and projectile ownership throughout an evolution.
function makeStarter(id, world) {
  const rigs = evolutionLines[id].map(form => makePokemon(form.id, true));
  const root = new THREE.Group();
  for (const rig of rigs) {
    root.add(rig.root);
    rig.root.visible = rig === rigs[0];
  }
  world.add(root);
  return {
    id, root, rigs, formId:id, activeRig:rigs[0],
    ready:Promise.all(rigs.map(rig => rig.ready)),
    animate(...args) { this.activeRig.animate(...args); }
  };
}

function setPartnerStage(actor, stage) {
  const form = evolutionLines[actor.id][stage];
  actor.activeRig.root.visible = false;
  actor.activeRig = actor.rigs[stage];
  actor.formId = form.id;
  actor.activeRig.root.visible = true;
  actor.activeRig.animate(0,0,0);
  document.getElementById('partnerName').textContent = form.name;
  const portrait = document.getElementById('partnerPortrait');
  portrait.src = 'assets/' + form.id + '.png';
  portrait.alt = form.name;
}

function makeEvolutionShowcase() {
  const T = THREE, stage = new T.Scene();
  const camera = new T.PerspectiveCamera(37,1,.1,60);
  const stand = new T.Group();
  stage.add(stand, new T.HemisphereLight(0xe0edff,0xa09588,1.05));
  const key = new T.DirectionalLight(0xffe1b8,2.65);
  key.position.set(-4,6,5);
  key.castShadow=true;
  Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.3,far:20});
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.normalBias=.025;
  const rim = new T.DirectionalLight(0xcae5ff,2.1);
  rim.position.set(4,3,-4);
  const floor = new T.Mesh(new T.PlaneGeometry(85,85),new T.MeshStandardMaterial({color:0x26272a,roughness:.85}));
  floor.rotation.x=-Math.PI/2;
  floor.position.y=-.025;
  floor.receiveShadow=true;
  stage.add(key,rim,floor);
  const glow = new T.MeshBasicMaterial({transparent:true,opacity:.65,side:T.DoubleSide});
  const ring = new T.Mesh(new T.RingGeometry(2.23,2.26,100),glow);
  ring.rotation.x = -Math.PI/2;
  stage.add(ring);
  const guide = new T.Mesh(new T.RingGeometry(2.31,2.32,100),glow);
  guide.rotation.x = -Math.PI/2;
  stage.add(guide);
  let rig, owner, time=0;
  return {
    get active(){return !!rig;},
    start(actor) {
      owner=actor;rig=actor.activeRig;time=0;
      stage.environment=actor.root.parent.environment;
      stand.add(rig.root);
      stand.rotation.y=Math.PI-.67;
      stage.background=new T.Color(actor.id===4?0x38231f:0x142f3b);
      stage.fog=new T.Fog(stage.background,16,38);
      glow.color.setHex(actor.id===4?0xffb177:0x8fe5f0);
    },
    stop() {
      if(!rig)return;
      owner.root.add(rig.root);
      rig=owner=null;
    },
    render(renderer,dt) {
      time+=dt;
      rig.animate(dt,0,0);
      const aspect=innerWidth/innerHeight;
      const portrait=aspect<.85;
      stand.rotation.y=Math.PI-.5+.24*Math.sin(time*.7);
      const height=owner.formId===6?3.9:owner.formId===9?3.35:2.85;
      const distance=height*(portrait?3.45:2.85);
      camera.aspect=aspect;
      camera.position.set(0,height*.7,distance);
      camera.lookAt(0,height*.53,0);
      camera.setViewOffset(innerWidth,innerHeight,-innerWidth*(portrait?.17:.20),innerHeight*(portrait?.22:.12),innerWidth,innerHeight);
      renderer.render(stage,camera);
    }
  };
}
