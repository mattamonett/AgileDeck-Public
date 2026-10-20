import * as THREE from 'three';
import { bearPlan, type BearPlan } from './bear-choreography';
import { gait, glossy, glow, makeLimb, matte, oval, part, reach, type Limb } from '../../kit';

const FUR = 0x9c6a40,
  FUR_DARK = 0x77492a,
  MUZZLE = 0xe6c597,
  BELLY = 0xdcb27d,
  EAR_IN = 0xeba89b,
  PAD = 0x8c514b,
  HONEY = 0xf2aa1e,
  NOSE = 0x24150f,
  EYE = 0x1a100c;

/** Hip height on all fours, in model units above the floor. */
export const BEAR_WALK_HIP = 19.5;
/** Arm roots in body space (the body pivots at the hip). */
export const BEAR_SHOULDER = new THREE.Vector2(14, 0);
const BEAR_ARM_Z = 7;
const LEG_Z = 6;
export const BEAR_STRIDE = 12;
/** Head mount in body space. */
const HEAD_AT = new THREE.Vector2(21, 8.5);
/** Front of the lower lip in head space. */
export const BEAR_MOUTH = new THREE.Vector2(10.6, -4.9);

export interface BearModel {
  readonly plan: BearPlan;
  readonly body: THREE.Group;
  readonly torso: THREE.Group;
  /** Counter-rotates the spine pitch so the head turns about the vertical. */
  readonly neck: THREE.Group;
  readonly head: THREE.Group;
  readonly jaw: THREE.Group;
  readonly eyes: readonly THREE.Group[];
  readonly lashes: readonly THREE.Mesh[];
  readonly cheeks: readonly THREE.Mesh[];
  readonly ears: readonly THREE.Group[];
  readonly nose: THREE.Mesh;
  readonly mouthInside: THREE.Mesh;
  readonly tail: THREE.Mesh;
  /** Front legs: [left (model +z), right (model -z)]. */
  readonly arms: readonly [Limb, Limb];
  readonly legs: readonly [Limb, Limb];
  /** Sole centres of the front paws, where honey prints are pressed. */
  readonly soles: readonly [THREE.Object3D, THREE.Object3D];
  /** Front of the lower lip: the point that meets the pie on each bite. */
  readonly mouth: THREE.Object3D;
  /** Above the head, where the dozing Z puffs rise from. */
  readonly crown: THREE.Object3D;
  readonly frontSole: number;
  readonly hindSole: number;
  /** Ankle height when the hind foot stands on its heel with the sole facing forward. */
  readonly hindHeel: number;
}
const models = new WeakMap<THREE.Group, BearModel>();

const vertex = new THREE.Vector3();
/** Lowest point of a paw's real geometry below its ankle, with the paw turned by `angle`. */
function soleDepth(end: THREE.Object3D, angle: number): number {
  const turn = new THREE.Matrix4().makeRotationZ(angle);
  let lowest = Infinity;
  for (const child of end.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    child.updateMatrix();
    const points = child.geometry.getAttribute('position');
    for (let i = 0; i < points.count; i++)
      lowest = Math.min(
        lowest,
        vertex.fromBufferAttribute(points, i).applyMatrix4(child.matrix).applyMatrix4(turn).y,
      );
  }
  return -lowest;
}

/** A chubby paw with a pad and four toe beans on its sole. */
function paw(end: THREE.Object3D, name: string, length: number, pad: number) {
  oval(end, `${name}-paw`, matte(FUR_DARK, 0.85), length * 0.45, -2.5, 0, length, 2.6, 3.4);
  oval(end, `${name}-pad`, glossy(pad, 0.35), length * 0.45, -4.85, 0, length * 0.6, 0.55, 2.1);
  for (let k = 0; k < 4; k++)
    oval(
      end,
      `${name}-bean-${k}`,
      glossy(pad, 0.35),
      length * 1.07,
      -4.45,
      (k - 1.5) * 1.05,
      0.62,
      0.48,
      0.55,
    );
}

