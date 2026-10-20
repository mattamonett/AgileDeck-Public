import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import { ELF_RIBBONS, elfPlan, type ElfPlan } from './elf-choreography';
import { gait, glossy, glow, makeLimb, matte, oval, part, reach, type Limb } from '../../kit';

const SKIN = 0xf6c9a4,
  CHEEK = 0xec8f8a,
  TUNIC = 0x2e8b4a,
  TUNIC_DARK = 0x1d6634,
  TRIM = 0xc8283a,
  FUR = 0xfff6ea,
  GOLD = 0xe8b93a,
  BELT = 0x2a1d17,
  HAIR = 0xb5622c,
  WOOD = 0xc89456;

export const ELF_HIP = 14;
/** Height of the ankle above the shoe sole (the shoe oval's lowest point). */
export const ELF_ANKLE = 2.1;
export const ELF_SHOULDER = new THREE.Vector2(0.4, 11.2);
export const ELF_ARM = [6.4, 6.2] as const;
/** Fingertip and spool centre below the wrist, in the hand's own space. */
export const ELF_TIP = 2.7;
export const ELF_GRIP = 1.3;
export const ELF_STRIDE = 9.5;
/** Flange radius (the spool rolls on its flanges) and full ribbon radius, model units. */
export const SPOOL_RADIUS = 4;
export const SPOOL_WOUND = 3.2;

export interface ElfSpool {
  readonly group: THREE.Group;
  readonly wound: THREE.Mesh;
}
export interface ElfModel {
  readonly plan: ElfPlan;
  readonly body: THREE.Group;
  readonly head: THREE.Group;
  readonly hat: readonly THREE.Group[];
  readonly bell: THREE.Group;
  readonly eyes: readonly THREE.Group[];
  readonly pupils: readonly THREE.Mesh[];
  readonly brows: readonly THREE.Mesh[];
  readonly mouth: THREE.Mesh;
  readonly arms: readonly [Limb, Limb];
  readonly legs: readonly [Limb, Limb];
  /** Fingertip markers, one per hand. */
  readonly tips: readonly [THREE.Object3D, THREE.Object3D];
  /** A spool gripped by its axle in each fist; only the hand that holds it shows it. */
  readonly spools: readonly [ElfSpool, ElfSpool];
}
const models = new WeakMap<THREE.Group, ElfModel>();

/** A wooden ribbon spool whose axle runs along z, so it rolls like a wheel on screen. */
export function makeSpool(name: string, ribbon: number): ElfSpool {
  const group = new THREE.Group();
  group.name = name;
  for (const z of [-1.7, 1.7]) {
    const flange = part(
      group,
      `${name}-flange`,
      new THREE.CylinderGeometry(SPOOL_RADIUS, SPOOL_RADIUS, 0.6, 20),
      glossy(WOOD, 0.5),
      0,
      0,
      z,
    );
    flange.rotation.x = Math.PI / 2;
    // Three holes in each flange make the roll readable.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      part(
        group,
        `${name}-hole`,
        new THREE.CircleGeometry(0.62, 10),
        matte(0x5a3415, 0.8),
        Math.cos(a) * 2.35,
        Math.sin(a) * 2.35,
        z + Math.sign(z) * 0.32,
      );
    }
  }
  const wound = part(
    group,
    `${name}-wound`,
    new THREE.CylinderGeometry(SPOOL_WOUND, SPOOL_WOUND, 2.8, 20),
    glossy(ribbon, 0.3),
  );
  wound.rotation.x = Math.PI / 2;
  part(
    group,
    `${name}-pin`,
    new THREE.CylinderGeometry(0.42, 0.42, 6.2, 8),
    glossy(GOLD, 0.3),
  ).rotation.x = Math.PI / 2;
  return { group, wound };
}
export function setWound(spool: ElfSpool, left: number) {
  const k = 0.55 + 0.45 * Math.max(0, Math.min(1, left));
  spool.wound.scale.set(k, 1, k);
}

