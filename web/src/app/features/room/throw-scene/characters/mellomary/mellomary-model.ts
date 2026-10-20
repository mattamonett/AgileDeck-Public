import * as THREE from 'three';
import { melloPlan, type MelloPlan } from './mellomary-choreography';
import { glossy, glow, makeLimb, matte, oval, part, reach, type Limb } from '../../kit';

const SKIN = 0xf0c4a2,
  HAIR = 0xa8763f,
  HAIR_DARK = 0x86592c,
  PURPLE = 0x6a2fb3,
  ORANGE = 0xf2782b,
  RUFF = 0xfbf8f2,
  SHOE = 0x17151a,
  SILVER = 0xdfe3ea,
  SILVER_DARK = 0x9aa1ad,
  PEARL = 0xf6efe4,
  LIPS = 0xc9455a,
  BLUSH = 0xf28c96;

/** Standing hip height, ankle height above the sole and the shoulder in body space, in model units. */
export const MELLO_HIP = 29;
export const MELLO_ANKLE = 1.9;
export const MELLO_SHOULDER = new THREE.Vector3(0.6, 15.2, 5.6);
/** Forward distance from the ankle to the toe tip, used when she rises onto her toes. */
export const MELLO_TOE = 4.1;
const THIGH = 14.2,
  SHIN = 13.2,
  UPPER_ARM = 10.2,
  FOREARM = 9.8;

export interface MelloHand {
  /** The index finger: curled into the fist, or raised to point or to hush. */
  readonly finger: THREE.Group;
  readonly grip: THREE.Object3D;
}
/** A silver mellophone whose origin sits on top of the valve block. */
export interface Mellophone {
  readonly root: THREE.Group;
  /** The mouthpiece rim, the right hand's spot on the valves, the left hand's on the bell pipe and the bell mouth. */
  readonly mouthpiece: THREE.Object3D;
  readonly valves: THREE.Object3D;
  readonly pipe: THREE.Object3D;
  readonly bell: THREE.Object3D;
}
export interface MelloModel {
  readonly plan: MelloPlan;
  readonly body: THREE.Group;
  readonly head: THREE.Group;
  /** Where the mouthpiece rests against her lips, in head space. */
  readonly lips: THREE.Object3D;
  readonly eyes: readonly THREE.Mesh[];
  readonly brows: readonly THREE.Mesh[];
  readonly mouth: THREE.Mesh;
  readonly cheeks: readonly THREE.Mesh[];
  readonly ruff: THREE.Mesh;
  readonly arms: readonly [Limb, Limb];
  readonly hands: readonly [MelloHand, MelloHand];
  readonly legs: readonly [Limb, Limb];
  readonly horn: Mellophone;
}
const models = new WeakMap<THREE.Group, MelloModel>();

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

// ---------- Costume fabrics ----------

type Fabric = 'diamonds' | 'sequins';

