import * as THREE from 'three';
import { gravyPlan, type GravyPlan } from './gravy-choreography';
import {
  gait,
  glossy,
  glow,
  makeLimb,
  matte,
  oval,
  part,
  reach,
  type Limb,
  clamp as clamp01,
} from '../../kit';

const SKIN = 0xf1c09a,
  CHEEK = 0xe9877a,
  COAT = 0xf4f0e6,
  COAT_SHADE = 0xdcd5c6,
  APRON = 0xfffbf0,
  NAVY = 0x1f3a64,
  GOLD = 0xdcaa3c,
  TROUSER = 0x343a46,
  SHOE = 0x16161a,
  HAIR = 0x6e4426,
  PORCELAIN = 0xfbf8f2,
  GRAVY = 0x6a3818,
  ROLL = 0xd9a35a,
  SOGGY = 0x7b4a22;

export const GRAVY_HIP = new THREE.Vector2(0, 28);
export const GRAVY_SHOULDER = new THREE.Vector2(1.5, 24);
/** The shoe oval bottoms out exactly this far below the ankle, so planted soles sit on the floor. */
export const GRAVY_ANKLE = 3.1;
/** The boat's handle sits in the palm with its length running along the fingers. */
export const BOAT_REST = -Math.PI / 2;
const BOAT_GRIP = new THREE.Vector3(0, -2.6, 0);
const ROLL_GRIP = new THREE.Vector3(0, -4.4, 0.6);
const LIP = new THREE.Vector3(25.3, 6.1, 0);

export interface GravyModel {
  readonly plan: GravyPlan;
  readonly body: THREE.Group;
  readonly head: THREE.Group;
  readonly hat: THREE.Group;
  readonly lids: readonly THREE.Mesh[];
  readonly brows: readonly THREE.Mesh[];
  readonly mouth: THREE.Mesh;
  /** [boat arm, roll arm]. */
  readonly arms: readonly [Limb, Limb];
  readonly legs: readonly [Limb, Limb];
  readonly boat: THREE.Group;
  readonly boatBody: THREE.Group;
  readonly lip: THREE.Object3D;
  readonly gravyTop: THREE.Mesh;
  readonly bead: THREE.Mesh;
  readonly dribble: THREE.Mesh;
  readonly roll: THREE.Group;
  readonly lobes: readonly THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[];
  readonly soak: THREE.Mesh;
  readonly wiper: THREE.Object3D;
}
const models = new WeakMap<THREE.Group, GravyModel>();

function hand(limb: Limb, name: string) {
  oval(limb.end, `${name}-palm`, matte(SKIN, 0.6), 0, -2.5, 0, 2.2, 2.7, 1.7);
  oval(limb.end, `${name}-thumb`, matte(SKIN, 0.6), 1.5, -1.6, 0.9, 0.8, 1.5, 0.8).rotation.z =
    -0.5;
  part(
    limb.end,
    `${name}-cuff`,
    new THREE.CylinderGeometry(2.4, 2.6, 1.6, 12),
    matte(NAVY, 0.6),
    0,
    0.5,
    0,
  );
}

