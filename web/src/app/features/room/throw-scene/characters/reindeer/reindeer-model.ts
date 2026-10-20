import * as THREE from 'three';
import { reindeerPlan, type ReindeerPlan } from './reindeer-choreography';
import {
  gait,
  glossy,
  glow,
  makeLimb,
  matte,
  mix,
  oval,
  part,
  reachIn,
  type Limb,
} from '../../kit';

const COAT = 0x9a6440,
  COAT_DARK = 0x6e4529,
  CREAM = 0xe8d0a6,
  WHITE = 0xf6efe2,
  LEG = 0x7d4e31,
  LEG_DARK = 0x56361f,
  HOOF = 0x2a2023,
  ANTLER = 0xd9c59c,
  NOSE = 0xd8343f,
  COLLAR = 0xb8202f,
  BELL = 0xf2c14e;

/** Body origin height above the floor at rest, in model units. */
export const REINDEER_BODY_Y = 27;
/** Sole contact point below and ahead of the ankle, measured from the hoof geometry. */
export const REINDEER_SOLE = { x: 0.9, y: 3.4 } as const;
const NECK_REST = -0.55,
  HEAD_REST = 0.45,
  EAR_REST = -0.45;
/** Front-near, front-far, back-near, back-far: limb roots in body space; near legs face +z. */
const LEG_ROOTS = [
  [10.5, -4, 4.4],
  [10.5, -4, -4.4],
  [-10.5, -4, 4.2],
  [-10.5, -4, -4.2],
] as const;
/** Front knees (carpi) fold forward, hind hocks fold back. */
const BENDS = [1, 1, -1, -1] as const;

/** Sole target in actor-root space (x forward, y up, floor at 0) and the hoof's angle there. */
export interface ReindeerHoof {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}
export type ReindeerHooves = readonly [ReindeerHoof, ReindeerHoof, ReindeerHoof, ReindeerHoof];
export function fourHooves(f: (i: number) => ReindeerHoof): ReindeerHooves {
  return [f(0), f(1), f(2), f(3)];
}
export const REINDEER_REST: ReindeerHooves = [
  { x: 11.6, y: 0, angle: 0 },
  { x: 10.4, y: 0, angle: 0 },
  { x: -9.6, y: 0, angle: 0 },
  { x: -11, y: 0, angle: 0 },
];
export function mixHooves(a: ReindeerHooves, b: ReindeerHooves, t: number): ReindeerHooves {
  return fourHooves((i) => {
    const p = a[i] ?? REINDEER_REST[0],
      q = b[i] ?? REINDEER_REST[0];
    return { x: mix(p.x, q.x, t), y: mix(p.y, q.y, t), angle: mix(p.angle, q.angle, t) };
  });
}

export type ReindeerGait = 'trot' | 'bound';
const GAIT_OFFSETS: Record<ReindeerGait, readonly number[]> = {
  trot: [0, 0.5, 0.5, 0],
  bound: [0, 0.1, 0.55, 0.65],
};
export const reindeerStrideLength = (style: ReindeerGait, stride: number) =>
  (style === 'bound' ? 18 : 14) * stride;
/** Hoof targets for travel: stance hooves stay fixed in the world while the body passes over them. */
export function reindeerStride(
  walked: number,
  style: ReindeerGait,
  planted: number,
  stride: number,
): ReindeerHooves {
  const length = reindeerStrideLength(style, stride),
    lift = style === 'bound' ? 6 : 3.6,
    air = 1 - planted;
  return fourHooves((i) => {
    const rest = REINDEER_REST[i] ?? REINDEER_REST[0];
    const g = gait(walked, length, GAIT_OFFSETS[style][i] ?? 0, lift);
    return { x: rest.x + g.x, y: g.y * air, angle: -0.7 * Math.sin(Math.PI * g.swing) * air };
  });
}

