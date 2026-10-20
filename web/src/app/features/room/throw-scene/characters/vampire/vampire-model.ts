import * as THREE from 'three';
import { vampirePlan, type VampirePlan } from './vampire-choreography';
import {
  flat,
  gait,
  glossy,
  glow,
  makeLimb,
  matte,
  outline,
  oval,
  part,
  reach,
  type Limb,
} from '../../kit';

const SKIN = 0xd4cde0,
  COAT = 0x1d1826,
  LINING = 0x8d1530,
  HAIR = 0x120d18,
  BAT = 0x2e2236,
  MEMBRANE = 0x5b2648;

export const VAMPIRE_HIP = new THREE.Vector2(0, 38.6);
const SHOULDER = new THREE.Vector2(1, 27.5);
/** The bat hovers where the vampire's head forms, so the transformation stays in place. */
export const BAT_ANCHOR = new THREE.Vector3(2.5, 78, 4);

export interface VampireModel {
  readonly plan: VampirePlan;
  readonly human: THREE.Group;
  readonly body: THREE.Group;
  readonly head: THREE.Group;
  readonly jaw: THREE.Group;
  readonly cape: THREE.Group;
  readonly arms: readonly [Limb, Limb];
  readonly legs: readonly [Limb, Limb];
  readonly fang: THREE.Object3D;
  readonly bat: THREE.Group;
  readonly wings: readonly THREE.Group[];
  readonly batHead: THREE.Group;
}
const models = new WeakMap<THREE.Group, VampireModel>();

function hand(limb: Limb, name: string) {
  oval(limb.end, `${name}-palm`, matte(SKIN, 0.6), 0, -2.4, 0, 2.2, 2.9, 1.5);
  for (let f = 0; f < 3; f++) {
    const claw = part(
      limb.end,
      `${name}-claw-${f}`,
      new THREE.ConeGeometry(0.45, 4.2, 6),
      glossy(0xe8e0ee),
      (f - 1) * 1.15,
      -6.4,
      0.3,
    );
    claw.rotation.z = Math.PI + (f - 1) * 0.12;
  }
  part(
    limb.end,
    `${name}-cuff`,
    new THREE.CylinderGeometry(2.3, 2.5, 2, 10),
    matte(0xe9e3d6, 0.7),
    0,
    0.4,
    0,
  );
}

function wing(bat: THREE.Group, side: number): THREE.Group {
  const root = new THREE.Group();
  root.name = `bat-wing-${side}`;
  root.position.set(side * 3.2, 1.5, 0);
  bat.add(root);
  const tips = [
    [side * 23, 9],
    [side * 26, -1],
    [side * 20, -10],
  ] as const;
  const wrist = [side * 11, 4] as const;
  // Membrane spans arm, wrist and finger tips with scalloped trailing edges between the fingers.
  const shape = outline([
    [0, 1.5],
    wrist,
    [side * 23, 9],
    [side * 21, 3],
    [side * 26, -1],
    [side * 18, -3],
    [side * 20, -10],
    [side * 12, -5],
    [side * 6, -5.5],
    [side * 2, -3],
  ]);
  part(
    root,
    `bat-membrane-${side}`,
    new THREE.ShapeGeometry(shape),
    matte(MEMBRANE, 0.75),
    0,
    0,
    -0.4,
  );
  const bone = (
    name: string,
    a: readonly [number, number],
    b: readonly [number, number],
    r: number,
  ) => {
    const mesh = part(root, name, new THREE.CylinderGeometry(r * 0.7, r, 1, 6), matte(BAT, 0.6));
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
    mesh.scale.y = Math.hypot(dx, dy);
    mesh.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
  };
  bone(`bat-arm-${side}`, [0, 1.5], wrist, 0.9);
  tips.forEach((tip, i) => bone(`bat-finger-${side}-${i}`, wrist, tip, 0.45));
  part(
    root,
    `bat-thumb-${side}`,
    new THREE.ConeGeometry(0.5, 2.4, 5),
    matte(BAT, 0.6),
    wrist[0],
    wrist[1] + 1.4,
    0.3,
  );
  return root;
}