/** A porcelain gravy boat: shallow bowl, navy band, gold rim, open trough spout and curled handle. */
function makeBoat(parent: THREE.Object3D): {
  boat: THREE.Group;
  body: THREE.Group;
  lip: THREE.Object3D;
  top: THREE.Mesh;
  bead: THREE.Mesh;
  dribble: THREE.Mesh;
} {
  const boat = new THREE.Group();
  boat.name = 'gravy-boat';
  boat.position.copy(BOAT_GRIP);
  boat.rotation.z = BOAT_REST;
  parent.add(boat);
  // The body rolls about the boat's length so the viewer can see into the bowl from either side.
  const body = new THREE.Group();
  body.name = 'gravy-boat-body';
  boat.add(body);
  const bowl = part(
    body,
    'gravy-boat-bowl',
    new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    glossy(PORCELAIN, 0.2),
    13,
    1.2,
    0,
  );
  bowl.scale.set(9.8, 6.4, 5.4);
  const band = part(
    body,
    'gravy-boat-band',
    new THREE.SphereGeometry(1.02, 24, 2, 0, Math.PI * 2, Math.PI / 2 + 0.14, 0.26),
    matte(NAVY, 0.5),
    13,
    1.2,
    0,
  );
  band.scale.copy(bowl.scale);
  const rimGeometry = new THREE.TorusGeometry(1, 0.1, 6, 36);
  rimGeometry.rotateX(Math.PI / 2);
  const rim = part(body, 'gravy-boat-rim', rimGeometry, glossy(GOLD, 0.3), 13, 1.2, 0);
  rim.scale.set(9.7, 7, 5.5);
  const topGeometry = new THREE.CircleGeometry(1, 24);
  topGeometry.rotateX(-Math.PI / 2);
  const top = part(body, 'gravy-boat-gravy', topGeometry, glossy(GRAVY, 0.15), 13, 0.6, 0);
  // Open trough spout, its open half facing up, reaching forward and up to the pouring lip.
  const spout = part(
    body,
    'gravy-boat-spout',
    new THREE.ConeGeometry(3.3, 10.5, 16, 1, true, 0, Math.PI),
    glossy(PORCELAIN, 0.2),
    21.2,
    2.2,
    0,
  );
  spout.rotation.z = -0.95;
  spout.scale.set(1, 1, 0.75);
  const spoutRim = part(
    body,
    'gravy-boat-spout-rim',
    new THREE.TorusGeometry(1, 0.24, 5, 10, Math.PI),
    glossy(GOLD, 0.3),
    LIP.x - 0.3,
    LIP.y - 0.5,
    0,
  );
  spoutRim.rotation.set(Math.PI / 2, 0, -0.95);
  // The handle rises above the rim at the back and curls down into the hand.
  const handle = part(
    body,
    'gravy-boat-handle',
    new THREE.TorusGeometry(3.4, 0.9, 8, 22, (Math.PI * 4) / 3),
    glossy(PORCELAIN, 0.2),
    3.4,
    0.9,
    0,
  );
  handle.rotation.z = Math.PI / 3;
  oval(body, 'gravy-boat-thumbrest', glossy(GOLD, 0.3), 5.1, 4.2, 0, 1, 0.6, 0.8);
  part(
    body,
    'gravy-boat-foot',
    new THREE.CylinderGeometry(3.4, 4.2, 1.6, 16),
    glossy(PORCELAIN, 0.2),
    13,
    -4.9,
    0,
  );
  // Gravy beads at the lip while pouring and a dribble left down the spout afterwards.
  const bead = oval(
    body,
    'gravy-boat-bead',
    glossy(GRAVY, 0.12),
    LIP.x,
    LIP.y - 0.3,
    0,
    1.2,
    1,
    1.1,
  );
  const dribble = oval(
    body,
    'gravy-boat-dribble',
    glossy(GRAVY, 0.15),
    22.6,
    0.2,
    2.2,
    0.7,
    2.4,
    0.5,
  );
  dribble.rotation.z = -0.5;
  const lip = new THREE.Object3D();
  lip.name = 'gravy-boat-lip';
  lip.position.copy(LIP);
  body.add(lip);
  return { boat, body, lip, top, bead, dribble };
}

