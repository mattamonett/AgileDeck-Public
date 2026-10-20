import * as THREE from 'three';
import { PUMPKIN_RIBS, pumpkinPlan, type PumpkinPlan } from './pumpkin-choreography';
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

const RIND = [0xe8761e, 0xd2611a] as const,
  FLESH = 0x8e1a1a,
  CARVE = 0xffc548;

export const PUMPKIN_CENTER = new THREE.Vector3(0, 21, 0);
/** Back hinge of both jaws, in shell space. */
export const PUMPKIN_HINGE = new THREE.Vector3(-13.5, 0, 0);
/** The carved face turns three quarters toward the viewer while still facing the card. */
export const FACE_ANGLE = 0.72;
const RADIUS = 14.5;

export interface Rib {
  readonly mesh: THREE.Mesh;
  readonly upper: boolean;
  readonly angle: number;
  readonly home: THREE.Vector3;
}
export interface PumpkinModel {
  readonly plan: PumpkinPlan;
  readonly shell: THREE.Group;
  readonly upper: THREE.Group;
  readonly lower: THREE.Group;
  readonly ribs: readonly Rib[];
  readonly maw: THREE.Group;
  readonly strands: readonly THREE.Mesh[];
  readonly glows: readonly THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
  readonly candle: THREE.Group;
  readonly flame: THREE.Mesh;
  readonly bulge: THREE.Mesh;
  readonly chunk: THREE.Mesh;
  readonly bite: THREE.Object3D;
  readonly arms: readonly [Limb, Limb];
  readonly legs: readonly [Limb, Limb];
  readonly cracks: readonly THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
  /** Carved face panel, jaw teeth and stem: pieces that blow out together when it bursts. */
  readonly pieces: readonly THREE.Group[];
}
const models = new WeakMap<THREE.Group, PumpkinModel>();

function faceFrame(angle: number, y: number, out: THREE.Vector3) {
  return out.set(Math.cos(angle) * RADIUS, y, Math.sin(angle) * RADIUS);
}
/** Places a flat carved feature on the shell surface facing outward at `angle`. */
function carve(
  parent: THREE.Object3D,
  name: string,
  points: readonly (readonly [number, number])[],
  angle: number,
  y: number,
  along: number,
  color: number,
  inset = 0,
) {
  const mesh = part(parent, name, new THREE.ShapeGeometry(outline(points)), glow(color));
  const at = faceFrame(angle, y, new THREE.Vector3());
  mesh.position.set(
    at.x - Math.sin(angle) * along + Math.cos(angle) * inset,
    at.y,
    at.z + Math.cos(angle) * along + Math.sin(angle) * inset,
  );
  mesh.position.sub(PUMPKIN_HINGE);
  mesh.rotation.y = Math.PI / 2 - angle;
  return mesh;
}