/** Orange and red harlequin panes divided by white lines: orange diamonds on the grid, red between them. */
function paintDiamonds(
  ctx: CanvasRenderingContext2D,
  x0: number,
  width: number,
  height: number,
  cols: number,
  rows: number,
) {
  const w = width / cols,
    h = height / rows;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, width, height);
  ctx.clip();
  ctx.fillStyle = '#d8283c';
  ctx.fillRect(x0, 0, width, height);
  for (let row = -1; row <= rows; row++)
    for (let col = -1; col <= cols; col++) {
      const cx = x0 + (col + 0.5) * w,
        cy = (row + 0.5) * h;
      ctx.fillStyle = '#f2782b';
      ctx.beginPath();
      ctx.moveTo(cx, cy - h / 2);
      ctx.lineTo(cx + w / 2, cy);
      ctx.lineTo(cx, cy + h / 2);
      ctx.lineTo(cx - w / 2, cy);
      ctx.closePath();
      ctx.fill();
    }
  ctx.strokeStyle = '#fffaf2';
  ctx.lineWidth = Math.max(2, w * 0.09);
  for (let i = -rows - cols; i <= rows + cols; i++) {
    // Two families of diagonals along the diamond edges, each starting at a diamond's top corner.
    const x = x0 + (i + 0.5) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + rows * w, rows * h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - rows * w, rows * h);
    ctx.stroke();
  }
  ctx.restore();
}
/** Deep purple with a scatter of glints that read as sequins. */
function paintSequins(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  width: number,
  height: number,
) {
  ctx.fillStyle = '#6a2fb3';
  ctx.fillRect(x0, y0, width, height);
  let seed = 7;
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < (width * height) / 60; i++) {
    ctx.fillStyle = next() < 0.5 ? '#a978ec' : next() < 0.6 ? '#4d1f8a' : '#e3d2ff';
    ctx.beginPath();
    ctx.arc(x0 + next() * width, y0 + next() * height, 0.8 + next() * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * A canvas fabric, drawn once and disposed through the material's map. A split fabric puts the first
 * pattern on the body's right half (the sphere's +z half), the second on the left, and may add a
 * purple yoke across the top, as on her tunic.
 */
function fabric(
  left: Fabric,
  right: Fabric | null,
  yoke = 0,
  cols = 4,
  rows = 3,
): THREE.MeshStandardMaterial {
  const sequined = left === 'sequins' && right !== 'diamonds';
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: sequined ? 0.38 : 0.75,
    metalness: sequined ? 0.22 : 0.02,
    side: THREE.DoubleSide,
  });
  const fallback = left === 'diamonds' ? ORANGE : PURPLE;
  if (typeof document === 'undefined') {
    material.color.setHex(fallback);
    return material;
  }
  const canvas = document.createElement('canvas');
  canvas.width = right ? 256 : 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    material.color.setHex(fallback);
    return material;
  }
  const paint = (kind: Fabric, x0: number, width: number) =>
    kind === 'diamonds'
      ? paintDiamonds(ctx, x0, width, 128, cols, rows)
      : paintSequins(ctx, x0, 0, width, 128);
  if (right) {
    paint(left, 0, 128);
    paint(right, 128, 128);
  } else paint(left, 0, canvas.width);
  if (yoke > 0) paintSequins(ctx, 0, 0, canvas.width, 128 * yoke);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  material.map = texture;
  return material;
}

