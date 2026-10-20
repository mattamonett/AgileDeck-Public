import * as THREE from 'three';
import { mummyPlan, type MummyPlan } from './mummy-choreography';
import { gait, glow, makeLimb, matte, oval, part, reach, type Limb } from '../../kit';

const WRAP = 0xd9cdaa,
  WRAP_DARK = 0xbcae88,
  STAIN = 0x8b7048,
  FLESH = 0x47372a,
  RIB = 0x75604a;

export const MUMMY_TORSO_BANDS = 7;
const BAND_Y = (i: number) => 25.7 - i * 3.55;
export const MUMMY_HIP = new THREE.Vector2(0.5, 33);
export const MUMMY_SHOULDER = new THREE.Vector2(1.5, 26);

export interface MummyModel {
  readonly plan: MummyPlan;
  readonly body: THREE.Group;
  readonly head: THREE.Group;
  readonly bands: readonly THREE.Mesh[];
  readonly arms: readonly [Limb, Limb];
  readonly legs: readonly [Limb, Limb];
  readonly grip: THREE.Object3D;
  readonly backGrip: THREE.Object3D;
  readonly unravel: THREE.Object3D;
  readonly eye: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  readonly tatters: readonly THREE.Group[];
}
const models = new WeakMap<THREE.Group, MummyModel>();

/** A unit-height cylinder with raised bandage ridges that survive scaling to any segment length. */
function wrappedCylinder(top: number, bottom: number, ridges: number): THREE.CylinderGeometry {
  const g = new THREE.CylinderGeometry(top, bottom, 1, 12, ridges * 4);
  const v = g.getAttribute('position');
  for (let i = 0; i < v.count; i++) {
    const y = v.getY(i);
    const bump = 1 + 0.12 * Math.abs(Math.sin((y + 0.5) * Math.PI * ridges + v.getX(i) * 0.4));
    v.setX(i, v.getX(i) * bump);
    v.setZ(i, v.getZ(i) * bump);
  }
  g.computeVertexNormals();
  return g;
}

function wrapLimb(limb: Limb, ridges: number, radius: number) {
  limb.upper.geometry.dispose();
  limb.upper.geometry = wrappedCylinder(radius * 0.92, radius, ridges);
  limb.lower.geometry.dispose();
  limb.lower.geometry = wrappedCylinder(radius * 0.74, radius * 0.9, ridges);
}

function tatter(
  parent: THREE.Object3D,
  name: string,
  x: number,
  y: number,
  z: number,
  length: number,
) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, y, z);
  const g = new THREE.PlaneGeometry(2.3, length, 1, 4);
  g.translate(0, -length / 2, 0);
  const v = g.getAttribute('position');
  for (let i = 0; i < v.count; i++)
    if (v.getY(i) < -length + 0.01) v.setX(i, v.getX(i) * (i % 2 ? 0.4 : 1.2));
  part(group, `${name}-cloth`, g, matte(WRAP_DARK, 0.95));
  parent.add(group);
  return group;
}

