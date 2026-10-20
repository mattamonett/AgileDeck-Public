import * as THREE from 'three';
import { ghostPlan, type GhostPlan } from './ghost-choreography';
import { glow, makeLimb, matte, oval, part, reach, type Limb } from '../../kit';

const SHEET = 0xf6f8ff,
  SHEET_GLOW = 0xb8c6ff,
  INK = 0x2a2440,
  OUTLINE = 0x7b86b4,
  BLUSH = 0xf5a3c0,
  TONGUE = 0xe86d8e;

/** Shoulder pivots of the sheet arms, in body space. */
export const GHOST_SHOULDER = new THREE.Vector2(10.2, 24);
const UPPER_ARM = 6,
  FOREARM = 5.6;
const HEM_LOBES = 8;

export interface GhostModel {
  readonly plan: GhostPlan;
  /** Pivots at the hem's centre; leans, swells and bobs as a whole. */
  readonly body: THREE.Group;
  readonly eyes: readonly THREE.Mesh[];
  /** Happy closed-eye arcs shown while it laughs. */
  readonly squints: readonly THREE.Mesh[];
  readonly mouth: THREE.Mesh;
  readonly grin: THREE.Group;
  readonly brows: readonly THREE.Mesh[];
  readonly arms: readonly [Limb, Limb];
  readonly lobes: readonly THREE.Group[];
  /** Every material with its authored opacity and depth write, so the ghost can fade and clip as one. */
  readonly materials: readonly {
    readonly material: THREE.Material;
    readonly opacity: number;
    readonly depthWrite: boolean;
  }[];
}
const models = new WeakMap<THREE.Group, GhostModel>();

function group(parent: THREE.Object3D, name: string, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** A soft, faintly glowing sheet that reads on the dark felt and on light themes. */
function sheet(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: SHEET,
    emissive: SHEET_GLOW,
    emissiveIntensity: 0.22,
    roughness: 0.6,
    side: THREE.FrontSide,
  });
}
/** Inverted-hull outline: a slightly larger back-face shell behind the sheet. */
function hull(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide });
}

/** Sheet silhouette from the hem up to the domed head, revolved about the vertical axis. */
const PROFILE: readonly (readonly [number, number])[] = [
  [12.6, 0.4],
  [12.2, 4],
  [11.4, 10],
  [11.1, 16],
  [11.4, 22],
  [11.1, 27],
  [10, 31],
  [8.1, 34.6],
  [5.2, 37.6],
  [2.3, 39.4],
  [0.01, 40],
];

function buildSheet(body: THREE.Group) {
  const geometry = new THREE.LatheGeometry(
    PROFILE.map(([x, y]) => new THREE.Vector2(x, y)),
    28,
  );
  part(body, 'ghost-sheet', geometry, sheet());
  const shell = part(body, 'ghost-outline', geometry.clone(), hull(), 0, -0.5, 0);
  shell.scale.set(1.06, 1.03, 1.06);
  // A scalloped hem: rounded lobes that ripple as it floats.
  const lobes: THREE.Group[] = [];
  for (let i = 0; i < HEM_LOBES; i++) {
    const a = (i / HEM_LOBES) * Math.PI * 2;
    const lobe = group(body, 'ghost-hem', Math.sin(a) * 11.4, 1.2, Math.cos(a) * 11.4);
    oval(lobe, 'ghost-hem-lobe', sheet(), 0, -0.6, 0, 3.4, 2.6, 3.4);
    oval(lobe, 'ghost-hem-outline', hull(), 0, -0.75, 0, 3.75, 2.95, 3.75);
    lobes.push(lobe);
  }
  return lobes;
}

function buildFace(body: THREE.Group) {
  const face = group(body, 'ghost-face', 0, 0, 0);
  const eyes: THREE.Mesh[] = [],
    squints: THREE.Mesh[] = [],
    brows: THREE.Mesh[] = [];
  for (const x of [-4.1, 4.1]) {
    const eye = oval(face, 'ghost-eye', matte(INK, 0.35), x, 25.6, 10.4, 2.2, 3.3, 1.2);
    oval(eye, 'ghost-eye-glint', glow(0xffffff, 0.95), -0.25, 0.42, 0.85, 0.3, 0.24, 0.2);
    eyes.push(eye);
    const squint = part(
      face,
      'ghost-squint',
      new THREE.TorusGeometry(2, 0.42, 6, 14, Math.PI),
      matte(INK, 0.4),
      x,
      25,
      10.9,
    );
    squint.visible = false;
    squints.push(squint);
    const brow = part(
      face,
      'ghost-brow',
      new THREE.BoxGeometry(3.4, 0.7, 0.6),
      matte(INK, 0.4),
      x,
      30,
      9.9,
    );
    brows.push(brow);
    oval(face, 'ghost-cheek', glow(BLUSH, 0.55), x * 1.72, 21.4, 9.3, 1.7, 1, 0.6);
  }
  const mouth = oval(face, 'ghost-mouth', matte(INK, 0.4), 0, 19.6, 10.9, 1.5, 1.9, 0.9);
  oval(mouth, 'ghost-tongue', matte(TONGUE, 0.5), 0, -0.45, 0.35, 0.6, 0.4, 0.6);
  // A wide open grin for the laughing fit: dark arc with a tongue at the bottom.
  const grin = group(face, 'ghost-grin', 0, 20.4, 10.9);
  const smile = part(
    grin,
    'ghost-grin-arc',
    new THREE.CircleGeometry(3.4, 18, Math.PI, Math.PI),
    matte(INK, 0.4),
  );
  smile.position.z = 0.15;
  oval(grin, 'ghost-grin-tongue', matte(TONGUE, 0.5), 0, -2.3, 0.3, 1.6, 0.85, 0.4);
  grin.visible = false;
  return { eyes, squints, mouth, grin, brows };
}

