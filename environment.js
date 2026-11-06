'use strict';

// Landscape scans and tree models (fir_tree_01, fir_sapling_medium, tree_small_02, mossy_rock) by Poly Haven, CC0.
function buildForest(scene, renderer) {
  const T = THREE;
  let seed = 3210346040;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const range = (a,b) => a + (b-a)*random();
  const tau = Math.PI*2;
  const obstacles = [], loader = new T.TextureLoader();
  const anisotropy = Math.min(6,renderer.capabilities.getMaxAnisotropy());
  function texture(name, color = true) {
    const tex = loader.load('assets/'+name);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.anisotropy = anisotropy;
    if (color) tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  // The red channel blends the path. Green holds projected canopy and contact shade.
  const extent = 128;
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = mapCanvas.height = 1024;
  const ctx = mapCanvas.getContext('2d');
  ctx.fillRect(0,0,1024,1024);
  ctx.setTransform(8,0,0,8,512,512);
  function trail(width, red) {
    ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgb('+red+',0,0)';
    ctx.beginPath();ctx.moveTo(-8,59);
    ctx.bezierCurveTo(-14,30,10,26,.5,9);ctx.bezierCurveTo(-8,-6,-2,-12,9,-21);
    ctx.bezierCurveTo(14,-28,6,-32,1,-46);ctx.stroke();
    ctx.lineWidth=width*.55;ctx.beginPath();ctx.moveTo(-2,2);
    ctx.bezierCurveTo(-10,-2,-22,7,-35,0);ctx.stroke();
  }
  for(let i=0;i<15;i++) trail(6.6-i*.29,Math.round(245*(i+1)/15));
  ctx.globalCompositeOperation = 'lighten';
  function shade(x,z,rx,rz,shadeAmount,angle=0) {
    ctx.save();ctx.translate(x,z);ctx.rotate(angle);ctx.scale(rx,rz);
    const gradient=ctx.createRadialGradient(0,0,.22,0,0,1);
    gradient.addColorStop(0,'rgb(0,'+shadeAmount+',0)');gradient.addColorStop(1,'#000');
    ctx.fillStyle=gradient;ctx.fillRect(-1,-1,2,2);ctx.restore();
  }

  const rockMap = texture('forest-stone.jpg'), rockNormal = texture('forest-stone-normal.jpg',false);
  function altitude(x,z) {
    const radius = Math.hypot(x,z);
    const a = Math.atan2(z,x);
    const rise = Math.max(0,Math.min(1,(radius-38)/70));
    return .24*(rise*(9+8*Math.sin(a*5+.7)+5*Math.cos(a*9-1)+3*Math.sin(a*23))+
      rise*rise*(20+7*Math.cos(a*3)+3*Math.sin(a*29)) + rise*2*Math.sin(x*.38+z*.18));
  }
  const terrain = [], tints = [], uv = [], indices = [];
  const sectors = 224, rows = 11;
  for (let j=0;j<=rows;j++) {
    const r = 36+j*7.6;
    for (let i=0;i<=sectors;i++) {
      const a=tau*i/sectors, x=Math.cos(a)*r,z=Math.sin(a)*r,h=altitude(x,z);
      terrain.push(x,h-.08,z);uv.push(x/8,z/8);
      const trees = Math.max(0,Math.min(1,.9-h*.036+.14*Math.sin(x*.27)));
      const col = new T.Color(0xb3b2a5).lerp(new T.Color(0x9caa87),trees);
      tints.push(col.r,col.g,col.b);
      if(i<sectors&&j<rows) {
        const k=j*(sectors+1)+i;
        indices.push(k,k+1,k+sectors+1,k+1,k+sectors+2,k+sectors+1);
      }
    }
  }
  function buffer(points,texcoords,idx) {
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(points,3));
    geo.setAttribute('uv',new T.Float32BufferAttribute(texcoords,2));
    geo.setIndex(idx);geo.computeVertexNormals();return geo;
  }
  const mountains=buffer(terrain,uv,indices);
  mountains.setAttribute('color',new T.Float32BufferAttribute(tints,3));
  scene.add(new T.Mesh(mountains,new T.MeshLambertMaterial({map:rockMap,vertexColors:true})));

  const branch = buffer(
    [-.09,0,0,.09,0,0, -.52,-.06,.35,.52,-.06,.35, -.4,-.18,.7,.4,-.18,.7, -.10,-.13,1,.1,-.13,1],
    [.41,0,.59,0, 0,.35,1,.35,.1,.7,.9,.7,.4,1,.6,1],
    [0,2,1,1,2,3,2,4,3,3,4,5,4,6,5,5,6,7]
  );
  const rock = new T.IcosahedronGeometry(1,2);
  const rockPos=rock.attributes.position;
  for(let i=0;i<rockPos.count;i++){
    const x=rockPos.getX(i), y=rockPos.getY(i), z=rockPos.getZ(i);
    const f=1+.12*Math.cos(x*4.2+y*5.8)+.068*Math.sin(z*8-y*2.8)+.04*Math.cos(x*11+z*3);
    rockPos.setXYZ(i,x*f,Math.sign(y)*Math.pow(Math.abs(y),.78)*f,z*f);
  }
  rock.computeVertexNormals();
  const bark=texture('fir-bark.jpg');bark.repeat.set(1,3.4);
  const fir=texture('fir-bough.webp');fir.wrapS=fir.wrapT=T.ClampToEdgeWrapping;
  // The photographed foliage carries its own fine needle shading.
  const types={
    branch:[branch,new T.MeshBasicMaterial({map:fir,side:T.DoubleSide,alphaTest:.30})],
    trunk:[new T.CylinderGeometry(.12,1,1,10),new T.MeshLambertMaterial({map:bark})],
    stone:[rock,new T.MeshStandardMaterial({map:rockMap,normalMap:rockNormal,roughness:.94,normalScale:new T.Vector2(.65,.65)})],
    ruin:[new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({map:rockMap,normalMap:rockNormal,roughness:.96})],
    crystal:[new T.OctahedronGeometry(1),new T.MeshStandardMaterial({color:0x8cd7c8,emissive:0x175951,metalness:.25,roughness:.25})]
  };
  const groups=new Map(), dummy=new T.Object3D();
  function place(kind,x,y,z,sx,sy,sz,rotY=0,rotX=0,rotZ=0,color=0xffffff) {
    // Static groups allow the GPU to skip the sectors behind the chase camera.
    const key=kind+':'+Math.floor((x+16)/42)+','+Math.floor((z+16)/42);
    if(!groups.has(key)) groups.set(key,{kind,items:[]});
    dummy.position.set(x,y,z);dummy.rotation.set(rotX,rotY,rotZ,'YXZ');
    dummy.scale.set(sx,sy,sz);dummy.updateMatrix();
    groups.get(key).items.push([dummy.matrix.clone(),color]);
  }
  const lightDirection=scene.children.find(l=>l.isDirectionalLight).position;
  const shadowX=-lightDirection.x/lightDirection.y,shadowZ=-lightDirection.z/lightDirection.y;
  function tree(x,z,s) {
    const floor=altitude(x,z), h=s*range(8.4,11.7), radius=s*range(1.8,2.8);
    const start = h*range(.20,.41), tilt=range(-.026,.026), trunkWidth=s*range(.20,.31);
    const trunkTint = new T.Color().setScalar(range(1.7,2.5));
    place('trunk',x,floor+h*.50,z,trunkWidth,h,trunkWidth,range(0,tau),tilt,0,trunkTint);
    const layers=11;
    const orientation=range(0,tau), hue=range(.92,1.24);
    for(let j=0;j<layers;j++) {
      const t=j/layers,y=start+(h-start)*t;
      const span=radius*Math.pow(1-t,.78)*(1+.13*Math.sin(t*Math.PI));
      const n=7;
      const angle=orientation+j*2.4;
      for(let k=0;k<n;k++) {
        const a=angle+k*tau/n+range(-.23,.23), len=span*range(.78,1.24);
        const exposure=(.88+.30*(Math.sin(a)*-0.72+Math.cos(a)*-.67))*(.76+.35*t)*hue;
        const tint=new T.Color(exposure*.95,exposure,exposure*.87);
        place('branch',x,floor+y+range(-.46,.42)*s,z+tilt*y,
          len*range(.9,1.32),len,len,a,range(.10,.69)-t*.66,range(-.62,.62),tint);
      }
    }
    shade(x,z,trunkWidth*3,trunkWidth*2.3,124);
    const mid=(h+start)*.47;
    shade(x+mid*shadowX,z+mid*shadowZ,h*.57,radius*.82,118,.74);
    for(let j=0;j<55;j++) {
      const y=range(start,h),a=range(0,tau), rad=radius*(h-y)/(h-start)*Math.sqrt(random());
      const px=x+Math.cos(a)*rad+y*shadowX, pz=z+Math.sin(a)*rad+y*shadowZ;
      shade(px,pz,range(.3,1.7)*s,range(.23,.8)*s,Math.round(range(70,150)),a);
    }
  }
  // Two fixed orthographic views of each scanned tree keep the trunks rooted as the camera turns.
  const treeCells=new Map(), herbCells=new Map();
  function vegetation(cells,columns,x,floor,z,height,species,aspect,light) {
    const key=Math.floor(x/36)+','+Math.floor(z/36);
    if(!cells.has(key))cells.set(key,{points:[],uv:[],colors:[],indices:[]});
    const cell=cells.get(key),yAngle=range(0,tau),width=height*aspect*range(.88,1.12);
    for(let row=0;row<2;row++) {
      const a=yAngle+row*Math.PI*.5, dx=Math.cos(a)*width*.5,dz=Math.sin(a)*width*.5;
      const offset=cell.points.length/3, u=species/columns,v=(1-row)*.5;
      cell.points.push(x-dx,floor,z-dz,x+dx,floor,z+dz,x-dx,floor+height,z-dz,x+dx,floor+height,z+dz);
      cell.uv.push(u,v,u+1/columns,v,u,v+.5,u+1/columns,v+.5);
      cell.indices.push(offset,offset+1,offset+2,offset+2,offset+1,offset+3);
      for(let i=0;i<4;i++)cell.colors.push(light,light,light*.95);
    }
  }
  function woodlandTree(x,z,height,species) {
    vegetation(treeCells,3,x,altitude(x,z)-.05,z,height,species,1.25,range(.9,1.24));
    if(Math.hypot(x,z)<47){
      const reach=height*.65;
      shade(x,z,height*.08,height*.064,125);
      shade(x+reach*shadowX,z+reach*shadowZ,height*.39,height*.19,115,.74);
      for(let j=0;j<32;j++){
        const y=range(.33,.91)*height, halfWidth=height*(1-y/height)*.43;
        shade(x+y*shadowX+range(-halfWidth,halfWidth),z+y*shadowZ+range(-halfWidth,halfWidth),
          height*range(.05,.12),height*range(.026,.072),Math.round(range(65,141)),range(0,tau));
      }
    }
  }
  const mainTrees=[[-11,9,1.35,0],[12,4,1.15,2],[-17,-9,1.25,1],[15,-19,1.4,-1],[-20,22,1.15,0],[23,17,1.3,-1],[-24,-18,.95,2]];
  for(const [x,z,s,species] of mainTrees){
    if(species<0)tree(x,z,s);
    else woodlandTree(x,z,s*range(8.2,10.4),species);
    obstacles.push({x,z,r:.55*s,h:5*s});
  }
  // Vary the age, density and spacing along the forest edge, with gaps facing the distant pass.
  for(let cluster=0;cluster<82;cluster++) {
    const a=range(0,tau),r=range(36,78),count=Math.floor(range(2,7));
    const cx=Math.cos(a)*r,cz=Math.sin(a)*r;
    if(cz<-24 && Math.abs(cx-6)<6 && r<44)continue;
    const kind=random()<.33?0:random()<.48?1:2;
    for(let i=0;i<count;i++) {
      const x=cx+range(-4.5,4.5),z=cz+range(-4.5,4.5);
      const s=range(6.3,15.5)*(i%3===1?.48:1);
      woodlandTree(x,z,s,random()<.82?kind:2);
    }
  }
  for(let j=0;j<65;j++){
    const a=range(0,tau),r=range(32,51);
    woodlandTree(Math.cos(a)*r,Math.sin(a)*r,range(.65,3.2),2);
  }
  function boulder(x,z,r) {
    place('stone',x,r*.33,z,r,r*.83,r*.9,range(0,tau),range(-.15,.15),range(-.2,.2));
    shade(x+r*.44,z+r*.35,r*1.4,r*1.02,133,.72);
    obstacles.push({x,z,r:r*.93,h:r*1.18});
  }
  for(const b of [[-4,5,2.05],[7,-4,1.7],[8.5,-4.6,1.15],[-12,-17,2.4],[16,12,1.65],[-17,13,1.6]])boulder(...b);
  for(let i=0;i<240;i++) {
    const x=range(-38,38),z=range(-38,38),s=range(.06,.20);
    place('stone',x,.015,z,s,s*.42,s*.78,range(0,tau));
  }
  for(const side of [-1,1]){
    const x=6.7+side*3.45, z=-34.6;
    place('ruin',x,.36,z,2.3,.72,2.25,side*.04);
    for(let i=0;i<6;i++) place('ruin',x+.05*i*side,.77+i*.81,z,1.56-i*.043,.84,1.6,range(-.04,.04));
    place('ruin',x+side*.25,5.45,z,1.95,.64,1.85,side*.02);
    shade(x+2.2,z+2,4.8,1.35,100,.74);
  }
  place('ruin',6.7,6.06,-34.6,9.7,.72,1.86,.012,0,.014);
  place('ruin',6.7,6.56,-34.6,10.15,.32,2.13);
  place('crystal',6.7,4.78,-34.6,.53,1.04,.53);
  place('ruin',6.7,.21,-34.55,3.6,.42,2.25);
  // Clumps leave open patches for combat silhouettes and for the dirt track.
  const pathPixels=ctx.getImageData(0,0,1024,1024).data;
  for(let i=0;i<1780;i++) {
    const x=range(-37,37),z=range(-37,37);
    const u=Math.max(0,Math.min(1023,Math.floor((x+64)*8))),v=Math.max(0,Math.min(1023,Math.floor((z+64)*8)));
    if(Math.hypot(x,z)>39 || pathPixels[(v*1024+u)*4]>150)continue;
    const species=random()<.12?Math.floor(range(0,2)):Math.floor(range(2,5));
    const count=species<2?1:Math.floor(range(1,5));
    const baseHeight=species<2?range(.28,.77):range(.22,.52);
    for(let j=0;j<count;j++) {
      const px=x+range(-.67,.67),pz=z+range(-.67,.67),h=baseHeight*range(.7,1.31);
      vegetation(herbCells,5,px,-.025,pz,h,species,1.34,range(1.0,1.6));
    }
    shade(x,z,baseHeight*1.9,baseHeight*1.33,Math.round(range(18,57)),range(0,tau));
  }
  for(const [cells,file,threshold] of [[treeCells,'woodland-trees.webp',.25],[herbCells,'woodland-groundcover.webp',.26]]){
    const atlas=texture(file);atlas.wrapS=atlas.wrapT=T.ClampToEdgeWrapping;
    const mat=new T.MeshBasicMaterial({map:atlas,vertexColors:true,alphaTest:threshold,side:T.DoubleSide});
    if(cells===herbCells){
      // Fill the backlit blades with bounced light from the surrounding moss.
      mat.onBeforeCompile=shader=>{
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',
          '#include <color_fragment>\n diffuseColor.rgb = diffuseColor.rgb * 1.22 + vec3(.058, .077, .030);');
      };
    }
    for(const cell of cells.values()){
      const geo=buffer(cell.points,cell.uv,cell.indices);
      geo.setAttribute('color',new T.Float32BufferAttribute(cell.colors,3));
      scene.add(new T.Mesh(geo,mat));
    }
  }
  const macro=new T.CanvasTexture(mapCanvas);macro.anisotropy=anisotropy;
  const floorMap=texture('forest-floor.jpg'),pathMap=texture('forest-path.jpg'),floorNormal=texture('forest-floor-normal.jpg',false);
  floorNormal.repeat.set(42,42);
  const groundMaterial=new T.MeshStandardMaterial({map:floorMap,normalMap:floorNormal,normalScale:new T.Vector2(.53,.53),roughness:.98});
  groundMaterial.onBeforeCompile=shader=>{
    shader.uniforms.pathMap={value:pathMap};shader.uniforms.terrainMask={value:macro};
    shader.fragmentShader='uniform sampler2D pathMap;\nuniform sampler2D terrainMask;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec2 tile = vMapUv * 42.0;
      vec4 floorSample = texture2D(map,tile);
      vec4 macro = texture2D(terrainMask,vMapUv);
      float path = smoothstep(0.07, 0.91, macro.r + (floorSample.g-.23)*.21);
      vec3 soil = texture2D(pathMap,tile*.86).rgb * vec3(1.52,1.56,1.6);
      vec2 patchUv = vMapUv * 7.0;
      float moss = smoothstep(.18,.46,texture2D(map,patchUv).g);
      vec3 groundColor = mix(floorSample.rgb * mix(vec3(.74,.83,.70),vec3(.92,.99,.83),moss),soil,path);
      diffuseColor.rgb *= groundColor * mix(vec3(1.0),vec3(.29,.37,.49),macro.g);
    `);
  };
  const field=new T.Mesh(new T.PlaneGeometry(extent,extent),groundMaterial);
  field.rotation.x=-Math.PI/2;field.position.y=-.025;field.receiveShadow=true;scene.add(field);
  for(const {kind,items} of groups.values()){
    const [geometry,material]=types[kind], mesh=new T.InstancedMesh(geometry,material,items.length);
    items.forEach(([matrix,color],i)=>{
      mesh.setMatrixAt(i,matrix);
      if(color!==0xffffff)mesh.setColorAt(i,color);
    });
    mesh.computeBoundingSphere();scene.add(mesh);
  }
  return obstacles;
}