/** A pleated white ruff: an open flared collar whose lower rim ripples. */
function ruffGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(2.5, 7.4, 3.4, 48, 2, true);
  const at = geometry.getAttribute('position');
  for (let i = 0; i < at.count; i++) {
    const x = at.getX(i),
      y = at.getY(i),
      z = at.getZ(i);
    const a = Math.atan2(z, x);
    const low = (1.7 - y) / 3.4;
    const pleat = 1 + 0.12 * low * Math.sin(a * 14);
    at.setXYZ(i, x * pleat, y - 0.5 * low * Math.cos(a * 14), z * pleat);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function buildBody(root: THREE.Group) {
  const body = group(root, 'mellomary-body', 0, MELLO_HIP, 0);
  // Quartered like the reference costume: her right side wears diamonds above and purple below, the left the reverse.
  oval(body, 'mellomary-hips', fabric('sequins', 'diamonds'), 0, 0.6, 0, 5.4, 3.8, 6.2);
  oval(
    body,
    'mellomary-tunic',
    fabric('diamonds', 'sequins', 0.24, 3, 4),
    0.3,
    8.6,
    0,
    5.2,
    8.8,
    6.6,
  );
  const ruff = part(body, 'mellomary-ruff', ruffGeometry(), matte(RUFF, 0.85), 0.5, 17.6, 0);
  part(
    body,
    'mellomary-ruff-edge',
    new THREE.TorusGeometry(2.6, 0.35, 6, 24),
    matte(RUFF, 0.85),
    0.5,
    19.2,
    0,
  ).rotation.x = Math.PI / 2;
  oval(body, 'mellomary-neck', matte(SKIN, 0.7), 0.6, 18.8, 0, 1.9, 2.4, 1.9);
  return { body, ruff };
}

function buildHead(body: THREE.Group) {
  const head = group(body, 'mellomary-head', 1.2, 23.8, 0);
  oval(head, 'mellomary-face', matte(SKIN, 0.7), 0, 0, 0, 4.6, 5.4, 4.4);
  for (const z of [1, -1])
    oval(head, 'mellomary-ear', matte(SKIN, 0.7), -0.6, 0.2, z * 4.2, 0.9, 1.4, 0.7);
  // Hair pulled smoothly back into a bun, as in the reference photo.
  oval(head, 'mellomary-hair-crown', matte(HAIR, 0.9), -1.4, 2.6, 0, 4.6, 3.9, 4.7);
  oval(head, 'mellomary-hair-back', matte(HAIR, 0.9), -2.2, -0.6, 0, 3.3, 4.4, 4.5);
  oval(head, 'mellomary-bun', matte(HAIR_DARK, 0.9), -5.2, 1.8, 0, 2.2, 2.2, 2.2);
  part(
    head,
    'mellomary-bun-tie',
    new THREE.TorusGeometry(1.5, 0.35, 6, 16),
    glossy(PURPLE, 0.35),
    -3.9,
    1.6,
    0,
  ).rotation.y = Math.PI / 2;
  const eyes: THREE.Mesh[] = [],
    brows: THREE.Mesh[] = [],
    cheeks: THREE.Mesh[] = [];
  for (const z of [1.75, -1.75]) {
    const eye = oval(head, 'mellomary-eye', glossy(0x2a1c14, 0.25), 4.0, 1.1, z, 0.5, 0.85, 0.6);
    eyes.push(eye);
    // The glint is a child of the eye, so it blinks and widens with it.
    oval(
      eye,
      'mellomary-eye-glint',
      glow(0xffffff, 0.95),
      0.75,
      0.35,
      Math.sign(z) * -0.2,
      0.32,
      0.25,
      0.3,
    );
    const brow = part(
      head,
      'mellomary-brow',
      new THREE.BoxGeometry(0.35, 0.3, 1.5),
      matte(HAIR_DARK, 0.7),
      4.0,
      2.65,
      z,
    );
    brows.push(brow);
    cheeks.push(
      oval(head, 'mellomary-cheek', glow(BLUSH, 0.5), 3.5, -1.3, z * 1.45, 0.6, 0.8, 0.85),
    );
    // A tiny purple harlequin diamond painted under each eye.
    const paint = part(
      head,
      'mellomary-face-paint',
      new THREE.CircleGeometry(0.55, 4),
      matte(PURPLE, 0.6),
      4.05,
      -0.3,
      z * 1.3,
    );
    paint.rotation.y = Math.PI / 2 - Math.sign(z) * 0.35;
    paint.scale.set(0.7, 1.3, 1);
  }
  oval(head, 'mellomary-nose', matte(0xe0a888, 0.6), 4.6, -0.2, 0, 0.7, 0.85, 0.7);
  const mouth = oval(head, 'mellomary-mouth', matte(LIPS, 0.5), 4.05, -2.6, 0, 0.35, 0.32, 1.2);
  const lips = marker(head, 'mellomary-lips', 4.4, -2.6, 0);
  return { head, eyes, brows, cheeks, mouth, lips };
}

function buildHand(limb: Limb, name: string): MelloHand {
  oval(limb.end, `${name}-palm`, matte(SKIN, 0.7), 0, -1.2, 0, 1.25, 1.55, 0.95);
  const thumb = oval(limb.end, `${name}-thumb`, matte(SKIN, 0.7), 0.9, -0.9, 0.3, 0.45, 0.95, 0.45);
  thumb.rotation.z = -0.5;
  const finger = group(limb.end, `${name}-finger`, 0.35, -2.3, 0);
  oval(finger, `${name}-finger-digit`, matte(SKIN, 0.7), 0, -1.2, 0, 0.38, 1.4, 0.42);
  // A white ruffle at the wrist, matching the collar.
  const cuff = part(
    limb.end,
    `${name}-cuff`,
    new THREE.TorusGeometry(1.25, 0.32, 6, 14),
    matte(RUFF, 0.85),
    0,
    0.3,
    0,
  );
  cuff.rotation.x = Math.PI / 2;
  return { finger, grip: marker(limb.end, `${name}-grip`, 0, -1.4, 0) };
}

function buildLimbs(root: THREE.Group, body: THREE.Group) {
  const arm = (name: string, z: number, kind: Fabric) =>
    makeLimb(
      body,
      name,
      MELLO_SHOULDER.x,
      MELLO_SHOULDER.y,
      z,
      UPPER_ARM,
      FOREARM,
      1.5,
      fabric(kind, null, 0, 4, 3),
    );
  const leg = (name: string, z: number, kind: Fabric) => {
    const limb = makeLimb(
      root,
      name,
      0,
      MELLO_HIP,
      z,
      THIGH,
      SHIN,
      2.1,
      fabric(kind, null, 0, 4, 4),
    );
    // A black marching shoe: the sole bottoms out exactly MELLO_ANKLE below the ankle.
    oval(limb.end, `${name}-shoe`, glossy(SHOE, 0.3), 1.5, -0.95, 0, 2.7, 0.95, 1.45);
    part(
      limb.end,
      `${name}-sole`,
      new THREE.BoxGeometry(5.4, 0.6, 2.8),
      matte(0x0b0a0c, 0.8),
      1.4,
      -MELLO_ANKLE + 0.3,
      0,
    );
    oval(limb.end, `${name}-shoe-shine`, glow(0xffffff, 0.35), 2.6, -0.5, 0.6, 0.6, 0.25, 0.4);
    return limb;
  };
  // Her right arm (+z) is diamonds and her left purple; the legs swap, as on the costume.
  const arms: [Limb, Limb] = [
    arm('mellomary-arm-0', MELLO_SHOULDER.z, 'diamonds'),
    arm('mellomary-arm-1', -MELLO_SHOULDER.z, 'sequins'),
  ];
  const hands: [MelloHand, MelloHand] = [
    buildHand(arms[0], 'mellomary-hand-0'),
    buildHand(arms[1], 'mellomary-hand-1'),
  ];
  const legs: [Limb, Limb] = [
    leg('mellomary-leg-0', 2.7, 'sequins'),
    leg('mellomary-leg-1', -2.7, 'diamonds'),
  ];
  return { arms, hands, legs };
}

/** The bell's flare: a lathe whose radius grows sharply toward the mouth. */
function bellGeometry(): THREE.LatheGeometry {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= 14; i++) {
    const s = i / 14;
    points.push(new THREE.Vector2(0.42 + 3.4 * s ** 3.2, s * 7.6));
  }
  return new THREE.LatheGeometry(points, 28);
}