/** Red and white stockings: every face takes the colour of the stripe its centre lies in. */
function stripedCylinder(top: number, bottom: number, stripes: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(top, bottom, 1, 10, stripes * 2).toNonIndexed();
  const position = g.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const red = new THREE.Color(TRIM),
    white = new THREE.Color(FUR);
  for (let i = 0; i < position.count; i += 3) {
    const y = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
    const c = Math.floor((y + 0.5) * stripes * 0.9999) % 2 ? red : white;
    for (let j = 0; j < 3; j++) colors.set([c.r, c.g, c.b], (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

const up = new THREE.Vector3(0, 1, 0);
function pointed(
  parent: THREE.Object3D,
  name: string,
  material: THREE.Material,
  radius: number,
  height: number,
  at: readonly [number, number, number],
  toward: readonly [number, number, number],
) {
  const mesh = part(parent, name, new THREE.ConeGeometry(radius, height, 10), material, ...at);
  mesh.quaternion.setFromUnitVectors(up, new THREE.Vector3(...toward).normalize());
  return mesh;
}

function buildHead(body: THREE.Group) {
  const head = new THREE.Group();
  head.name = 'elf-head';
  head.position.set(1, 19.2, 0);
  body.add(head);
  oval(head, 'elf-face', matte(SKIN, 0.7), 0, 0, 0, 5.4, 5.2, 5);
  // Long pointed ears sweep back past the head so they read in profile and from the front.
  for (const z of [-1, 1]) {
    pointed(head, 'elf-ear', matte(SKIN, 0.7), 1.35, 8, [-4.2, 1, z * 3.8], [-0.9, 0.42, z * 0.3]);
    pointed(
      head,
      'elf-ear-inner',
      matte(CHEEK, 0.7),
      0.7,
      5.4,
      [-4.1, 1, z * 4.25],
      [-0.9, 0.42, z * 0.3],
    );
    oval(head, 'elf-cheek', matte(CHEEK, 0.6), 4.1, -1.5, z * 3.1, 1.2, 0.8, 0.5);
    oval(head, 'elf-hair', matte(HAIR, 0.8), -1.4, 2.7, z * 4, 2.2, 1.6, 1.2);
  }
  oval(head, 'elf-fringe', matte(HAIR, 0.8), 3.2, 3.4, 0, 2.2, 1, 3.4);
  const eyes: THREE.Group[] = [],
    pupils: THREE.Mesh[] = [],
    brows: THREE.Mesh[] = [];
  for (const z of [-1, 1]) {
    const eye = new THREE.Group();
    eye.name = 'elf-eye';
    eye.position.set(4.3, 0.9, z * 1.9);
    head.add(eye);
    oval(eye, 'elf-eye-white', glossy(0xfffdf8, 0.2), 0, 0, 0, 0.85, 1.2, 0.7);
    pupils.push(oval(eye, 'elf-pupil', glossy(0x2a1a10, 0.15), 0.6, -0.1, 0, 0.42, 0.68, 0.42));
    part(
      eye,
      'elf-glint',
      new THREE.SphereGeometry(0.18, 6, 4),
      glow(0xffffff),
      0.95,
      0.2,
      z * 0.15,
    );
    eyes.push(eye);
    brows.push(
      part(
        head,
        'elf-brow',
        new THREE.BoxGeometry(1.7, 0.36, 0.4),
        matte(HAIR, 0.8),
        4.8,
        2.6,
        z * 2,
      ),
    );
  }
  part(head, 'elf-nose', new THREE.SphereGeometry(1, 10, 8), matte(0xf0a38c, 0.6), 5.6, -0.5, 0);
  const mouth = oval(head, 'elf-mouth', matte(0x5a1b16, 0.6), 4.95, -2.7, 0, 0.4, 0.42, 1.3);

  const hatBase = new THREE.Group();
  hatBase.name = 'elf-hat';
  hatBase.position.set(-0.3, 3.9, 0);
  hatBase.rotation.z = 0.1;
  head.add(hatBase);
  part(
    hatBase,
    'elf-hat-brim',
    new THREE.TorusGeometry(4.9, 1, 8, 22),
    matte(FUR, 0.95),
    0,
    0.4,
    0,
  ).rotation.x = Math.PI / 2;
  const hat: THREE.Group[] = [];
  let parent: THREE.Object3D = hatBase,
    rise = 0.6;
  const cones = [
    [4.7, 3.4, 4.6],
    [3.4, 2.1, 4.6],
    [2.1, 0.3, 5.2],
  ] as const;
  cones.forEach(([bottom, top, height], i) => {
    const seg = new THREE.Group();
    seg.name = `elf-hat-${i}`;
    seg.position.y = rise;
    parent.add(seg);
    if (i) part(seg, 'elf-hat-joint', new THREE.SphereGeometry(bottom, 12, 8), matte(TUNIC, 0.75));
    part(
      seg,
      'elf-hat-cone',
      new THREE.CylinderGeometry(top, bottom, height, 14),
      matte(i === 1 ? TUNIC_DARK : TUNIC, 0.75),
      0,
      height / 2,
      0,
    );
    hat.push(seg);
    parent = seg;
    rise = height;
  });
  const bell = new THREE.Group();
  bell.name = 'elf-bell';
  bell.position.y = rise;
  parent.add(bell);
  part(
    bell,
    'elf-bell-loop',
    new THREE.TorusGeometry(0.35, 0.12, 6, 10),
    glossy(GOLD, 0.25),
    0,
    -0.2,
    0,
  );
  part(
    bell,
    'elf-bell-shell',
    new THREE.SphereGeometry(1.1, 12, 10),
    glossy(GOLD, 0.2),
    0,
    -1.4,
    0,
  );
  part(
    bell,
    'elf-bell-slot',
    new THREE.TorusGeometry(1.02, 0.12, 6, 16),
    matte(0x4a3510, 0.6),
    0,
    -1.75,
    0,
  ).rotation.x = Math.PI / 2;
  return { head, hat, bell, eyes, pupils, brows, mouth };
}

function buildArm(body: THREE.Group, name: string, z: number) {
  const limb = makeLimb(
    body,
    name,
    ELF_SHOULDER.x,
    ELF_SHOULDER.y,
    z,
    ELF_ARM[0],
    ELF_ARM[1],
    1.1,
    matte(TUNIC, 0.75),
    matte(TUNIC_DARK, 0.75),
  );
  part(
    limb.end,
    `${name}-cuff`,
    new THREE.TorusGeometry(1.15, 0.5, 6, 14),
    matte(FUR, 0.95),
    0,
    0.2,
    0,
  ).rotation.x = Math.PI / 2;
  oval(limb.end, `${name}-mitten`, matte(SKIN, 0.7), 0, -1.3, 0, 1.25, 1.45, 1.1);
  oval(limb.end, `${name}-thumb`, matte(SKIN, 0.7), 0.95, -0.8, 0, 0.5, 0.85, 0.5).rotation.z =
    -0.5;
  const tip = new THREE.Object3D();
  tip.name = `${name}-tip`;
  tip.position.set(0, -ELF_TIP, 0);
  limb.end.add(tip);
  return { limb, tip };
}

function buildLeg(root: THREE.Group, name: string, z: number): Limb {
  const stocking = matte(0xffffff, 0.8);
  stocking.vertexColors = true;
  const limb = makeLimb(root, name, 0, ELF_HIP, z, 6.8, 6.4, 1.25, stocking, matte(TRIM, 0.8));
  limb.upper.geometry.dispose();
  limb.upper.geometry = stripedCylinder(1.25 * 0.9, 1.25, 4);
  limb.lower.geometry.dispose();
  limb.lower.geometry = stripedCylinder(1.25 * 0.72, 1.25 * 0.88, 4);
  // A pointed shoe whose toe curls up and back to a little bell; its sole is ELF_ANKLE below the ankle.
  oval(limb.end, `${name}-shoe`, matte(TUNIC_DARK, 0.7), 1.7, -1, 0, 3, 1.1, 1.55);
  const curl = part(
    limb.end,
    `${name}-curl`,
    new THREE.TorusGeometry(1, 0.42, 6, 12, Math.PI * 1.25),
    matte(TUNIC_DARK, 0.7),
    4.3,
    0,
    0,
  );
  curl.rotation.z = -Math.PI / 2;
  part(
    limb.end,
    `${name}-toe-bell`,
    new THREE.SphereGeometry(0.55, 8, 6),
    glossy(GOLD, 0.25),
    3.6,
    0.75,
    0,
  );
  part(
    limb.end,
    `${name}-ankle-cuff`,
    new THREE.TorusGeometry(1.05, 0.38, 6, 12),
    matte(FUR, 0.95),
    0,
    0.3,
    0,
  ).rotation.x = Math.PI / 2;
  return limb;
}

export function makeElf(id: string): THREE.Group {
  const plan = elfPlan(id);
  const ribbon = ELF_RIBBONS[plan.ribbon] ?? ELF_RIBBONS[0];
  const root = new THREE.Group();
  root.name = 'christmas-elf';
  const body = new THREE.Group();
  body.name = 'elf-body';
  body.position.set(0, ELF_HIP, 0);
  root.add(body);
  const tunic = [
    [5.5, -2.6],
    [5.9, -1],
    [5.4, 1.4],
    [4.8, 4],
    [5, 7],
    [4.4, 9.8],
    [3, 11.6],
    [1.7, 12.4],
  ] as const;
  part(
    body,
    'elf-tunic',
    new THREE.LatheGeometry(
      tunic.map(([r, y]) => new THREE.Vector2(r, y)),
      20,
    ),
    matte(TUNIC, 0.75),
  );
  // A jagged hem of alternating points.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    pointed(
      body,
      'elf-hem',
      matte(i % 2 ? TRIM : TUNIC_DARK, 0.75),
      1.3,
      2.8,
      [Math.cos(a) * 5.3, -3.7, Math.sin(a) * 5.3],
      [Math.cos(a) * 0.25, -1, Math.sin(a) * 0.25],
    );
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    pointed(
      body,
      'elf-collar',
      matte(i % 2 ? FUR : TRIM, 0.85),
      1,
      2.6,
      [Math.cos(a) * 3.1, 11.3, Math.sin(a) * 3.1],
      [Math.cos(a) * 0.8, -0.6, Math.sin(a) * 0.8],
    );
  }
  part(
    body,
    'elf-belt',
    new THREE.TorusGeometry(5.45, 0.6, 6, 24),
    glossy(BELT, 0.4),
    0,
    1.4,
    0,
  ).rotation.x = Math.PI / 2;
  part(body, 'elf-buckle', new THREE.BoxGeometry(0.5, 1.8, 1.9), glossy(GOLD, 0.25), 5.95, 1.4, 0);
  for (const [x, y] of [
    [5.05, 5.2],
    [4.95, 7.7],
  ] as const)
    part(body, 'elf-button', new THREE.SphereGeometry(0.45, 8, 6), glossy(GOLD, 0.25), x, y, 0);
  for (const z of [-4.3, 4.3])
    oval(body, 'elf-sleeve-puff', matte(TUNIC, 0.75), 0.4, 11, z, 2.2, 2.2, 2);
  part(
    body,
    'elf-neck',
    new THREE.CylinderGeometry(1.6, 1.8, 2.6, 10),
    matte(SKIN, 0.7),
    0.5,
    13.2,
    0,
  );
  const face = buildHead(body);
  const front = buildArm(body, 'elf-arm-front', 4.6);
  const back = buildArm(body, 'elf-arm-back', -4.6);
  const spools = [front, back].map(({ limb }, i) => {
    const spool = makeSpool(`elf-spool-${i}`, ribbon);
    // Gripped by its axle pin; the spool sits on the outer side of the fist.
    spool.group.position.set(0, -ELF_GRIP, i ? -2.6 : 2.6);
    limb.end.add(spool.group);
    return spool;
  });
  const legs: [Limb, Limb] = [
    buildLeg(root, 'elf-leg-front', 2.5),
    buildLeg(root, 'elf-leg-back', -2.5),
  ];
  const [spoolFront, spoolBack] = spools;
  if (!spoolFront || !spoolBack) throw new Error('Missing elf spools');
  models.set(root, {
    plan,
    body,
    head: face.head,
    hat: face.hat,
    bell: face.bell,
    eyes: face.eyes,
    pupils: face.pupils,
    brows: face.brows,
    mouth: face.mouth,
    arms: [front.limb, back.limb],
    legs,
    tips: [front.tip, back.tip],
    spools: [spoolFront, spoolBack],
  });
  elfPose(root, ELF_REST);
  return root;
}

export function elfModel(root: THREE.Group): ElfModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native elf');
  return model;
}

export interface ElfPoseInput {
  /** Distance walked in model units; planted feet stay put while it is unchanged. */
  readonly walked: number;
  readonly planted: number;
  /** Step height multiplier. */
  readonly lift: number;
  /** Whole-body jump (feet included) in model units. */
  readonly hop: number;
  readonly crouch: number;
  /** Walking bounce of the hips, 0..1. */
  readonly bounce: number;
  readonly lean: number;
  readonly headTilt: number;
  readonly headTurn: number;
  /** Hand targets relative to each shoulder, in body space. */
  readonly front: Point;
  readonly back: Point;
  /** Which fist shows its spool. */
  readonly spools: readonly [boolean, boolean];
  /** Ribbon left on the spool, 0..1. */
  readonly wound: number;
  /** -1 fussy frown .. 1 raised in surprise. */
  readonly brow: number;
  /** 1 open, 0 shut; above 1 wide with alarm. */
  readonly eyes: number;
  /** 0 a small smile .. 1 an alarmed "O". */
  readonly mouth: number;
  readonly look: number;
  /** Swing of the floppy hat. */
  readonly hat: number;
}
export const ELF_REST: ElfPoseInput = {
  walked: 0,
  planted: 1,
  lift: 1,
  hop: 0,
  crouch: 0,
  bounce: 1,
  lean: 0.1,
  headTilt: 0,
  headTurn: 0,
  front: { x: 1, y: -11 },
  back: { x: 5.5, y: -6.5 },
  spools: [false, true],
  wound: 1,
  brow: 0,
  eyes: 1,
  mouth: 0,
  look: 0,
  hat: 0,
};

export function elfPose(root: THREE.Group, q: ElfPoseInput) {
  const m = elfModel(root);
  const cycle = (q.walked / ELF_STRIDE) * Math.PI * 2;
  const bob = Math.abs(Math.sin(cycle)) * 0.6 * (1 - q.planted) * q.bounce;
  const hip = ELF_HIP - q.crouch - bob + q.hop;
  m.legs.forEach((leg, i) => {
    const step = gait(q.walked, ELF_STRIDE, i * 0.5, 2.4 * q.lift);
    const free = 1 - q.planted;
    leg.root.position.y = hip;
    reach(
      leg,
      step.x + (i ? -0.6 : 0.6),
      ELF_ANKLE + q.hop + step.y * free - hip,
      1,
      -0.35 * step.swing * free,
    );
  });
  m.body.position.set(0, hip, 0);
  m.body.rotation.set(0, 0, -q.lean);
  m.head.rotation.set(0, q.headTurn, q.headTilt);
  reach(m.arms[0], q.front.x, q.front.y, -1);
  reach(m.arms[1], q.back.x, q.back.y, -1);
  // The floppy hat trails the motion and the bell always hangs down.
  const droop = [0.3, 0.55, 0.7];
  let turned = -q.lean + q.headTilt + 0.1;
  m.hat.forEach((seg, i) => {
    seg.rotation.z = (droop[i] ?? 0) + q.hat * (0.4 + i * 0.3);
    turned += seg.rotation.z;
  });
  m.bell.rotation.z = -turned + q.hat * 0.6;
  const open = Math.max(0.08, q.eyes);
  m.eyes.forEach((eye) => eye.scale.set(1, open, 1));
  m.pupils.forEach((pupil) => (pupil.position.z = q.look * 0.3));
  m.brows.forEach((brow) => {
    brow.position.y = 2.6 + 0.6 * q.brow;
    brow.rotation.z = 0.35 * Math.min(0, q.brow) + 0.15 * Math.max(0, q.brow);
  });
  m.mouth.scale.set(0.4 + 0.15 * q.mouth, 0.42 + 0.9 * q.mouth, 1.3 - 0.6 * q.mouth);
  m.spools.forEach((spool, i) => {
    spool.group.visible = q.spools[i] ?? false;
    setWound(spool, q.wound);
  });
}

export function loopShape(sign: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absellipse(sign * 0.55, 0.16, 0.56, 0.36, 0, Math.PI * 2, false, sign * 0.3);
  const hole = new THREE.Path();
  hole.absellipse(sign * 0.58, 0.16, 0.3, 0.14, 0, Math.PI * 2, true, sign * 0.3);
  shape.holes.push(hole);
  return shape;
}

export function tailShape(sign: number): THREE.Shape {
  const points = [
    [0.06, -0.05],
    [0.52, -0.82],
    [0.38, -0.72],
    [0.3, -0.9],
    [-0.06, -0.14],
  ] as const;
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(sign * x, y) : shape.moveTo(sign * x, y)));
  shape.closePath();
  return shape;
}
