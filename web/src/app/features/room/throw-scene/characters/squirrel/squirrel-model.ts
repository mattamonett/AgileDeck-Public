import * as THREE from 'three';
import {
  ACORN_CAP_AT,
  ACORN_CAP_H,
  ACORN_NUT,
  ACORN_R,
  ACORN_TOP,
  squirrelPlan,
  type SquirrelPlan,
} from './squirrel-choreography';
import { gait, glossy, glow, makeLimb, matte, mix, oval, part, reach, type Limb } from '../../kit';

const FUR = 0xc2672c,
  FUR_DARK = 0x8f4622,
  CREAM = 0xf4e0b8,
  CHEEK = 0xd98a4e,
  TAIL = 0xc87132,
  FRINGE = 0xf0bd80,
  PAW = 0x6a381d,
  EAR_IN = 0xe49a84,
  TUFT = 0x56290f;

/** Root sits on the floor under the body; x is forward, y up, z toward the viewer. */
export const SQ_HIP = new THREE.Vector2(-7, 11);
export const SQ_SHOULDER = new THREE.Vector2(13, -0.5);
export const SQ_NECK = new THREE.Vector2(19.5, 5.8);
const SQ_TAIL = new THREE.Vector2(-6.5, 2.5);
/** Ankle heights that put the hind sole and the front palm exactly on the floor. */
export const SQ_HIND_SOLE = 1.7;
export const SQ_PAW_SOLE = 1.85;
export const SQ_HIND_X = -4;
export const SQ_FRONT_X = 10.5;
export const SQ_STRIDE = 13;
export const SQ_TAIL_SEGMENTS = 8;
const TAIL_REST = [0.3, 0.18, 0.08, -0.1, -0.32, -0.48, -0.58, -0.62] as const;
const TAIL_R = [2.6, 3.6, 4.4, 4.9, 5.0, 4.7, 4.0, 3.0] as const;
const TAIL_LEN = 4.4;

export interface SquirrelModel {
  readonly plan: SquirrelPlan;
  readonly body: THREE.Group;
  readonly head: THREE.Group;
  readonly eyes: readonly THREE.Group[];
  readonly ears: readonly THREE.Group[];
  readonly cheeks: readonly THREE.Mesh[];
  readonly tail: readonly THREE.Group[];
  readonly arms: readonly [Limb, Limb];
  readonly legs: readonly [Limb, Limb];
  /** Pinch points between the fingers of each front paw. */
  readonly paws: readonly [THREE.Object3D, THREE.Object3D];
  readonly fingers: readonly THREE.Group[];
  /** Just outside the lips, where acorns enter and leave the cheek pouches. */
  readonly mouth: THREE.Object3D;
  /** Inside the skull, hidden by the head. */
  readonly inside: THREE.Object3D;
  /** Centre of the giant acorn while its cap is held in the incisors. */
  readonly hold: THREE.Object3D;
}
const models = new WeakMap<THREE.Group, SquirrelModel>();

/** Acorn with its axis on +y: a turned nut, a domed cap with a rim, and a stem. Lying, it rests on the cap rim. */
export function makeAcorn(name: string, giant: boolean): THREE.Group {
  const acorn = new THREE.Group();
  acorn.name = name;
  const profile = ACORN_NUT.map(([r, y]) => new THREE.Vector2(r, y));
  part(
    acorn,
    `${name}-nut`,
    new THREE.LatheGeometry(profile, 14),
    glossy(giant ? 0xc98f45 : 0xb9813d, 0.35),
  );
  const cap = part(
    acorn,
    `${name}-cap`,
    new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    matte(giant ? 0x704826 : 0x684322, 0.95),
    0,
    ACORN_CAP_AT,
    0,
  );
  cap.scale.set(ACORN_R, ACORN_CAP_H, ACORN_R);
  const rim = part(
    acorn,
    `${name}-rim`,
    new THREE.TorusGeometry(ACORN_R - 0.32, 0.32, 6, 18),
    matte(0x4f3119, 0.95),
    0,
    ACORN_CAP_AT,
    0,
  );
  rim.rotation.x = Math.PI / 2;
  const stem = part(
    acorn,
    `${name}-stem`,
    new THREE.CylinderGeometry(0.28, 0.4, 1.3, 6),
    matte(0x4a2d16, 0.9),
    0,
    ACORN_TOP + 0.45,
    0,
  );
  stem.rotation.z = 0.25;
  return acorn;
}