export function makePumpkin(id: string): THREE.Group {
  const plan = pumpkinPlan(id);
  const root = new THREE.Group();
  root.name = 'halloween-pumpkin';
  const shell = new THREE.Group();
  shell.name = 'pumpkin-shell';
  shell.position.copy(PUMPKIN_CENTER);
  root.add(shell);
  const upper = new THREE.Group(),
    lower = new THREE.Group();
  upper.name = 'pumpkin-upper';
  lower.name = 'pumpkin-lower';
  for (const g of [upper, lower]) {
    g.position.copy(PUMPKIN_HINGE);
    shell.add(g);
  }
  const ribs: Rib[] = [];
  for (let i = 0; i < PUMPKIN_RIBS; i++) {
    const a = (i / PUMPKIN_RIBS) * Math.PI * 2;
    for (const top of [true, false]) {
      const g = new THREE.SphereGeometry(
        1,
        14,
        7,
        0,
        Math.PI * 2,
        top ? 0 : Math.PI / 2,
        Math.PI / 2,
      );
      const mesh = part(
        top ? upper : lower,
        `pumpkin-rib-${top ? 'u' : 'l'}${i}`,
        g,
        glossy(RIND[i % 2] ?? 0xe8761e, 0.55),
      );
      const home = new THREE.Vector3(Math.cos(a) * 8.6, 0, Math.sin(a) * 8.6).sub(PUMPKIN_HINGE);
      mesh.position.copy(home);
      mesh.rotation.y = -a;
      mesh.scale.set(6.8, top ? 12.2 : 11, 5.4);
      ribs.push({ mesh, upper: top, angle: a, home });
    }
  }
  // Inside: bloody flesh, stringy pulp and seeds, lit by a candle.
  const maw = new THREE.Group();
  maw.name = 'pumpkin-maw';
  shell.add(maw);
  oval(maw, 'pumpkin-flesh', matte(FLESH, 0.4), 1, -0.5, 0, 12.5, 6, 12.5);
  oval(maw, 'pumpkin-throat', matte(0x3a0607, 0.5), 3, 0, 1.5, 6, 3.5, 6);
  for (let i = 0; i < 6; i++)
    oval(
      maw,
      'pumpkin-seed',
      matte(0xf1e2b8, 0.5),
      6 + (i % 3) * 2,
      -2 + (i % 2),
      -4 + i * 1.6,
      0.9,
      0.45,
      0.6,
    );
  const strands = [0, 1, 2, 3].map((i) => {
    const s = part(
      maw,
      `pumpkin-strand-${i}`,
      new THREE.CylinderGeometry(0.35, 0.5, 1, 6),
      matte(i % 2 ? 0xc73a1c : 0xe8a33a, 0.5),
    );
    s.position.set(9 + i * 1.1, 0, -3 + i * 2.2);
    return s;
  });
  const candle = new THREE.Group();
  candle.name = 'pumpkin-candle';
  candle.position.set(-1, -3, 0);
  shell.add(candle);
  part(
    candle,
    'pumpkin-wax',
    new THREE.CylinderGeometry(1.4, 1.5, 4, 10),
    matte(0xf3ead2, 0.6),
    0,
    -1,
    0,
  );
  const flame = part(
    candle,
    'pumpkin-flame',
    new THREE.SphereGeometry(1, 10, 8),
    glow(0xffd25a),
    0,
    2.2,
    0,
  );
  flame.scale.set(0.9, 1.8, 0.9);
  const glows: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  const piece = (parent: THREE.Group, name: string) => {
    const g = new THREE.Group();
    g.name = name;
    parent.add(g);
    return g;
  };
  const face = piece(upper, 'pumpkin-face'),
    jaw = piece(lower, 'pumpkin-jaw-teeth'),
    crown = piece(upper, 'pumpkin-crown');
  // Carved, candle-lit eyes and nose with dark rims, and the grin along the jaw line.
  for (const along of [-4.4, 4.4]) {
    const eye: [number, number][] = [
      [-2.6, -1.6],
      [2.6, -1.6],
      [along > 0 ? -2.2 : 2.2, 2.6],
    ];
    carve(
      face,
      'pumpkin-eye-rim',
      eye.map(([x, y]) => [x * 1.25, y * 1.25] as const),
      FACE_ANGLE,
      6.2,
      along,
      0x3a1206,
      0.15,
    );
    glows.push(carve(face, 'pumpkin-eye', eye, FACE_ANGLE, 6.2, along, CARVE, 0.35));
    const brow = carve(
      face,
      'pumpkin-brow',
      [
        [-3, 0],
        [3, 0],
        [3, 0.9],
        [-3, 1.6],
      ],
      FACE_ANGLE,
      9.6,
      along,
      0x5a1d08,
      0.3,
    );
    brow.rotation.z = along > 0 ? 0.35 : -0.35;
  }
  glows.push(
    carve(
      face,
      'pumpkin-nose',
      [
        [-1.2, 0],
        [1.2, 0],
        [0, 1.8],
      ],
      FACE_ANGLE,
      2.6,
      0,
      CARVE,
      0.4,
    ),
  );
  for (let k = 0; k < 5; k++) {
    const along = (k - 2) * 2.6;
    carve(
      face,
      `pumpkin-tooth-u${k}`,
      [
        [-1.2, 0.2],
        [1.2, 0.2],
        [0, -2.6 - (k % 2)],
      ],
      FACE_ANGLE,
      0.2,
      along,
      0xffe2a0,
      0.5,
    );
    if (k < 4)
      carve(
        jaw,
        `pumpkin-tooth-l${k}`,
        [
          [-1.1, -0.2],
          [1.1, -0.2],
          [0, 2.4 + (k % 2) * 0.6],
        ],
        FACE_ANGLE,
        -0.2,
        along + 1.3,
        0xffe2a0,
        0.5,
      );
  }
  glows.push(
    carve(
      jaw,
      'pumpkin-grin-glow',
      [
        [-7, 0.2],
        [7, 0.2],
        [6, -1.4],
        [-6, -1.4],
      ],
      FACE_ANGLE,
      0.1,
      0,
      CARVE,
      0.1,
    ),
  );
  // Glowing cracks open across the rind as it swells before bursting.
  const crackPath: readonly (readonly [number, number])[] = [
    [0, 0],
    [1.2, -1.8],
    [0.4, -3.4],
    [1.8, -5],
    [1.1, -6.8],
  ];
  const crackShape = [
    ...crackPath.map(([x, y]) => [x - 0.35, y] as const),
    ...crackPath
      .slice()
      .reverse()
      .map(([x, y]) => [x + 0.35, y] as const),
  ];
  const cracks = [0, 1, 2].map((i) => {
    const crack = carve(
      upper,
      `pumpkin-crack-${i}`,
      crackShape,
      FACE_ANGLE + 0.9 + i * 0.9,
      9 - i * 1.5,
      0,
      0xffb22a,
      0.25,
    );
    crack.visible = false;
    return crack;
  });
  // Stem, leaf and a curling tendril on the lid.
  const stemCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 11, 0),
    new THREE.Vector3(1, 15, 0),
    new THREE.Vector3(-1.5, 17.5, 0.5),
  );
  const stem = part(
    crown,
    'pumpkin-stem',
    new THREE.TubeGeometry(stemCurve, 8, 1.6, 7, false),
    matte(0x5b6e2c, 0.8),
  );
  stem.position.sub(PUMPKIN_HINGE);
  const leaf = flat(
    crown,
    'pumpkin-leaf',
    matte(0x4f7d2a, 0.7),
    [
      [0, 0],
      [4, 2.4],
      [7, 1],
      [5.2, -1.2],
      [2.4, -1.4],
    ],
    0,
  );
  leaf.position.set(1.5 - PUMPKIN_HINGE.x, 12.5, 2);
  leaf.rotation.set(0.4, -0.5, 0.25);
  const bulge = oval(shell, 'pumpkin-bulge', glossy(0xf0852a, 0.5), 0, 6, 9.5, 4.2, 4.2, 3.4);
  bulge.visible = false;
  const chunk = oval(shell, 'pumpkin-chunk', glossy(0x9b1222, 0.25), 12, 0, 5, 2.6, 1.8, 2.2);
  chunk.visible = false;
  const bite = new THREE.Object3D();
  bite.name = 'pumpkin-bite';
  faceFrame(FACE_ANGLE, 0, bite.position).add(
    new THREE.Vector3(Math.cos(FACE_ANGLE) * 0.8, 0, Math.sin(FACE_ANGLE) * 0.8),
  );
  shell.add(bite);
  const arm = (name: string, z: number) => {
    const limb = makeLimb(
      shell,
      name,
      0.5,
      -1,
      z,
      9.5,
      9,
      1,
      matte(0x4c7a2a, 0.75),
      matte(0x3c6122, 0.75),
    );
    for (let k = 0; k < 3; k++) {
      const leafHand = flat(
        limb.end,
        `${name}-leaf-${k}`,
        matte(0x5d8e33, 0.7),
        [
          [0, 0],
          [-1.2, -2.6],
          [0, -4.4],
          [1.2, -2.6],
        ],
        0,
      );
      leafHand.rotation.z = (k - 1) * 0.55;
    }
    return limb;
  };
  const arms: [Limb, Limb] = [arm('pumpkin-arm-front', 12.6), arm('pumpkin-arm-back', -12.6)];
  const leg = (name: string, z: number) => {
    const limb = makeLimb(
      root,
      name,
      0.5,
      10.5,
      z,
      6.2,
      5.8,
      1.6,
      matte(0x6b4b26, 0.85),
      matte(0x5a3d1e, 0.85),
    );
    oval(limb.end, `${name}-root-foot`, matte(0x5a3d1e, 0.9), 1.5, -1.2, 0, 3.4, 1.2, 2.4);
    for (let k = 0; k < 3; k++) {
      const toe = part(
        limb.end,
        `${name}-rootlet`,
        new THREE.ConeGeometry(0.5, 2.6, 5),
        matte(0x4a3218, 0.9),
        3.4 + k * 0.4,
        -1.6,
        (k - 1) * 1.1,
      );
      toe.rotation.z = -Math.PI / 2 - 0.3;
    }
    return limb;
  };
  const legs: [Limb, Limb] = [leg('pumpkin-leg-front', 5), leg('pumpkin-leg-back', -5)];
  models.set(root, {
    plan,
    shell,
    upper,
    lower,
    ribs,
    maw,
    strands,
    glows,
    candle,
    flame,
    bulge,
    chunk,
    bite,
    arms,
    legs,
    cracks,
    pieces: [face, jaw, crown],
  });
  return root;
}