function makeBat(root: THREE.Group): { bat: THREE.Group; wings: THREE.Group[]; head: THREE.Group } {
  const bat = new THREE.Group();
  bat.name = 'bat';
  bat.position.copy(BAT_ANCHOR);
  root.add(bat);
  oval(bat, 'bat-body', matte(BAT, 0.95), 0, -1.5, 0, 4.6, 6.2, 3.8);
  oval(bat, 'bat-belly', matte(0x4a3a4c, 0.95), 0, -2.2, 2.4, 2.8, 4.2, 1.6);
  const head = new THREE.Group();
  head.name = 'bat-head';
  head.position.set(0, 5.4, 0.6);
  bat.add(head);
  oval(head, 'bat-skull', matte(BAT, 0.9), 0, 0, 0, 3.7, 3.3, 3.2);
  oval(head, 'bat-snout', matte(0x3b2c41, 0.8), 0, -1.1, 2.7, 1.6, 1.2, 1);
  for (const s of [-1, 1]) {
    const ear = part(
      head,
      `bat-ear-${s}`,
      new THREE.ConeGeometry(1.6, 5, 6),
      matte(BAT, 0.85),
      s * 2.2,
      3.6,
      0,
    );
    ear.rotation.z = -s * 0.32;
    oval(
      head,
      `bat-ear-inner-${s}`,
      matte(0x7b3e5c, 0.8),
      s * 2.25,
      3.3,
      0.9,
      0.7,
      1.7,
      0.4,
    ).rotation.z = -s * 0.32;
    oval(head, `bat-eye-${s}`, glow(0xff4a3d), s * 1.3, 0.5, 2.9, 0.62, 0.62, 0.4);
    const fang = part(
      head,
      `bat-fang-${s}`,
      new THREE.ConeGeometry(0.28, 1.2, 5),
      glossy(0xfff8f0),
      s * 0.55,
      -2.2,
      3.1,
    );
    fang.rotation.z = Math.PI;
  }
  for (const s of [-1, 1]) {
    const foot = part(
      bat,
      `bat-foot-${s}`,
      new THREE.ConeGeometry(0.6, 2.4, 5),
      matte(BAT, 0.7),
      s * 1.6,
      -7.8,
      0,
    );
    foot.rotation.z = Math.PI;
  }
  return { bat, wings: [wing(bat, -1), wing(bat, 1)], head };
}

