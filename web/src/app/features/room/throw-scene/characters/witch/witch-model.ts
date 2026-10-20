import * as THREE from 'three';
import { witchPlan, type WitchPlan } from './witch-choreography';
import {
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

const SKIN = 0x8fbe57,
  DRESS = 0x5a2b78,
  DARK = 0x2a1838,
  WOOD = 0x8a5a34,
  STRAW = 0xd6ad57;

export const WITCH_HIP = new THREE.Vector2(-6, 3.6);
const SHOULDER = new THREE.Vector2(2.5, 16);
/** Broom grip for the steering hand, in broom (root) space. */
export const BROOM_GRIP = new THREE.Vector2(7.5, 2.7);
export const BROOM_HAND_Z = 2.2;

export interface WitchModel {
  readonly plan: WitchPlan;
  readonly body: THREE.Group;
  readonly head: THREE.Group;
  readonly jaw: THREE.Group;
  readonly hat: THREE.Group;
  readonly hatTip: THREE.Group;
  readonly brim: THREE.Object3D;
  readonly hair: THREE.Group;
  readonly arms: readonly [Limb, Limb];
  readonly legs: readonly [Limb, Limb];
  readonly bristles: THREE.Group;
  readonly holster: THREE.Group;
  readonly potion: THREE.Group;
  readonly liquid: THREE.Mesh;
  readonly cork: THREE.Mesh;
  readonly mouth: THREE.Object3D;
  readonly finger: THREE.Object3D;
  readonly grips: readonly [THREE.Object3D, THREE.Object3D];
}
const models = new WeakMap<THREE.Group, WitchModel>();

function broom(root: THREE.Group): THREE.Group {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-26, 0, 0),
    new THREE.Vector3(0, -1.4, 0),
    new THREE.Vector3(29, 1.6, 0),
  );
  part(root, 'broom-handle', new THREE.TubeGeometry(curve, 20, 1.25, 8, false), matte(WOOD, 0.7));
  oval(root, 'broom-knob', matte(0x6b4226, 0.6), 29.4, 1.7, 0, 1.8, 1.8, 1.8);
  for (const x of [-24.5, -26.5])
    part(
      root,
      'broom-binding',
      new THREE.TorusGeometry(2.1, 0.55, 6, 14),
      matte(0x5a2f22, 0.8),
      x,
      0,
      0,
    ).rotation.y = Math.PI / 2;
  const bristles = new THREE.Group();
  bristles.name = 'broom-bristles';
  bristles.position.set(-26, 0, 0);
  root.add(bristles);
  for (let i = 0; i < 14; i++) {
    const a = ((i % 7) - 3) * 0.085,
      z = (Math.floor(i / 7) - 0.5) * 2.6;
    const straw = part(
      bristles,
      `broom-straw-${i}`,
      new THREE.CylinderGeometry(0.35, 0.8, 21, 5),
      matte(i % 3 ? STRAW : 0xb88d3e, 0.9),
    );
    straw.geometry.translate(0, -10.5, 0);
    straw.position.set(0, 0, z);
    straw.rotation.z = Math.PI / 2 + a;
  }
  return bristles;
}

function arm(body: THREE.Group, name: string, z: number): Limb {
  const limb = makeLimb(body, name, SHOULDER.x, SHOULDER.y, z, 11, 10.5, 1.9, matte(DRESS, 0.8));
  const cuff = part(
    limb.end,
    `${name}-cuff`,
    new THREE.ConeGeometry(2.6, 3.4, 10, 1, true),
    matte(DARK, 0.85),
    0,
    1.4,
    0,
  );
  cuff.rotation.z = Math.PI;
  oval(limb.end, `${name}-palm`, matte(SKIN, 0.6), 0, -1.6, 0, 1.7, 2.1, 1.2);
  for (let f = 0; f < 3; f++)
    oval(
      limb.end,
      `${name}-finger-${f}`,
      matte(SKIN, 0.6),
      (f - 1) * 0.9,
      -4.1,
      0.2,
      0.45,
      1.9,
      0.45,
    );
  return limb;
}