export function makeBear(id: string): THREE.Group {
  const plan = bearPlan(id);
  const root = new THREE.Group();
  root.name = 'thanksgiving-bear';
  const body = new THREE.Group();
  body.name = 'bear-body';
  root.add(body);
  const torso = new THREE.Group();
  torso.name = 'bear-torso';
  body.add(torso);
  oval(torso, 'bear-rump', matte(FUR), 0, 0.5, 0, 9.5, 9, 9.2);
  oval(torso, 'bear-belly', matte(FUR), 7, 0.5, 0, 11, 9.5, 9.6);
  oval(torso, 'bear-chest', matte(FUR), 13.5, 1.5, 0, 8, 9, 9);
  oval(torso, 'bear-belly-patch', matte(BELLY, 0.9), 8, -5.4, 0, 9.5, 4.6, 8);
  oval(torso, 'bear-hump', matte(FUR_DARK), 12, 8, 0, 6.5, 3.4, 6.8);
  for (const z of [5.4, -5.4]) oval(body, 'bear-haunch', matte(FUR), 1, -1.5, z, 6.5, 7, 4.6);
  const tail = oval(torso, 'bear-tail', matte(FUR), -9.6, 3.6, 0, 2.7, 2.5, 2.7);
  oval(body, 'bear-neck', matte(FUR), 18.5, 5, 0, 5.4, 6.2, 6.6);

  const neck = new THREE.Group();
  neck.name = 'bear-neck-mount';
  neck.position.set(HEAD_AT.x, HEAD_AT.y, 0);
  body.add(neck);
  const head = new THREE.Group();
  head.name = 'bear-head';
  head.rotation.order = 'YZX';
  neck.add(head);
  oval(head, 'bear-skull', matte(FUR), 0, 0, 0, 9, 8.6, 8.8);
  const cheeks = [5.2, -5.2].map((z) =>
    oval(head, 'bear-cheek', matte(FUR), 2.4, -3.2, z, 4.2, 3.6, 3.2),
  );
  oval(head, 'bear-muzzle', matte(MUZZLE, 0.9), 7.4, -2.6, 0, 4.6, 3.4, 4.2);
  oval(head, 'bear-bridge', matte(MUZZLE, 0.9), 5, -0.4, 0, 3.6, 2.3, 3.2);
  const nose = oval(head, 'bear-nose', glossy(NOSE, 0.2), 11.5, -1.1, 0, 1.9, 1.35, 2.4);
  oval(head, 'bear-nose-glint', glow(0xfff8ee, 0.9), 12.3, -0.4, 1.2, 0.55, 0.35, 0.5);
  oval(head, 'bear-philtrum', matte(0x4a2a1c, 0.7), 11, -3.3, 0, 0.35, 0.95, 0.35);
  const mouthInside = oval(
    head,
    'bear-mouth-inside',
    matte(0x5c1d24, 0.6),
    8.6,
    -4.9,
    0,
    2.9,
    1.3,
    2.6,
  );
  const jaw = new THREE.Group();
  jaw.name = 'bear-jaw';
  jaw.position.set(5.6, -4.6, 0);
  head.add(jaw);
  oval(jaw, 'bear-chin', matte(MUZZLE, 0.9), 3.3, -0.7, 0, 3.8, 1.7, 3.4);
  oval(jaw, 'bear-tongue', glossy(0xea8a96, 0.4), 4, 0.25, 0, 2.2, 0.7, 2);
  const eyes: THREE.Group[] = [],
    lashes: THREE.Mesh[] = [];
  for (const z of [5.5, -5.5]) {
    const eye = new THREE.Group();
    eye.name = 'bear-eye';
    eye.position.set(5.9, 2.4, z);
    eye.rotation.y = z > 0 ? -0.55 : 0.55;
    head.add(eye);
    oval(eye, 'bear-eyeball', glossy(EYE, 0.15), 0, 0, 0, 1.65, 2.15, 1.4);
    oval(eye, 'bear-eye-glint', glow(0xffffff), 0.55, 0.75, Math.sign(z) * 1.2, 0.6, 0.7, 0.35);
    oval(
      eye,
      'bear-eye-sparkle',
      glow(0xffffff, 0.85),
      -0.5,
      -0.7,
      Math.sign(z) * 1.25,
      0.26,
      0.28,
      0.2,
    );
    eyes.push(eye);
    // Closed, contented eyes: a soft upturned arc in place of the eyeball.
    const arc = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-1.4, 0.2, 0),
      new THREE.Vector3(0, -1.1, 0),
      new THREE.Vector3(1.4, 0.2, 0),
    );
    const lash = part(
      head,
      'bear-sleepy-lash',
      new THREE.TubeGeometry(arc, 10, 0.32, 5, false),
      matte(0x2c1a12, 0.7),
      6.2,
      2.5,
      z * 1.04,
    );
    lash.rotation.y = eye.rotation.y;
    lashes.push(lash);
  }
  const ears: THREE.Group[] = [];
  for (const z of [5.8, -5.8]) {
    const ear = new THREE.Group();
    ear.name = 'bear-ear';
    ear.position.set(-1.6, 7.3, z);
    ear.rotation.y = z > 0 ? -0.75 : 0.75;
    head.add(ear);
    oval(ear, 'bear-ear-outer', matte(FUR_DARK), 0, 0, 0, 1.8, 3.4, 3.4);
    oval(ear, 'bear-ear-inner', matte(EAR_IN, 0.9), 0.95, -0.35, 0, 0.9, 2.15, 2.15);
    ears.push(ear);
  }
  const mouth = new THREE.Object3D();
  mouth.name = 'bear-mouth';
  mouth.position.set(BEAR_MOUTH.x, BEAR_MOUTH.y, 0);
  head.add(mouth);
  const crown = new THREE.Object3D();
  crown.name = 'bear-crown';
  crown.position.set(3, 11, 0);
  head.add(crown);

  const arm = (name: string, z: number) => {
    const limb = makeLimb(
      body,
      name,
      BEAR_SHOULDER.x,
      BEAR_SHOULDER.y,
      z,
      9,
      8.5,
      3.4,
      matte(FUR),
      matte(FUR_DARK),
    );
    // Turn the sole first, then aim the paw, so a pressed paw keeps its toes pointing up.
    limb.end.rotation.order = 'ZYX';
    paw(limb.end, name, 3.4, HONEY);
    return limb;
  };
  const arms: [Limb, Limb] = [arm('bear-arm-left', BEAR_ARM_Z), arm('bear-arm-right', -BEAR_ARM_Z)];
  const leg = (name: string, z: number) => {
    const limb = makeLimb(
      root,
      name,
      0,
      BEAR_WALK_HIP,
      z,
      8.5,
      8,
      4.2,
      matte(FUR),
      matte(FUR_DARK),
    );
    paw(limb.end, name, 4.6, PAD);
    return limb;
  };
  const legs: [Limb, Limb] = [leg('bear-leg-left', LEG_Z), leg('bear-leg-right', -LEG_Z)];
  const frontSole = soleDepth(arms[0].end, 0);
  const soles = arms.map((a, i) => {
    const marker = new THREE.Object3D();
    marker.name = `bear-sole-${i}`;
    marker.position.set(3.4 * 0.45, -frontSole, 0);
    a.end.add(marker);
    return marker;
  });
  const [soleLeft, soleRight] = soles;
  if (!soleLeft || !soleRight) throw new Error('Missing bear soles');
  models.set(root, {
    plan,
    body,
    torso,
    neck,
    head,
    jaw,
    eyes,
    lashes,
    cheeks,
    ears,
    nose,
    mouthInside,
    tail,
    arms,
    legs,
    soles: [soleLeft, soleRight],
    mouth,
    crown,
    frontSole,
    hindSole: soleDepth(legs[0].end, 0),
    hindHeel: soleDepth(legs[0].end, Math.PI / 2),
  });
  bearPose(root, BEAR_REST);
  return root;
}