export function makeVampire(id: string): THREE.Group {
  const plan = vampirePlan(id);
  const root = new THREE.Group();
  root.name = 'halloween-vampire';
  const human = new THREE.Group();
  human.name = 'vampire';
  root.add(human);
  const body = new THREE.Group();
  body.name = 'vampire-body';
  body.position.set(VAMPIRE_HIP.x, VAMPIRE_HIP.y, 0);
  human.add(body);
  oval(body, 'vampire-hips', matte(COAT, 0.7), 0, 1, 0, 7.5, 6, 6);
  oval(body, 'vampire-coat', matte(COAT, 0.65), 0, 15, 0, 8.2, 14.5, 6.4);
  oval(body, 'vampire-shirt', matte(0xeee8df, 0.7), 5.2, 18, 0, 3, 9.5, 4.6);
  oval(body, 'vampire-waistcoat', matte(0x4a1426, 0.6), 4.6, 11, 0, 3.4, 5.5, 4.8);
  oval(body, 'vampire-medallion', glossy(0xc7a04a, 0.3), 8, 21.5, 0, 1.3, 1.3, 1);
  oval(body, 'vampire-gem', glow(0xd2163c), 8.9, 21.5, 0, 0.6, 0.6, 0.4);
  for (const z of [6, -6])
    oval(body, 'vampire-shoulder', matte(COAT, 0.65), 1, 27, z, 4.4, 3.6, 3.6);
  part(
    body,
    'vampire-neck',
    new THREE.CylinderGeometry(2.2, 2.8, 6, 10),
    matte(SKIN, 0.6),
    2,
    31,
    0,
  );

  // A tall, flared cape with a high collar, lined in blood red.
  const cape = new THREE.Group();
  cape.name = 'vampire-cape';
  cape.position.set(-1, 29, 0);
  body.add(cape);
  const capeShape: readonly (readonly [number, number])[] = [
    [2, 1],
    [-6, -6],
    [-15, -26],
    [-19, -44],
    [-13, -41],
    [-9, -46],
    [-3, -41],
    [2, -44],
    [3, -10],
  ];
  for (const z of [-4.5, 4.5]) {
    flat(cape, 'cape-outer', matte(0x15111c, 0.85), capeShape, z * 1.02);
    const inner = flat(cape, 'cape-lining', matte(LINING, 0.55), capeShape, z * 0.92);
    inner.scale.set(0.9, 0.95, 1);
  }
  for (const z of [-3.6, 3.6]) {
    const collar = flat(
      cape,
      'cape-collar',
      matte(LINING, 0.55),
      [
        [2, 1],
        [-1, 13],
        [-5, 4],
      ],
      z,
    );
    collar.rotation.y = z > 0 ? -0.3 : 0.3;
    flat(
      cape,
      'cape-collar-back',
      matte(0x15111c, 0.85),
      [
        [2.4, 0],
        [-1.4, 14],
        [-6, 4],
      ],
      z * 1.15,
    );
  }

  const head = new THREE.Group();
  head.name = 'vampire-head';
  head.position.set(2.5, 38, 0);
  body.add(head);
  oval(head, 'vampire-skull', matte(SKIN, 0.55), 0, 0, 0, 6.6, 8.2, 6.2);
  oval(head, 'vampire-cheek', matte(0xc7bfd6, 0.6), 3.6, -3, 0, 3.2, 3.4, 5.2);
  oval(head, 'vampire-nose', matte(SKIN, 0.55), 6.6, 0.4, 0, 1.4, 2.4, 1.1);
  oval(head, 'vampire-hair', matte(HAIR, 0.35), -1.2, 3.2, 0, 6.4, 6.6, 6.5);
  // Widow's peak sits on the brow in profile from either side.
  for (const z of [-3.5, 3.5]) {
    flat(
      head,
      'vampire-peak',
      matte(HAIR, 0.35),
      [
        [0, 8],
        [5.6, 6.2],
        [3.4, 4.2],
        [4.4, 2.6],
        [1.6, 3.2],
      ],
      z,
    );
    const ear = part(
      head,
      'vampire-ear',
      new THREE.ConeGeometry(1.3, 4.4, 6),
      matte(SKIN, 0.6),
      -0.6,
      1.5,
      z * 1.68,
    );
    ear.rotation.z = 0.75;
    oval(head, 'vampire-socket', matte(0x4f3b5e, 0.6), 4.7, 2.2, z * 0.62, 1.7, 1.2, 1);
    oval(head, 'vampire-eye', glow(0xff2e3a), 5.5, 2.3, z * 0.66, 0.85, 0.65, 0.5);
    const brow = part(
      head,
      'vampire-brow',
      new THREE.BoxGeometry(3.6, 0.6, 0.6),
      matte(HAIR, 0.4),
      5.2,
      3.9,
      z * 0.66,
    );
    brow.rotation.z = -0.35;
  }
  oval(head, 'vampire-lip', matte(0x6a2034, 0.5), 6, -3.4, 0, 1.6, 0.55, 2.4);
  const jaw = new THREE.Group();
  jaw.name = 'vampire-jaw';
  jaw.position.set(1, -3.6, 0);
  head.add(jaw);
  oval(jaw, 'vampire-chin', matte(SKIN, 0.55), 3.6, -2, 0, 3.6, 2.3, 4);
  oval(jaw, 'vampire-mouth', matte(0x3b0a17, 0.4), 4.4, -0.6, 0, 1.6, 0.9, 2.2);
  for (const z of [-1.2, 1.2]) {
    const fang = part(
      head,
      `vampire-fang-${z > 0 ? 1 : 0}`,
      new THREE.ConeGeometry(0.42, 2.4, 6),
      glossy(0xfffaf2, 0.2),
      6.2,
      -4.6,
      z,
    );
    fang.rotation.z = Math.PI;
  }
  const fang = new THREE.Object3D();
  fang.name = 'vampire-fang-tip';
  fang.position.set(6.2, -5.8, 0);
  head.add(fang);

  const arm = (name: string, z: number) => {
    const limb = makeLimb(
      body,
      name,
      SHOULDER.x,
      SHOULDER.y,
      z,
      14.5,
      13.5,
      2.4,
      matte(COAT, 0.65),
    );
    hand(limb, name);
    return limb;
  };
  const arms: [Limb, Limb] = [arm('vampire-arm-front', 6.4), arm('vampire-arm-back', -6.4)];
  const leg = (name: string, z: number) => {
    const limb = makeLimb(
      human,
      name,
      VAMPIRE_HIP.x,
      VAMPIRE_HIP.y,
      z,
      19,
      18,
      2.8,
      matte(0x241d2e, 0.7),
    );
    oval(limb.end, `${name}-shoe`, glossy(0x0d0a10, 0.3), 2.6, -1.3, 0, 4.6, 1.8, 2.4);
    return limb;
  };
  const legs: [Limb, Limb] = [leg('vampire-leg-front', 3.4), leg('vampire-leg-back', -3.4)];
  const bat = makeBat(root);
  models.set(root, {
    plan,
    human,
    body,
    head,
    jaw,
    cape,
    arms,
    legs,
    fang,
    bat: bat.bat,
    wings: bat.wings,
    batHead: bat.head,
  });
  return root;
}