export function makeSquirrel(id: string): THREE.Group {
  const plan = squirrelPlan(id);
  const root = new THREE.Group();
  root.name = 'thanksgiving-squirrel';
  const body = new THREE.Group();
  body.name = 'squirrel-body';
  body.position.set(SQ_HIP.x, SQ_HIP.y, 0);
  root.add(body);
  oval(body, 'squirrel-haunch', matte(FUR, 0.85), 0, 0.5, 0, 8.4, 8.4, 7.6);
  oval(body, 'squirrel-torso', matte(FUR, 0.85), 6.5, 1.4, 0, 8.6, 6.8, 6.4);
  oval(body, 'squirrel-chest', matte(FUR, 0.85), 13.5, 2, 0, 6.2, 6.6, 5.8);
  oval(body, 'squirrel-belly', matte(CREAM, 0.9), 8, -1.9, 0, 8.2, 4.6, 5);
  oval(body, 'squirrel-bib', matte(CREAM, 0.9), 16, 0.6, 0, 4.2, 5.2, 4.4);

  const head = new THREE.Group();
  head.name = 'squirrel-head';
  head.position.set(SQ_NECK.x, SQ_NECK.y, 0);
  body.add(head);
  oval(head, 'squirrel-skull', matte(FUR, 0.85), 0, 0, 0, 7.2, 6.6, 6);
  oval(head, 'squirrel-muzzle', matte(FUR, 0.85), 5, -1.8, 0, 4.2, 3.4, 3.6);
  oval(head, 'squirrel-chin', matte(CREAM, 0.9), 5.4, -3.6, 0, 3.4, 1.9, 3);
  oval(head, 'squirrel-nose', glossy(0x2b1a14, 0.3), 9, -0.9, 0, 1.15, 0.95, 1.25);
  part(
    head,
    'squirrel-teeth',
    new THREE.BoxGeometry(0.9, 1.5, 1.6),
    matte(0xfff4dc, 0.4),
    8.1,
    -4.4,
    0,
  );
  const cheeks = [1, -1].map((z) =>
    oval(head, 'squirrel-cheek', matte(CHEEK, 0.85), 3.8, -2.6, z * 3.5, 2.4, 2.1, 2.2),
  );
  const eyes = [1, -1].map((z) => {
    const eye = new THREE.Group();
    eye.name = 'squirrel-eye';
    eye.position.set(2.6, 1.5, z * 5.3);
    head.add(eye);
    oval(eye, 'squirrel-eye-ring', matte(CREAM, 0.8), -0.1, 0, -z * 0.35, 2.95, 3.3, 1);
    oval(eye, 'squirrel-eyeball', glossy(0x140f0c, 0.15), 0, 0, 0, 2.4, 2.85, 1.5);
    oval(eye, 'squirrel-eye-glint', glow(0xffffff), 0.75, 1.1, z * 1.25, 0.78, 0.9, 0.3);
    oval(eye, 'squirrel-eye-glint-small', glow(0xfff4e0), -0.7, -1.05, z * 1.2, 0.36, 0.36, 0.2);
    return eye;
  });
  const ears = [1, -1].map((z) => {
    const ear = new THREE.Group();
    ear.name = 'squirrel-ear';
    ear.position.set(-2, 5.4, z * 2.9);
    ear.rotation.x = -z * 0.25;
    head.add(ear);
    oval(ear, 'squirrel-ear-outer', matte(FUR, 0.85), 0, 2.6, 0, 1.7, 3.2, 0.9);
    oval(ear, 'squirrel-ear-inner', matte(EAR_IN, 0.8), 0.25, 2.4, z * 0.45, 1, 2.2, 0.45);
    const tuft = part(
      ear,
      'squirrel-ear-tuft',
      new THREE.ConeGeometry(0.9, 3.8, 7),
      matte(TUFT, 0.95),
      -0.3,
      6.6,
      0,
    );
    tuft.rotation.z = 0.3;
    return ear;
  });
  const marker = (parent: THREE.Object3D, name: string, x: number, y: number) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, 0);
    parent.add(o);
    return o;
  };
  const mouth = marker(head, 'squirrel-mouth', 9.6, -3.4);
  const inside = marker(head, 'squirrel-inside', 0.8, -0.6);
  const hold = marker(head, 'squirrel-hold', 8.3 + 2.5 * plan.giant, -4.2);

  const arm = (name: string, z: number) => {
    const limb = makeLimb(
      body,
      name,
      SQ_SHOULDER.x,
      SQ_SHOULDER.y,
      z,
      4.8,
      7,
      1.35,
      matte(FUR, 0.85),
      matte(FUR_DARK, 0.85),
    );
    oval(limb.end, `${name}-palm`, matte(PAW, 0.8), 0.3, -0.6, 0, 1.25, 1.25, 1);
    const fingers = new THREE.Group();
    fingers.name = `${name}-fingers`;
    fingers.position.set(0.9, -0.55, 0);
    limb.end.add(fingers);
    for (let f = 0; f < 3; f++)
      oval(
        fingers,
        `${name}-finger`,
        matte(PAW, 0.8),
        0.5,
        -0.35,
        (f - 1) * 0.55,
        0.45,
        0.75,
        0.38,
      );
    const pinch = marker(limb.end, `${name}-pinch`, 0, 0);
    return { limb, fingers, pinch };
  };
  const near = arm('squirrel-arm-near', 3.4),
    far = arm('squirrel-arm-far', -3.4);
  const leg = (name: string, z: number) => {
    const limb = makeLimb(
      root,
      name,
      SQ_HIP.x,
      SQ_HIP.y,
      z,
      7.2,
      6.8,
      2.1,
      matte(FUR, 0.85),
      matte(FUR_DARK, 0.85),
    );
    oval(limb.end, `${name}-foot`, matte(FUR_DARK, 0.85), 2.6, -0.7, 0, 3.6, 1, 1.6);
    for (let t = 0; t < 3; t++)
      oval(limb.end, `${name}-toe`, matte(PAW, 0.8), 5.7, -0.85, (t - 1) * 0.7, 0.9, 0.6, 0.4);
    return limb;
  };
  const legs: [Limb, Limb] = [leg('squirrel-leg-near', 4.6), leg('squirrel-leg-far', -4.6)];

  // A segmented, curled plume: each puff overlaps the next, with a frosted rim on the outside of the curl.
  const tail: THREE.Group[] = [];
  let parent: THREE.Object3D = body;
  for (let i = 0; i < SQ_TAIL_SEGMENTS; i++) {
    const seg = new THREE.Group();
    seg.name = `squirrel-tail-${i}`;
    seg.position.set(i ? 0 : SQ_TAIL.x, i ? TAIL_LEN : SQ_TAIL.y, 0);
    parent.add(seg);
    const r = TAIL_R[i] ?? 3;
    oval(
      seg,
      `squirrel-tail-puff-${i}`,
      matte(TAIL, 0.95),
      0,
      TAIL_LEN * 0.5,
      0,
      r,
      TAIL_LEN * 1.1,
      r * 0.82,
    );
    if (i >= 2)
      oval(
        seg,
        `squirrel-tail-fringe-${i}`,
        matte(FRINGE, 0.95),
        -r * 0.22,
        TAIL_LEN * 0.5,
        0,
        r * 1.04,
        TAIL_LEN * 1.15,
        r * 0.55,
      );
    tail.push(seg);
    parent = seg;
  }
  models.set(root, {
    plan,
    body,
    head,
    eyes,
    ears,
    cheeks,
    tail,
    arms: [near.limb, far.limb],
    legs,
    paws: [near.pinch, far.pinch],
    fingers: [near.fingers, far.fingers],
    mouth,
    inside,
    hold,
  });
  squirrelPose(root, SQUIRREL_REST);
  return root;
}

