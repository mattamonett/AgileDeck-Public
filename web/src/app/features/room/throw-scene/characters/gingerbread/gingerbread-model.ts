import * as THREE from 'three';
import { gingerbreadPlan, type GingerbreadPlan } from './gingerbread-choreography';
import { glossy, makeLimb, matte, oval, part, reach, type Limb } from '../../kit';

const COOKIE = 0xc47a3c,
  BAKED = 0x8a4a1c,
  ICING = 0xfffaf0,
  CHOC = 0x2e160a,
  CHEEK = 0xf0868a,
  CANE_RED = new THREE.Color(0xd42a36),
  CANE_WHITE = new THREE.Color(0xfff6ee);

/** Hip height above the soles when standing straight. */
export const GINGER_HIP = 13.2;
/** The ankle (limb end) sits this far above the sole of the rounded foot. */
export const FOOT_DROP = 3.6;
/** Shoulder joints in body space; +x is the cane arm, which faces the card. */
export const GINGER_SHOULDER = new THREE.Vector2(6.4, 15.2);
export const GINGER_LEG_X = 3.3;
/** Depth of the shoulder joints in front of the body's mid-plane. */
export const GINGER_ARM_Z = 0.4;
const SLAB = 3.6,
  BEVEL = 0.9;
const FACE_Z = SLAB / 2 + BEVEL + 0.1;
/** Grip on the cane hand, in the hand's end-group space. */
const GRIP = new THREE.Vector3(0, -1.6, 1.1);
/** Inner apex of the crook, in cane space: the point that bears on the card. */
export const GINGER_HOOK = new THREE.Vector3(2.5, 12.8, 0);

export interface Xy {
  readonly x: number;
  readonly y: number;
}
export interface CaneSlot {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
}
export interface GingerbreadModel {
  readonly plan: GingerbreadPlan;
  readonly body: THREE.Group;
  readonly head: THREE.Group;
  readonly eyes: readonly THREE.Group[];
  readonly pupils: readonly THREE.Mesh[];
  /** [cane arm, free arm]. */
  readonly arms: readonly [Limb, Limb];
  /** [card-side leg, outer leg]. */
  readonly legs: readonly [Limb, Limb];
  /** Icing cuffs for [cane arm, free arm, near leg, far leg]. */
  readonly cuffs: readonly THREE.Group[];
  readonly cane: THREE.Group;
  readonly hook: THREE.Object3D;
  readonly navel: THREE.Object3D;
}
const models = new WeakMap<THREE.Group, GingerbreadModel>();

/** A rounded, slightly tapered cookie outline. */
function roundedOutline(
  cx: number,
  cy: number,
  a: number,
  b: number,
  n: number,
  taper: number,
  inset = 0,
): THREE.Vector2[] {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2,
      c = Math.cos(t),
      s = Math.sin(t);
    const y = Math.sign(s) * Math.abs(s) ** (2 / n) * (b - inset);
    const x = Math.sign(c) * Math.abs(c) ** (2 / n) * (a - inset) * (1 + (taper * y) / b);
    points.push(new THREE.Vector2(cx + x, cy + y));
  }
  return points;
}

/** A flat baked slab: pale top faces with a darker baked rim that outlines it at card size. */
function slab(parent: THREE.Object3D, name: string, outline: readonly THREE.Vector2[]): THREE.Mesh {
  const shape = new THREE.Shape([...outline]);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: SLAB,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 2,
    curveSegments: 16,
    steps: 1,
  });
  g.translate(0, 0, -SLAB / 2);
  const mesh = new THREE.Mesh(g, [matte(COOKIE, 0.85), matte(BAKED, 0.9)]);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

/** Piped royal icing along a path. */
function piping(
  parent: THREE.Object3D,
  name: string,
  points: THREE.Vector3[],
  radius: number,
  closed: boolean,
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return part(
    parent,
    name,
    new THREE.TubeGeometry(curve, points.length * 3, radius, 6, closed),
    glossy(ICING, 0.4),
  );
}

