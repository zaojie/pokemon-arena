// Skeletal character instances share their mesh data and textures across encounters.
const makePokemon = (() => {
  const templates = new Map();
  const flameLayers = {
    4:['Material #36','Material #37'],
    5:['Material #36','Material #38'],
    6:['Material_15','Material_16']
  };
  const T = THREE;
  const footprint = new T.PlaneGeometry(2.4, 2);
  const shade = document.createElement('canvas');
  shade.width = shade.height = 64;
  const pen = shade.getContext('2d');
  const fade = pen.createRadialGradient(32, 32, 2, 32, 32, 32);
  fade.addColorStop(0, 'rgba(45,42,46,0.48)');
  fade.addColorStop(.48, 'rgba(45,42,46,0.28)');
  fade.addColorStop(1, 'rgba(45,42,46,0)');
  pen.fillStyle = fade;
  pen.fillRect(0, 0, 64, 64);
  const shadowMaterial = new T.MeshBasicMaterial({
    map: new T.CanvasTexture(shade), transparent: true, depthWrite: false
  });
  const flame = new T.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false});
  const flameTime = {value:0};
  flame.onBeforeRender = () => { flameTime.value = performance.now() * .001; };
  flame.onBeforeCompile = shader => {
    shader.uniforms.flameTime = flameTime;
    shader.vertexShader = 'uniform float flameTime;\n' + shader.vertexShader.replace('#include <project_vertex>', `
      #include <project_vertex>
      mvPosition.x += .043 * color.y * color.y * sin(flameTime * 8.0 + color.y * 9.0);
      gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = 'uniform float flameTime;\n' + shader.fragmentShader.replace('#include <color_fragment>', `
      float h = vColor.y;
      float curl = sin(vColor.x*8.0 + h*13.0 - flameTime*7.0)
                 + .5*sin(vColor.z*11.0 - h*17.0 + flameTime*9.0);
      float heat = clamp(1.05 - h + curl*.22, 0.0, 1.0);
      diffuseColor.rgb = mix(vec3(1.06,.065,.004), vec3(1.4,.51,.028), smoothstep(.08,.55,heat));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.85,1.37,.46), smoothstep(.53,.91,heat));
      diffuseColor.a = mix(.56,.98,smoothstep(.07,.53,heat));`);
  };

  function template(id) {
    if (!templates.has(id)) {
      const bytes = Uint8Array.from(atob(PokemonAssets.data[id]), c => c.charCodeAt(0));
      templates.set(id, new PokemonAssets.GLTFLoader().parseAsync(bytes.buffer, '').then(({scene}) => {
        // This Pikachu source is Z-up; Charmander and Squirtle are Y-up.
        scene.rotation.set(id === 25 ? -Math.PI / 2 : 0, Math.PI, 0, 'YXZ');
        scene.updateMatrixWorld(true);
        let hips;
        scene.traverse(object => {
          if (object.isSkinnedMesh) {
            object.skeleton.update();
            object.frustumCulled = false;
            const layers = flameLayers[id];
            if (layers && object.material.name === layers[1]) object.visible = false;
            if (layers && object.material.name === layers[0]) {
              // The source stores its flame stencil as opaque RGB. Use rest-space coordinates so the fire follows the tail.
              const bounds = new T.Box3().setFromObject(object, true);
              const count = object.geometry.attributes.position.count;
              const colors = new Float32Array(count * 3);
              const position = new T.Vector3(), extent = bounds.getSize(new T.Vector3());
              for (let i = 0; i < count; i++) {
                object.localToWorld(object.getVertexPosition(i, position));
                position.sub(bounds.min).divide(extent).toArray(colors, i * 3);
              }
              object.geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
              object.material = flame;
            }
          }
          if (/^(Hips|Waist)(_|$)/.test(object.name)) hips = object;
        });
        const box = new T.Box3().setFromObject(scene, true);
        const anchor = hips.getWorldPosition(new T.Vector3());
        const height = {4:2.35, 5:2.9, 6:3.9, 7:2.08, 8:2.55, 9:3.35, 25:2.65}[id];
        // Wartortle's source is posed on the tip of its tail. Its running rig lifts the tail.
        const floor = id === 8 ? box.min.y + .22 * (box.max.y - box.min.y) : box.min.y;
        const scale = height / (box.max.y - floor);
        scene.scale.setScalar(scale);
        scene.position.set(-anchor.x * scale, -floor * scale, -anchor.z * scale);
        return scene;
      }));
    }
    return templates.get(id);
  }

  return function makePokemon(id, castShadow = false) {
    const root = new T.Group(), body = new T.Group();
    const shadow = new T.Mesh(footprint, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = .035;
    root.add(shadow, body);
    const motion = makePartnerMotion(id, body, shadow);
    const ready = template(id).then(source => {
      const rig = PokemonAssets.clone(source);
      if (castShadow) rig.traverse(part => {
        if (part.isSkinnedMesh && part.visible && part.material.isMeshStandardMaterial && !part.material.transparent) {
          part.castShadow = true;
          part.receiveShadow = true;
        }
      });
      motion.bind(rig);
      body.add(rig);
      motion.animate(0);
    });
    return {id, root, body, animate:motion.animate, ready};
  };
})();
