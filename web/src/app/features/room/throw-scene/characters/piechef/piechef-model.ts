import * as THREE from 'three';
import { piechefPlan, type PiechefPlan } from './piechef-choreography';
import { bone, makeLimb, matte, oval, part, reach, type Limb } from '../../kit';

const JACKET = 0xf8f5ee,
  JACKET_SHADE = 0xe2dccf,
  TROUSERS = 0x46434f,
  CLOG = 0x2b2525,
  SKIN = 0xf1c29c,
  CHEEK = 0xea8f84,
  HAIR = 0x5c3a22,
  MITT = 0xc9442f,
  MITT_DARK = 0x9c2f1f,
  MITT_CUFF = 0xf2dfc0,
  APRON = 0x8fb0c8,
  APRON_DARK = 0x52779a,
  SCARF = 0xc8323a,
  TIN = 0xb9c1c9,
  CRUST = 0xd9a052,
  FILLING = 0xd8782c,
  CREAM = 0xfff6e8;

export const PIECHEF_HIP = 21;
export const PIECHEF_HIP_X = 0.6;
/** Shoulder pivot in body space. */
export const PIECHEF_SHOULDER = new THREE.Vector2(0.8, 20.5);
/** Body-space height of the head pivot; the toque sits on top. */
export const PIECHEF_HEAD = new THREE.Vector2(2.4, 29.5);
export const PIE_RADIUS = 7;
/** Rim radius where the mitts hold the tin. */
export const PIE_RIM = PIE_RADIUS + 0.4;
/** Height of the filling face above the tin centre, in pie space. */
export const PIE_FACE = 1.3;

export interface PiechefModel {
  readonly plan: PiechefPlan;
  readonly body: THREE.Group;
  readonly head: THREE.Group;
  readonly toque: THREE.Group;
  readonly brim: THREE.Object3D;
  readonly apron: THREE.Group;
  readonly bow: THREE.Group;
  readonly eyes: readonly THREE.Group[];
  readonly brows: readonly THREE.Mesh[];
  readonly mouth: THREE.Mesh;
  readonly arms: readonly [Limb, Limb];
  readonly legs: readonly [Limb, Limb];
  /** Centre of each oven mitt's palm, carried by the arm's end group. */
  readonly grips: readonly [THREE.Object3D, THREE.Object3D];
  readonly pie: THREE.Group;
  readonly fresh: THREE.Group;
  readonly emptied: THREE.Group;
  /** Centre of the filling face: the point that meets the card. */
  readonly face: THREE.Object3D;
  /** Points on the tin rim held by arm 0 and arm 1. */
  readonly rims: readonly [THREE.Object3D, THREE.Object3D];
}
const models = new WeakMap<THREE.Group, PiechefModel>();

function marker(
  parent: THREE.Object3D,
  name: string,
  x: number,
  y: number,
  z: number,
): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
function metal(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: TIN,
    roughness: 0.32,
    metalness: 0.55,
    side: THREE.DoubleSide,
  });
}

/** A crimped crust ring: a torus whose tube bulges in regular pinches around the pie. */
function crimpedRing(radius: number, tube: number, pinches: number): THREE.TorusGeometry {
  const g = new THREE.TorusGeometry(radius, tube, 8, 48);
  const v = g.getAttribute('position');
  for (let i = 0; i < v.count; i++) {
    const x = v.getX(i),
      y = v.getY(i);
    const a = Math.atan2(y, x),
      k = 1 + 0.07 * Math.sin(a * pinches);
    v.setXY(i, x * k, y * k);
  }
  g.computeVertexNormals();
  return g;
}