/** A zigzag icing cuff that rides the wrist or ankle, square to the forearm or shin (limb along -y). */
function cuff(limb: Limb, name: string, y: number, radius: number): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  limb.root.add(group);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    points.push(
      new THREE.Vector3(
        Math.cos(a) * radius,
        y + (i % 2 ? 0.55 : -0.55),
        Math.sin(a) * radius * 0.8,
      ),
    );
  }
  piping(group, `${name}-icing`, points, 0.42, true);
  return group;
}

/** Replaces a limb's round segments with flatter cookie-dough ones. */
function flattenLimb(limb: Limb, radius: number) {
  limb.upper.geometry.dispose();
  limb.upper.geometry = new THREE.CylinderGeometry(radius * 0.9, radius, 1, 12).scale(1, 1, 0.72);
  limb.lower.geometry.dispose();
  limb.lower.geometry = new THREE.CylinderGeometry(radius * 0.8, radius * 0.9, 1, 12).scale(
    1,
    1,
    0.72,
  );
  limb.joint.geometry.scale(1, 1, 0.75);
}

/** Candy-cane tube with twisted red stripes baked into vertex colours; grip at the origin, crook up and toward +x. */
function candyCane(): THREE.TubeGeometry {
  const points: THREE.Vector3[] = [];
  for (let y = -11; y < 11.4; y += 2.4) points.push(new THREE.Vector3(0, y, 0));
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI - (i / 10) * Math.PI;
    points.push(new THREE.Vector3(2.5 + 2.5 * Math.cos(a), 11.4 + 2.5 * Math.sin(a), 0));
  }
  points.push(new THREE.Vector3(4.95, 10.1, 0), new THREE.Vector3(4.85, 9.1, 0));
  const tubular = 84,
    radial = 8;
  const g = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points, false, 'centripetal'),
    tubular,
    1.1,
    radial,
    false,
  );
  const colors: number[] = [];
  const count = g.getAttribute('position').count;
  for (let k = 0; k < count; k++) {
    const i = Math.floor(k / (radial + 1)),
      j = k % (radial + 1);
    const stripe = ((i / tubular) * 12 + (j / radial) * 0.9) % 1 < 0.42;
    const c = stripe ? CANE_RED : CANE_WHITE;
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

export function makeGingerbread(id: string): THREE.Group {
  const plan = gingerbreadPlan(id);
  const root = new THREE.Group();
  root.name = 'christmas-gingerbread';
  const body = new THREE.Group();
  body.name = 'gingerbread-body';
  body.position.set(0, GINGER_HIP, 0);
  root.add(body);
  slab(body, 'gingerbread-torso', roundedOutline(0, 8.6, 7.4, 9.6, 2.7, 0.07));
  piping(
    body,
    'gingerbread-torso-icing',
    roundedOutline(0, 8.6, 7.4, 9.6, 2.7, 0.07, 1.6).map(
      (v, i) => new THREE.Vector3(v.x, v.y + 0.22 * Math.sin(i * 1.6), FACE_Z),
    ),
    0.45,
    true,
  );
  [0xd8263a, 0x2f9e5a, 0xd8263a].forEach((color, i) => {
    const y = 13.2 - i * 4.5;
    oval(body, `gingerbread-button-${i}`, glossy(color, 0.25), 0, y, FACE_Z + 0.3, 1.75, 1.6, 1);
    oval(
      body,
      `gingerbread-button-glint-${i}`,
      glossy(0xffffff, 0.2),
      -0.55,
      y + 0.55,
      FACE_Z + 1.2,
      0.42,
      0.36,
      0.2,
    );
  });
  const navel = new THREE.Object3D();
  navel.name = 'gingerbread-navel';
  navel.position.set(0, 8.6, 0);
  body.add(navel);

  const head = new THREE.Group();
  head.name = 'gingerbread-head';
  head.position.set(0, 18.4, 0);
  body.add(head);
  const circle = roundedOutline(0, 8.4, 9, 9, 2, 0);
  slab(head, 'gingerbread-skull', circle);
  // Wavy piped "hair" across the top of the head.
  const fringe: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = 0.45 + (i / 16) * (Math.PI - 0.9),
      r = 7.1 + (i % 2 ? 0.55 : -0.35);
    fringe.push(new THREE.Vector3(Math.cos(a) * r, 8.4 + Math.sin(a) * r, FACE_Z));
  }
  piping(head, 'gingerbread-fringe', fringe, 0.5, false);
  const eyes: THREE.Group[] = [],
    pupils: THREE.Mesh[] = [];
  for (const x of [-3.2, 3.2]) {
    const eye = new THREE.Group();
    eye.name = 'gingerbread-eye';
    eye.position.set(x, 9.9, FACE_Z);
    head.add(eye);
    oval(eye, 'gingerbread-eye-icing', glossy(ICING, 0.35), 0, 0, 0.1, 1.95, 2.15, 0.6);
    pupils.push(oval(eye, 'gingerbread-pupil', glossy(CHOC, 0.3), 0, -0.15, 0.6, 1.05, 1.25, 0.45));
    oval(eye, 'gingerbread-eye-glint', glossy(0xffffff, 0.2), 0.35, 0.4, 1.05, 0.34, 0.34, 0.15);
    eyes.push(eye);
    oval(
      head,
      'gingerbread-cheek',
      matte(CHEEK, 0.6),
      x * 1.72,
      5.7,
      FACE_Z - 0.05,
      1.35,
      1.0,
      0.3,
    );
  }
  const smile: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI + 0.62 + (i / 10) * (Math.PI - 1.24);
    smile.push(new THREE.Vector3(Math.cos(a) * 4.3, 7.6 + Math.sin(a) * 3.6, FACE_Z));
  }
  piping(head, 'gingerbread-smile', smile, 0.62, false);

  const cuffs: THREE.Group[] = [];
  const arm = (name: string, x: number) => {
    const limb = makeLimb(
      body,
      name,
      x,
      GINGER_SHOULDER.y,
      GINGER_ARM_Z,
      5.2,
      4.9,
      2.55,
      matte(COOKIE, 0.85),
    );
    flattenLimb(limb, 2.55);
    oval(limb.end, `${name}-hand`, matte(COOKIE, 0.85), 0, -1.6, 0, 2.4, 2.6, 1.7);
    cuffs.push(cuff(limb, `${name}-cuff`, 0.7, 2.15));
    return limb;
  };
  const arms: [Limb, Limb] = [
    arm('gingerbread-arm-cane', GINGER_SHOULDER.x),
    arm('gingerbread-arm-free', -GINGER_SHOULDER.x),
  ];
  const leg = (name: string, x: number) => {
    const limb = makeLimb(root, name, x, GINGER_HIP, 0, 6.2, 6, 2.9, matte(COOKIE, 0.85));
    flattenLimb(limb, 2.9);
    // The sphere's lowest vertex sits exactly FOOT_DROP below the ankle.
    oval(limb.end, `${name}-foot`, matte(COOKIE, 0.85), 0.5, -1.4, 0, 3, 2.2, 1.9);
    cuffs.push(cuff(limb, `${name}-cuff`, 0.9, 2.5));
    return limb;
  };
  const legs: [Limb, Limb] = [
    leg('gingerbread-leg-near', GINGER_LEG_X),
    leg('gingerbread-leg-far', -GINGER_LEG_X),
  ];

  const cane = new THREE.Group();
  cane.name = 'gingerbread-cane';
  part(
    cane,
    'gingerbread-cane-stick',
    candyCane(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, side: THREE.DoubleSide }),
  );
  part(
    cane,
    'gingerbread-cane-foot',
    new THREE.SphereGeometry(1.1, 10, 8),
    glossy(0xfff6ee, 0.3),
    0,
    -11,
    0,
  );
  part(
    cane,
    'gingerbread-cane-tip',
    new THREE.SphereGeometry(1.1, 10, 8),
    glossy(0xd42a36, 0.3),
    4.85,
    9.1,
    0,
  );
  const hook = new THREE.Object3D();
  hook.name = 'gingerbread-hook';
  hook.position.copy(GINGER_HOOK);
  cane.add(hook);
  arms[0].end.add(cane);
  cane.position.copy(GRIP);
  models.set(root, { plan, body, head, eyes, pupils, arms, legs, cuffs, cane, hook, navel });
  return root;
}