export function makeMummy(id: string): THREE.Group {
  const plan = mummyPlan(id);
  const root = new THREE.Group();
  root.name = 'halloween-mummy';
  const body = new THREE.Group();
  body.name = 'mummy-body';
  body.position.set(MUMMY_HIP.x, MUMMY_HIP.y, 0);
  root.add(body);
  oval(body, 'mummy-pelvis', matte(WRAP, 0.95), 0, 0.5, 0, 9, 6, 7.5);
  oval(body, 'mummy-core', matte(FLESH, 0.9), 0, 14, 0, 9.4, 13.5, 7.4);
  for (const z of [6.3, -6.3])
    for (let i = 0; i < 4; i++) {
      const rib = part(
        body,
        `mummy-rib-${i}`,
        new THREE.TorusGeometry(1, 0.16, 6, 14, Math.PI),
        matte(RIB, 0.7),
        0.5,
        21 - i * 2.6,
        z,
      );
      rib.scale.set(6.6 - i * 0.4, 1.4, 1);
      rib.rotation.z = Math.PI;
    }
  const bands: THREE.Mesh[] = [];
  for (let i = 0; i < MUMMY_TORSO_BANDS; i++) {
    const band = part(
      body,
      `torso-band-${i}`,
      new THREE.CylinderGeometry(1, 1.02, 3.9, 20, 1, true),
      matte(i % 2 ? WRAP_DARK : WRAP, 0.95),
      0,
      BAND_Y(i),
      0,
    );
    band.scale.set(10.6 - Math.abs(i - 3) * 0.35, 1, 8.3 - Math.abs(i - 3) * 0.3);
    band.rotation.set(0, i * 0.9, (i % 2 ? 1 : -1) * 0.13);
    bands.push(band);
  }
  oval(body, 'mummy-stain', matte(STAIN, 0.9), 4, 9, 7.6, 2.6, 1.6, 0.6);
  oval(body, 'mummy-stain-high', matte(STAIN, 0.9), -3, 19, 7.4, 1.6, 2.2, 0.6);
  for (const z of [6.6, -6.6])
    oval(body, 'mummy-shoulder', matte(WRAP, 0.95), 1.2, 25.5, z, 4.6, 4.3, 4.2);
  part(
    body,
    'mummy-neck',
    new THREE.CylinderGeometry(2.6, 3.2, 6, 10),
    matte(WRAP_DARK, 0.95),
    2,
    29.5,
    0,
  );

  const head = new THREE.Group();
  head.name = 'mummy-head';
  head.position.set(3, 37, 0);
  body.add(head);
  oval(head, 'mummy-skull', matte(WRAP, 0.95), 0, 0, 0, 8.2, 9.4, 7.8);
  oval(head, 'mummy-jaw', matte(WRAP_DARK, 0.95), 2.6, -6, 0, 5.6, 3.6, 6);
  // The bands leave a dark gap at eye level so the glowing eyes read at card size.
  [6.6, 3.7, -2.7, -5.7].forEach((y, i) => {
    const r = Math.sqrt(Math.max(0, 1 - (y / 9.4) ** 2)) * 8.3;
    const band = part(
      head,
      `head-band-${i}`,
      new THREE.TorusGeometry(1, 0.12, 6, 24),
      matte(i % 2 ? WRAP_DARK : WRAP, 0.95),
      0,
      y,
      0,
    );
    band.scale.set(r, r, 8.5);
    band.rotation.set(Math.PI / 2, (i - 1.5) * 0.12, (i - 1.5) * 0.06);
  });
  oval(head, 'mummy-socket', matte(0x160e09, 0.6), 6.3, 0.6, 2.9, 2.4, 1.9, 1.6);
  const eye = part(
    head,
    'mummy-eye',
    new THREE.SphereGeometry(1, 12, 8),
    glow(0xffbe3c),
    7.5,
    0.6,
    3.2,
  );
  eye.scale.setScalar(1.15);
  oval(head, 'mummy-pupil', matte(0x220a04, 0.4), 8.6, 0.6, 3.4, 0.26, 0.7, 0.3);
  // The far socket is half covered by a slipped bandage but still glints when the mummy turns.
  oval(head, 'mummy-far-socket', matte(0x160e09, 0.6), 6.2, 0.6, -2.9, 2.2, 1.8, 1.5);
  const far = part(
    head,
    'mummy-far-eye',
    new THREE.SphereGeometry(1, 12, 8),
    glow(0xd99a2a),
    7.3,
    0.4,
    -3.2,
  );
  far.scale.set(0.9, 0.55, 0.9);
  const slipped = part(
    head,
    'mummy-slipped-band',
    new THREE.BoxGeometry(6, 2.2, 1.2),
    matte(WRAP, 0.95),
    6.4,
    1.7,
    -3.9,
  );
  slipped.rotation.z = -0.35;
  oval(head, 'mummy-mouth', matte(0x140b07, 0.6), 7.2, -4.2, 0.6, 1.8, 0.75, 2.6);
  const tatters = [
    tatter(head, 'head-tatter', -6.8, 2.5, -1.5, 13),
    tatter(body, 'hip-tatter', -8, 4, 3.5, 11),
  ];

  const arm = (name: string, z: number) => {
    const limb = makeLimb(
      body,
      name,
      MUMMY_SHOULDER.x,
      MUMMY_SHOULDER.y,
      z,
      13,
      12,
      3.1,
      matte(WRAP, 0.95),
      matte(WRAP_DARK, 0.95),
    );
    wrapLimb(limb, 3, 3.1);
    oval(limb.end, `${name}-palm`, matte(WRAP_DARK, 0.95), 0, -2.6, 0, 2.5, 3.1, 1.7);
    for (let f = 0; f < 3; f++)
      oval(
        limb.end,
        `${name}-finger-${f}`,
        matte(WRAP, 0.95),
        (f - 1) * 1.3,
        -5.4,
        0.4,
        0.75,
        1.9,
        0.75,
      );
    part(
      limb.end,
      `${name}-cuff`,
      new THREE.TorusGeometry(2.3, 0.6, 6, 14),
      matte(WRAP_DARK, 0.95),
      0,
      0.4,
      0,
    ).rotation.x = Math.PI / 2;
    return limb;
  };
  const front = arm('mummy-arm-front', 6.8);
  const back = arm('mummy-arm-back', -6.8);
  const grip = new THREE.Object3D();
  grip.name = 'mummy-grip';
  grip.position.set(0, -3.2, 0.8);
  front.end.add(grip);
  const backGrip = new THREE.Object3D();
  backGrip.name = 'mummy-back-grip';
  backGrip.position.set(0, -3.2, -0.8);
  back.end.add(backGrip);
  tatters.push(tatter(front.end, 'wrist-tatter', 1.6, 0.6, 1.2, 7));

  const leg = (name: string, z: number) => {
    const limb = makeLimb(
      root,
      name,
      MUMMY_HIP.x,
      MUMMY_HIP.y,
      z,
      16,
      15.5,
      3.6,
      matte(WRAP, 0.95),
      matte(WRAP_DARK, 0.95),
    );
    wrapLimb(limb, 4, 3.6);
    oval(limb.end, `${name}-foot`, matte(WRAP_DARK, 0.95), 2.4, -1.3, 0, 4.4, 1.9, 2.8);
    oval(limb.end, `${name}-toe-wrap`, matte(WRAP, 0.95), 5.4, -1.6, 0, 1.6, 1.2, 2.4);
    return limb;
  };
  const legs: [Limb, Limb] = [leg('mummy-leg-front', 4.2), leg('mummy-leg-back', -4.2)];
  const unravel = new THREE.Object3D();
  unravel.name = 'mummy-unravel';
  body.add(unravel);
  models.set(root, {
    plan,
    body,
    head,
    bands,
    arms: [front, back],
    legs,
    grip,
    backGrip,
    unravel,
    eye,
    tatters,
  });
  mummyPose(root, { ...MUMMY_REST });
  return root;
}