function potion(): {
  potion: THREE.Group;
  liquid: THREE.Mesh;
  cork: THREE.Mesh;
  mouth: THREE.Object3D;
} {
  const g = new THREE.Group();
  g.name = 'witch-potion';
  const glass = new THREE.MeshStandardMaterial({
    color: 0xc9f2d4,
    roughness: 0.08,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
  });
  part(g, 'potion-flask', new THREE.SphereGeometry(3.1, 16, 12), glass, 0, -3.8, 0);
  const liquid = part(
    g,
    'potion-liquid',
    new THREE.SphereGeometry(2.55, 16, 12),
    glow(0x76ff5c, 0.92),
    0,
    -3.8,
    0,
  );
  part(g, 'potion-neck', new THREE.CylinderGeometry(0.85, 1.1, 3.2, 10), glass.clone(), 0, -0.2, 0);
  part(
    g,
    'potion-lip',
    new THREE.TorusGeometry(0.95, 0.28, 6, 12),
    glossy(0xbfe8c8, 0.1),
    0,
    1.3,
    0,
  ).rotation.x = Math.PI / 2;
  const cork = part(
    g,
    'potion-cork',
    new THREE.CylinderGeometry(0.75, 0.6, 1.8, 8),
    matte(0x9c6a3c, 0.9),
    0,
    2.1,
    0,
  );
  oval(g, 'potion-bubble', glow(0xd8ffc8, 0.8), 0.9, -2.6, 1.6, 0.5, 0.5, 0.3);
  const mouth = new THREE.Object3D();
  mouth.name = 'potion-mouth';
  mouth.position.set(0, 1.5, 0);
  g.add(mouth);
  return { potion: g, liquid, cork, mouth };
}