export interface ReindeerModel {
  readonly plan: ReindeerPlan;
  readonly body: THREE.Group;
  readonly neck: THREE.Group;
  readonly head: THREE.Group;
  readonly legs: readonly [Limb, Limb, Limb, Limb];
  readonly soles: readonly [THREE.Object3D, THREE.Object3D, THREE.Object3D, THREE.Object3D];
  readonly ears: readonly [THREE.Group, THREE.Group];
  readonly eyes: readonly [THREE.Group, THREE.Group];
  readonly brows: readonly [THREE.Mesh, THREE.Mesh];
  readonly blush: readonly THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[];
  readonly tail: THREE.Group;
  readonly bell: THREE.Group;
  /** Front of the nose, where a rubbing hoof lands. */
  readonly nose: THREE.Object3D;
  readonly sweat: THREE.Object3D;
}
const models = new WeakMap<THREE.Group, ReindeerModel>();

function marker(parent: THREE.Object3D, name: string, x: number, y: number, z: number) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

function tube(
  parent: THREE.Object3D,
  name: string,
  points: readonly (readonly [number, number, number])[],
  radius: number,
) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const mesh = part(
    parent,
    name,
    new THREE.TubeGeometry(curve, 10, radius, 6, false),
    matte(ANTLER, 0.6),
  );
  const [x, y, z] = points.at(-1) ?? [0, 0, 0];
  oval(
    parent,
    `${name}-tip`,
    matte(0xf0e2c0, 0.55),
    x,
    y,
    z,
    radius * 0.95,
    radius * 0.95,
    radius * 0.95,
  );
  return mesh;
}

function hoof(limb: Limb, name: string) {
  oval(limb.end, `${name}-fetlock`, matte(CREAM, 0.95), 0, -0.3, 0, 1.75, 1.3, 1.75);
  oval(limb.end, `${name}-pastern`, matte(LEG_DARK, 0.85), 0.3, -1.4, 0, 1.3, 1.1, 1.3);
  // Split hooves: two glossy toes whose undersides sit exactly on the sole line.
  for (const z of [0.72, -0.72])
    oval(limb.end, `${name}-toe`, glossy(HOOF, 0.35), REINDEER_SOLE.x, -2.15, z, 1.55, 1.25, 0.78);
  oval(limb.end, `${name}-dewclaw`, glossy(HOOF, 0.4), -1.3, -1, 0, 0.5, 0.6, 0.5);
  return marker(limb.end, `${name}-sole`, REINDEER_SOLE.x, -REINDEER_SOLE.y, 0);
}