/** A silver mellophone laid in its own xy plane: bell forward along +x, valves up, mouthpiece back. */
export function buildMellophone(): Mellophone {
  const root = new THREE.Group();
  root.name = 'mellomary-mellophone';
  const tube = (name: string, ax: number, ay: number, bx: number, by: number, radius: number) => {
    const mesh = part(
      root,
      name,
      new THREE.CylinderGeometry(radius, radius, 1, 10),
      glossy(SILVER, 0.22),
    );
    mesh.position.set((ax + bx) / 2, (ay + by) / 2, 0);
    mesh.scale.y = Math.hypot(bx - ax, by - ay);
    mesh.rotation.z = Math.atan2(by - ay, bx - ax) - Math.PI / 2;
    return mesh;
  };
  for (const x of [-1.1, 0, 1.1]) {
    part(
      root,
      'mellomary-valve',
      new THREE.CylinderGeometry(0.5, 0.5, 3, 12),
      glossy(SILVER, 0.22),
      x,
      -1.5,
      0,
    );
    part(
      root,
      'mellomary-valve-cap',
      new THREE.CylinderGeometry(0.58, 0.58, 0.35, 12),
      glossy(SILVER_DARK, 0.3),
      x,
      0.05,
      0,
    );
    part(
      root,
      'mellomary-valve-button',
      new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12),
      glossy(PEARL, 0.35),
      x,
      0.75,
      0,
    );
    part(
      root,
      'mellomary-valve-stem',
      new THREE.CylinderGeometry(0.14, 0.14, 0.6, 6),
      glossy(SILVER_DARK, 0.3),
      x,
      0.4,
      0,
    );
  }
  // Main tubing from the valves to the bell, the coiled wrap below and the leadpipe back to the mouthpiece.
  tube('mellomary-main-tube', 1.4, -0.7, 4.2, -0.7, 0.36);
  const wrap = part(
    root,
    'mellomary-wrap',
    new THREE.TorusGeometry(2.1, 0.33, 8, 26),
    glossy(SILVER, 0.22),
    0.6,
    -3.6,
    0,
  );
  wrap.scale.set(1.35, 1, 1);
  tube('mellomary-leadpipe', -1.4, 0.2, -6.1, 1.3, 0.28);
  tube('mellomary-crook', -1.6, -2.6, -1.4, 0.2, 0.3);
  const cup = part(
    root,
    'mellomary-mouthpiece',
    new THREE.CylinderGeometry(0.55, 0.25, 1.1, 10),
    glossy(SILVER_DARK, 0.25),
    -6.6,
    1.4,
    0,
  );
  cup.rotation.z = Math.PI / 2 + 0.23;
  const bell = part(root, 'mellomary-bell', bellGeometry(), glossy(SILVER, 0.2), 4.0, -0.7, 0);
  bell.rotation.z = -Math.PI / 2;
  const rim = part(
    root,
    'mellomary-bell-rim',
    new THREE.TorusGeometry(3.8, 0.2, 8, 30),
    glossy(SILVER_DARK, 0.25),
    11.6,
    -0.7,
    0,
  );
  rim.rotation.y = Math.PI / 2;
  // A soft glint so the bell still reads as polished metal under the scene's plain lights.
  const glint = oval(
    root,
    'mellomary-bell-glint',
    glow(0xffffff, 0.55),
    10.2,
    1.6,
    1.6,
    0.5,
    1.1,
    0.3,
  );
  glint.rotation.z = -0.5;
  return {
    root,
    mouthpiece: marker(root, 'mellomary-mouthpiece-rim', -7.15, 1.55, 0),
    valves: marker(root, 'mellomary-valve-grip', 0, 1.9, 0),
    pipe: marker(root, 'mellomary-pipe-grip', 4.6, -1.5, 0),
    bell: marker(root, 'mellomary-bell-mouth', 11.7, -0.7, 0),
  };
}

