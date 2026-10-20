import * as THREE from 'three';
import { TURKEY_LOOSE, turkeyPlan, type TurkeyPlan } from './turkey-choreography';
import { gait, makeLimb, matte, mix, oval, part, reach, type Limb, type Side } from '../../kit';

const BRONZE = 0x6a4428,
  BRONZE_DARK = 0x3e2817,
  COPPER = 0x8d5a30,
  LEG = 0xd08a6e,
  HEAD_SKIN = 0x93bfdc,
  HEAD_FLUSH = 0xe3f1fa,
  RED = 0xc4202c,
  RED_FLUSH = 0xf0303a,
  BEAK = 0xdcb67a;

/** Hip height while standing tall, in model units above the floor. */
export const TURKEY_HIP = 21;
/** The ankle centre sits this far above the lowest point of the toes. */
export const TURKEY_ANKLE = 1.1;
/** Base of the neck in body space. */
export const TURKEY_NECK = new THREE.Vector2(12, 17);
/** Beak tip in head space (the head's +x is the direction the beak points). */
export const TURKEY_TIP = new THREE.Vector2(9.6, 0.5);
const TAIL_FEATHERS = 11,
  COVERTS = 7,
  /** Fan yaw that turns a displayed tail three quarters toward the viewer. */
  FAN_YAW = Math.PI - Math.atan2(0.6, 0.8);

export interface FeatherPalette {
  readonly base: number;
  readonly bar: number;
  readonly band: number;
  readonly tip: number;
}
const TAIL: FeatherPalette = { base: 0x7a4a26, bar: 0x55331a, band: 0x1e130c, tip: 0xdcbc8c };
const COVERT: FeatherPalette = { base: 0x6e4527, bar: 0x5a381f, band: 0x24170e, tip: 0xa8743e };
const WING: FeatherPalette = { base: 0x2e2722, bar: 0xece4d4, band: 0x2e2722, tip: 0xd4cbb8 };
const BODY: FeatherPalette = { base: 0x8a5a30, bar: 0x6a4224, band: 0x1d130c, tip: 0xd8b07c };

const STOPS = [0, 0.12, 0.25, 0.38, 0.5, 0.62, 0.72, 0.74, 0.84, 0.86, 0.95, 1] as const;
/**
 * A flat feather along +x from its quill to a rounded tip, coloured with bars, a dark band and a
 * pale tip that read at card size.
 */