export function vampireModel(root: THREE.Group): VampireModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native vampire');
  return model;
}

export interface VampirePose {
  readonly walked: number;
  readonly planted: number;
  readonly lean: number;
  readonly crouch: number;
  readonly rise: number;
  readonly neck: number;
  readonly headTilt: number;
  readonly mouth: number;
  readonly cape: number;
  /** Hand targets per arm; null leaves that arm to be placed against the card by the trick. */
  readonly front: { readonly x: number; readonly y: number } | null;
  readonly back: { readonly x: number; readonly y: number } | null;
  readonly form: number;
  readonly batForm: number;
  readonly flap: number;
  readonly fold: number;
  readonly bank: number;
  readonly batYaw: number;
}

export function vampirePose(root: THREE.Group, q: VampirePose) {
  const m = vampireModel(root);
  const stride = 20;
  const hip = VAMPIRE_HIP.y - q.crouch;
  m.legs.forEach((leg, i) => {
    const step = gait(q.walked, stride, i * 0.5, 4);
    leg.root.position.y = hip;
    reach(leg, step.x + (i ? -1.5 : 1.5), -(hip - 3.1) + step.y * (1 - q.planted), 1, 0);
  });
  m.body.position.y = hip;
  m.body.rotation.z = -q.lean;
  // The rise is applied straight up in world space, whatever the body's lean.
  m.head.position.set(2.5 + q.neck - q.rise * Math.sin(q.lean), 38 + q.rise * Math.cos(q.lean), 0);
  m.head.rotation.z = -q.headTilt;
  m.jaw.rotation.z = -0.55 * q.mouth;
  m.cape.rotation.z = 0.35 * q.cape;
  m.cape.scale.set(1 + 0.45 * q.cape, 1 - 0.1 * q.cape, 1);
  if (q.front) reach(m.arms[0], q.front.x, q.front.y, -1);
  if (q.back) reach(m.arms[1], q.back.x, q.back.y, -1);
  m.human.visible = q.form > 0.001;
  m.human.scale.set(Math.max(0.001, 0.6 + 0.4 * q.form), Math.max(0.001, q.form), 1);
  m.human.position.y = (1 - q.form) * BAT_ANCHOR.y * 0.5;
  m.bat.visible = q.batForm > 0.001;
  m.bat.scale.setScalar(Math.max(0.001, q.batForm));
  m.bat.rotation.set(0, q.batYaw, q.bank);
  m.wings.forEach((wing, i) => {
    const side = i ? 1 : -1;
    wing.rotation.z = side * q.flap;
    wing.scale.x = 1 - 0.45 * q.fold;
  });
}

export function tinyBat(): THREE.ShapeGeometry {
  return new THREE.ShapeGeometry(
    outline([
      [0, 1.2],
      [1.2, 2.2],
      [3.6, 2.6],
      [5, 1.4],
      [3.8, 0.6],
      [3, -0.6],
      [1.6, 0],
      [0.8, -1.2],
      [0, -0.4],
      [-0.8, -1.2],
      [-1.6, 0],
      [-3, -0.6],
      [-3.8, 0.6],
      [-5, 1.4],
      [-3.6, 2.6],
      [-1.2, 2.2],
    ]),
  );
}