function makePie(root: THREE.Group) {
  const pie = new THREE.Group();
  pie.name = 'piechef-pie';
  root.add(pie);
  const R = PIE_RADIUS;
  const profile = [
    new THREE.Vector2(0, -2.3),
    new THREE.Vector2(0.72 * R, -2.3),
    new THREE.Vector2(0.97 * R, -0.2),
    new THREE.Vector2(R + 0.55, 0.25),
    new THREE.Vector2(R + 0.55, 0.55),
  ];
  part(pie, 'pie-tin', new THREE.LatheGeometry(profile, 28), metal());
  part(
    pie,
    'pie-tin-stamp',
    new THREE.TorusGeometry(0.42 * R, 0.22, 6, 24),
    metal(),
    0,
    -2.36,
    0,
  ).rotation.x = Math.PI / 2;
  part(
    pie,
    'pie-tin-rim',
    new THREE.TorusGeometry(R + 0.55, 0.32, 6, 32),
    metal(),
    0,
    0.5,
    0,
  ).rotation.x = Math.PI / 2;
  const fresh = new THREE.Group();
  fresh.name = 'pie-fresh';
  pie.add(fresh);
  part(
    fresh,
    'pie-crust',
    crimpedRing(R - 0.7, 1.1, 14),
    matte(CRUST, 0.75),
    0,
    0.7,
    0,
  ).rotation.x = Math.PI / 2;
  oval(fresh, 'pie-filling', matte(FILLING, 0.55), 0, 0.5, 0, R - 1.4, 0.8, R - 1.4);
  oval(fresh, 'pie-cream-base', matte(CREAM, 0.6), 0, 1.7, 0, 2.2, 1.1, 2.2);
  part(
    fresh,
    'pie-cream-swirl',
    new THREE.ConeGeometry(1.8, 2.8, 10),
    matte(CREAM, 0.6),
    0,
    3.2,
    0,
  );
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 + 0.4;
    oval(
      fresh,
      `pie-dollop-${i}`,
      matte(CREAM, 0.6),
      Math.cos(a) * 0.55 * R,
      1.6,
      Math.sin(a) * 0.55 * R,
      1,
      0.75,
      1,
    );
  }
  const emptied = new THREE.Group();
  emptied.name = 'pie-emptied';
  emptied.visible = false;
  pie.add(emptied);
  oval(emptied, 'pie-smear', matte(0xc9682a, 0.5), 0.6, -1.85, -0.4, R - 1.8, 0.3, R - 2.4);
  oval(emptied, 'pie-cream-smear', matte(CREAM, 0.6), -1.2, -1.55, 1, 2.1, 0.25, 1.2);
  part(
    emptied,
    'pie-crust-remnant',
    crimpedRing(R - 0.3, 0.55, 10),
    matte(0xb57c3a, 0.8),
    0,
    0.3,
    0,
  ).rotation.x = Math.PI / 2;
  const face = marker(pie, 'pie-face', 0, PIE_FACE, 0);
  const rims: [THREE.Object3D, THREE.Object3D] = [
    marker(pie, 'pie-rim-0', R, 0.3, 0),
    marker(pie, 'pie-rim-1', -R, 0.3, 0),
  ];
  return { pie, fresh, emptied, face, rims };
}