/** A soft cloverleaf dinner roll held in the palm; its centre is what presses on the card. */
function makeRoll(parent: THREE.Object3D) {
  const roll = new THREE.Group();
  roll.name = 'gravy-roll';
  roll.position.copy(ROLL_GRIP);
  parent.add(roll);
  const lobes = [
    [-1.6, -0.4, 0.4],
    [1.6, -0.4, 0.4],
    [0, 1.3, -0.3],
  ].map(([x = 0, y = 0, z = 0], i) => {
    const lobe = new THREE.Mesh(
      new THREE.SphereGeometry(1, 14, 10),
      new THREE.MeshStandardMaterial({ color: ROLL, roughness: 0.55, side: THREE.DoubleSide }),
    );
    lobe.name = `gravy-roll-lobe-${i}`;
    lobe.position.set(x, y, z);
    lobe.scale.set(2.5, 2.2, 2.4);
    roll.add(lobe);
    return lobe;
  });
  oval(roll, 'gravy-roll-crust', glossy(0xa8652a, 0.35), 0, 0.2, 2.1, 1.6, 0.9, 0.5);
  const soak = oval(roll, 'gravy-roll-soak', glossy(GRAVY, 0.12), 0, -1.4, 1.6, 3.4, 1.4, 1.2);
  const wiper = new THREE.Object3D();
  wiper.name = 'gravy-roll-contact';
  roll.add(wiper);
  return { roll, lobes, soak, wiper };
}

function makeHead(body: THREE.Group) {
  const head = new THREE.Group();
  head.name = 'gravy-head';
  head.position.set(2.8, 33.2, 0);
  body.add(head);
  oval(head, 'gravy-skull', matte(SKIN, 0.6), 0, 0, 0, 6.6, 6.9, 6.3);
  oval(head, 'gravy-jowl', matte(SKIN, 0.6), 2.4, -3.2, 0, 4.6, 3.6, 5.2);
  oval(head, 'gravy-nose', matte(0xeb9c80, 0.5), 6.7, -0.4, 0, 1.9, 1.6, 1.6);
  oval(head, 'gravy-hair', matte(HAIR, 0.7), -2.6, -0.6, 0, 4.6, 4.8, 6.1);
  const lids: THREE.Mesh[] = [],
    brows: THREE.Mesh[] = [];
  for (const z of [-1, 1]) {
    oval(head, 'gravy-ear', matte(SKIN, 0.6), -0.6, -0.4, z * 6.1, 1.3, 1.9, 0.8);
    oval(head, 'gravy-cheek', matte(CHEEK, 0.6), 4.4, -2.2, z * 4.1, 1.8, 1.3, 1);
    oval(head, 'gravy-eye-white', matte(0xffffff, 0.3), 4.9, 1.5, z * 3.3, 1.15, 1.35, 0.7);
    oval(head, 'gravy-pupil', matte(0x1b120c, 0.3), 5.5, 1.4, z * 3.65, 0.6, 0.8, 0.45);
    oval(head, 'gravy-glint', glow(0xffffff), 5.8, 1.85, z * 3.95, 0.24, 0.24, 0.15);
    const lid = oval(head, 'gravy-lid', matte(SKIN, 0.6), 5, 2.4, z * 3.4, 1.35, 1.5, 0.85);
    lid.visible = false;
    lids.push(lid);
    const brow = part(
      head,
      'gravy-brow',
      new THREE.BoxGeometry(2.8, 0.7, 0.7),
      matte(HAIR, 0.6),
      4.9,
      3.6,
      z * 3.5,
    );
    brows.push(brow);
    // A curled handlebar moustache, one half per side of the nose.
    const tash = oval(
      head,
      'gravy-moustache',
      matte(HAIR, 0.6),
      6.1,
      -2.4,
      z * 1.5,
      1.2,
      0.85,
      2.1,
    );
    tash.rotation.x = z * 0.3;
    oval(head, 'gravy-moustache-curl', matte(HAIR, 0.6), 5.6, -1.7, z * 3.5, 0.6, 0.75, 0.6);
  }
  const mouth = oval(head, 'gravy-mouth', matte(0x5a1c14, 0.5), 5.9, -3.9, 0, 0.9, 0.35, 1.5);
  // Chef's toque with a navy hatband and a gold anchor badge: the captain of the gravy boat.
  const hat = new THREE.Group();
  hat.name = 'gravy-hat';
  hat.position.set(-0.4, 5, 0);
  head.add(hat);
  part(
    hat,
    'gravy-hat-band',
    new THREE.CylinderGeometry(6.3, 6.1, 4.2, 22),
    matte(COAT, 0.75),
    0,
    0.6,
    0,
  );
  part(
    hat,
    'gravy-hat-stripe',
    new THREE.CylinderGeometry(6.45, 6.35, 1.3, 22, 1, true),
    matte(NAVY, 0.5),
    0,
    -0.4,
    0,
  );
  for (const z of [-1, 1]) {
    const badge = part(
      hat,
      'gravy-hat-anchor',
      new THREE.CircleGeometry(1.25, 14),
      glossy(GOLD, 0.3),
      Math.cos(0.75) * 6.5,
      0.6,
      z * Math.sin(0.75) * 6.5,
    );
    badge.rotation.y = z * (Math.PI / 2 - 0.75);
    const shank = part(
      hat,
      'gravy-hat-anchor-shank',
      new THREE.BoxGeometry(0.3, 1.5, 0.2),
      matte(NAVY, 0.5),
      Math.cos(0.75) * 6.65,
      0.6,
      z * Math.sin(0.75) * 6.65,
    );
    shank.rotation.y = badge.rotation.y;
  }
  [
    [0, 5.2, 0, 7.6, 4.6, 7],
    [-2.6, 7.4, 1.6, 4.4, 3.8, 4.4],
    [2.5, 7.6, -1.2, 4.5, 3.9, 4.3],
    [0.4, 8.6, 0.2, 4.6, 3.2, 4.6],
  ].forEach(([x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1], i) =>
    oval(hat, `gravy-hat-puff-${i}`, matte(i % 2 ? COAT : 0xfdfbf5, 0.8), x, y, z, sx, sy, sz),
  );
  return { head, hat, lids, brows, mouth };
}