export function featherGeometry(
  length: number,
  width: number,
  palette: FeatherPalette,
): THREE.BufferGeometry {
  const positions: number[] = [],
    colors: number[] = [],
    index: number[] = [];
  const color = new THREE.Color(),
    shaft = new THREE.Color();
  STOPS.forEach((f, i) => {
    const half =
      (width / 2) *
      (f < 0.3
        ? 0.2 + 0.8 * Math.sin((f / 0.3) * (Math.PI / 2))
        : f > 0.88
          ? 0.12 + 0.88 * Math.sqrt(Math.max(0, 1 - ((f - 0.88) / 0.12) ** 2))
          : 1);
    color.setHex(
      f >= 0.86 ? palette.tip : f >= 0.74 ? palette.band : i % 2 ? palette.bar : palette.base,
    );
    shaft.copy(color).lerp(new THREE.Color(palette.tip), 0.35);
    for (const [y, c] of [
      [half, color],
      [0, shaft],
      [-half, color],
    ] as const) {
      positions.push(f * length, y, 0);
      colors.push(c.r, c.g, c.b);
    }
    if (i < STOPS.length - 1) {
      const a = i * 3;
      index.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
export function featherMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.6,
    metalness: 0.12,
    side: THREE.DoubleSide,
  });
}
/** The loose body feathers share one shape so a released copy matches the attached one exactly. */
export const looseFeatherGeometry = (i: number) => featherGeometry(6 + (i % 3) * 0.6, 3.4, BODY);

/** Rounded body-feather scale, copper at the centre and black at the rim. */
function scaleGeometry(): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(1, 10, Math.PI * 0.95, Math.PI * 1.1);
  const points = g.getAttribute('position');
  const centre = new THREE.Color(0xae7a42),
    rim = new THREE.Color(0x24170e),
    c = new THREE.Color();
  const colors: number[] = [];
  for (let i = 0; i < points.count; i++) {
    c.copy(i === 0 ? centre : rim);
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

/** A hanging fleshy drop (snood or wattle) along -y from its root, unit length. */
function dropGeometry(width: number): THREE.LatheGeometry {
  const profile = [
    [0.001, 0],
    [0.55, 0],
    [0.62, -0.3],
    [0.72, -0.72],
    [0.5, -0.93],
    [0.001, -1],
  ] as const;
  return new THREE.LatheGeometry(
    profile.map(([x, y]) => new THREE.Vector2(x * width, y)),
    10,
  );
}

export interface TurkeyWing {
  readonly root: THREE.Group;
  readonly zSide: Side;
  readonly hand: THREE.Group;
  readonly primaries: readonly THREE.Group[];
  readonly extended: THREE.Quaternion;
}
export interface TurkeyEye {
  readonly group: THREE.Group;
  readonly white: THREE.Mesh;
}
export interface TurkeyModel {
  readonly plan: TurkeyPlan;
  readonly body: THREE.Group;
  readonly plumage: THREE.Group;
  readonly legs: readonly [Limb, Limb];
  readonly neck: Limb;
  readonly head: THREE.Group;
  readonly jaw: THREE.Group;
  readonly beakTip: THREE.Object3D;
  readonly snood: THREE.Group;
  readonly wattle: THREE.Group;
  readonly skin: THREE.MeshStandardMaterial;
  readonly flesh: readonly THREE.MeshStandardMaterial[];
  readonly eyes: readonly TurkeyEye[];
  readonly tail: THREE.Group;
  readonly fan: THREE.Group;
  readonly tailFeathers: readonly THREE.Group[];
  readonly coverts: readonly THREE.Group[];
  readonly wings: readonly TurkeyWing[];
  readonly loose: readonly THREE.Mesh[];
}
const models = new WeakMap<THREE.Group, TurkeyModel>();

function group(parent: THREE.Object3D, name: string, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
function replaceMaterial(mesh: THREE.Mesh, material: THREE.Material) {
  const old = mesh.material;
  for (const m of Array.isArray(old) ? old : [old]) m.dispose();
  mesh.material = material;
}

function makeLeg(root: THREE.Object3D, name: string, z: number): Limb {
  const limb = makeLimb(
    root,
    name,
    0.5,
    TURKEY_HIP,
    z,
    10,
    11.5,
    2.5,
    matte(BRONZE, 0.7),
    matte(LEG, 0.55),
  );
  // A tapered feathered drumstick above, a thin scaly shank below the backward-bending ankle.
  limb.upper.geometry.dispose();
  limb.upper.geometry = new THREE.CylinderGeometry(1.3, 2.8, 1, 10);
  limb.lower.geometry.dispose();
  limb.lower.geometry = new THREE.CylinderGeometry(0.8, 1.0, 1, 8);
  replaceMaterial(limb.lower, matte(LEG, 0.55));
  limb.joint.geometry.dispose();
  limb.joint.geometry = new THREE.SphereGeometry(1.2, 10, 8);
  const foot = limb.end;
  oval(foot, `${name}-ankle`, matte(LEG, 0.55), 0, 0, 0, 1, 1, 1);
  for (const a of [-0.55, 0, 0.55]) {
    // Every toe and claw bottoms out exactly TURKEY_ANKLE below the ankle, so planted soles touch the floor.
    const toe = oval(
      foot,
      `${name}-toe`,
      matte(LEG, 0.55),
      Math.cos(a) * 2.4,
      -TURKEY_ANKLE + 0.5,
      -Math.sin(a) * 2.4,
      2.6,
      0.5,
      0.55,
    );
    toe.rotation.y = a;
    const claw = part(
      foot,
      `${name}-claw`,
      new THREE.ConeGeometry(0.3, 1.3, 6),
      matte(0x2c2420, 0.4),
      Math.cos(a) * 5.2,
      -TURKEY_ANKLE + 0.32,
      -Math.sin(a) * 5.2,
    );
    claw.rotation.set(0, a, -Math.PI / 2);
  }
  oval(foot, `${name}-hind-toe`, matte(LEG, 0.55), -1.8, -TURKEY_ANKLE + 0.45, 0, 1.6, 0.45, 0.45);
  return limb;
}

function makeWing(body: THREE.Object3D, zSide: Side): TurkeyWing {
  const root = group(body, `turkey-wing-${zSide > 0 ? 'near' : 'far'}`, 5, 15, zSide * 9.3);
  // Folded, the span lies back along the body (-x) with the feathers hanging below it (-y).
  oval(root, 'turkey-wing-coverts', matte(BRONZE, 0.55), -6, -1.2, zSide * 0.7, 8, 4.4, 1.5);
  oval(root, 'turkey-wing-shoulder', matte(COPPER, 0.55), -1.5, 0, zSide * 0.9, 3.2, 3, 1.4);
  for (let i = 0; i < 4; i++) {
    const f = part(
      root,
      'turkey-secondary',
      featherGeometry(8.5, 2.8, WING),
      featherMaterial(),
      -2.5 - i * 2.6,
      -1.5,
      zSide * (0.2 - i * 0.05),
    );
    f.rotation.z = -Math.PI / 2 - 0.45 - i * 0.06;
  }
  const hand = group(root, 'turkey-wing-hand', -12, 0.3, zSide * 0.15);
  const primaries = [0, 1, 2, 3].map((i) => {
    const pivot = group(hand, 'turkey-primary', 0, -i * 0.5, zSide * -0.05 * i);
    part(
      pivot,
      'turkey-primary-vane',
      featherGeometry(12.5 - i * 0.6, 2.7, WING),
      featherMaterial(),
    );
    return pivot;
  });
  // Spread: span out to the side (model z), feathers trailing back (-x).
  const extended = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 0, -zSide),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, -zSide, 0),
    ),
  );
  return { root, zSide, hand, primaries, extended };
}