function makeHead(body: THREE.Group) {
  const head = new THREE.Group();
  head.name = 'piechef-head';
  head.position.set(PIECHEF_HEAD.x, PIECHEF_HEAD.y, 0);
  head.rotation.order = 'YZX';
  body.add(head);
  oval(head, 'piechef-skull', matte(SKIN, 0.6), 0, 0, 0, 7.2, 7.6, 7);
  oval(head, 'piechef-jowl', matte(SKIN, 0.6), 3.2, -4.2, 0, 4.6, 3.3, 5.2);
  oval(head, 'piechef-hair', matte(HAIR, 0.7), -3.4, 0.4, 0, 4.4, 5, 7.2);
  oval(head, 'piechef-nose', matte(0xeea089, 0.5), 7.6, -0.6, 0, 2, 1.7, 1.8);
  oval(head, 'piechef-nose-glint', matte(0xffd6c4, 0.4), 8.6, 0.1, 1, 0.5, 0.4, 0.4);
  const eyes: THREE.Group[] = [];
  const brows: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    oval(head, 'piechef-ear', matte(SKIN, 0.6), -0.8, 0, s * 6.7, 1.6, 2.2, 0.8);
    oval(head, 'piechef-cheek', matte(CHEEK, 0.6), 5.6, -2.2, s * 4.4, 1.6, 1.1, 0.8);
    const eye = new THREE.Group();
    eye.name = 'piechef-eye';
    eye.position.set(5.9, 1.6, s * 2.7);
    head.add(eye);
    oval(eye, 'piechef-eye-white', matte(0xffffff, 0.3), 0, 0, 0, 1.05, 1.45, 0.9);
    oval(eye, 'piechef-pupil', matte(0x2a1d18, 0.3), 0.75, -0.1, 0, 0.55, 0.8, 0.5);
    oval(eye, 'piechef-glint', matte(0xffffff, 0.2), 1.15, 0.35, s * 0.25, 0.2, 0.24, 0.2);
    eyes.push(eye);
    brows.push(
      part(
        head,
        'piechef-brow',
        new THREE.BoxGeometry(2.4, 0.55, 0.6),
        matte(HAIR, 0.6),
        6.1,
        3.8,
        s * 2.9,
      ),
    );
    const tuft = oval(
      head,
      'piechef-moustache',
      matte(0x6b4127, 0.7),
      7,
      -2.7,
      s * 1.6,
      2.2,
      0.95,
      1.5,
    );
    tuft.rotation.x = s * 0.35;
    oval(head, 'piechef-moustache-curl', matte(0x6b4127, 0.7), 6.3, -1.9, s * 3.3, 1, 0.7, 0.9);
  }
  const mouth = oval(head, 'piechef-mouth', matte(0x5b2420, 0.5), 7.1, -4.4, 0, 0.8, 0.5, 1.1);

  const toque = new THREE.Group();
  toque.name = 'piechef-toque';
  toque.position.set(-0.6, 5, 0);
  head.add(toque);
  part(
    toque,
    'toque-band',
    new THREE.CylinderGeometry(6.5, 6.7, 3.8, 20),
    matte(0xeceae4, 0.7),
    0,
    1.9,
    0,
  );
  part(
    toque,
    'toque-puff',
    new THREE.CylinderGeometry(8.2, 6.6, 7.5, 20),
    matte(0xfbfaf6, 0.75),
    0,
    7.55,
    0,
  );
  oval(toque, 'toque-crown', matte(0xfbfaf6, 0.75), 0, 11.8, 0, 4.4, 4, 4.4);
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5;
    oval(
      toque,
      `toque-puff-${i}`,
      matte(0xfbfaf6, 0.75),
      Math.sin(a) * 4.6,
      11.2,
      Math.cos(a) * 4.6,
      3.5,
      3.3,
      3.5,
    );
  }
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI * 2) / 6 + 0.3;
    const pleat = part(
      toque,
      `toque-pleat-${i}`,
      new THREE.CylinderGeometry(0.22, 0.22, 7, 4),
      matte(0xd8d3c9, 0.8),
      Math.sin(a) * 7.45,
      7.5,
      Math.cos(a) * 7.45,
    );
    pleat.rotation.set(0.21, a, 0, 'YXZ');
  }
  const brim = marker(toque, 'toque-brim', 5.2, 1.6, 0);
  return { head, eyes, brows, mouth, toque, brim };
}