export function squirrelModel(root: THREE.Group): SquirrelModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native squirrel');
  return model;
}

interface Target {
  readonly x: number;
  readonly y: number;
}
export interface SquirrelPose {
  /** Distance travelled in model units; planted feet stay put while it is unchanged. */
  readonly walked: number;
  /** Lowers lifted feet onto the floor while the body is not travelling. */
  readonly planted: number;
  /** Body pitch about the hip, positive nose-up (sitting on its haunches near 1). */
  readonly pitch: number;
  readonly crouch: number;
  readonly lift: number;
  /** Head pitch relative to level, and its turn toward the viewer. */
  readonly headTilt: number;
  readonly headTurn: number;
  readonly cheeks: number;
  readonly blink: number;
  readonly ears: number;
  /** Front paw target in root space, blended from the paws' floor positions by `frontWeight`. */
  readonly front: Target;
  readonly frontWeight: number;
  /** Draws the paw target toward the lips. */
  readonly toMouth: number;
  readonly pinch: number;
  readonly hind: Target;
  readonly hindWeight: number;
  /** Extra bend per tail segment, for lag and flicks. */
  readonly tail: readonly number[];
}
export const SQUIRREL_REST: SquirrelPose = {
  walked: 0,
  planted: 1,
  pitch: 0,
  crouch: 0,
  lift: 0,
  headTilt: 0,
  headTurn: 0,
  cheeks: 1,
  blink: 0,
  ears: 0,
  front: { x: SQ_FRONT_X, y: SQ_PAW_SOLE },
  frontWeight: 0,
  toMouth: 0,
  pinch: 0,
  hind: { x: SQ_HIND_X, y: SQ_HIND_SOLE },
  hindWeight: 0,
  tail: [],
};

