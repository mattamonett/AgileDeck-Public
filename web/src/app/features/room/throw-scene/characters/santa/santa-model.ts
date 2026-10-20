import * as THREE from 'three';
import { santaPlan, type SantaPlan } from './santa-choreography';
import {
  clamp,
  flat,
  glossy,
  glow,
  makeLimb,
  matte,
  oval,
  outline,
  part,
  reach,
  type Limb,
} from '../../kit';

const RED = 0xc8202f,
  RED_DARK = 0x9a1824,
  FUR = 0xfbf7ee,
  FUR_SHADE = 0xe8dfcf,
  SKIN = 0xf3c3a0,
  ROSE = 0xec8a86,
  BOOT = 0x241d1e,
  GOLD = 0xe6b34a,
  BURLAP = 0x93613a,
  BURLAP_DARK = 0x6e4426,
  HOLLY = 0x2f7a3a;

/** Standing hip height and the height of the ankle above the boot sole, in model units. */
export const SANTA_HIP = 15;
export const SANTA_ANKLE = 3.7;
export const SANTA_SHOULDER = new THREE.Vector3(1.2, 17.2, 8.2);
/** Sleigh: strut pivot height, base top, half width, panel height and strut length. */
export const SLEIGH_PIVOT = 4.9;
export const SLEIGH_BASE_TOP = SLEIGH_PIVOT + 1.4;
export const SLEIGH_HALF_WIDTH = 9.5;
export const SLEIGH_WALL = 9;
const STRUT = 4;
const RUNNER_FOLDED = 1.2;

export interface SantaModel {
  readonly plan: SantaPlan;
  readonly body: THREE.Group;
  readonly belly: THREE.Mesh;
  readonly head: THREE.Group;
  readonly eyes: readonly THREE.Mesh[];
  readonly mouth: THREE.Mesh;
  readonly hat: THREE.Group;
  readonly hatTip: THREE.Group;
  readonly arms: readonly [Limb, Limb];
  readonly legs: readonly [Limb, Limb];
  readonly sack: THREE.Group;
  readonly sackMouth: THREE.Object3D;
  readonly sackLip: THREE.Mesh;
  readonly sackHole: THREE.Mesh;
  readonly necks: readonly [THREE.Mesh, THREE.Mesh, THREE.Mesh];
  readonly sleigh: THREE.Group;
  readonly sleighSides: readonly [THREE.Group, THREE.Group];
  readonly sleighFront: THREE.Group;
  readonly runners: readonly [THREE.Group, THREE.Group];
  readonly struts: readonly THREE.Mesh[];
  /** Rail grips (near rear) used while pushing off, and side grips used while carrying it folded. */
  readonly railGrips: readonly [THREE.Object3D, THREE.Object3D];
  readonly carryGrips: readonly [THREE.Object3D, THREE.Object3D];
  /** Distance from a runner's centre line to its lowest vertex. */
  readonly runnerDrop: number;
}
const models = new WeakMap<THREE.Group, SantaModel>();