function makeApron(body: THREE.Group) {
  oval(body, 'apron-bib', matte(APRON, 0.8), 10.6, 13.6, 0, 1.1, 6.4, 5);
  oval(body, 'apron-pocket-bib', matte(APRON_DARK, 0.8), 11.5, 13.4, 0, 0.5, 1.8, 2.4);
  for (const z of [-3.2, 3.2]) {
    const strap = part(
      body,
      'apron-strap',
      new THREE.CylinderGeometry(0.45, 0.45, 1, 6),
      matte(APRON_DARK, 0.8),
    );
    bone(strap, 10.1, 19.6, 4.2, 25, z);
  }
  const apron = new THREE.Group();
  apron.name = 'piechef-apron';
  apron.position.set(1.4, 6, 0);
  body.add(apron);
  const front = Math.PI / 2 - 1.35;
  part(
    apron,
    'apron-skirt',
    new THREE.CylinderGeometry(10.9, 12.2, 12.5, 18, 1, true, front, 2.7),
    matte(APRON, 0.8),
    0,
    -6.25,
    0,
  );
  part(
    apron,
    'apron-hem',
    new THREE.CylinderGeometry(12.15, 12.3, 1.4, 18, 1, true, front, 2.7),
    matte(APRON_DARK, 0.8),
    0,
    -11.8,
    0,
  );
  part(
    apron,
    'apron-pocket',
    new THREE.BoxGeometry(0.8, 3.4, 5),
    matte(APRON_DARK, 0.8),
    11.8,
    -7,
    0,
  );
  const tie = part(
    apron,
    'apron-tie',
    new THREE.TorusGeometry(9.5, 0.55, 6, 28),
    matte(APRON_DARK, 0.8),
    0,
    0,
    0,
  );
  tie.rotation.x = Math.PI / 2;
  tie.scale.set(1, 0.86, 1);
  const bow = new THREE.Group();
  bow.name = 'apron-bow';
  bow.position.set(-9.4, 0, 0);
  apron.add(bow);
  for (const s of [-1, 1]) {
    oval(
      bow,
      'apron-bow-loop',
      matte(APRON_DARK, 0.8),
      -0.6,
      0.6,
      s * 1.6,
      1.4,
      2.1,
      0.8,
    ).rotation.x = s * 0.4;
    oval(
      bow,
      'apron-bow-tail',
      matte(APRON_DARK, 0.8),
      -0.8,
      -2.8,
      s * 0.9,
      0.7,
      2.8,
      0.5,
    ).rotation.z = -0.2;
  }
  return { apron, bow };
}

function makeArm(body: THREE.Group, name: string, z: number) {
  const limb = makeLimb(
    body,
    name,
    PIECHEF_SHOULDER.x,
    PIECHEF_SHOULDER.y,
    z,
    11.5,
    11,
    2.4,
    matte(JACKET, 0.7),
    matte(JACKET_SHADE, 0.7),
  );
  part(
    limb.end,
    `${name}-sleeve-roll`,
    new THREE.TorusGeometry(2.3, 0.8, 6, 14),
    matte(JACKET_SHADE, 0.7),
    0,
    1.2,
    0,
  ).rotation.x = Math.PI / 2;
  part(
    limb.end,
    `${name}-mitt-cuff`,
    new THREE.CylinderGeometry(2.7, 2.7, 1.8, 12),
    matte(MITT_CUFF, 0.9),
    0,
    -0.6,
    0,
  );
  oval(limb.end, `${name}-mitt`, matte(MITT, 0.85), 0, -3.6, 0, 2.6, 3.4, 2.1);
  const thumb = oval(limb.end, `${name}-mitt-thumb`, matte(MITT, 0.85), 2, -2.6, 0, 1, 1.9, 1);
  thumb.rotation.z = -0.5;
  for (const y of [-3, -4.5])
    part(
      limb.end,
      `${name}-mitt-quilt`,
      new THREE.BoxGeometry(4.6, 0.25, 4.0),
      matte(MITT_DARK, 0.85),
      0,
      y,
      0,
    );
  return { limb, grip: marker(limb.end, `${name}-grip`, 0, -3.6, 0) };
}