function makeHead(neck: Limb) {
  const head = group(neck.end, 'turkey-head');
  const skin = matte(HEAD_SKIN, 0.5);
  oval(head, 'turkey-skull', skin, 2.3, 0.9, 0, 4.2, 3.6, 3.2);
  oval(head, 'turkey-crown', matte(0xe8f0f4, 0.5), 1.4, 3.3, 0, 2.8, 1.2, 2.3);
  const throat = matte(RED, 0.45),
    snoodSkin = matte(RED, 0.45),
    wattleSkin = matte(RED, 0.45);
  oval(head, 'turkey-throat', throat, 1, -1.7, 0, 3.1, 2.3, 2.5);
  part(
    head,
    'turkey-beak',
    new THREE.ConeGeometry(1.15, 4.4, 10),
    matte(BEAK, 0.35),
    7.4,
    0.5,
    0,
  ).rotation.z = -Math.PI / 2;
  const jaw = group(head, 'turkey-jaw', 5.4, -0.1, 0);
  part(
    jaw,
    'turkey-lower-beak',
    new THREE.ConeGeometry(0.75, 3.4, 8),
    matte(0xc49a5c, 0.4),
    1.7,
    0,
    0,
  ).rotation.z = -Math.PI / 2;
  const beakTip = new THREE.Object3D();
  beakTip.name = 'turkey-beak-tip';
  beakTip.position.set(TURKEY_TIP.x, TURKEY_TIP.y, 0);
  head.add(beakTip);
  const eyes = ([1, -1] as const).map((z) => {
    const eye = group(head, 'turkey-eye', 3.7, 1.5, z * 2.85);
    const white = oval(
      eye,
      'turkey-eye-white',
      matte(0xfbfbf6, 0.3),
      -0.05,
      0,
      -z * 0.15,
      1.15,
      1.15,
      0.6,
    );
    oval(eye, 'turkey-iris', matte(0x1d1410, 0.2), 0, 0, 0, 0.8, 0.8, 0.55);
    oval(eye, 'turkey-glint', matte(0xffffff, 0.1), 0.25, 0.3, z * 0.5, 0.27, 0.27, 0.15);
    return { group: eye, white };
  });
  const snood = group(head, 'turkey-snood', 5.6, 2.4, 1);
  part(snood, 'turkey-snood-drop', dropGeometry(0.75), snoodSkin);
  const wattle = group(head, 'turkey-wattle', 1.6, -3.3, 0);
  const lobe = part(wattle, 'turkey-wattle-drop', dropGeometry(1.25), wattleSkin);
  lobe.scale.z = 0.6;
  const bumps = [
    [-0.5, -3.4, 1.2],
    [0.6, -4, -1],
    [-1.6, -2.4, 0.4],
    [3.2, -2.6, 1.1],
  ] as const;
  const caruncles = bumps.map(([x, y, z]) => {
    const m = matte(RED, 0.45);
    oval(head, 'turkey-caruncle', m, x, y, z, 0.8, 0.8, 0.8);
    return m;
  });
  return {
    head,
    jaw,
    beakTip,
    eyes,
    snood,
    wattle,
    skin,
    flesh: [throat, snoodSkin, wattleSkin, ...caruncles],
  };
}

