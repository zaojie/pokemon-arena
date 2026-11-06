'use strict';

// Both final forms reuse one instanced surface per element for all live jets.
function makeEvolvedJets(scene) {
  const T = THREE, capacity = 40;
  const tube = new T.CylinderGeometry(1,1,1,12,10,true);
  tube.translate(0,.5,0);
  tube.rotateX(Math.PI/2);
  const forward = new T.Vector3(0,0,1), pose = new T.Object3D();
  const vector = new T.Vector3(), rows = [];
  const materials = [];
  function layer(isFire) {
    const geometry = tube.clone();
    const data = new T.InstancedBufferAttribute(new Float32Array(capacity*4),4);
    geometry.setAttribute('profile',data);
    const material = new T.ShaderMaterial({
      uniforms:{clock:{value:0},fire:{value:isFire?1:0}},
      transparent:true,depthWrite:false,side:T.DoubleSide,
      vertexShader:`
        attribute vec4 profile; uniform float clock, fire;
        varying float along, angle, life, seed;
        varying vec3 jetNormal, eyeVector;
        void main() {
          along=position.z; angle=uv.x*6.28318; seed=profile.z;
          float t=clamp((clock-profile.w)/.34,0.,1.);
          life=t;
          float tip=smoothstep(.0,.44,t);
          vec3 p=position; p.z*=tip;
          float width=mix(profile.x,profile.y,along);
          float ripples=sin(along*39.-clock*37.+seed+2.*angle);
          float wave=sin(along*21.+angle*3.-clock*19.+seed);
          p.xy*=width*(1.+(.08+.14*fire)*(ripples+wave)*.5)*(1.-.4*t);
          p.x+=width*.17*sin(along*9.-clock*11.+seed)*along;
          p.y+=width*.13*cos(along*11.-clock*13.+seed)*along;
          mat4 jetToView=modelViewMatrix*instanceMatrix;
          vec4 viewed=jetToView*vec4(p,1.);
          jetNormal=mat3(jetToView)*vec3(position.xy,0.);
          eyeVector=-viewed.xyz;
          gl_Position=projectionMatrix*viewed;
        }`,
      fragmentShader:`
        varying float along, angle, life, seed; uniform float fire;
        varying vec3 jetNormal, eyeVector;
        float grain(vec2 p){
          vec3 a=fract(p.xyx*vec3(.1031,.1030,.0973));
          a+=dot(a,a.yzx+33.33);
          return fract((a.x+a.y)*a.z);
        }
        float flowNoise(vec2 p){
          vec2 cell=floor(p), w=fract(p);
          w=w*w*(3.-2.*w);
          return mix(mix(grain(cell),grain(cell+vec2(1.,0.)),w.x),
                     mix(grain(cell+vec2(0.,1.)),grain(cell+1.),w.x),w.y);
        }
        void main(){
          vec2 ring=vec2(cos(angle),sin(angle));
          vec2 flow=vec2(along*8.-life*3.,seed*4.)+ring*vec2(.7,1.7);
          float swirl=flowNoise(flow);
          float eddy=flowNoise(flow*2.5+swirl*1.8);
          float density=.62*swirl+.38*eddy;
          float fade=(1.-smoothstep(.46,1.,life))*
                     (1.-smoothstep(.60+.28*density,1.,along));
          vec3 eye=normalize(eyeVector), normal=normalize(jetNormal);
          float face=abs(dot(eye,normal));
          vec3 color; float opacity;
          if(fire>.5){
            float plume=density+(1.-along)*.28+.16*face;
            float heat=smoothstep(.30,1.12,plume-.17*along);
            color=mix(vec3(.44,.018,.002),vec3(1.35,.18,.005),heat);
            color=mix(color,vec3(2.1,1.14,.25),smoothstep(.66,1.,heat));
            opacity=smoothstep(.26+.30*along,.79,plume)*(.32+.54*heat);
            opacity*=.53+.47*smoothstep(.01,.35,face);
          } else {
            float rim=pow(1.-face,2.);
            float surge=sin(along*84.-life*36.+angle*3.+swirl*6.);
            vec3 light=mat3(viewMatrix)*normalize(vec3(-.4,.78,-.45));
            if(dot(normal,eye)<0.)normal=-normal;
            vec3 ripple=normalize(normal+(eddy-.5)*.45*light);
            float glint=pow(max(0.,dot(ripple,normalize(light+eye))),16.);
            float foam=smoothstep(.62,.91,eddy+.17*surge+.12*along);
            color=mix(vec3(.016,.19,.22),vec3(.32,.72,.81),.22+.55*rim+.19*surge);
            color=mix(color,vec3(.91,.98,1.),foam*.92)+glint*vec3(1.6,1.42,1.05);
            opacity=.28+.25*rim+.42*foam+.10*glint;
          }
          gl_FragColor=vec4(color,fade*opacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    material.forceSinglePass=true;
    const mesh = new T.InstancedMesh(geometry,material,capacity);
    mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=3;scene.add(mesh);
    materials.push(material);
    return {mesh,data,entries:[]};
  }
  const fire=layer(true),water=layer(false);
  rows.push(fire,water);
  let clock=0;
  function install(row,index,entry){
    row.mesh.setMatrixAt(index,entry.matrix);
    row.data.setXYZW(index,entry.base,entry.tip,entry.seed,entry.start);
    row.mesh.instanceMatrix.needsUpdate=true;row.data.needsUpdate=true;
  }
  return {
    draw(isFire,from,to,base,tip){
      vector.copy(to).sub(from);const length=vector.length();
      if(length<.15)return;
      const row=isFire?fire:water;
      if(row.entries.length===capacity)return;
      pose.position.copy(from);pose.quaternion.setFromUnitVectors(forward,vector.divideScalar(length));
      pose.scale.set(1,1,length);pose.updateMatrix();
      const entry={matrix:pose.matrix.clone(),base,tip,seed:Math.random()*6.28,start:clock};
      install(row,row.entries.length,entry);row.entries.push(entry);row.mesh.count=row.entries.length;
    },
    step(dt){
      clock+=dt;
      for(const material of materials)material.uniforms.clock.value=clock;
      for(const row of rows){
        for(let i=row.entries.length-1;i>=0;i--){
          if(clock-row.entries[i].start<.34)continue;
          const last=row.entries.pop();
          if(i<row.entries.length){row.entries[i]=last;install(row,i,last);}
        }
        row.mesh.count=row.entries.length;
      }
    },
    reset(){for(const row of rows){row.entries.length=row.mesh.count=0;}}
  };
}