export function makeWitch(id: string): THREE.Group {
  const plan = witchPlan(id);
  const root = new THREE.Group();
  root.name = 'halloween-witch';
  const bristles = broom(root);
  const body = new THREE.Group();
  body.name = 'witch-body';
  body.position.set(WITCH_HIP.x, WITCH_HIP.y, 0);
  root.add(body);
  oval(body, 'witch-pelvis', matte(DRESS, 0.8), 0, 0.5, 0, 6, 4.4, 5.2);
  oval(body, 'witch-torso', matte(DRESS, 0.8), 1.5, 9, 0, 5.6, 9, 4.8);
  oval(body, 'witch-bodice', matte(DARK, 0.8), 3.8, 9, 0, 2.6, 6.2, 4);
  for (const z of [-4.6, 4.6])
    flat(
      body,
      'witch-skirt',
      matte(0x3f1d57, 0.9),
      [
        [-10, 2],
        [6, 2],
        [7.5, -7],
        [4.6, -4.6],
        [2.4, -9.5],
        [-0.6, -5.4],
        [-3.6, -10.5],
        [-6.6, -5.6],
        [-10.5, -8.5],
      ],
      z,
    );
  part(
    body,
    'witch-belt',
    new THREE.TorusGeometry(5.4, 0.55, 6, 18),
    matte(0x3a2416, 0.8),
    0.6,
    3.2,
    0,
  ).rotation.x = Math.PI / 2;
  part(
    body,
    'witch-buckle',
    new THREE.BoxGeometry(1.8, 1.6, 0.6),
    glossy(0xd8b44a, 0.3),
    5.8,
    3.2,
    0,
  );
  const holster = new THREE.Group();
  holster.name = 'witch-holster';
  holster.position.set(1.5, 2.6, 5.4);
  body.add(holster);
  part(
    body,
    'witch-neck',
    new THREE.CylinderGeometry(1.5, 1.9, 4, 8),
    matte(SKIN, 0.6),
    3.5,
    18.5,
    0,
  );

  const head = new THREE.Group();
  head.name = 'witch-head';
  head.position.set(5, 23, 0);
  body.add(head);
  oval(head, 'witch-skull', matte(SKIN, 0.6), 0, 0, 0, 5.2, 5.8, 4.8);
  const nose = part(
    head,
    'witch-nose',
    new THREE.ConeGeometry(1.15, 7, 8),
    matte(0x86b44f, 0.55),
    6.3,
    -1,
    0,
  );
  nose.rotation.z = -Math.PI / 2 - 0.42;
  oval(head, 'witch-wart', matte(0x6c8e3a, 0.5), 6.4, 0.1, 0.9, 0.55, 0.55, 0.55);
  const chin = part(
    head,
    'witch-chin',
    new THREE.ConeGeometry(1.4, 3.6, 8),
    matte(SKIN, 0.6),
    3.6,
    -5.6,
    0,
  );
  chin.rotation.z = -Math.PI / 2 + 0.6;
  for (const z of [-2.3, 2.3]) {
    oval(head, 'witch-eye', glow(0xf7e24a), 3.9, 1.6, z, 1.15, 0.85, 0.6);
    oval(head, 'witch-pupil', matte(0x111111, 0.3), 4.6, 1.6, z * 1.04, 0.22, 0.75, 0.3);
    const brow = part(
      head,
      'witch-brow',
      new THREE.BoxGeometry(2.8, 0.55, 0.6),
      matte(0x3c4a20, 0.6),
      3.8,
      3,
      z,
    );
    brow.rotation.z = -0.4;
  }
  const jaw = new THREE.Group();
  jaw.name = 'witch-jaw';
  jaw.position.set(1.5, -2.6, 0);
  head.add(jaw);
  oval(jaw, 'witch-mouth', matte(0x2a0c1a, 0.5), 2.6, -0.8, 0, 1.9, 0.9, 3);
  oval(jaw, 'witch-lower-lip', matte(0x739a42, 0.6), 2.6, -1.8, 0, 1.9, 0.7, 3.2);
  const tooth = part(
    jaw,
    'witch-tooth',
    new THREE.ConeGeometry(0.35, 1.1, 5),
    glossy(0xf2ecd2, 0.3),
    3.2,
    -0.8,
    1.1,
  );
  tooth.rotation.z = Math.PI;
  const hair = new THREE.Group();
  hair.name = 'witch-hair';
  hair.position.set(-2.5, 2, 0);
  head.add(hair);
  for (let i = 0; i < 6; i++) {
    const z = (i - 2.5) * 1.5;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, z),
      new THREE.Vector3(-2.5, -4, z * 1.1),
      new THREE.Vector3(-3.5 + (i % 2), -9, z * 1.15),
      new THREE.Vector3(-5 + (i % 3), -13 - (i % 2) * 2, z * 1.2),
    ]);
    part(
      hair,
      `witch-strand-${i}`,
      new THREE.TubeGeometry(curve, 10, 0.55, 5, false),
      matte(i % 2 ? 0x2c2c36 : 0x45434f, 0.9),
    );
  }
  const hat = new THREE.Group();
  hat.name = 'witch-hat';
  hat.position.set(-0.4, 4.4, 0);
  head.add(hat);
  hat.rotation.z = 0.12;
  const brim = part(
    hat,
    'witch-brim',
    new THREE.CylinderGeometry(10.5, 10.5, 0.7, 26),
    matte(DARK, 0.85),
  );
  brim.scale.z = 0.9;
  part(
    hat,
    'witch-crown',
    new THREE.ConeGeometry(5.2, 10, 16, 1, true),
    matte(0x2f1d40, 0.85),
    -0.6,
    5.2,
    0,
  );
  part(
    hat,
    'witch-band',
    new THREE.CylinderGeometry(4.8, 5.1, 1.6, 16, 1, true),
    matte(0x7b3fa0, 0.6),
    -0.2,
    1.4,
    0,
  );
  part(
    hat,
    'witch-hat-buckle',
    new THREE.BoxGeometry(1.6, 1.5, 0.5),
    glossy(0xd8b44a, 0.3),
    4.6,
    1.4,
    1.6,
  );
  const hatTip = new THREE.Group();
  hatTip.name = 'witch-hat-tip';
  hatTip.position.set(-1.5, 9.8, 0);
  hat.add(hatTip);
  const tip = part(
    hatTip,
    'witch-tip',
    new THREE.ConeGeometry(2.4, 7.5, 12),
    matte(0x2f1d40, 0.85),
    -1.6,
    3,
    0,
  );
  tip.rotation.z = 0.55;
  // The steering arm sits close to the handle so its hand wraps the broom from any viewing angle.
  const arms: [Limb, Limb] = [
    arm(body, 'witch-arm-front', 5),
    arm(body, 'witch-arm-back', -BROOM_HAND_Z),
  ];
  const leg = (name: string, z: number) => {
    const limb = makeLimb(
      root,
      name,
      WITCH_HIP.x,
      WITCH_HIP.y,
      z,
      10.5,
      10,
      2,
      matte(0x2b2236, 0.8),
    );
    oval(limb.end, `${name}-boot`, glossy(0x1a1420, 0.4), 1.8, -1.2, 0, 3.4, 1.5, 1.6);
    const toe = part(
      limb.end,
      `${name}-curl`,
      new THREE.TorusGeometry(1, 0.38, 5, 10, Math.PI * 1.3),
      glossy(0x1a1420, 0.4),
      5,
      -0.4,
      0,
    );
    toe.rotation.z = -0.5;
    return limb;
  };
  const legs: [Limb, Limb] = [leg('witch-leg-front', 4), leg('witch-leg-back', -4)];
  const grips = arms.map((limb, i) => {
    const marker = new THREE.Object3D();
    marker.name = `witch-grip-${i}`;
    marker.position.set(0, -2, 0);
    limb.end.add(marker);
    return marker;
  });
  const finger = new THREE.Object3D();
  finger.name = 'witch-fingertip';
  finger.position.set(0, -5.6, 0.2);
  arms[0].end.add(finger);
  const flask = potion();
  holster.add(flask.potion);
  models.set(root, {
    plan,
    body,
    head,
    jaw,
    hat,
    hatTip,
    brim,
    hair,
    arms,
    legs,
    bristles,
    holster,
    potion: flask.potion,
    liquid: flask.liquid,
    cork: flask.cork,
    mouth: flask.mouth,
    finger,
    grips: [grips[0] ?? finger, grips[1] ?? finger],
  });
  return root;
}

