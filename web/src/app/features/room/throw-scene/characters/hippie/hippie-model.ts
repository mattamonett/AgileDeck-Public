import * as THREE from 'three';
import { hippiePlan, DAISY_STEM, type HippiePlan } from './hippie-choreography';
import { glossy, glow, makeLimb, matte, oval, part, reach, type Limb } from '../../kit';

const SKIN = 0xe7b48f,
  HAIR = 0x6b4426,
  HAIR_LIGHT = 0x8a5a33,
  DENIM = 0x4f73a8,
  DENIM_DARK = 0x3d5d8c,
  SUEDE = 0xa8703f,
  SUEDE_DARK = 0x84542c,
  BAND = 0xe0662f,
  LENS = 0xf08a3c,
  BRASS = 0xd8b24c,
  SANDAL = 0x6e4426,
  STEM = 0x4f9a43,
  PETAL = 0xfffdf4,
  HEART = 0xf4c022,
  LIPS = 0xc8505a,
  BLUSH = 0xf28c8c;

/** Standing hip height, ankle height above the sole and the shoulder in body space, in model units. */
export const HIPPIE_HIP = 29;
export const HIPPIE_ANKLE = 1.9;
export const HIPPIE_SHOULDER = new THREE.Vector3(0.6, 15.2, 5.6);
const THIGH = 14.2,
  SHIN = 13.2,
  UPPER_ARM = 10.2,
  FOREARM = 9.8;

export interface HippieHand {
  /** Index and middle fingers: curled into a loose fist, or raised as a peace sign. */
  readonly fingers: readonly [THREE.Group, THREE.Group];
  readonly grip: THREE.Object3D;
}
export interface Daisy {
  readonly root: THREE.Group;
  /** The flower head pivots on the stem top so it can lag behind sways. */
  readonly head: THREE.Group;
  readonly grip: THREE.Object3D;
}
export interface HippieModel {
  readonly plan: HippiePlan;
  readonly body: THREE.Group;
  readonly head: THREE.Group;
  readonly hair: THREE.Group;
  readonly eyes: readonly THREE.Mesh[];
  readonly mouth: THREE.Mesh;
  readonly fringe: readonly THREE.Group[];
  readonly arms: readonly [Limb, Limb];
  readonly hands: readonly [HippieHand, HippieHand];
  readonly legs: readonly [Limb, Limb];
  readonly flares: readonly [THREE.Group, THREE.Group];
  readonly daisy: Daisy;
}
const models = new WeakMap<THREE.Group, HippieModel>();