export function makeGravy(id: string): THREE.Group {
  const plan = gravyPlan(id);
  const root = new THREE.Group();
  root.name = 'thanksgiving-gravy-captain';
  const body = new THREE.Group();
  body.name = 'gravy-body';
  body.position.set(GRAVY_HIP.x, GRAVY_HIP.y, 0);
  root.add(body);
  oval(body, 'gravy-seat', matte(TROUSER, 0.8), -0.5, 1, 0, 8.4, 6, 7);
  oval(body, 'gravy-jacket', matte(COAT, 0.75), 1, 13, 0, 10.5, 13, 8.6);
  oval(body, 'gravy-apron', matte(APRON, 0.85), 2.4, 5.4, 0, 9.9, 8.4, 8.9);
  const tie = part(
    body,
    'gravy-apron-tie',
    new THREE.TorusGeometry(1, 0.05, 5, 30),
    matte(NAVY, 0.6),
    1.2,
    10.4,
    0,
  );
  tie.rotation.x = Math.PI / 2;
  tie.scale.set(10.6, 9.1, 18);
  oval(body, 'gravy-apron-pocket', matte(COAT_SHADE, 0.85), 8.3, 4.6, 4.6, 2.2, 2.2, 1.6);
  // Double-breasted jacket: two rows of navy buttons on each side of the front.
  for (const z of [-1, 1])
    for (const [k, a] of [0.32, 0.62].entries())
      for (let i = 0; i < 3; i++) {
        const y = 13.5 + i * 3.4,
          shrink = Math.sqrt(Math.max(0, 1 - ((y - 13) / 13) ** 2));
        oval(
          body,
          `gravy-button-${k}`,
          glossy(NAVY, 0.3),
          1 + 10.6 * Math.cos(a) * shrink,
          y,
          z * 8.7 * Math.sin(a) * shrink,
          0.6,
          0.6,
          0.6,
        );
      }
  for (const z of [-7.6, 7.6])
    oval(body, 'gravy-shoulder', matte(COAT, 0.75), 1.2, 23.6, z, 4.3, 3.8, 3.6);
  part(
    body,
    'gravy-neck',
    new THREE.CylinderGeometry(2.6, 3.2, 4.6, 12),
    matte(SKIN, 0.6),
    2.2,
    27.6,
    0,
  );
  // Sailor's neckerchief: a navy knot with two tails.
  oval(body, 'gravy-kerchief-knot', matte(NAVY, 0.6), 6.2, 25.2, 0, 1.8, 1.6, 2.2);
  for (const z of [-1, 1]) {
    const tail = oval(
      body,
      'gravy-kerchief-tail',
      matte(NAVY, 0.6),
      7.3,
      22.4,
      z * 1.4,
      0.9,
      2.8,
      0.9,
    );
    tail.rotation.z = -0.25;
    oval(
      body,
      'gravy-kerchief-stripe',
      matte(0xf6f6f6, 0.6),
      7.9,
      21.6,
      z * 1.4,
      0.35,
      1.2,
      0.95,
    ).rotation.z = -0.25;
  }
  const face = makeHead(body);

  const arm = (name: string, z: number) => {
    const limb = makeLimb(
      body,
      name,
      GRAVY_SHOULDER.x,
      GRAVY_SHOULDER.y,
      z,
      15.5,
      14,
      2.4,
      matte(COAT, 0.75),
      matte(COAT_SHADE, 0.75),
    );
    hand(limb, name);
    return limb;
  };
  const boatArm = arm('gravy-arm-boat', 8.4),
    rollArm = arm('gravy-arm-roll', -8.4);
  const boat = makeBoat(boatArm.end);
  const roll = makeRoll(rollArm.end);
  const leg = (name: string, z: number) => {
    const limb = makeLimb(
      root,
      name,
      GRAVY_HIP.x,
      GRAVY_HIP.y,
      z,
      13.5,
      13,
      2.8,
      matte(TROUSER, 0.8),
    );
    oval(limb.end, `${name}-shoe`, glossy(SHOE, 0.3), 2.6, -1.3, 0, 4.6, 1.8, 2.6);
    oval(limb.end, `${name}-sock`, matte(NAVY, 0.6), 0, 0.4, 0, 2.6, 1.2, 2.6);
    return limb;
  };
  const legs: [Limb, Limb] = [leg('gravy-leg-front', 4.2), leg('gravy-leg-back', -4.2)];
  models.set(root, {
    plan,
    body,
    head: face.head,
    hat: face.hat,
    lids: face.lids,
    brows: face.brows,
    mouth: face.mouth,
    arms: [boatArm, rollArm],
    legs,
    boat: boat.boat,
    boatBody: boat.body,
    lip: boat.lip,
    gravyTop: boat.top,
    bead: boat.bead,
    dribble: boat.dribble,
    roll: roll.roll,
    lobes: roll.lobes,
    soak: roll.soak,
    wiper: roll.wiper,
  });
  gravyPose(root, GRAVY_REST);
  return root;
}