export function mummyModel(root: THREE.Group): MummyModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native mummy');
  return model;
}

export interface MummyPoseInput {
  /** Distance walked in model units; feet stay planted while it is unchanged. */
  readonly walked: number;
  readonly drag: number;
  readonly lean: number;
  readonly twist: number;
  readonly headTurn: number;
  readonly headTilt: number;
  /** Hand targets relative to each shoulder, in body space. */
  readonly front: { readonly x: number; readonly y: number };
  readonly back: { readonly x: number; readonly y: number };
  readonly bandsLeft: number;
  readonly eye: number;
  readonly flutter: number;
  readonly crouch: number;
  /** Lowers any lifted foot onto the floor without sliding it while the mummy stands still. */
  readonly planted: number;
}
export const MUMMY_REST: MummyPoseInput = {
  walked: 0,
  drag: 1,
  lean: 0.08,
  twist: 0,
  headTurn: 0,
  headTilt: 0,
  front: { x: 20, y: 3 },
  back: { x: 18, y: 1 },
  bandsLeft: MUMMY_TORSO_BANDS,
  eye: 0.7,
  flutter: 0,
  crouch: 0,
  planted: 1,
};

export function mummyPose(root: THREE.Group, q: MummyPoseInput) {
  const m = mummyModel(root);
  const stride = 17;
  const bob = Math.abs(Math.sin((q.walked / stride) * Math.PI * 2)) * 0.9;
  const hip = MUMMY_HIP.y - q.crouch - bob;
  m.legs.forEach((leg, i) => {
    const dragging = (i === 0 ? 1 : -1) === q.drag;
    const step = gait(q.walked, stride, i * 0.5, dragging ? 0.4 : 4.2);
    leg.root.position.y = hip;
    // The ankle sits 3.2 units above the sole, so a planted foot rests exactly on the floor.
    const lift = step.y * (1 - q.planted),
      toe = dragging ? -0.35 * step.swing * (1 - q.planted) : 0;
    reach(leg, step.x + (dragging ? -1.5 : 1), -(hip - 3.2) + lift, 1, toe);
  });
  m.body.position.set(MUMMY_HIP.x, hip, 0);
  m.body.rotation.set(
    0,
    q.twist,
    -q.lean - q.drag * 0.04 * Math.sin((q.walked / stride) * Math.PI * 2),
  );
  m.head.rotation.set(0, q.headTurn, q.headTilt);
  reach(m.arms[0], q.front.x, q.front.y, -1);
  reach(m.arms[1], q.back.x, q.back.y, -1);
  m.bands.forEach((band, i) => {
    const left = q.bandsLeft - (MUMMY_TORSO_BANDS - 1 - i);
    band.visible = left > 0;
    band.scale.y = Math.min(1, Math.max(0.0001, left));
  });
  const top = Math.max(
    0,
    Math.min(MUMMY_TORSO_BANDS - 1, MUMMY_TORSO_BANDS - Math.ceil(q.bandsLeft)),
  );
  m.unravel.position.set(10.2, BAND_Y(top), 3.2);
  m.eye.material.opacity = 0.35 + 0.65 * q.eye;
  m.eye.scale.setScalar(0.75 + 0.35 * q.eye);
  m.tatters.forEach((t, i) => {
    t.rotation.z = 0.2 + Math.sin(q.flutter + i * 1.7) * 0.25;
  });
}