export function gingerbreadModel(root: THREE.Group): GingerbreadModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native gingerbread');
  return model;
}

export interface GingerbreadPose {
  readonly crouch: number;
  /** Body roll about the hips, model space. */
  readonly lean: number;
  /** Body pitch toward the viewer for a bow. */
  readonly bow: number;
  readonly headTilt: number;
  readonly headTurn: number;
  /** Pupils across the eyes, -1..1 (positive toward the card side). */
  readonly look: number;
  readonly blink: number;
  /** Cane hand relative to its shoulder, and the hand's angle in body space. */
  readonly cane: Xy;
  readonly caneAngle: number;
  readonly free: Xy;
  /** Ankle targets relative to each hip joint. */
  readonly legs: readonly [Xy, Xy];
  readonly toes: number;
  /** Cane spin about the grip, how far the fist has slid up the shaft, and the cane's depth. */
  readonly twirl: number;
  readonly slide: number;
  readonly caneZ: number;
}

export function gingerbreadPose(
  root: THREE.Group,
  q: GingerbreadPose,
  slot: CaneSlot | null = null,
) {
  const m = gingerbreadModel(root);
  const hip = GINGER_HIP - q.crouch;
  m.body.position.set(0, hip, 0);
  m.body.rotation.set(q.bow, 0, q.lean);
  m.head.rotation.set(0, q.headTurn, q.headTilt);
  m.legs.forEach((leg, i) => {
    const s = i ? -1 : 1,
      t = q.legs[i] ?? { x: 0, y: -(hip - FOOT_DROP) };
    leg.root.position.set(s * GINGER_LEG_X, hip, 0);
    reach(leg, t.x, t.y, s, s * q.toes);
  });
  reach(m.arms[0], q.cane.x, q.cane.y, -1, q.caneAngle);
  reach(m.arms[1], q.free.x, q.free.y, 1);
  if (slot) {
    if (m.cane.parent !== m.body) m.body.add(m.cane);
    m.cane.position.copy(slot.position);
    m.cane.quaternion.copy(slot.quaternion);
  } else {
    if (m.cane.parent !== m.arms[0].end) m.arms[0].end.add(m.cane);
    m.cane.position.set(GRIP.x, GRIP.y - q.slide, q.caneZ);
    m.cane.rotation.set(0, 0, q.twirl);
  }
  gingerbreadSyncCuffs(root);
  m.pupils.forEach((pupil) => (pupil.position.x = 0.5 * q.look));
  m.eyes.forEach((eye) => (eye.scale.y = Math.max(0.12, 1 - q.blink)));
}

/** Keeps the icing cuffs square to the forearms and shins after any limb is re-solved. */
export function gingerbreadSyncCuffs(root: THREE.Group) {
  const m = gingerbreadModel(root);
  [...m.arms, ...m.legs].forEach((limb, i) => {
    const c = m.cuffs[i];
    if (!c) return;
    c.position.copy(limb.end.position);
    c.rotation.z =
      Math.atan2(limb.end.position.y - limb.elbow.y, limb.end.position.x - limb.elbow.x) +
      Math.PI / 2;
  });
}

/** The crook's bearing point in the cane hand's end-group space for a given twirl and grip slide. */
export function gingerbreadHookInHand(twirl: number, slide: number): Xy {
  const c = Math.cos(twirl),
    s = Math.sin(twirl);
  return {
    x: GRIP.x + GINGER_HOOK.x * c - GINGER_HOOK.y * s,
    y: GRIP.y - slide + GINGER_HOOK.x * s + GINGER_HOOK.y * c,
  };
}