export function witchModel(root: THREE.Group): WitchModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native witch');
  return model;
}

export interface WitchPose {
  readonly lean: number;
  readonly headTilt: number;
  readonly jaw: number;
  readonly shake: number;
  readonly lag: number;
  /** Front hand target relative to its shoulder in body space. */
  readonly front: { readonly x: number; readonly y: number };
  readonly frontTurn: number | null;
  readonly liquid: number;
  readonly corked: boolean;
  readonly bristle: number;
  readonly kick: number;
}

const tmp = new THREE.Vector2();
/** Converts a broom-space point to the body frame, which pivots at the hip by the lean. */
function bodyLocal(x: number, y: number, lean: number, out: THREE.Vector2) {
  const dx = x - WITCH_HIP.x,
    dy = y - WITCH_HIP.y,
    c = Math.cos(lean),
    s = Math.sin(lean);
  return out.set(dx * c - dy * s, dx * s + dy * c);
}

export function witchPose(root: THREE.Group, q: WitchPose) {
  const m = witchModel(root);
  m.body.rotation.z = -q.lean;
  m.head.rotation.z = q.headTilt + Math.sin(q.shake * 40) * 0.06 * Math.min(1, q.shake);
  m.jaw.rotation.z = -0.6 * q.jaw;
  m.hat.rotation.z = 0.12 + q.lag * 0.25;
  m.hatTip.rotation.z = q.lag * 0.5;
  m.hair.rotation.z = q.lag * 0.4;
  m.bristles.rotation.z = Math.sin(q.bristle) * 0.05;
  // The steering hand stays wrapped around the broom handle whatever the lean.
  const grip = bodyLocal(BROOM_GRIP.x, BROOM_GRIP.y, q.lean, tmp);
  const backArm = m.arms[1];
  reach(backArm, grip.x - backArm.root.position.x, grip.y - backArm.root.position.y, -1);
  reach(m.arms[0], q.front.x, q.front.y, -1, q.frontTurn ?? undefined);
  m.legs.forEach((leg, i) => reach(leg, 7.5 - i * 1.5 + q.kick * 3, -13 + q.kick * 2, 1, 0.1));
  m.liquid.scale.y = Math.max(0.05, q.liquid);
  m.liquid.position.y = -3.8 - 2.55 * (1 - q.liquid);
  m.cork.visible = q.corked;
}

export function webbedFoot(): THREE.ShapeGeometry {
  return new THREE.ShapeGeometry(
    outline([
      [0, 0],
      [-1.6, 1.6],
      [-2.6, 1.2],
      [-1.4, 0.4],
      [-2.8, -0.4],
      [-1.2, -0.6],
      [-1.8, -2],
      [0, -0.8],
      [0.6, -0.2],
    ]),
  );
}