function face(head: THREE.Group, z: number) {
  const s = Math.sign(z);
  const eye = new THREE.Group();
  eye.name = s > 0 ? 'reindeer-eye-near' : 'reindeer-eye-far';
  eye.position.set(2.5, 1.5, z);
  head.add(eye);
  oval(eye, 'reindeer-eye-white', glossy(0xfffaf0, 0.3), 0, 0, 0, 1.9, 2.2, 0.9);
  oval(eye, 'reindeer-iris', glossy(0x4a2a16, 0.3), 0.45, -0.1, s * 0.5, 1.35, 1.55, 0.5);
  oval(eye, 'reindeer-pupil', glossy(0x120a06, 0.2), 0.6, -0.1, s * 0.82, 0.62, 0.78, 0.3);
  oval(eye, 'reindeer-eye-glint', glow(0xffffff), 0.95, 0.6, s * 1.05, 0.36, 0.36, 0.2);
  const brow = oval(
    head,
    'reindeer-brow',
    matte(COAT_DARK, 0.9),
    2.6,
    4.1,
    z * 1.03,
    1.8,
    0.42,
    0.45,
  );
  const blush = part(
    head,
    'reindeer-blush',
    new THREE.SphereGeometry(1, 12, 8),
    glow(0xff7a8e, 0),
    4.2,
    -1.7,
    z * 1.05,
  );
  blush.scale.set(1.5, 0.9, 0.35);
  const ear = new THREE.Group();
  ear.name = s > 0 ? 'reindeer-ear-near' : 'reindeer-ear-far';
  ear.position.set(-2.2, 3.4, z * 0.95);
  ear.rotation.y = -s * 0.35;
  head.add(ear);
  oval(ear, 'reindeer-ear-fur', matte(COAT, 0.85), -2.7, 0, 0, 3.5, 1.45, 0.7);
  oval(ear, 'reindeer-ear-inner', matte(0xe0a3a0, 0.8), -2.5, 0, s * 0.45, 2.6, 0.85, 0.3);
  // Young, branching antlers: a curved beam with a brow tine and a back tine.
  const antler = new THREE.Group();
  antler.name = 'reindeer-antler';
  antler.position.set(-0.8, 4.4, s * 2);
  head.add(antler);
  tube(
    antler,
    'reindeer-antler-beam',
    [
      [0, 0, 0],
      [-1.6, 4.6, s * 0.8],
      [-0.8, 9.4, s * 1.6],
      [1.8, 12.4, s * 2],
    ],
    0.72,
  );
  tube(
    antler,
    'reindeer-antler-brow-tine',
    [
      [-1.3, 3.6, s * 0.6],
      [1, 5.6, s * 0.9],
      [2.8, 6.4, s * 1.1],
    ],
    0.55,
  );
  tube(
    antler,
    'reindeer-antler-back-tine',
    [
      [-1.1, 8, s * 1.4],
      [-3.2, 10.2, s * 1.9],
      [-4.4, 11.6, s * 2.1],
    ],
    0.5,
  );
  return { eye, brow, blush, ear };
}