export function gravyModel(root: THREE.Group): GravyModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native gravy chef');
  return model;
}

const inHand = new THREE.Vector3();
/** A marker's position in its hand's end space, for solving the grip that puts it on a target. */
export function inHandOf(marker: THREE.Object3D, end: THREE.Object3D): { x: number; y: number } {
  inHand.set(0, 0, 0);
  for (let at: THREE.Object3D | null = marker; at && at !== end; at = at.parent) {
    at.updateMatrix();
    inHand.applyMatrix4(at.matrix);
  }
  return { x: inHand.x, y: inHand.y };
}

export interface GravyPose {
  /** Distance walked in model units; planted feet stay put while it is unchanged. */
  readonly walked: number;
  /** Stride length in model units; only changed while both feet are planted. */
  readonly stride: number;
  readonly planted: number;
  readonly crouch: number;
  readonly lean: number;
  readonly sway: number;
  readonly headTurn: number;
  readonly headTilt: number;
  readonly hatLag: number;
  readonly blink: number;
  readonly brows: number;
  readonly mouth: number;
  readonly level: number;
  readonly bead: number;
  readonly dribble: number;
  readonly boatRoll: number;
  readonly soak: number;
  readonly eaten: number;
}
export const GRAVY_REST: GravyPose = {
  walked: 0,
  stride: 15,
  planted: 1,
  crouch: 0,
  lean: 0.04,
  sway: 0,
  headTurn: 0,
  headTilt: 0,
  hatLag: 0,
  blink: 0,
  brows: 0,
  mouth: 0,
  level: 1,
  bead: 0,
  dribble: 0,
  boatRoll: 0.38,
  soak: 0,
  eaten: 0,
};