function makeLeg(root: THREE.Group, name: string, z: number): Limb {
  const limb = makeLimb(
    root,
    name,
    PIECHEF_HIP_X,
    PIECHEF_HIP,
    z,
    10.2,
    9.8,
    2.5,
    matte(TROUSERS, 0.85),
  );
  part(
    limb.end,
    `${name}-hem`,
    new THREE.TorusGeometry(2.4, 0.55, 6, 14),
    matte(0x34313b, 0.85),
    0,
    0.6,
    0,
  ).rotation.x = Math.PI / 2;
  oval(limb.end, `${name}-clog-upper`, matte(CLOG, 0.4), 1.2, -0.2, 0, 2.4, 1.3, 1.8);
  oval(limb.end, `${name}-clog`, matte(CLOG, 0.4), 1.6, -1.05, 0, 3.3, 1.05, 1.9);
  return limb;
}

export function makePiechef(id: string): THREE.Group {
  const plan = piechefPlan(id);
  const root = new THREE.Group();
  root.name = 'thanksgiving-piechef';
  const body = new THREE.Group();
  body.name = 'piechef-body';
  body.position.set(PIECHEF_HIP_X, PIECHEF_HIP, 0);
  body.rotation.order = 'YZX';
  root.add(body);
  oval(body, 'piechef-seat', matte(TROUSERS, 0.85), 0, 1.5, 0, 8.6, 6.2, 7.6);
  oval(body, 'piechef-jacket', matte(JACKET, 0.7), 1.4, 11.5, 0, 10.4, 12.2, 8.8);
  for (const z of [-6.4, 6.4])
    oval(body, 'piechef-shoulder', matte(JACKET, 0.7), 0.8, 20, z, 4.3, 3.8, 3.6);
  for (const y of [17.5, 14.5]) {
    for (const z of [-2.4, 2.4]) {
      const dy = (y - 11.5) / 12.2,
        dz = z / 8.8;
      const x = 1.4 + 10.4 * Math.sqrt(Math.max(0, 1 - dy * dy - dz * dz));
      oval(body, 'piechef-button', matte(0x9a8b74, 0.5), x, y, z, 0.6, 0.6, 0.6);
    }
  }
  part(
    body,
    'piechef-neck',
    new THREE.CylinderGeometry(2.6, 3, 4, 10),
    matte(SKIN, 0.6),
    2,
    25.2,
    0,
  );
  part(
    body,
    'piechef-scarf',
    new THREE.TorusGeometry(3.2, 1.15, 6, 16),
    matte(SCARF, 0.7),
    2.2,
    24.2,
    0,
  ).rotation.x = Math.PI / 2;
  oval(body, 'piechef-scarf-knot', matte(SCARF, 0.7), 5.6, 23.4, 0, 1.5, 1.3, 1.3);
  for (const s of [-1, 1])
    oval(
      body,
      'piechef-scarf-tail',
      matte(SCARF, 0.7),
      6.1,
      21.6,
      s * 0.8,
      0.9,
      2.2,
      0.6,
    ).rotation.z = s * 0.25;
  const { apron, bow } = makeApron(body);
  const { head, eyes, brows, mouth, toque, brim } = makeHead(body);
  const front = makeArm(body, 'piechef-arm-front', 7.6);
  const back = makeArm(body, 'piechef-arm-back', -7.6);
  const legs: [Limb, Limb] = [
    makeLeg(root, 'piechef-leg-front', 3.9),
    makeLeg(root, 'piechef-leg-back', -3.9),
  ];
  const { pie, fresh, emptied, face, rims } = makePie(root);
  models.set(root, {
    plan,
    body,
    head,
    toque,
    brim,
    apron,
    bow,
    eyes,
    brows,
    mouth,
    arms: [front.limb, back.limb],
    legs,
    grips: [front.grip, back.grip],
    pie,
    fresh,
    emptied,
    face,
    rims,
  });
  piechefPose(root, PIECHEF_REST);
  return root;
}

export function piechefModel(root: THREE.Group): PiechefModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native pie chef');
  return model;
}

const sole = new THREE.Vector3();
/**
 * Height of the ankle above the floor when the foot is tilted by `tilt` (toe down negative), measured
 * from the real clog vertices, so a planted or tiptoeing foot rests exactly on the floor.
 */