function makeTail(body: THREE.Object3D) {
  const tail = group(body, 'turkey-tail', -14, 13, 0);
  const fan = group(tail, 'turkey-fan');
  const tailFeathers = Array.from({ length: TAIL_FEATHERS }, (_, i) => {
    const pivot = group(fan, 'turkey-tail-feather', 0, 0, (i - TAIL_FEATHERS / 2) * 0.05);
    part(
      pivot,
      'turkey-tail-vane',
      featherGeometry(24 - Math.abs(i - 5) * 0.5, 3.9, TAIL),
      featherMaterial(),
    );
    return pivot;
  });
  const coverts = Array.from({ length: COVERTS }, (_, i) => {
    const pivot = group(fan, 'turkey-tail-covert');
    part(
      pivot,
      'turkey-covert-vane',
      featherGeometry(13 - Math.abs(i - 3) * 0.4, 3.4, COVERT),
      featherMaterial(),
    );
    return pivot;
  });
  oval(tail, 'turkey-tail-base', matte(BRONZE_DARK, 0.6), 1.5, 0, 0, 4, 3.4, 4);
  return { tail, fan, tailFeathers, coverts };
}

/** Overlapping rows of copper-and-black scale feathers laid on the body surface on both sides. */
function featherTiers(plumage: THREE.Object3D) {
  const toward = new THREE.Vector3(),
    normal = new THREE.Vector3(),
    flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  for (const zs of [1, -1])
    for (let r = 0; r < 4; r++)
      for (const x of [-11, -6, -1, 4, 9]) {
        const y = 17 - r * 4.6,
          q = ((x - 1) / 14) ** 2 + ((y - 10) / 11) ** 2;
        if (q > 0.85) continue;
        const z = zs * (9.5 * Math.sqrt(1 - q) + 0.35 + r * 0.12);
        const tier = part(
          plumage,
          'turkey-body-feather',
          scaleGeometry(),
          featherMaterial(),
          x + (r % 2) * 2,
          y,
          z,
        );
        tier.scale.set(3.3, 3.9, 1);
        normal.set((x - 1) / 196, (y - 10) / 121, z / 90.25).normalize();
        tier.quaternion.setFromUnitVectors(toward.set(0, 0, zs), normal);
        if (zs < 0) tier.quaternion.multiply(flip);
      }
}

/** Places of the loose body feathers: back, flank and rump on both sides. */
const LOOSE_SPOTS = [
  [-5, 15, 1],
  [3, 5, 1],
  [-8, 9, 1],
  [-4, 12, -1],
  [5, 15, 1],
  [0, 5, -1],
] as const;