export function pumpkinModel(root: THREE.Group): PumpkinModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native pumpkin');
  return model;
}

export interface PumpkinPose {
  readonly walked: number;
  readonly planted: number;
  readonly squash: number;
  readonly lift: number;
  readonly roll: number;
  readonly jaw: number;
  readonly swell: number;
  readonly lean: number;
  readonly flicker: number;
  readonly front: { readonly x: number; readonly y: number } | null;
  readonly back: { readonly x: number; readonly y: number } | null;
  readonly bulge: number;
  readonly chunk: boolean;
  readonly cracks: number;
}

export function pumpkinPose(root: THREE.Group, q: PumpkinPose) {
  const m = pumpkinModel(root);
  // The shell squashes on landings and swells before bursting; legs keep their feet on the floor.
  const sy = (1 - 0.16 * q.squash) * (1 + 0.16 * q.swell),
    sxz = (1 + 0.1 * q.squash) * (1 + 0.16 * q.swell);
  m.shell.scale.set(sxz, sy, sxz);
  m.shell.position.set(0, PUMPKIN_CENTER.y - 3.5 * q.squash + q.lift + 2 * q.swell, 0);
  m.shell.rotation.set(0, 0, q.roll - q.lean);
  m.upper.rotation.z = 0.75 * q.jaw;
  m.lower.rotation.z = -0.22 * q.jaw;
  m.maw.scale.y = 0.4 + 1.4 * q.jaw;
  m.strands.forEach((s, i) => {
    s.scale.y = Math.max(0.01, 3 + q.jaw * 12 * (0.7 + 0.1 * i));
    s.visible = q.jaw > 0.08;
  });
  const light = 0.75 + 0.25 * Math.sin(q.flicker * 13) * Math.sin(q.flicker * 7.3);
  m.glows.forEach((g) => (g.material.opacity = Math.max(0.35, light)));
  m.flame.scale.set(0.9, 1.6 + 0.4 * Math.sin(q.flicker * 17), 0.9);
  m.bulge.visible = q.bulge > 0 && q.bulge < 1;
  m.bulge.position.set(1, 7 - 15 * q.bulge, 9.6);
  m.bulge.scale.setScalar(4.2 * Math.sin(Math.PI * q.bulge) + 0.01);
  m.chunk.visible = q.chunk;
  m.cracks.forEach((c, i) => {
    c.visible = q.cracks > i / 3;
    c.material.opacity = Math.min(1, (q.cracks - i / 3) * 3) * light;
  });
  const hip = 10.5 - 3.5 * q.squash + q.lift;
  m.legs.forEach((leg, i) => {
    const g = gait(q.walked, 9, i * 0.5, 2);
    leg.root.position.y = hip;
    const swing = (1 - q.planted) * g.y;
    reach(
      leg,
      g.x * (1 - q.planted) + (i ? -1.5 : 1.5),
      -(hip - 2.4) + swing + Math.max(0, q.lift) * 0.6,
      1,
      0,
    );
  });
  if (q.front) reach(m.arms[0], q.front.x, q.front.y, -1);
  if (q.back) reach(m.arms[1], q.back.x, q.back.y, -1);
}