export function piechefAnkle(root: THREE.Group, tilt: number): number {
  const end = piechefModel(root).legs[0].end;
  const c = Math.cos(tilt),
    s = Math.sin(tilt);
  let lowest = Infinity;
  for (const o of end.children) {
    if (!(o instanceof THREE.Mesh)) continue;
    o.updateMatrix();
    const points = o.geometry.getAttribute('position');
    for (let i = 0; i < points.count; i++) {
      sole.fromBufferAttribute(points, i).applyMatrix4(o.matrix);
      lowest = Math.min(lowest, sole.x * s + sole.y * c);
    }
  }
  return -lowest;
}

export interface PiechefFoot {
  /** Root-space x of the ankle. */
  readonly x: number;
  /** Height of the sole above the floor. */
  readonly lift: number;
  /** Foot rotation; negative points the toe down. */
  readonly tilt: number;
}

export interface PiechefPose {
  readonly hip: number;
  readonly lean: number;
  readonly twist: number;
  readonly roll: number;
  readonly feet: readonly [PiechefFoot, PiechefFoot];
  readonly headTurn: number;
  readonly headTilt: number;
  /** 0 squeezed shut, 1 open, above 1 wide with alarm. */
  readonly eyes: number;
  /** Positive raises the inner brows in worry. */
  readonly brows: number;
  /** 0 closed, 1 a round "oh". */
  readonly mouth: number;
  readonly toqueTilt: number;
  readonly toqueSlip: number;
  readonly apron: number;
  readonly bow: number;
  readonly shrug: number;
  readonly splatted: boolean;
}
const FLAT: PiechefFoot = { x: 0, lift: 0, tilt: 0 };
export const PIECHEF_REST: PiechefPose = {
  hip: PIECHEF_HIP,
  lean: 0.06,
  twist: 0,
  roll: 0,
  feet: [
    { ...FLAT, x: 2 },
    { ...FLAT, x: -1 },
  ],
  headTurn: 0,
  headTilt: 0,
  eyes: 1,
  brows: 0,
  mouth: 0,
  toqueTilt: 0,
  toqueSlip: 0,
  apron: 0,
  bow: 0,
  shrug: 0,
  splatted: false,
};

/** Poses everything but the arms and the pie, which the trick places against world targets. */
export function piechefPose(root: THREE.Group, q: PiechefPose) {
  const m = piechefModel(root);
  m.body.position.set(PIECHEF_HIP_X, q.hip, 0);
  m.body.rotation.set(q.roll, q.twist, -q.lean);
  m.legs.forEach((leg, i) => {
    const foot = q.feet[i] ?? FLAT;
    leg.root.position.y = q.hip;
    const ankle = piechefAnkle(root, foot.tilt) + foot.lift;
    reach(leg, foot.x - PIECHEF_HIP_X, ankle - q.hip, 1, foot.tilt);
  });
  m.head.rotation.set(0, q.headTurn, -q.headTilt);
  m.eyes.forEach((eye) => eye.scale.set(1, Math.max(0.08, q.eyes), 1));
  for (const brow of m.brows) {
    brow.position.y = 3.8 + 0.5 * Math.abs(q.brows) + 0.25 * Math.max(0, q.eyes - 1);
    brow.rotation.z = 0.35 * q.brows;
  }
  m.mouth.scale.set(0.8 + 0.5 * q.mouth, 0.5 + 1.3 * q.mouth, 1.1 + 0.2 * q.mouth);
  m.toque.rotation.z = q.toqueTilt;
  m.toque.position.set(-0.6 + 0.8 * q.toqueSlip, 5 - q.toqueSlip, 0);
  m.apron.rotation.z = q.apron;
  m.bow.rotation.z = q.bow;
  for (const arm of m.arms) arm.root.position.y = PIECHEF_SHOULDER.y + q.shrug;
  m.fresh.visible = !q.splatted;
  m.emptied.visible = q.splatted;
}