const scratch = new THREE.Vector3();
/** A marker's position in the squirrel's own root space. */
export function squirrelPoint(root: THREE.Group, marker: THREE.Object3D): THREE.Vector3 {
  root.updateWorldMatrix(true, true);
  return root.worldToLocal(marker.getWorldPosition(new THREE.Vector3()));
}

export function squirrelPose(root: THREE.Group, q: SquirrelPose) {
  const m = squirrelModel(root);
  const hipY = SQ_HIP.y - q.crouch + q.lift;
  m.body.position.set(SQ_HIP.x, hipY, 0);
  m.body.rotation.set(0, 0, q.pitch);
  // The head stays roughly level as the body rears up, then tilts and turns on its own.
  m.head.rotation.set(0, q.headTurn, -q.pitch + q.headTilt);
  m.cheeks.forEach((cheek, i) => {
    const z = i ? -1 : 1,
      k = q.cheeks;
    // Pouches swell down and out behind the muzzle, changing the jaw line's silhouette.
    cheek.position.set(3.8 - 1.1 * k, -2.6 - 1.5 * k, z * (3.5 + 1.2 * k));
    cheek.scale.set(2.4 + 2.2 * k, 2.1 + 2 * k, 2.2 + 2.4 * k);
  });
  for (const eye of m.eyes) eye.scale.set(1, Math.max(0.1, 1 - q.blink), 1);
  m.ears.forEach((ear, i) => (ear.rotation.z = 0.2 + q.ears * 0.35 + i * 0.04));
  m.tail.forEach((seg, i) => {
    seg.rotation.z = (TAIL_REST[i] ?? 0) + (q.tail[i] ?? 0) - (i === 0 ? q.pitch : 0);
  });
  m.legs.forEach((leg, i) => {
    const g = gait(q.walked, SQ_STRIDE, i * 0.06, 3.4);
    const fx = SQ_HIND_X + g.x,
      fy = SQ_HIND_SOLE + g.y * (1 - q.planted);
    leg.root.position.y = hipY;
    reach(
      leg,
      mix(fx, q.hind.x, q.hindWeight) - SQ_HIP.x,
      mix(fy, q.hind.y, q.hindWeight) - hipY,
      1,
      0,
    );
  });
  root.updateMatrixWorld(true);
  const lips =
    q.toMouth > 0 ? root.worldToLocal(m.mouth.getWorldPosition(scratch)) : scratch.set(0, 0, 0);
  const c = Math.cos(-q.pitch),
    s = Math.sin(-q.pitch);
  m.arms.forEach((arm, i) => {
    const g = gait(q.walked, SQ_STRIDE, 0.5 + i * 0.06, 3);
    const floorX = SQ_FRONT_X + g.x,
      floorY = SQ_PAW_SOLE + g.y * (1 - q.planted);
    const heldX = mix(q.front.x, lips.x, q.toMouth),
      heldY = mix(q.front.y, lips.y, q.toMouth);
    const dx = mix(floorX, heldX, q.frontWeight) - SQ_HIP.x,
      dy = mix(floorY, heldY, q.frontWeight) - hipY;
    reach(arm, dx * c - dy * s - SQ_SHOULDER.x, dx * s + dy * c - SQ_SHOULDER.y, -1);
    // Paws lie flat on the floor, and turn to grip whatever they hold.
    arm.end.rotation.z = mix(-q.pitch, arm.end.rotation.z, q.frontWeight);
  });
  for (const f of m.fingers) f.rotation.z = -0.9 * q.pinch;
}