export function makeReindeer(id: string): THREE.Group {
  const plan = reindeerPlan(id);
  const root = new THREE.Group();
  root.name = 'christmas-reindeer';
  const body = new THREE.Group();
  body.name = 'reindeer-body';
  body.position.set(0, REINDEER_BODY_Y, 0);
  root.add(body);
  oval(body, 'reindeer-torso', matte(COAT, 0.85), 0, 0, 0, 14, 7.6, 7);
  oval(body, 'reindeer-chest', matte(COAT, 0.85), 9, -0.6, 0, 7.5, 7.6, 6.6);
  oval(body, 'reindeer-rump', matte(COAT_DARK, 0.85), -9.5, 0.6, 0, 7.8, 7.4, 6.8);
  oval(body, 'reindeer-belly', matte(CREAM, 0.95), 0, -4.6, 0, 11, 3.4, 6);
  oval(body, 'reindeer-chest-ruff', matte(WHITE, 0.95), 13, -1.5, 0, 3.6, 5.6, 5.2);
  oval(body, 'reindeer-rump-patch', matte(WHITE, 0.95), -16.2, 1.2, 0, 2.4, 4.6, 4.6);
  for (const z of [6.5, -6.5])
    oval(body, 'reindeer-saddle', matte(COAT_DARK, 0.9), -1, 4.4, z * 0.8, 9, 2.6, 1.6);
  const tail = new THREE.Group();
  tail.name = 'reindeer-tail';
  tail.position.set(-17, 4.6, 0);
  body.add(tail);
  oval(tail, 'reindeer-tail-top', matte(COAT_DARK, 0.85), -1.7, 0.4, 0, 2.6, 1.5, 1.6);
  oval(tail, 'reindeer-tail-under', matte(WHITE, 0.95), -1.7, -0.6, 0, 2.3, 1.1, 1.4);

  const neck = new THREE.Group();
  neck.name = 'reindeer-neck';
  neck.position.set(12, 3, 0);
  body.add(neck);
  part(
    neck,
    'reindeer-neck-fur',
    new THREE.CylinderGeometry(2.8, 3.8, 13, 12),
    matte(COAT, 0.85),
    0,
    6,
    0,
  );
  oval(neck, 'reindeer-throat', matte(CREAM, 0.95), 1.6, 4, 0, 2, 5.5, 3);
  const collar = part(
    neck,
    'reindeer-collar',
    new THREE.TorusGeometry(3.6, 0.75, 6, 18),
    glossy(COLLAR, 0.5),
    0,
    2.2,
    0,
  );
  collar.rotation.x = Math.PI / 2;
  const bell = new THREE.Group();
  bell.name = 'reindeer-bell';
  bell.position.set(3.8, 1.8, 0);
  neck.add(bell);
  oval(bell, 'reindeer-bell-shell', glossy(BELL, 0.2), 0.6, -1.4, 0, 1.45, 1.45, 1.45);
  oval(bell, 'reindeer-bell-slit', matte(0x5a3a10, 0.6), 1.1, -2.2, 0, 0.9, 0.25, 0.9);
  const head = new THREE.Group();
  head.name = 'reindeer-head';
  head.rotation.order = 'YZX';
  head.position.set(0, 12, 0);
  neck.add(head);
  oval(head, 'reindeer-skull', matte(COAT, 0.85), 0, 0.4, 0, 5.6, 5, 4.4);
  oval(head, 'reindeer-forelock', matte(CREAM, 0.95), -0.6, 4.6, 0, 2.4, 1.3, 2);
  oval(head, 'reindeer-muzzle', matte(CREAM, 0.9), 6.5, -2.3, 0, 5.2, 3.2, 3.2);
  oval(head, 'reindeer-nose', glossy(NOSE, 0.25), 11.3, -1.8, 0, 1.9, 1.75, 2);
  oval(head, 'reindeer-nose-glint', glow(0xffd6d6), 12.1, -0.9, 1.25, 0.45, 0.35, 0.3);
  oval(head, 'reindeer-mouth', matte(0x4a2a1a, 0.8), 8.2, -4.6, 0, 3, 0.35, 2.4);
  const near = face(head, 3.5),
    far = face(head, -3.5);
  const nose = marker(head, 'reindeer-nose-front', 12.6, -2.6, 0);
  const sweat = marker(head, 'reindeer-sweat', -4.2, 5, 0);

  const legs = LEG_ROOTS.map(([x, y, z], i) => {
    const front = i < 2;
    return makeLimb(
      body,
      `reindeer-leg-${i}`,
      x,
      y,
      z,
      10,
      10.5,
      front ? 1.75 : 1.95,
      matte(i % 2 ? LEG_DARK : LEG, 0.85),
      matte(COAT_DARK, 0.85),
    );
  });
  const [l0, l1, l2, l3] = legs;
  if (!l0 || !l1 || !l2 || !l3) throw new Error('Reindeer needs four legs');
  const soles = [
    hoof(l0, 'reindeer-hoof-0'),
    hoof(l1, 'reindeer-hoof-1'),
    hoof(l2, 'reindeer-hoof-2'),
    hoof(l3, 'reindeer-hoof-3'),
  ] as const;
  // Thighs give the hind legs a deer's heavy haunch instead of a straight stick.
  for (const z of [5.4, -5.4])
    oval(body, 'reindeer-haunch', matte(COAT_DARK, 0.85), -10.5, -2.4, z, 5, 5.4, 1.8);
  models.set(root, {
    plan,
    body,
    neck,
    head,
    legs: [l0, l1, l2, l3],
    soles,
    ears: [near.ear, far.ear],
    eyes: [near.eye, far.eye],
    brows: [near.brow, far.brow],
    blush: [near.blush, far.blush],
    tail,
    bell,
    nose,
    sweat,
  });
  reindeerPose(root, REINDEER_POSE);
  return root;
}

export function reindeerModel(root: THREE.Group): ReindeerModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native reindeer');
  return model;
}