function marker(parent: THREE.Object3D, name: string, x: number, y: number, z: number) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
function group(parent: THREE.Object3D, name: string, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
/** A horizontal ring (belt, hem, cuff) with separate radii across, deep and the tube thickness. */
function ring(
  parent: THREE.Object3D,
  name: string,
  color: number,
  x: number,
  y: number,
  rx: number,
  rz: number,
  tube: number,
  height: number,
) {
  const mesh = part(
    parent,
    name,
    new THREE.TorusGeometry(1, tube, 8, 30),
    matte(color, 0.95),
    x,
    y,
    0,
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.scale.set(rx, rz, height / (tube * 2));
  return mesh;
}
const boneUp = new THREE.Vector3(0, 1, 0),
  boneDir = new THREE.Vector3();
/** Places a unit-height cylinder so it spans exactly from a to b in its parent's space. */
export function bone3(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  boneDir.subVectors(b, a);
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.scale.set(1, Math.max(0.0001, boneDir.length()), 1);
  mesh.quaternion.setFromUnitVectors(boneUp, boneDir.normalize());
}

function buildHead(body: THREE.Group) {
  const head = group(body, 'santa-head', 2.2, 26.4, 0);
  oval(head, 'santa-face', matte(SKIN, 0.7), 0, 0, 0, 6, 6.3, 5.9);
  oval(head, 'santa-hair', matte(FUR_SHADE, 0.95), -3.4, -0.6, 0, 3.4, 4.6, 6);
  for (const z of [4.9, -4.9])
    oval(head, 'santa-whiskers', matte(FUR, 0.95), 1.2, -1.8, z, 3.4, 4, 1.8);
  // Layered beard: a full outer mass, a creamy inner layer and a soft point.
  oval(head, 'santa-beard', matte(FUR, 0.95), 2.8, -4.8, 0, 5, 5.6, 6.2);
  oval(head, 'santa-beard-inner', matte(FUR_SHADE, 0.95), 4.5, -5.8, 0, 3.3, 4.4, 4.6);
  const tip = part(
    head,
    'santa-beard-tip',
    new THREE.ConeGeometry(2.7, 4.6, 12),
    matte(FUR, 0.95),
    3.9,
    -10.6,
    0,
  );
  tip.rotation.z = Math.PI - 0.25;
  const mouth = oval(head, 'santa-mouth', matte(0x6b1f24, 0.6), 5.75, -2.8, 0, 0.75, 0.4, 1.4);
  for (const z of [1.6, -1.6]) {
    const tache = oval(head, 'santa-moustache', matte(FUR, 0.9), 5.9, -1.6, z, 1.6, 1, 2.6);
    tache.rotation.x = z > 0 ? -0.35 : 0.35;
  }
  oval(head, 'santa-nose', glossy(0xe98a7f, 0.5), 6.1, 0.1, 0, 1.45, 1.35, 1.45);
  const eyes: THREE.Mesh[] = [];
  for (const z of [2, -2]) {
    oval(head, 'santa-cheek', matte(ROSE, 0.6), 4.9, -0.2, z * 1.5, 1.4, 1.2, 1.2);
    eyes.push(oval(head, 'santa-eye', glossy(0x2a2026, 0.3), 5.35, 1.9, z, 0.5, 0.95, 0.6));
    oval(head, 'santa-eye-glint', glow(0xffffff), 5.8, 2.3, z * 0.92, 0.26, 0.3, 0.2);
    const brow = oval(head, 'santa-brow', matte(FUR, 0.95), 5.25, 3.35, z * 1.1, 1, 0.6, 1.6);
    brow.rotation.x = z > 0 ? 0.25 : -0.25;
  }
  const hat = group(head, 'santa-hat', -0.4, 4.4, 0);
  ring(hat, 'santa-hat-brim', FUR, 0, 0, 6.4, 6.3, 0.32, 2.2);
  const cone = group(hat, 'santa-hat-cone', 0, 0.6, 0);
  cone.rotation.z = 0.5;
  part(cone, 'santa-hat-crown', new THREE.ConeGeometry(5.5, 10, 18), matte(RED, 0.8), 0, 5, 0);
  const hatTip = group(cone, 'santa-hat-tip', 0, 9.4, 0);
  part(hatTip, 'santa-hat-point', new THREE.ConeGeometry(2, 5, 12), matte(RED, 0.8), 0, 2.4, 0);
  oval(hatTip, 'santa-pompom', matte(FUR, 0.95), 0, 5.3, 0, 2.1, 2.1, 2.1);
  return { head, eyes, mouth, hat, hatTip };
}

function buildBody(root: THREE.Group) {
  const body = group(root, 'santa-body', 0, SANTA_HIP, 0);
  oval(body, 'santa-coat-skirt', matte(RED_DARK, 0.85), 0.2, 1.4, 0, 10.4, 6.2, 9.4);
  ring(body, 'santa-hem', FUR, 0.2, -3.4, 10.2, 9.2, 0.2, 2.2);
  const belly = oval(body, 'santa-belly', matte(RED, 0.8), 0.9, 9.4, 0, 11, 11.2, 9.8);
  oval(body, 'santa-chest', matte(RED, 0.8), 0.2, 16.4, 0, 8.6, 6, 9.6);
  oval(body, 'santa-placket', matte(FUR, 0.95), 11, 8.6, 0, 1.4, 8.4, 2.1);
  ring(body, 'santa-belt', 0x2a2222, 0.9, 6, 10.6, 9.45, 0.13, 2);
  part(body, 'santa-buckle', new THREE.BoxGeometry(1, 3.6, 4.4), glossy(GOLD, 0.3), 11.9, 6, 0);
  part(
    body,
    'santa-buckle-hole',
    new THREE.BoxGeometry(1.1, 1.8, 2.4),
    matte(0x2a2222, 0.6),
    12,
    6,
    0,
  );
  ring(body, 'santa-collar', FUR, 1.6, 21.4, 5.6, 5.8, 0.3, 2.2);
  return { body, belly };
}

function buildLimbs(root: THREE.Group, body: THREE.Group) {
  const arm = (name: string, z: number) => {
    const limb = makeLimb(
      body,
      name,
      SANTA_SHOULDER.x,
      SANTA_SHOULDER.y,
      z,
      8.6,
      8.2,
      2.6,
      matte(RED, 0.8),
      matte(RED_DARK, 0.8),
    );
    oval(limb.end, `${name}-mitten`, matte(0x2c2526, 0.85), 0, -0.6, 0, 2.3, 2.7, 2);
    const thumb = oval(
      limb.end,
      `${name}-thumb`,
      matte(0x2c2526, 0.85),
      1.6,
      0.1,
      0,
      0.9,
      1.5,
      0.9,
    );
    thumb.rotation.z = -0.5;
    const cuff = part(
      limb.end,
      `${name}-cuff`,
      new THREE.TorusGeometry(2.4, 0.95, 8, 16),
      matte(FUR, 0.95),
      0,
      1.7,
      0,
    );
    cuff.rotation.x = Math.PI / 2;
    return limb;
  };
  const leg = (name: string, z: number) => {
    const limb = makeLimb(
      root,
      name,
      0.4,
      SANTA_HIP,
      z,
      6.6,
      6.4,
      2.9,
      matte(RED_DARK, 0.85),
      matte(RED_DARK, 0.85),
    );
    part(
      limb.end,
      `${name}-shaft`,
      new THREE.CylinderGeometry(3, 2.9, 3.6, 14),
      matte(BOOT, 0.55),
      0.3,
      -0.9,
      0,
    );
    // The ankle sits SANTA_ANKLE above the sole: both boot ovals bottom out exactly there.
    oval(limb.end, `${name}-foot`, glossy(BOOT, 0.4), 1.6, -2, 0, 4, 1.7, 2.8);
    oval(limb.end, `${name}-toe`, glossy(BOOT, 0.4), 4, -2.3, 0, 2, 1.4, 2.4);
    const cuff = part(
      limb.end,
      `${name}-cuff`,
      new THREE.TorusGeometry(3.1, 0.85, 8, 18),
      matte(FUR, 0.95),
      0.2,
      1.2,
      0,
    );
    cuff.rotation.x = Math.PI / 2;
    return limb;
  };
  const arms: [Limb, Limb] = [
    arm('santa-arm-0', SANTA_SHOULDER.z),
    arm('santa-arm-1', -SANTA_SHOULDER.z),
  ];
  const legs: [Limb, Limb] = [leg('santa-leg-0', 4.2), leg('santa-leg-1', -4.2)];
  return { arms, legs };
}

function buildSack(body: THREE.Group) {
  const sack = group(body, 'santa-sack');
  // Spin about its own axis first so the patch can face the viewer on either side, then tilt.
  sack.rotation.order = 'ZYX';
  const profile = [
    [0.01, 0],
    [5, 0.4],
    [8.2, 3],
    [9.2, 8],
    [8.6, 13],
    [6.4, 16.8],
    [3.6, 19],
    [2.6, 20.4],
  ].map(([x = 0, y = 0]) => new THREE.Vector2(x, y));
  part(sack, 'santa-sack-cloth', new THREE.LatheGeometry(profile, 18), matte(BURLAP, 0.97));
  const patch = flat(
    sack,
    'santa-sack-patch',
    matte(BURLAP_DARK, 0.97),
    [
      [-2.2, -2],
      [2.4, -1.7],
      [2.1, 2.3],
      [-2, 2],
    ],
    0,
  );
  patch.position.set(0, 8.5, 9.25);
  ring(sack, 'santa-sack-string', GOLD, 0, 18.4, 4.6, 4.6, 0.12, 1);
  const sackLip = ring(sack, 'santa-sack-lip', BURLAP_DARK, 0, 20.4, 2.6, 2.6, 0.25, 1.2);
  const sackHole = part(
    sack,
    'santa-sack-hole',
    new THREE.CircleGeometry(2.5, 16),
    matte(0x2a1a10, 1),
    0,
    20.5,
    0,
  );
  sackHole.rotation.x = -Math.PI / 2;
  const sackMouth = marker(sack, 'santa-sack-mouth', 0, 20.4, 0);
  const neck = (name: string, top: number, bottom: number) =>
    part(body, name, new THREE.CylinderGeometry(top, bottom, 1, 8), matte(BURLAP, 0.97));
  const necks: [THREE.Mesh, THREE.Mesh, THREE.Mesh] = [
    neck('santa-sack-neck', 1.2, 1.6),
    neck('santa-sack-twist', 1, 1.2),
    neck('santa-sack-tail', 1.5, 0.7),
  ];
  return { sack, sackMouth, sackLip, sackHole, necks };
}

function buildSleigh(root: THREE.Group) {
  const sleigh = group(root, 'santa-sleigh');
  sleigh.visible = false;
  part(
    sleigh,
    'sleigh-base',
    new THREE.BoxGeometry(26, 1.4, SLEIGH_HALF_WIDTH * 2),
    glossy(RED_DARK, 0.45),
    0,
    SLEIGH_PIVOT + 0.7,
    0,
  );
  const sides = [1, -1].map((s) => {
    const hinge = group(
      sleigh,
      `sleigh-side-${s > 0 ? 'near' : 'far'}`,
      0,
      SLEIGH_BASE_TOP,
      s * SLEIGH_HALF_WIDTH,
    );
    part(
      hinge,
      'sleigh-panel',
      new THREE.BoxGeometry(26, SLEIGH_WALL, 0.8),
      glossy(RED, 0.4),
      0,
      SLEIGH_WALL / 2,
      s * 0.4,
    );
    const rail = part(
      hinge,
      'sleigh-rail',
      new THREE.CylinderGeometry(0.6, 0.6, 26.6, 8),
      glossy(GOLD, 0.3),
      0,
      SLEIGH_WALL,
      s * 0.4,
    );
    rail.rotation.z = Math.PI / 2;
    const scroll = part(
      hinge,
      'sleigh-scroll',
      new THREE.TorusGeometry(2.3, 0.35, 6, 18),
      glossy(GOLD, 0.3),
      5,
      SLEIGH_WALL / 2,
      s * 0.9,
    );
    scroll.scale.set(1.4, 1, 1);
    for (const [x, a] of [
      [-5.6, 0.5],
      [-3.6, -0.4],
    ] as const) {
      const leaf = flat(
        hinge,
        'sleigh-holly',
        matte(HOLLY, 0.6),
        [
          [0, 0],
          [1.4, 0.9],
          [3.4, 0.5],
          [2, -0.6],
        ],
        s * 0.85,
      );
      leaf.position.set(x, SLEIGH_WALL / 2, s * 0.85);
      leaf.rotation.z = a;
    }
    oval(
      hinge,
      'sleigh-berry',
      glossy(0xc21d2b, 0.3),
      -4.6,
      SLEIGH_WALL / 2 + 0.2,
      s * 1,
      0.8,
      0.8,
      0.5,
    );
    return hinge;
  });
  const front = group(sleigh, 'sleigh-front', 13, SLEIGH_BASE_TOP + 0.8, 0);
  part(
    front,
    'sleigh-dash',
    new THREE.BoxGeometry(0.8, 10, SLEIGH_HALF_WIDTH * 2),
    glossy(RED, 0.4),
    0.4,
    5,
    0,
  );
  const dashTrim = part(
    front,
    'sleigh-dash-trim',
    new THREE.CylinderGeometry(0.7, 0.7, SLEIGH_HALF_WIDTH * 2 + 0.6, 8),
    glossy(GOLD, 0.3),
    0.4,
    10,
    0,
  );
  dashTrim.rotation.x = Math.PI / 2;
  const curve = new THREE.CatmullRomCurve3(
    [
      [-15, 0],
      [6, 0],
      [12, 0.4],
      [15.5, 3],
      [15.6, 6.6],
      [13.2, 8.2],
      [11.6, 6.6],
    ].map(([x = 0, y = 0]) => new THREE.Vector3(x, y, 0)),
  );
  let runnerDrop = 0.9;
  const runners = [1, -1].map((s) => {
    const runner = group(sleigh, `sleigh-runner-${s > 0 ? 'near' : 'far'}`, 0, 0, s * 7.5);
    const tube = part(
      runner,
      'sleigh-runner-blade',
      new THREE.TubeGeometry(curve, 40, 0.9, 8, false),
      glossy(GOLD, 0.25),
    );
    tube.geometry.computeBoundingBox();
    runnerDrop = -(tube.geometry.boundingBox?.min.y ?? -0.9);
    return runner;
  });
  const struts: THREE.Mesh[] = [];
  for (const z of [7.5, -7.5])
    for (const x of [-8, 6])
      struts.push(
        part(
          sleigh,
          'sleigh-strut',
          new THREE.CylinderGeometry(0.55, 0.55, 1, 8),
          glossy(GOLD, 0.3),
          x,
          0,
          z,
        ),
      );
  const railGrips: [THREE.Object3D, THREE.Object3D] = [
    marker(
      sleigh,
      'sleigh-grip-near',
      -6,
      SLEIGH_BASE_TOP + SLEIGH_WALL + 2.2,
      SLEIGH_HALF_WIDTH + 0.4,
    ),
    marker(
      sleigh,
      'sleigh-grip-far',
      -6,
      SLEIGH_BASE_TOP + SLEIGH_WALL + 2.2,
      -SLEIGH_HALF_WIDTH - 0.4,
    ),
  ];
  const carryGrips: [THREE.Object3D, THREE.Object3D] = [
    marker(sleigh, 'sleigh-carry-near', 1, SLEIGH_PIVOT + 1.2, SLEIGH_HALF_WIDTH + 2.1),
    marker(sleigh, 'sleigh-carry-far', 1, SLEIGH_PIVOT + 1.2, -SLEIGH_HALF_WIDTH - 2.1),
  ];
  const [near, far] = sides,
    [rNear, rFar] = runners;
  if (!near || !far || !rNear || !rFar) throw new Error('Sleigh parts missing');
  return {
    sleigh,
    sleighSides: [near, far] as const,
    sleighFront: front,
    runners: [rNear, rFar] as const,
    struts,
    railGrips,
    carryGrips,
    runnerDrop,
  };
}

export function makeSanta(id: string): THREE.Group {
  const plan = santaPlan(id);
  const root = new THREE.Group();
  root.name = 'christmas-santa';
  const { body, belly } = buildBody(root);
  const face = buildHead(body);
  const limbs = buildLimbs(root, body);
  const sack = buildSack(body);
  const sleigh = buildSleigh(root);
  models.set(root, { plan, body, belly, ...face, ...limbs, ...sack, ...sleigh });
  santaPose(root, { ...SANTA_REST, side: plan.side });
  return root;
}

export function santaModel(root: THREE.Group): SantaModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native Santa');
  return model;
}

export interface SoleTarget {
  readonly x: number;
  /** Height of the sole above the floor (the sleigh base when standing on it). */
  readonly y: number;
}
export interface SleighPose {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  /** 0 folded flat .. 1 standing on its runners; hinges open in a staggered order. */
  readonly unfold: number;
  readonly squash: number;
}
export interface SantaPose {
  readonly side: number;
  /** Sole targets for both feet in root space. */
  readonly feet: readonly [SoleTarget, SoleTarget];
  readonly hip: number;
  readonly hipX: number;
  readonly lean: number;
  readonly roll: number;
  readonly headTilt: number;
  readonly headTurn: number;
  readonly blink: number;
  readonly mouth: number;
  readonly jiggle: number;
  readonly sackLift: number;
  readonly sackSway: number;
  readonly sackOpen: number;
  readonly hatLift: number;
  readonly flop: number;
  readonly sleigh: SleighPose | null;
}
export const SANTA_REST: SantaPose = {
  side: 1,
  feet: [
    { x: 1.6, y: 0 },
    { x: -0.8, y: 0 },
  ],
  hip: SANTA_HIP,
  hipX: 0,
  lean: 0.04,
  roll: 0,
  headTilt: 0,
  headTurn: 0,
  blink: 0,
  mouth: 0,
  jiggle: 0,
  sackLift: 0,
  sackSway: 0,
  sackOpen: 0,
  hatLift: 0,
  flop: 0,
  sleigh: null,
};

const overshoot = (n: number) => {
  const t = clamp(n) - 1;
  return 1 + 2.4 * t * t * t + 1.4 * t * t;
};
/** Runner strut angle from straight down for an unfold amount. */
export function sleighStrut(unfold: number): number {
  return RUNNER_FOLDED * (1 - overshoot((unfold - 0.15) / 0.55));
}
/** Height of the lowest runner vertex above the sleigh origin, so a grounded sleigh rests on it. */
export function sleighRest(model: SantaModel, unfold: number): number {
  return SLEIGH_PIVOT - STRUT * Math.cos(sleighStrut(unfold)) - model.runnerDrop;
}

const neckA = new THREE.Vector3(),
  neckB = new THREE.Vector3(),
  neckC = new THREE.Vector3(),
  neckD = new THREE.Vector3();
/** Body-space points along the sack's gathered neck: mouth, over the far shoulder, grip and tail. */
export function sackNeck(model: SantaModel, side: number) {
  model.sack.updateMatrix();
  neckA.copy(model.sackMouth.position).applyMatrix4(model.sack.matrix);
  neckB.set(1.2, 23.4, -side * 7);
  neckC.set(10.8, 16.4, -side * 2.4);
  neckD.set(12, 11.8, -side * 1.2);
  return { mouth: neckA, shoulder: neckB, grip: neckC, tail: neckD };
}

export function santaPose(root: THREE.Group, q: SantaPose) {
  const m = santaModel(root);
  m.legs.forEach((leg, i) => {
    const foot = q.feet[i] ?? { x: 0, y: 0 };
    leg.root.position.set(0.4 + q.hipX, q.hip, leg.root.position.z);
    reach(leg, foot.x - q.hipX - 0.4, foot.y + SANTA_ANKLE - q.hip, 1, 0);
  });
  m.body.position.set(q.hipX, q.hip, 0);
  m.body.rotation.set(q.roll, 0, -q.lean);
  m.belly.scale.set(
    11 * (1 - 0.03 * q.jiggle),
    11.2 * (1 + 0.05 * q.jiggle),
    9.8 * (1 - 0.03 * q.jiggle),
  );
  m.head.rotation.set(0, q.headTurn, q.headTilt);
  for (const eye of m.eyes) eye.scale.y = 0.95 * Math.max(0.12, 1 - q.blink);
  m.mouth.scale.set(0.75 + 0.2 * q.mouth, 0.4 + 1.3 * q.mouth, 1.4);
  m.hat.position.set(-0.4 + 0.6 * q.hatLift, 4.4 + 3 * q.hatLift, 0);
  m.hat.rotation.z = -0.45 * q.hatLift;
  m.hatTip.rotation.z = 1 + q.flop;
  // The sack hangs behind the far shoulder; the near side depends on which way the event faces.
  const side = q.side < 0 ? -1 : 1;
  m.sack.position.set(-8.6, 2.4 + q.sackLift, -side * 3.6);
  m.sack.rotation.set(0, side > 0 ? 0 : Math.PI, -0.3 + q.sackSway);
  const open = 1 + 0.9 * q.sackOpen;
  m.sackLip.scale.set(2.6 * open, 2.6 * open, m.sackLip.scale.z);
  m.sackHole.scale.setScalar(open);
  const neck = sackNeck(m, side);
  const [a, b, c] = m.necks;
  bone3(a, neck.mouth, neck.shoulder);
  bone3(b, neck.shoulder, neck.grip);
  bone3(c, neck.grip, neck.tail);
  poseSleigh(m, q.sleigh);
}

function poseSleigh(m: SantaModel, s: SleighPose | null) {
  m.sleigh.visible = s !== null;
  if (!s) return;
  m.sleigh.position.set(s.x, s.y, 0);
  m.sleigh.rotation.set(0, 0, s.angle);
  m.sleigh.scale.set(1 + 0.04 * s.squash, 1 - 0.1 * s.squash, 1 + 0.04 * s.squash);
  const sides = overshoot(s.unfold / 0.55);
  m.sleighSides.forEach(
    (hinge, i) => (hinge.rotation.x = (i === 0 ? -1 : 1) * (Math.PI / 2) * (1 - sides)),
  );
  m.sleighFront.rotation.z = Math.PI / 2 - (Math.PI / 2 + 0.25) * overshoot((s.unfold - 0.4) / 0.6);
  const alpha = sleighStrut(s.unfold);
  const dx = STRUT * Math.sin(alpha),
    dy = SLEIGH_PIVOT - STRUT * Math.cos(alpha);
  m.runners.forEach((runner) => runner.position.set(dx, dy, runner.position.z));
  m.struts.forEach((strut, i) => {
    const x = i % 2 ? 6 : -8,
      z = i < 2 ? 7.5 : -7.5;
    neckA.set(x, SLEIGH_PIVOT, z);
    neckB.set(x + dx, dy, z);
    bone3(strut, neckA, neckB);
  });
}

export function star(): THREE.ShapeGeometry {
  const points: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2,
      r = i % 2 ? 0.32 : 1;
    points.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return new THREE.ShapeGeometry(outline(points));
}

export function helix(): THREE.TubeGeometry {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2 * 4;
    points.push(new THREE.Vector3(Math.cos(a) * 3, i / 64 - 0.5, Math.sin(a) * 3));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 96, 0.32, 6, false);
}