export function bearModel(root: THREE.Group): BearModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native bear');
  return model;
}

/** A paw or foot target in root space, with the paw's angle in root space. */
export interface BearReach {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}
export interface BearPoseInput {
  /** Distance walked in model units; planted feet stay put while it is unchanged. */
  readonly walked: number;
  /** Lowers lifted feet onto the floor without sliding them. */
  readonly planted: number;
  readonly hip: { readonly x: number; readonly y: number };
  /** Spine angle: 0 on all fours, about 1.2 sitting up, nose up positive. */
  readonly pitch: number;
  readonly roll: number;
  /** Head angle in root space, so it stays level however the spine is pitched. */
  readonly headPitch: number;
  readonly headTurn: number;
  readonly headTilt: number;
  readonly jaw: number;
  readonly eyes: number;
  readonly cheeks: number;
  readonly ears: number;
  readonly sniff: number;
  readonly breath: number;
  readonly tail: number;
  /** Hind feet [left, right]; null follows the walk cycle. */
  readonly feet: readonly [BearReach | null, BearReach | null];
  /** Front paws [left, right]; null follows the walk cycle. */
  readonly paws: readonly [BearReach | null, BearReach | null];
  /** Turns each front sole toward the card (radians about the paw's length). */
  readonly press: readonly [number, number];
}
export const BEAR_REST: BearPoseInput = {
  walked: 0,
  planted: 1,
  hip: { x: 0, y: BEAR_WALK_HIP },
  pitch: 0,
  roll: 0,
  headPitch: 0,
  headTurn: 0,
  headTilt: 0,
  jaw: 0,
  eyes: 1,
  cheeks: 0,
  ears: 0,
  sniff: 0,
  breath: 0,
  tail: 0,
  feet: [null, null],
  paws: [null, null],
  press: [0, 0],
};