export function makeMelloMary(id: string): THREE.Group {
  const plan = melloPlan(id);
  const root = new THREE.Group();
  root.name = 'mellomary';
  const { body, ruff } = buildBody(root);
  const face = buildHead(body);
  const limbs = buildLimbs(root, body);
  const horn = buildMellophone();
  body.add(horn.root);
  models.set(root, { plan, body, ruff, ...face, ...limbs, horn });
  melloPose(root, MELLO_REST);
  return root;
}

export function melloModel(root: THREE.Group): MelloModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native MelloMary');
  return model;
}

export interface SoleTarget {
  readonly x: number;
  readonly y: number;
  /** Heel-up pitch in radians; a planted foot keeps its toe tip on the target. */
  readonly toe: number;
}
/** Ankle height above the floor when the foot pitches heel-up by `toe` radians on its toe tip. */
export const tiptoeAnkle = (toe: number) => MELLO_ANKLE * Math.cos(toe) + MELLO_TOE * Math.sin(toe);
export interface MelloPose {
  readonly feet: readonly [SoleTarget, SoleTarget];
  readonly hip: number;
  readonly lean: number;
  readonly roll: number;
  readonly headTilt: number;
  readonly headRoll: number;
  readonly headTurn: number;
  readonly blink: number;
  /** Eyes and brows thrown wide for the scare. */
  readonly wide: number;
  /** 0 a closed smile, 1 a wide-open "ta-da" grin. */
  readonly grin: number;
  /** Lips pursed on the mouthpiece with puffed cheeks. */
  readonly puff: number;
  /** 0 curled, 1 the index finger raised, for each hand. */
  readonly point: readonly [number, number];
  /** Ruff swing, following the body's motion. */
  readonly swing: number;
}
export const MELLO_REST: MelloPose = {
  feet: [
    { x: 1.2, y: 0, toe: 0 },
    { x: -1, y: 0, toe: 0 },
  ],
  hip: MELLO_HIP,
  lean: 0,
  roll: 0,
  headTilt: 0,
  headRoll: 0,
  headTurn: 0,
  blink: 0,
  wide: 0,
  grin: 0,
  puff: 0,
  point: [0, 0],
  swing: 0,
};

