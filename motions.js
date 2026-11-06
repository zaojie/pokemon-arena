// Build per-rig bindings once. Animation ticks reuse the vectors, poses and quaternions.
function makePartnerMotion(id, body, shadow) {
  const T = THREE;
  const clamp = T.MathUtils.clamp;
  const joints = new Map();
  const angles = new T.Euler();
  const turn = new T.Quaternion();
  const pivot = new T.Vector3();
  const isFire = id >= 4 && id <= 6;
  const isWater = id >= 7 && id <= 9;
  const jump = isWater ? .26 : isFire ? .38 : .51;
  const weight = isWater ? .7 : isFire ? .93 : 1.12;
  let stridePhase = 0;
  let breathPhase = Math.random() * 6.28;
  let speed = 0;

  // Contact, weight acceptance, passing foot, toe-off and swing back to contact.
  const thighCurve = [.64, .42, .08, -.27, -.58, -.44, .15, .66];
  const shinCurve = [.10, .28, .16, .05, .32, .96, .85, .28];
  const footCurve = [-.32, -.22, .02, .22, .41, .23, -.08, -.35];
  const gaitBob = [.03, 0, .08, .17, .03, 0, .08, .17];
  function cycle(curve, phase) {
    const index = Math.floor(phase);
    const fraction = phase - index;
    return curve[index & 7] + (curve[(index + 1) & 7] - curve[index & 7]) * fraction;
  }
  function keyPose(name, x = 0, y = 0, z = 0) {
    const joint = joints.get(name);
    if (!joint) return;
    turn.setFromEuler(angles.set(x, y, z));
    joint.bone.quaternion.copy(joint.inverse).multiply(turn).multiply(joint.parent).multiply(joint.rest);
  }
  function bind(rig) {
    rig.updateMatrixWorld(true);
    rig.traverse(bone => {
      if (!bone.isBone) return;
      const name = bone.name.replace(/_\d+$/, '');
      if (!/^(Head|Jaw|Tail[12]|TailA02|[LR](Thigh|Leg|Foot|Arm|ForeArm|Ear1|Feeler1|Feeler3|FeelerA))$/.test(name)) return;
      const parent = bone.parent.getWorldQuaternion(new T.Quaternion());
      joints.set(name, {bone, rest:bone.quaternion.clone(), parent, inverse:parent.clone().invert(), size:bone.scale.clone()});
    });
  }

  function animate(dt, speed01 = 0, recoil = 0, extra = {}) {
    speed += (clamp(speed01, 0, 1) - speed) * Math.min(1, dt * 12);
    breathPhase = (breathPhase + dt * 2.4) % (2 * Math.PI);
    const breath = Math.sin(breathPhase);
    const dodge = extra.dodgeProgress ?? -1;
    const dodging = dodge >= 0 && dodge < 1;
    const airborne = dodging ? Math.sin(dodge * Math.PI) : 0;
    const hit = clamp(extra.hit || 0, 0, 1);
    // A fresh shot lunges out, eases back and slightly overshoots on recovery.
    const attack = clamp(recoil, 0, 1);
    const release = Math.sin(attack * Math.PI / 2) - .22 * Math.sin(attack * 2 * Math.PI);
    const charge = clamp(extra.charge || 0, 0, 1);
    const side = clamp(extra.side || 0, -1, 1);
    const forward = clamp(extra.forward ?? 1, -1, 1);
    const travel = speed * (1 - airborne);
    stridePhase = (stridePhase + dt * (4.4 + speed * 7.6) * weight) % 8;
    const legDrive = Math.abs(side) > Math.abs(forward) ? .56 : forward < 0 ? -.7 : 1;
    const tailSweep = Math.sin(stridePhase * Math.PI / 4);
    const bob = cycle(gaitBob, stridePhase) * travel * weight;

    let pitch = -.10 * travel * forward + .23 * hit + .13 * charge - .14 * release;
    let roll = side * travel * .12 + tailSweep * travel * .045;
    let twist = .065 * tailSweep * travel + (isFire ? .15 : .035) * release;
    if (dodging) {
      if (isWater) {
        const spin = dodge * dodge * (3 - 2 * dodge) * 2 * Math.PI;
        if (Math.abs(side) > Math.abs(forward)) roll -= Math.sign(side) * spin;
        else pitch -= (forward < 0 ? -1 : 1) * spin;
      } else {
        roll -= side * airborne * (isFire ? .77 : 1.08);
        pitch -= airborne * (.42 + .2 * forward);
        twist += side * airborne * .32;
      }
    }
    // Rotate around the actor's middle so a shell roll never pivots about its feet.
    body.rotation.set(pitch, twist, roll);
    const centre = id === 9 ? 1.4 : id === 6 ? 1.5 : isWater ? .85 : .98;
    pivot.set(0,centre,0).applyQuaternion(body.quaternion);
    body.position.set(-pivot.x, centre - pivot.y + bob + (1 + breath) * .011 + airborne * jump - charge * .055, -pivot.z);
    shadow.scale.setScalar(1 - airborne * .24);

    // Squirtle pulls its head and limbs into the shell before turning over.
    if (isWater) {
      const tuck = airborne * airborne;
      for (const name of ['Head','LArm','RArm','LThigh','RThigh','Tail1']) {
        const joint = joints.get(name);
        if (joint) joint.bone.scale.copy(joint.size).multiplyScalar(1 - .74 * tuck);
      }
    }
    keyPose('Head', -.12 * hit + .11 * charge - release * (isWater ? .20 : .27) + .032 * breath + .25 * airborne, .09 * side * travel, dodging ? 0 : -roll * .12);
    keyPose('Jaw', -.40 * release * (1-airborne));
    keyPose('Tail1', (id === 8 ? -.85 : 0) - .15 * release + .32 * airborne, (id===25 ? -.92 : .04) + .13 * breath + tailSweep * travel * .29 - side * .18, .12 * charge);
    keyPose('Tail2', -.14 * release, .09 * breath + tailSweep * travel * .12);
    keyPose('TailA02', 0, 0, .1 * breath + tailSweep * travel * .12);

    for (let i = 0; i < 2; i++) {
      const prefix = i ? 'R' : 'L';
      const sign = i ? -1 : 1;
      const phase = stridePhase + i * 4;
      const thigh = cycle(thighCurve, phase) * travel;
      const knee = cycle(shinCurve, phase) * travel;
      keyPose(prefix+'Thigh', thigh * legDrive * weight + .62 * airborne + charge * .18, 0, side * thigh * .6);
      keyPose(prefix+'Leg', -knee * weight - .88 * airborne - .25 * charge);
      keyPose(prefix+'Foot', cycle(footCurve, phase) * travel + .20 * airborne);
      const restingArm = sign * (id === 6 ? .06 : isWater ? .5 : .82);
      keyPose(prefix+'Arm', -thigh * (isFire ? .7 : .55) * legDrive + .45 * charge - .36 * release + .42 * airborne,
        sign * (isWater ? .17 : .10) * release, restingArm - sign * (.10 * breath + .39 * release - .16 * hit));
      keyPose(prefix+'ForeArm', .16 + .18 * knee + .43 * airborne + .29 * charge);
      if (id === 9) keyPose(prefix+'FeelerA', -.14 * release, sign * .03 * release, 0);
      if (id === 6) {
        const flap = .12 * Math.sin(breathPhase * 1.5) + .28 * travel * tailSweep + .48 * airborne - .18 * release;
        keyPose(prefix+'Feeler1', .08 * release, sign * .08 * charge, sign * flap);
        keyPose(prefix+'Feeler3', 0, sign * .09 * Math.sin(breathPhase), sign * flap * .45);
      }
      keyPose(prefix+'Ear1', -.10 * breath - .20 * travel - .38 * charge + .33 * release - .60 * airborne, 0, sign * (.05 * tailSweep + .14 * hit));
    }
  }
  return {bind, animate};
}