function buildArms(body: THREE.Group): [Limb, Limb] {
  const arm = (name: string, s: number) => {
    const limb = makeLimb(
      body,
      name,
      s * GHOST_SHOULDER.x,
      GHOST_SHOULDER.y,
      1.5,
      UPPER_ARM,
      FOREARM,
      2.5,
      sheet(),
    );
    // Rounded sheet mitten at the end of each arm.
    oval(limb.end, `${name}-mitten`, sheet(), 0, -1.6, 0, 2.6, 2.9, 2.4);
    oval(limb.end, `${name}-mitten-outline`, hull(), 0, -1.6, -0.2, 2.9, 3.2, 2.6);
    return limb;
  };
  return [arm('ghost-arm-0', -1), arm('ghost-arm-1', 1)];
}

export function makeGhost(id: string): THREE.Group {
  const plan = ghostPlan(id);
  const root = new THREE.Group();
  root.name = 'ghost';
  const body = group(root, 'ghost-body', 0, 0, 0);
  const lobes = buildSheet(body);
  const face = buildFace(body);
  const arms = buildArms(body);
  const materials: GhostModel['materials'][number][] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(o.material) ? o.material : [o.material])
      materials.push({ material, opacity: material.opacity, depthWrite: material.depthWrite });
  });
  models.set(root, { plan, body, lobes, arms, materials, ...face });
  ghostPose(root, GHOST_REST);
  return root;
}

export function ghostModel(root: THREE.Group): GhostModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native ghost');
  return model;
}

export interface ArmTarget {
  readonly x: number;
  readonly y: number;
}
export interface GhostPose {
  /** Body lean (positive tips toward +x), extra height and swell of the sheet. */
  readonly lean: number;
  readonly lift: number;
  readonly swell: number;
  /** Squash (positive) or stretch of the sheet. */
  readonly squash: number;
  /** Hand targets relative to each shoulder, in body units. */
  readonly hands: readonly [ArmTarget, ArmTarget];
  /** Mouth: 0 a small hoot, 1 a huge BOO. */
  readonly open: number;
  /** 0 normal eyes, 1 squeezed shut with laughter (and a grin). */
  readonly laugh: number;
  /** Pupil glance direction across the screen, -1..1. */
  readonly glance: number;
  readonly blink: number;
  /** Brow lift: negative is a menacing scowl. */
  readonly brow: number;
  /** Hem ripple phase in radians and its strength. */
  readonly ripple: number;
  readonly flutter: number;
  readonly opacity: number;
}
export const GHOST_REST: GhostPose = {
  lean: 0,
  lift: 0,
  swell: 0,
  squash: 0,
  hands: [
    { x: -2.5, y: -9.5 },
    { x: 2.5, y: -9.5 },
  ],
  open: 0,
  laugh: 0,
  glance: 0,
  blink: 0,
  brow: 0,
  ripple: 0,
  flutter: 0.5,
  opacity: 1,
};

export function ghostPose(root: THREE.Group, q: GhostPose) {
  const m = ghostModel(root);
  m.body.position.set(0, q.lift, 0);
  m.body.rotation.set(0, 0, -q.lean);
  const s = 1 + q.swell;
  m.body.scale.set(s * (1 + 0.5 * q.squash), s * (1 - q.squash), s * (1 + 0.5 * q.squash));
  m.arms.forEach((arm, i) => {
    const t = q.hands[i] ?? { x: 0, y: -9 };
    // Elbows bow outward on both sides.
    reach(arm, t.x, t.y, i === 0 ? -1 : 1);
  });
  const shut = q.laugh > 0.5;
  m.eyes.forEach((eye, i) => {
    eye.visible = !shut;
    eye.scale.y = 3.3 * Math.max(0.1, 1 - q.blink) * (1 + 0.18 * q.open);
    eye.position.x = (i ? 4.1 : -4.1) + 0.6 * q.glance;
  });
  m.squints.forEach((squint) => (squint.visible = shut));
  m.brows.forEach((brow, i) => {
    brow.position.y = 30 + 1.4 * q.brow + 0.6 * q.open;
    // A scowl tilts the inner ends down; surprise or glee lifts them.
    brow.rotation.z =
      (i ? 1 : -1) * 0.35 * Math.min(0, q.brow) - (i ? 1 : -1) * 0.15 * Math.max(0, q.brow);
  });
  m.mouth.visible = !shut;
  m.mouth.scale.set(1.5 + 2.1 * q.open, 1.9 + 3.6 * q.open, 0.9);
  m.mouth.position.y = 19.6 - 1.6 * q.open;
  m.grin.visible = shut;
  m.grin.scale.setScalar(0.8 + 0.3 * q.laugh);
  m.lobes.forEach((lobe, i) => {
    const wave = Math.sin(q.ripple + i * 1.7);
    lobe.position.y = 1.2 + 0.9 * q.flutter * wave;
    lobe.scale.set(1, 1 + 0.25 * q.flutter * wave, 1);
  });
  for (const { material, opacity, depthWrite } of m.materials) {
    material.transparent = opacity < 1 || q.opacity < 1;
    material.opacity = opacity * q.opacity;
    // A see-through ghost must not hide what is behind it in the depth buffer.
    material.depthWrite = depthWrite && q.opacity >= 1;
  }
}