export function makeTurkey(id: string): THREE.Group {
  const plan = turkeyPlan(id);
  const root = new THREE.Group();
  root.name = 'thanksgiving-turkey';
  const legs: [Limb, Limb] = [
    makeLeg(root, 'turkey-leg-near', 3.4),
    makeLeg(root, 'turkey-leg-far', -3.4),
  ];
  const body = group(root, 'turkey-body', 0, TURKEY_HIP, 0);
  const plumage = group(body, 'turkey-plumage');
  oval(plumage, 'turkey-core', matte(BRONZE, 0.55), 1, 10, 0, 14, 11, 9.5);
  oval(plumage, 'turkey-breast', matte(COPPER, 0.5), 9.5, 8, 0, 7.5, 9, 8);
  oval(plumage, 'turkey-rump', matte(BRONZE_DARK, 0.6), -10, 11, 0, 8, 7, 7.5);
  featherTiers(plumage);
  // The tom's beard: a black tuft hanging from the breast.
  for (const z of [-0.6, 0, 0.6]) {
    const hair = part(
      plumage,
      'turkey-beard',
      new THREE.ConeGeometry(0.5, 7, 5),
      matte(0x15100c, 0.8),
      16.4,
      5.4,
      z,
    );
    hair.rotation.z = Math.PI - 0.25 + z * 0.15;
  }
  const loose = LOOSE_SPOTS.slice(0, TURKEY_LOOSE).map(([x, y, zs], i) => {
    const q = Math.min(0.95, ((x - 1) / 14) ** 2 + ((y - 10) / 11) ** 2);
    const f = part(
      plumage,
      `turkey-loose-${i}`,
      looseFeatherGeometry(i),
      featherMaterial(),
      x,
      y,
      zs * (9.5 * Math.sqrt(1 - q) + 1),
    );
    f.rotation.set(0, zs < 0 ? Math.PI : 0, zs < 0 ? -0.55 : Math.PI + 0.55);
    return f;
  });
  const { tail, fan, tailFeathers, coverts } = makeTail(body);
  const wings = [makeWing(body, 1), makeWing(body, -1)];
  const neck = makeLimb(
    body,
    'turkey-neck',
    TURKEY_NECK.x,
    TURKEY_NECK.y,
    0,
    12,
    11,
    3.1,
    matte(BRONZE, 0.6),
    matte(BRONZE_DARK, 0.7),
  );
  // Feathered base, a bristling hackle ruff at the bend, bare red skin up to the head.
  neck.lower.geometry.dispose();
  neck.lower.geometry = new THREE.CylinderGeometry(1.5, 2, 1, 10);
  const neckSkin = matte(RED, 0.5);
  replaceMaterial(neck.lower, neckSkin);
  neck.joint.geometry.dispose();
  neck.joint.geometry = new THREE.IcosahedronGeometry(3.1, 1);
  const head = makeHead(neck);
  models.set(root, {
    plan,
    body,
    plumage,
    legs,
    neck,
    ...head,
    flesh: [...head.flesh, neckSkin],
    tail,
    fan,
    tailFeathers,
    coverts,
    wings,
    loose,
  });
  turkeyPose(root, TURKEY_REST);
  return root;
}

export function turkeyModel(root: THREE.Group): TurkeyModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native turkey');
  return model;
}

export interface TurkeyPose {
  /** Distance walked in model units; planted feet stay put while it is unchanged. */
  readonly walked: number;
  readonly stride: number;
  readonly lift: number;
  /** Lowers a lifted foot onto the floor without sliding it. */
  readonly planted: number;
  /** Draws the legs up under the body while airborne. */
  readonly tuck: number;
  readonly hip: number;
  readonly pitch: number;
  readonly puff: number;
  readonly fan: number;
  readonly rattle: number;
  /** Which model side (z) faces the viewer, so the fan opens toward the camera. */
  readonly toward: Side;
  readonly unfold: number;
  readonly flap: number;
  readonly droop: number;
  /** Neck end (head base) in root space, and the beak's angle in root space. */
  readonly neck: { readonly x: number; readonly y: number };
  readonly beak: number;
  readonly turn: number;
  readonly gape: number;
  readonly snood: number;
  readonly flush: number;
  readonly blink: number;
  readonly alarm: number;
  readonly swing: number;
  readonly time: number;
}
export const TURKEY_REST: TurkeyPose = {
  walked: 0,
  stride: 14,
  lift: 5,
  planted: 1,
  tuck: 0,
  hip: TURKEY_HIP,
  pitch: 0.08,
  puff: 0,
  fan: 0,
  rattle: 0,
  toward: 1,
  unfold: 0,
  flap: 0,
  droop: 0,
  neck: { x: 15.5, y: 55 },
  beak: 0.05,
  turn: 0,
  gape: 0,
  snood: 0.2,
  flush: 0,
  blink: 0,
  alarm: 0,
  swing: 0,
  time: 0,
};