export interface ReindeerPose {
  /** Sole targets in actor-root space; soles meet them exactly whenever the leg can reach. */
  readonly hooves: ReindeerHooves;
  /** Body raise above its rest height (negative crouches). */
  readonly lift: number;
  /** Body pitch, positive lifts the chest. */
  readonly pitch: number;
  readonly neck: number;
  readonly headTilt: number;
  readonly headTurn: number;
  /** Ear droop: positive lays the ears back and down, negative pricks them up. */
  readonly ears: number;
  /** Quick twitch of the camera-side ear. */
  readonly flick: number;
  readonly lids: number;
  readonly brows: number;
  readonly blush: number;
  /** Tail angle: negative raises it. */
  readonly tail: number;
  readonly bell: number;
  /** Draws the camera-side front hoof up to rub the nose. */
  readonly rub: number;
  /** Phase of the rubbing circle the hoof scrubs around the nose. */
  readonly scrub: number;
  /** Index of the camera-side front leg (0 when the model's +z faces the camera). */
  readonly near: 0 | 1;
}
export const REINDEER_POSE: ReindeerPose = {
  hooves: REINDEER_REST,
  lift: 0,
  pitch: 0,
  neck: 0,
  headTilt: 0,
  headTurn: 0,
  ears: 0,
  flick: 0,
  lids: 1,
  brows: 0,
  blush: 0,
  tail: 0,
  bell: 0,
  rub: 0,
  scrub: 0,
  near: 0,
};
export const REINDEER_RUB_ANGLE = 1.5;

const nosePoint = new THREE.Vector3();
export function reindeerPose(root: THREE.Group, q: ReindeerPose) {
  const m = reindeerModel(root);
  m.body.position.set(0, REINDEER_BODY_Y + q.lift, 0);
  m.body.rotation.set(0, 0, q.pitch);
  m.neck.rotation.set(0, 0, NECK_REST + q.neck);
  m.head.rotation.set(0, q.headTurn, HEAD_REST + q.headTilt);
  m.ears.forEach((ear, i) => {
    ear.rotation.z = EAR_REST + 0.7 * q.ears - (i === q.near ? 0.6 * q.flick : 0);
  });
  for (const eye of m.eyes) eye.scale.y = Math.max(0.08, q.lids);
  for (const brow of m.brows) {
    // Worried brows tip up at the inner (front) end and lift.
    brow.rotation.z = 0.4 * q.brows;
    brow.position.y = 4.1 + 0.5 * q.brows;
  }
  for (const blush of m.blush) {
    blush.visible = q.blush > 0.01;
    blush.material.opacity = 0.75 * q.blush;
  }
  m.tail.rotation.z = q.tail;
  m.bell.rotation.z = q.bell;
  root.updateMatrixWorld(true);
  let nose: { x: number; y: number } | null = null;
  if (q.rub > 0) {
    m.nose.getWorldPosition(nosePoint);
    root.worldToLocal(nosePoint);
    nose = { x: nosePoint.x + 1.3 * Math.cos(q.scrub), y: nosePoint.y + 0.9 * Math.sin(q.scrub) };
  }
  m.legs.forEach((leg, i) => {
    let h = q.hooves[i] ?? REINDEER_REST[0];
    if (nose && i === q.near)
      h = {
        x: mix(h.x, nose.x, q.rub),
        y: mix(h.y, nose.y, q.rub),
        angle: mix(h.angle, REINDEER_RUB_ANGLE, q.rub),
      };
    const c = Math.cos(h.angle),
      s = Math.sin(h.angle);
    // The ankle sits so the rotated sole marker lands exactly on the target.
    const ax = h.x - (c * REINDEER_SOLE.x + s * REINDEER_SOLE.y),
      ay = h.y - (s * REINDEER_SOLE.x - c * REINDEER_SOLE.y);
    // A rubbing foreleg folds its knee under; the trick only starts the rub with the leg straight.
    const bend = nose && i === q.near ? -1 : (BENDS[i] ?? 1);
    reachIn(leg, root, ax, ay, bend, h.angle - q.pitch);
  });
}