/** Ragged cloth strip from x 0..1, y -0.5..0.5, shaded darker toward its frayed edges. */
export function clothStrip(seed: number): THREE.BufferGeometry {
  const columns = 16,
    positions: number[] = [],
    colors: number[] = [],
    index: number[] = [];
  const edge = new THREE.Color(0xb0a07b),
    middle = new THREE.Color(0xe8ddbd),
    stain = new THREE.Color(0x9c8358);
  for (let i = 0; i <= columns; i++) {
    const x = i / columns,
      jag = 0.1 * Math.abs(Math.sin(i * 2.7 + seed)) + 0.04 * Math.abs(Math.sin(i * 5.3 - seed));
    const stained = Math.abs(i - ((seed * 7) % columns)) < 1.2;
    for (const [y, color] of [
      [0.5 - jag, edge],
      [0.05 * Math.sin(i + seed), stained ? stain : middle],
      [-0.5 + jag * 0.8, edge],
    ] as const) {
      positions.push(x, y, 0);
      colors.push(color.r, color.g, color.b);
    }
    if (i < columns)
      for (let row = 0; row < 2; row++) {
        const a = i * 3 + row;
        index.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  return g;
}

export interface CardEye {
  readonly group: THREE.Group;
  readonly socket: THREE.Mesh;
  readonly ball: THREE.Group;
  readonly iris: THREE.Mesh;
  readonly pupil: THREE.Mesh;
}

export function cardEye(parent: THREE.Object3D, name: string): CardEye {
  const group = new THREE.Group();
  group.name = name;
  parent.add(group);
  const socket = part(
    group,
    `${name}-shadow`,
    new THREE.CircleGeometry(1, 24),
    glow(0x140b06, 0.92),
  );
  const ball = new THREE.Group();
  group.add(ball);
  part(ball, `${name}-white`, new THREE.CircleGeometry(1, 24), glow(0xe1d088), 0, 0, 0.1);
  for (const [x, a] of [
    [-0.62, 0.3],
    [0.6, -0.4],
  ] as const) {
    const vein = part(
      ball,
      `${name}-vein`,
      new THREE.PlaneGeometry(0.42, 0.05),
      glow(0xb2382a, 0.8),
      x,
      0.12,
      0.15,
    );
    vein.rotation.z = a;
  }
  const iris = part(
    ball,
    `${name}-iris`,
    new THREE.CircleGeometry(0.46, 20),
    glow(0xd47d18),
    0,
    0,
    0.2,
  );
  const pupil = part(
    ball,
    `${name}-pupil`,
    new THREE.CircleGeometry(0.16, 12),
    glow(0x080302),
    0,
    0,
    0.3,
  );
  part(ball, `${name}-glint`, new THREE.CircleGeometry(0.08, 8), glow(0xfff6dc), 0.15, 0.2, 0.4);
  return { group, socket, ball, iris, pupil };
}