/** Poses everything but the arms and horn, which follow world targets once the body is placed. */
export function melloPose(root: THREE.Group, q: MelloPose) {
  const m = melloModel(root);
  m.legs.forEach((leg, i) => {
    const foot = q.feet[i] ?? { x: 0, y: 0, toe: 0 };
    leg.root.position.set(0, q.hip, leg.root.position.z);
    // On tiptoe the ankle lifts and shifts so the toe tip stays exactly where the flat toe was.
    const shift = MELLO_TOE * (1 - Math.cos(foot.toe)) + MELLO_ANKLE * Math.sin(foot.toe);
    reach(leg, foot.x + shift, foot.y + tiptoeAnkle(foot.toe) - q.hip, 1, -foot.toe);
  });
  m.body.position.set(0, q.hip, 0);
  m.body.rotation.set(q.roll, 0, -q.lean);
  m.head.rotation.set(q.headRoll, q.headTurn, q.headTilt);
  for (const eye of m.eyes) {
    const open = Math.max(0.1, 1 - q.blink);
    eye.scale.set(0.5 + 0.12 * q.wide, (0.85 + 0.3 * q.wide) * open, 0.6 + 0.12 * q.wide);
  }
  m.brows.forEach((brow) => (brow.position.y = 2.65 + 0.8 * q.wide));
  // The grin opens downward; a pucker shrinks the mouth to the mouthpiece.
  m.mouth.scale.set(
    0.35 + 0.25 * q.grin - 0.1 * q.puff,
    0.32 + 1.0 * q.grin,
    1.2 + 0.5 * q.grin - 0.55 * q.puff,
  );
  m.mouth.position.y = -2.6 - 0.45 * q.grin;
  m.cheeks.forEach((cheek) =>
    cheek.scale.set(0.6 + 0.55 * q.puff, 0.8 + 0.5 * q.puff, 0.85 + 0.6 * q.puff),
  );
  m.ruff.rotation.z = 0.06 * q.swing;
  m.hands.forEach((hand, i) => {
    const v = q.point[i] ?? 0;
    hand.finger.rotation.set((1 - v) * 1.9, 0, 0);
    hand.finger.scale.setScalar(0.75 + 0.25 * v);
  });
}

/** A white-haloed eighth note (or beamed pair) drawn flat; its origin is the note head. */
export function buildNote(name: string, color: number, beamed: boolean): THREE.Group {
  const note = new THREE.Group();
  note.name = name;
  const shapes = (layer: THREE.Object3D, grow: number, material: () => THREE.MeshBasicMaterial) => {
    const heads = beamed ? [0, 4.2] : [0];
    for (const x of heads) {
      const head = part(
        layer,
        `${name}-head`,
        new THREE.CircleGeometry(1, 16),
        material(),
        x,
        0,
        0,
      );
      head.scale.set(1.3 + grow, 0.98 + grow, 1);
      head.rotation.z = 0.35;
      part(
        layer,
        `${name}-stem`,
        new THREE.PlaneGeometry(0.45 + grow * 1.4, 6.2 + grow * 1.4),
        material(),
        x + 1.1,
        3.1,
        0,
      );
    }
    if (beamed) {
      const beam = part(
        layer,
        `${name}-beam`,
        new THREE.PlaneGeometry(4.7 + grow * 1.4, 1.1 + grow * 1.4),
        material(),
        3.2,
        6.2,
        0,
      );
      beam.rotation.z = 0.05;
    } else {
      const flag = part(
        layer,
        `${name}-flag`,
        new THREE.PlaneGeometry(0.75 + grow * 1.4, 3 + grow * 1.4),
        material(),
        2.05,
        4.9,
        0,
      );
      flag.rotation.z = 0.7;
    }
  };
  const halo = new THREE.Group();
  halo.position.z = -0.2;
  note.add(halo);
  shapes(halo, 0.45, () => glow(0xffffff, 1));
  shapes(note, 0, () => glow(color, 1));
  note.visible = false;
  return note;
}