/** Shoulder of an arm in root space for a given hip and spine pitch. */
export function bearShoulder(hip: { readonly x: number; readonly y: number }, pitch: number) {
  return {
    x: hip.x + Math.cos(pitch) * BEAR_SHOULDER.x - Math.sin(pitch) * BEAR_SHOULDER.y,
    y: hip.y + Math.sin(pitch) * BEAR_SHOULDER.x + Math.cos(pitch) * BEAR_SHOULDER.y,
  };
}

/** Reaches a front paw to a root-space target; the arm hangs from the pitched body. */
export function bearReachPaw(
  root: THREE.Group,
  i: 0 | 1,
  q: BearPoseInput,
  target: BearReach,
  press: number,
) {
  const m = bearModel(root);
  const arm = m.arms[i];
  const dx = target.x - q.hip.x,
    dy = target.y - q.hip.y;
  const c = Math.cos(q.pitch),
    s = Math.sin(q.pitch);
  reach(
    arm,
    c * dx + s * dy - BEAR_SHOULDER.x,
    -s * dx + c * dy - BEAR_SHOULDER.y,
    -1,
    target.angle - q.pitch,
  );
  arm.end.rotation.x = press;
}

export function bearPose(root: THREE.Group, q: BearPoseInput) {
  const m = bearModel(root);
  m.body.position.set(q.hip.x, q.hip.y, 0);
  m.body.rotation.set(0, 0, q.pitch);
  m.torso.rotation.set(q.roll, 0, 0);
  const b = q.breath;
  m.torso.scale.set(1 + 0.012 * b, 1 + 0.035 * b, 1 + 0.03 * b);
  m.tail.rotation.z = q.tail * 0.5;
  m.tail.position.y = 3.6 + q.tail * 0.6;
  m.neck.rotation.z = -q.pitch;
  m.head.rotation.set(q.headTilt, q.headTurn, q.headPitch);
  m.jaw.rotation.z = -0.62 * q.jaw;
  m.mouthInside.visible = q.jaw > 0.05;
  m.mouthInside.scale.set(2.9, 0.4 + 1.6 * Math.min(1, q.jaw), 2.6);
  const open = Math.max(0, Math.min(1, q.eyes));
  m.eyes.forEach((eye) => {
    eye.scale.y = Math.max(0.06, open);
    eye.visible = open > 0.12;
  });
  m.lashes.forEach((lash) => (lash.visible = open <= 0.12));
  m.cheeks.forEach((cheek) =>
    cheek.scale.set(
      4.2 * (1 + 0.4 * q.cheeks),
      3.6 * (1 + 0.35 * q.cheeks),
      3.2 * (1 + 0.6 * q.cheeks),
    ),
  );
  m.ears.forEach((ear, i) => (ear.rotation.z = q.ears * 0.3 + (i ? 0.04 : -0.04) * q.sniff));
  m.nose.scale.set(
    1.9 * (1 + 0.16 * q.sniff),
    1.35 * (1 - 0.12 * q.sniff),
    2.4 * (1 + 0.12 * q.sniff),
  );
  m.legs.forEach((leg, i) => {
    leg.root.position.set(q.hip.x, q.hip.y, i ? -LEG_Z : LEG_Z);
    const foot = q.feet[i];
    if (foot) {
      reach(leg, foot.x - q.hip.x, foot.y - q.hip.y, 1, foot.angle);
      return;
    }
    const step = gait(q.walked, BEAR_STRIDE, i ? 0.5 : 0, 3.2);
    reach(
      leg,
      step.x + (i ? -0.8 : 0.8) - q.hip.x,
      m.hindSole + step.y * (1 - q.planted) - q.hip.y,
      1,
      0,
    );
  });
  const shoulder = bearShoulder(q.hip, q.pitch);
  ([0, 1] as const).forEach((i) => {
    const target = q.paws[i];
    if (target) {
      bearReachPaw(root, i, q, target, q.press[i]);
      return;
    }
    const step = gait(q.walked, BEAR_STRIDE, i ? 0.75 : 0.25, 2.8);
    bearReachPaw(
      root,
      i,
      q,
      { x: shoulder.x + 1 + step.x, y: m.frontSole + step.y * (1 - q.planted), angle: 0 },
      q.press[i],
    );
  });
}