function group(parent: THREE.Object3D, name: string, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
function marker(parent: THREE.Object3D, name: string, x: number, y: number, z: number) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

/** Soft tie-dye spiral, drawn once; the texture is disposed through the shirt material's map. */
function tieDye(): THREE.MeshStandardMaterial {
  const material = matte(0xffffff, 0.85);
  if (typeof document === 'undefined') {
    material.color.setHex(0xe86fa8);
    return material;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    material.color.setHex(0xe86fa8);
    return material;
  }
  const colors = ['#e2489a', '#f39a2e', '#f7d84a', '#4cb87b', '#3d8fd6', '#8a5bc9'];
  for (let ring = 9; ring >= 0; ring--) {
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = colors[(i + ring) % colors.length] ?? '#e2489a';
      ctx.beginPath();
      ctx.moveTo(64, 64);
      const twist = ring * 0.35;
      ctx.arc(
        64,
        64,
        10 + ring * 9,
        (i / 6) * Math.PI * 2 + twist,
        ((i + 1) / 6) * Math.PI * 2 + twist,
      );
      ctx.closePath();
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  material.map = texture;
  return material;
}

function buildBody(root: THREE.Group) {
  const body = group(root, 'hippie-body', 0, HIPPIE_HIP, 0);
  oval(body, 'hippie-hips', matte(DENIM, 0.9), 0, 0.6, 0, 5.4, 3.6, 6.2);
  oval(body, 'hippie-shirt', tieDye(), 0.3, 8.6, 0, 5.2, 8.6, 6.6);
  part(
    body,
    'hippie-belt',
    new THREE.CylinderGeometry(5.6, 5.6, 1.2, 18),
    matte(SUEDE_DARK, 0.8),
    0,
    2.4,
    0,
  );
  // An open fringed suede vest: two front panels, a back and a dangling fringe along the hem.
  for (const z of [1, -1]) {
    const panel = oval(body, 'hippie-vest', matte(SUEDE, 0.9), -0.7, 9.4, z * 4.3, 4.3, 7.6, 2.6);
    panel.rotation.x = z * 0.12;
  }
  oval(body, 'hippie-vest-back', matte(SUEDE, 0.9), -1.6, 9.6, 0, 4.4, 7.8, 6.4);
  const fringe: THREE.Group[] = [];
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.85 + (i / 8) * Math.PI * 1.7;
    const strand = group(body, 'hippie-fringe', Math.cos(a) * 5.2 - 0.4, 2.6, Math.sin(a) * 6.3);
    part(
      strand,
      'hippie-fringe-strand',
      new THREE.BoxGeometry(0.5, 3.4, 0.3),
      matte(SUEDE_DARK, 0.9),
      0,
      -1.7,
      0,
    );
    fringe.push(strand);
  }
  // Peace pendant on a cord at the open front of the vest.
  const pendant = group(body, 'hippie-pendant', 5.4, 11.2, 0);
  pendant.rotation.y = Math.PI / 2;
  part(
    pendant,
    'hippie-pendant-ring',
    new THREE.TorusGeometry(1.25, 0.24, 6, 18),
    glossy(BRASS, 0.3),
  );
  part(pendant, 'hippie-pendant-bar', new THREE.BoxGeometry(0.28, 2.4, 0.28), glossy(BRASS, 0.3));
  for (const s of [-1, 1]) {
    const leg = part(
      pendant,
      'hippie-pendant-leg',
      new THREE.BoxGeometry(0.28, 1.3, 0.28),
      glossy(BRASS, 0.3),
      s * 0.45,
      -0.55,
      0,
    );
    leg.rotation.z = s * 0.8;
  }
  oval(body, 'hippie-neck', matte(SKIN, 0.7), 0.6, 18.4, 0, 2, 2.6, 2);
  return { body, fringe };
}

function buildHead(body: THREE.Group) {
  const head = group(body, 'hippie-head', 1.2, 23.6, 0);
  oval(head, 'hippie-face', matte(SKIN, 0.7), 0, 0, 0, 4.6, 5.4, 4.4);
  oval(head, 'hippie-ear', matte(SKIN, 0.7), -0.6, 0.2, 0, 1.2, 1.7, 4.8);
  // Long centre-parted hair: a crown, a mass falling well down her back and side locks over her shoulders.
  const hair = group(head, 'hippie-hair', 0, 0, 0);
  oval(hair, 'hippie-hair-crown', matte(HAIR, 0.95), -0.5, 2.4, 0, 5.1, 4, 5);
  oval(hair, 'hippie-hair-back', matte(HAIR, 0.95), -3.4, -6.4, 0, 3.1, 10.6, 5.4);
  for (const z of [1, -1]) {
    const lock = oval(
      hair,
      'hippie-hair-lock',
      matte(HAIR_LIGHT, 0.95),
      0.4,
      -5.6,
      z * 4,
      2.1,
      8,
      1.3,
    );
    lock.rotation.z = -0.12;
  }
  const band = part(
    head,
    'hippie-headband',
    new THREE.TorusGeometry(4.75, 0.42, 6, 28),
    matte(BAND, 0.7),
    -0.2,
    2.5,
    0,
  );
  band.rotation.x = Math.PI / 2;
  band.rotation.y = 0.18;
  band.scale.set(1, 0.95, 1);
  for (const z of [0.7, -0.7]) {
    const tail = part(
      head,
      'hippie-headband-tail',
      new THREE.BoxGeometry(0.6, 4, 0.25),
      matte(BAND, 0.7),
      -5,
      0.6,
      z,
    );
    tail.rotation.z = -0.35;
  }
  // Little daisies woven into the headband, like a flower crown.
  for (let i = 0; i < 5; i++) {
    const a = 0.35 + i * 0.62;
    const x = Math.cos(a) * 4.9,
      z = Math.sin(a) * 4.9 * (i % 2 ? -1 : 1);
    const bloom = group(head, 'hippie-crown-daisy', x - 0.2, 2.5 + 0.25 * Math.sin(i * 2.1), z);
    // Each bloom faces out from the head.
    bloom.rotation.y = Math.atan2(x, z);
    part(bloom, 'hippie-crown-petals', new THREE.CircleGeometry(0.95, 8), matte(PETAL, 0.7));
    part(
      bloom,
      'hippie-crown-heart',
      new THREE.CircleGeometry(0.4, 8),
      matte(HEART, 0.6),
      0,
      0,
      0.05,
    );
  }
  // Rosy cheeks, a soft pink smile, a small nose and hoop earrings.
  for (const z of [2.6, -2.6])
    oval(head, 'hippie-cheek', glow(BLUSH, 0.45), 3.7, -1.2, z, 0.5, 0.75, 0.75);
  const mouth = oval(head, 'hippie-mouth', matte(LIPS, 0.5), 4.05, -2.5, 0, 0.35, 0.32, 1.25);
  oval(head, 'hippie-nose', matte(0xd99f7c, 0.6), 4.7, 0.1, 0, 0.75, 0.95, 0.75);
  for (const z of [4.6, -4.6]) {
    const hoop = part(
      head,
      'hippie-earring',
      new THREE.TorusGeometry(0.85, 0.16, 6, 16),
      glossy(BRASS, 0.3),
      -0.4,
      -1.7,
      z,
    );
    hoop.rotation.y = Math.PI / 2;
  }
  const eyes: THREE.Mesh[] = [];
  for (const z of [1.8, -1.8]) {
    eyes.push(oval(head, 'hippie-eye', glossy(0x2b2117, 0.3), 4.05, 1.3, z, 0.4, 0.7, 0.5));
    const lash = part(
      head,
      'hippie-lash',
      new THREE.BoxGeometry(0.2, 0.2, 0.9),
      matte(0x2b2117, 0.5),
      4.25,
      2.05,
      z + Math.sign(z) * 0.35,
    );
    lash.rotation.x = Math.sign(z) * -0.5;
    // Round tinted sunglasses: a wire rim around a warm lens, sitting just proud of the eye.
    const rim = part(
      head,
      'hippie-glasses-rim',
      new THREE.TorusGeometry(1.35, 0.17, 6, 20),
      glossy(BRASS, 0.3),
      4.55,
      1.3,
      z,
    );
    rim.rotation.y = Math.PI / 2;
    const lens = part(
      head,
      'hippie-glasses-lens',
      new THREE.CircleGeometry(1.25, 18),
      glow(LENS, 0.62),
      4.6,
      1.3,
      z,
    );
    lens.rotation.y = Math.PI / 2;
    oval(head, 'hippie-glasses-glint', glow(0xffffff, 0.85), 4.7, 1.8, z - 0.35, 0.12, 0.3, 0.3);
  }
  part(
    head,
    'hippie-glasses-bridge',
    new THREE.BoxGeometry(0.25, 0.25, 1.2),
    glossy(BRASS, 0.3),
    4.6,
    1.5,
    0,
  );
  return { head, hair, eyes, mouth };
}

function buildHand(limb: Limb, name: string): HippieHand {
  oval(limb.end, `${name}-palm`, matte(SKIN, 0.7), 0, -1.2, 0, 1.2, 1.5, 0.9);
  const thumb = oval(limb.end, `${name}-thumb`, matte(SKIN, 0.7), 0.9, -0.9, 0.3, 0.45, 0.95, 0.45);
  thumb.rotation.z = -0.5;
  const fingers = [0.45, -0.45].map((x, i) => {
    const finger = group(limb.end, `${name}-finger-${i}`, x, -2.3, 0);
    oval(finger, `${name}-finger-${i}-digit`, matte(SKIN, 0.7), 0, -1.2, 0, 0.36, 1.35, 0.4);
    return finger;
  });
  const [a, b] = fingers;
  if (!a || !b) throw new Error('Missing hippie fingers');
  // The bead bracelet sits on the wrist, just above the palm.
  const bracelet = part(
    limb.end,
    `${name}-beads`,
    new THREE.TorusGeometry(1.15, 0.32, 6, 12),
    glossy(0x3fa1b0, 0.4),
    0,
    0.2,
    0,
  );
  bracelet.rotation.x = Math.PI / 2;
  return { fingers: [a, b], grip: marker(limb.end, `${name}-grip`, 0, -1.4, 0) };
}

function buildLimbs(root: THREE.Group, body: THREE.Group) {
  const arm = (name: string, z: number) => {
    const limb = makeLimb(
      body,
      name,
      HIPPIE_SHOULDER.x,
      HIPPIE_SHOULDER.y,
      z,
      UPPER_ARM,
      FOREARM,
      1.5,
      tieDye(),
    );
    // Short tie-dye sleeves over bare forearms; the replaced clones are released here.
    for (const mesh of [limb.lower, limb.joint]) {
      for (const old of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        old.dispose();
      mesh.material = matte(SKIN, 0.7);
    }
    return limb;
  };
  const leg = (name: string, z: number) => {
    const limb = makeLimb(
      root,
      name,
      0,
      HIPPIE_HIP,
      z,
      THIGH,
      SHIN,
      2.1,
      matte(DENIM, 0.9),
      matte(DENIM_DARK, 0.9),
    );
    // Bell-bottom flare: a widening cone hanging from just below the knee to the ankle.
    const flare = group(limb.end, `${name}-flare`, 0, 0, 0);
    part(
      flare,
      `${name}-bell`,
      new THREE.CylinderGeometry(1.9, 3.3, 5.6, 14, 1, true),
      matte(DENIM, 0.9),
      0,
      2.4,
      0,
    );
    part(
      flare,
      `${name}-hem`,
      new THREE.TorusGeometry(3.25, 0.25, 6, 18),
      matte(DENIM_DARK, 0.9),
      0,
      -0.4,
      0,
    ).rotation.x = Math.PI / 2;
    // A bare foot in a sandal: the sole bottoms out exactly HIPPIE_ANKLE below the ankle.
    oval(limb.end, `${name}-foot`, matte(SKIN, 0.7), 1.6, -1.15, 0, 2.6, 0.75, 1.3);
    part(
      limb.end,
      `${name}-sole`,
      new THREE.BoxGeometry(5.6, 0.6, 2.8),
      matte(SANDAL, 0.8),
      1.5,
      -HIPPIE_ANKLE + 0.3,
      0,
    );
    part(
      limb.end,
      `${name}-strap`,
      new THREE.BoxGeometry(0.6, 0.5, 2.9),
      matte(SANDAL, 0.8),
      2.4,
      -1.05,
      0,
    );
    return { limb, flare };
  };
  const arms: [Limb, Limb] = [
    arm('hippie-arm-0', HIPPIE_SHOULDER.z),
    arm('hippie-arm-1', -HIPPIE_SHOULDER.z),
  ];
  const hands: [HippieHand, HippieHand] = [
    buildHand(arms[0], 'hippie-hand-0'),
    buildHand(arms[1], 'hippie-hand-1'),
  ];
  const near = leg('hippie-leg-0', 2.7),
    far = leg('hippie-leg-1', -2.7);
  return {
    arms,
    hands,
    legs: [near.limb, far.limb] as const,
    flares: [near.flare, far.flare] as const,
  };
}

/** A daisy that faces the viewer; its origin is the grip at the bottom of the stem. */
export function buildDaisy(): Daisy {
  const root = new THREE.Group();
  root.name = 'hippie-daisy';
  part(
    root,
    'daisy-stem',
    new THREE.CylinderGeometry(0.32, 0.4, DAISY_STEM, 8),
    matte(STEM, 0.7),
    0,
    DAISY_STEM / 2,
    0,
  );
  const leaf = oval(root, 'daisy-leaf', matte(STEM, 0.7), 1.3, DAISY_STEM * 0.42, 0, 1.6, 0.6, 0.3);
  leaf.rotation.z = 0.55;
  const head = group(root, 'daisy-head', 0, DAISY_STEM, 0);
  for (let i = 0; i < 12; i++) {
    const petal = oval(head, 'daisy-petal', matte(PETAL, 0.75), 0, 0, 0.2, 0.75, 2.2, 0.25);
    const a = (i / 12) * Math.PI * 2;
    petal.position.set(Math.cos(a) * 2.2, Math.sin(a) * 2.2, 0.2);
    petal.rotation.z = a - Math.PI / 2;
  }
  oval(head, 'daisy-heart', glossy(HEART, 0.5), 0, 0, 0.6, 1.25, 1.25, 0.6);
  return { root, head, grip: marker(root, 'daisy-grip', 0, 1.4, 0) };
}

export function makeHippie(id: string): THREE.Group {
  const plan = hippiePlan(id);
  const root = new THREE.Group();
  root.name = 'hippie';
  const { body, fringe } = buildBody(root);
  const face = buildHead(body);
  const limbs = buildLimbs(root, body);
  const daisy = buildDaisy();
  root.add(daisy.root);
  models.set(root, { plan, body, fringe, ...face, ...limbs, daisy });
  hippiePose(root, HIPPIE_REST);
  return root;
}

export function hippieModel(root: THREE.Group): HippieModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native hippie');
  return model;
}

export interface SoleTarget {
  readonly x: number;
  readonly y: number;
}
/** Forward distance from the ankle to the toe tip, used when she rises onto her toes. */
export const HIPPIE_TOE = 4.1;
/** Ankle height above the floor when the foot pitches heel-up by `toe` radians on its toe tip. */
export const tiptoeAnkle = (toe: number) =>
  HIPPIE_ANKLE * Math.cos(toe) + HIPPIE_TOE * Math.sin(toe);
export interface HippiePose {
  readonly feet: readonly [SoleTarget, SoleTarget];
  /** Heel-up pitch of both feet in radians; the toe tips stay on the sole targets. */
  readonly toe: number;
  readonly hip: number;
  readonly lean: number;
  readonly roll: number;
  /** Head back (positive) or forward, a curious roll toward a shoulder, and a nod. */
  readonly headTilt: number;
  readonly headRoll: number;
  readonly headNod: number;
  readonly headTurn: number;
  readonly blink: number;
  readonly smile: number;
  /** 0 a loose fist, 1 two fingers raised in a peace sign, for each hand. */
  readonly peace: readonly [number, number];
  /** Fringe and hair swing, following the body's motion. */
  readonly swing: number;
}
export const HIPPIE_REST: HippiePose = {
  feet: [
    { x: 1.2, y: 0 },
    { x: -1, y: 0 },
  ],
  toe: 0,
  hip: HIPPIE_HIP,
  lean: 0,
  roll: 0,
  headTilt: 0,
  headRoll: 0,
  headNod: 0,
  headTurn: 0,
  blink: 0,
  smile: 0.5,
  peace: [0, 0],
  swing: 0,
};

/** Poses everything but the arms, which reach for world targets once the body is placed. */
export function hippiePose(root: THREE.Group, q: HippiePose) {
  const m = hippieModel(root);
  m.legs.forEach((leg, i) => {
    const foot = q.feet[i] ?? { x: 0, y: 0 };
    leg.root.position.set(0, q.hip, leg.root.position.z);
    // On tiptoe the ankle lifts and shifts so the toe tip stays exactly where the flat toe was.
    const shift = HIPPIE_TOE * (1 - Math.cos(q.toe)) + HIPPIE_ANKLE * Math.sin(q.toe);
    reach(leg, foot.x + shift, foot.y + tiptoeAnkle(q.toe) - q.hip, 1, -q.toe);
  });
  m.flares.forEach((flare, i) => {
    // The bell follows the shin from the ankle up toward the knee, swinging out a little.
    const leg = m.legs[i];
    if (!leg) return;
    const dx = leg.joint.position.x - leg.end.position.x,
      dy = leg.joint.position.y - leg.end.position.y;
    flare.rotation.z = Math.atan2(-dx, dy) - leg.end.rotation.z + q.swing * 0.12;
  });
  m.body.position.set(0, q.hip, 0);
  m.body.rotation.set(q.roll, 0, -q.lean);
  m.head.rotation.set(q.headRoll, q.headTurn, q.headTilt - q.headNod);
  for (const eye of m.eyes) eye.scale.y = 0.7 * Math.max(0.12, 1 - q.blink);
  m.mouth.scale.set(0.45 + 0.25 * q.smile, 0.35 + 0.2 * q.smile, 1.5 + 0.4 * q.smile);
  m.hair.rotation.z = 0.08 * q.swing + 0.5 * q.headNod;
  m.fringe.forEach(
    (strand, i) => (strand.rotation.z = q.swing * (0.35 + 0.05 * (i % 3)) + q.lean * 0.8),
  );
  m.hands.forEach((hand, i) => {
    const v = q.peace[i] ?? 0;
    hand.fingers.forEach((finger, j) => {
      // Curled fingers fold back under the palm; raised ones straighten and spread into a V.
      finger.rotation.set((1 - v) * 1.9, 0, (j === 0 ? 1 : -1) * 0.22 * v);
      finger.scale.setScalar(0.75 + 0.25 * v);
    });
  });
}