const IDENTITY = new THREE.Quaternion(),
  X_AXIS = new THREE.Vector3(1, 0, 0),
  Z_AXIS = new THREE.Vector3(0, 0, 1),
  qa = new THREE.Quaternion(),
  qb = new THREE.Quaternion(),
  qc = new THREE.Quaternion(),
  skinCold = new THREE.Color(HEAD_SKIN),
  skinHot = new THREE.Color(HEAD_FLUSH),
  redCold = new THREE.Color(RED),
  redHot = new THREE.Color(RED_FLUSH);

export function turkeyPose(root: THREE.Group, q: TurkeyPose) {
  const m = turkeyModel(root);
  m.body.position.set(0, q.hip, 0);
  m.body.rotation.set(0, 0, q.pitch);
  m.plumage.scale.setScalar(1 + 0.1 * q.puff);
  m.legs.forEach((leg, i) => {
    const g = gait(q.walked, q.stride, i * 0.5, q.lift);
    leg.root.position.y = q.hip;
    const x = mix(g.x + (i ? -1.2 : 1.2), -2.5 + i * 1.5, q.tuck);
    const y = mix(g.y * (1 - q.planted), 8, q.tuck);
    const toe = -0.35 * g.swing * (1 - q.planted) * (1 - q.tuck) - 0.8 * q.tuck;
    reach(leg, x, -(q.hip - TURKEY_ANKLE) + y, -1, toe);
  });
  // The neck end is given in root space; convert it into the pitched body's space.
  const c = Math.cos(q.pitch),
    s = Math.sin(q.pitch),
    dy = q.neck.y - q.hip;
  reach(
    m.neck,
    q.neck.x * c + dy * s - TURKEY_NECK.x,
    -q.neck.x * s + dy * c - TURKEY_NECK.y,
    1,
    q.beak - q.pitch,
  );
  m.head.rotation.set(0, -q.toward * q.turn, 0);
  m.jaw.rotation.z = -0.5 * q.gape;
  // Snood and wattle hang under gravity whatever the head does, swinging with its jerks.
  m.snood.rotation.z = -q.beak + 0.3 + 0.25 * q.swing;
  m.snood.position.z = q.toward;
  m.snood.scale.set(1, mix(3.2, 7, q.snood), 1);
  m.wattle.rotation.z = -q.beak - 0.15 + 0.3 * q.swing;
  m.wattle.scale.set(1, 4.4 + 1.2 * q.flush, 1);
  m.skin.color.lerpColors(skinCold, skinHot, q.flush);
  for (const mat of m.flesh) mat.color.lerpColors(redCold, redHot, q.flush);
  for (const eye of m.eyes) {
    const wide = 1 + 0.35 * q.alarm;
    eye.group.scale.set(wide, wide * Math.max(0.08, 1 - q.blink), wide);
    eye.white.scale.set(1.15 * q.alarm + 0.01, 1.15 * q.alarm + 0.01, 0.6);
  }
  const open = q.fan;
  m.tail.rotation.z = mix(0.3, -0.1, open);
  m.fan.rotation.y = -q.toward * mix(Math.PI, FAN_YAW, open);
  m.tailFeathers.forEach((f, i) => {
    const t = i / (TAIL_FEATHERS - 1);
    f.rotation.z =
      mix(0.02 + 0.012 * i, mix(0.1, 2.85, t), open) +
      q.rattle * 0.06 * Math.sin(q.time * 0.11 + i * 1.7);
  });
  m.coverts.forEach((f, i) => {
    const t = i / (COVERTS - 1);
    f.position.z = -q.toward * 0.7;
    f.rotation.z =
      mix(0.05 + 0.01 * i, mix(0.3, 2.6, t), open) + q.rattle * 0.04 * Math.sin(q.time * 0.13 + i);
  });
  for (const w of m.wings) {
    qa.slerpQuaternions(IDENTITY, w.extended, q.unfold);
    qb.setFromAxisAngle(X_AXIS, -w.zSide * q.flap * q.unfold);
    qc.setFromAxisAngle(Z_AXIS, -0.3 * q.droop);
    w.root.quaternion.copy(qb).multiply(qa).multiply(qc);
    w.hand.rotation.z = (1 - q.unfold) * 0.16 - 0.25 * q.unfold * Math.max(0, -q.flap);
    w.primaries.forEach(
      (f, i) => (f.rotation.z = Math.PI - 0.1 + (i - 1.5) * (0.06 + 0.22 * q.unfold)),
    );
  }
}