const soggy = new THREE.Color(SOGGY),
  fresh = new THREE.Color(ROLL);
/** Poses legs, body, face and props; the arms are placed afterwards by the trick against world targets. */
export function gravyPose(root: THREE.Group, q: GravyPose) {
  const m = gravyModel(root);
  const stride = q.stride;
  const bob =
    Math.abs(Math.sin((q.walked / stride) * Math.PI * 2)) *
    (m.plan.march ? 0.9 : 0.5) *
    (1 - q.planted);
  const hip = GRAVY_HIP.y - q.crouch - bob;
  m.legs.forEach((leg, i) => {
    const step = gait(q.walked, stride, i * 0.5, Math.min(4.2, 1.2 + stride * 0.16));
    leg.root.position.y = hip;
    reach(
      leg,
      step.x * (1 - q.planted) + (i ? -1.6 : 1.4),
      -(hip - GRAVY_ANKLE) + step.y * (1 - q.planted),
      1,
      0,
    );
  });
  // A waddle rocks the body over each stance foot; a march stays upright.
  const rock = m.plan.march
    ? 0
    : 0.05 * Math.sin((q.walked / stride) * Math.PI * 2) * (1 - q.planted);
  m.body.position.set(GRAVY_HIP.x, hip, 0);
  m.body.rotation.set(rock + q.sway, 0, -q.lean);
  m.head.rotation.set(0, q.headTurn, q.headTilt);
  m.hat.rotation.set(0, 0, q.hatLag);
  m.lids.forEach((lid) => {
    lid.visible = q.blink > 0.04;
    lid.scale.y = 1.5 * Math.max(0.05, q.blink);
    lid.position.y = 2.4 + 1.1 * (1 - q.blink);
  });
  m.brows.forEach((brow) => {
    brow.position.y = 3.6 + 0.8 * q.brows;
    brow.rotation.z = -0.3 * q.brows;
  });
  m.mouth.scale.set(0.9 + 0.3 * q.mouth, 0.35 + 1.1 * q.mouth, 1.5);
  m.boatBody.rotation.x = q.boatRoll;
  const level = Math.max(0.05, q.level);
  m.gravyTop.position.y = -4.4 + 5 * level;
  const across = Math.sqrt(Math.max(0.02, 1 - ((1.2 - m.gravyTop.position.y) / 6.4) ** 2));
  m.gravyTop.scale.set(9.4 * across, 1, 5.1 * across);
  m.bead.visible = q.bead > 0.02;
  m.bead.scale.set(1.2 * q.bead + 0.01, 1 + 0.6 * q.bead, 1.1 * q.bead + 0.01);
  m.dribble.visible = q.dribble > 0.02;
  m.dribble.scale.set(0.7, 2.4 * q.dribble + 0.01, 0.5);
  m.lobes.forEach((lobe, i) => {
    const bite = clamp01(q.eaten - (2 - i));
    lobe.visible = bite < 0.99;
    lobe.scale.set(2.5 * (1 - 0.6 * bite), 2.2 * (1 - 0.6 * bite), 2.4 * (1 - 0.6 * bite));
    lobe.material.color.copy(fresh).lerp(soggy, Math.min(1, q.soak * (i === 2 ? 0.6 : 1)));
  });
  m.soak.visible = q.soak > 0.03;
  m.soak.scale.set(3.4, 0.4 + 1.2 * q.soak, 1.2);
}

/** A smooth, rounded puddle outline (radius about one) for glossy gravy. */
export function puddleShape(phase: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 0.86 + 0.1 * Math.sin(a * 3 + phase) + 0.05 * Math.sin(a * 5 - phase * 1.3);
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  return shape;
}
