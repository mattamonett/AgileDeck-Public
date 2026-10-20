import * as THREE from 'three';
import { dollPlan, type DollPlan } from './doll-choreography';
import {
  flat,
  gait,
  glossy,
  glow,
  localTarget,
  makeLimb,
  matte,
  mix,
  oval,
  part,
  reach,
  reachIn,
  stripGeometry,
  type Limb,
} from '../../kit';

const PORCELAIN = 0xf3e7dc,
  DRESS = 0x7f1d31,
  LACE = 0xf6f0e6,
  HAIR = 0x4a2916,
  BLOOD = 0x8a0c1f;

export const DOLL_HIP = 18;
const SHOULDER = new THREE.Vector2(0.5, 20);

export interface DollModel {
  readonly plan: DollPlan;
  readonly body: THREE.Group;
  readonly head: THREE.Group;
  readonly lids: readonly THREE.Group[];
  readonly glows: readonly THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[];
  readonly cracks: readonly THREE.Mesh[];
  readonly tears: readonly THREE.Mesh[];
  readonly arms: readonly [Limb, Limb];
  readonly legs: readonly [Limb, Limb];
}
const models = new WeakMap<THREE.Group, DollModel>();

/** A fixed jagged path whose visible length is revealed with the draw range. */
function revealStrip(
  points: readonly (readonly [number, number])[],
  width: number,
): THREE.BufferGeometry {
  const segments = points.length - 1;
  const g = stripGeometry(segments);
  const p = g.getAttribute('position');
  points.forEach(([x, y], i) => {
    const [nx, ny] = points[Math.min(segments, i + 1)] ?? [x, y];
    const [px, py] = points[Math.max(0, i - 1)] ?? [x, y];
    const dx = nx - px,
      dy = ny - py,
      l = Math.hypot(dx, dy) || 1;
    const w = (width * (1 - (i / segments) * 0.7)) / 2;
    p.setXYZ(i * 2, x - (dy / l) * w, y + (dx / l) * w, 0);
    p.setXYZ(i * 2 + 1, x + (dy / l) * w, y - (dx / l) * w, 0);
  });
  g.computeBoundingSphere();
  g.setDrawRange(0, 0);
  return g;
}
export function revealFraction(mesh: THREE.Mesh, fraction: number) {
  const index = mesh.geometry.getIndex();
  const total = index ? index.count : 0;
  mesh.geometry.setDrawRange(0, Math.floor((total / 6) * Math.max(0, Math.min(1, fraction))) * 6);
  mesh.visible = fraction > 0.001;
}

function ringlet(
  parent: THREE.Object3D,
  name: string,
  x: number,
  y: number,
  z: number,
  length: number,
) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24,
      a = t * Math.PI * 7;
    points.push(new THREE.Vector3(x + Math.cos(a) * 1.1, y - t * length, z + Math.sin(a) * 1.1));
  }
  part(
    parent,
    name,
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.62, 6, false),
    matte(HAIR, 0.55),
  );
}

export function makeDoll(id: string): THREE.Group {
  const plan = dollPlan(id);
  const root = new THREE.Group();
  root.name = 'halloween-doll';
  const body = new THREE.Group();
  body.name = 'doll-body';
  body.position.set(0, DOLL_HIP, 0);
  body.rotation.order = 'ZYX';
  root.add(body);
  const skirt = new THREE.LatheGeometry(
    [
      new THREE.Vector2(3.6, 13),
      new THREE.Vector2(5.4, 9),
      new THREE.Vector2(8, 3),
      new THREE.Vector2(9.6, -2.5),
      new THREE.Vector2(9.2, -3),
    ],
    20,
  );
  part(body, 'doll-skirt', skirt, matte(DRESS, 0.75));
  part(
    body,
    'doll-hem',
    new THREE.TorusGeometry(9.3, 0.7, 6, 24),
    matte(LACE, 0.9),
    0,
    -2.6,
    0,
  ).rotation.x = Math.PI / 2;
  oval(body, 'doll-apron', matte(LACE, 0.85), 4.6, 4.5, 0, 3, 7.5, 5.6);
  oval(body, 'doll-bodice', matte(DRESS, 0.7), 0.4, 17, 0, 4.4, 5.2, 4);
  part(
    body,
    'doll-collar',
    new THREE.TorusGeometry(3.4, 1, 6, 18),
    matte(LACE, 0.9),
    0.6,
    21.6,
    0,
  ).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++)
    oval(body, 'doll-button', glossy(0xe8d9b0, 0.3), 4.6, 18.5 - i * 2.2, 0, 0.5, 0.5, 0.4);
  for (const z of [-4.6, 4.6])
    oval(body, 'doll-sleeve', matte(DRESS, 0.7), 0.4, 19.6, z, 2.7, 2.6, 2.6);

  const head = new THREE.Group();
  head.name = 'doll-head';
  head.position.set(1.5, 31, 0);
  head.rotation.order = 'YZX';
  body.add(head);
  oval(head, 'doll-skull', glossy(PORCELAIN, 0.3), 0, 0, 0, 8.6, 8.8, 8.4);
  oval(head, 'doll-hair-cap', matte(HAIR, 0.55), -1.8, 1.8, 0, 8.3, 8.3, 8.8);
  flat(
    head,
    'doll-fringe',
    matte(HAIR, 0.55),
    [
      [3.5, 8.4],
      [8, 4.4],
      [7.6, 2.6],
      [6.2, 3.6],
      [5.4, 2.4],
      [4.2, 3.8],
      [3, 2.8],
    ],
    4.6,
  );
  flat(
    head,
    'doll-fringe-far',
    matte(HAIR, 0.55),
    [
      [3.5, 8.4],
      [8, 4.4],
      [7.6, 2.6],
      [6.2, 3.6],
      [5.4, 2.4],
      [4.2, 3.8],
      [3, 2.8],
    ],
    -4.6,
  );
  for (const [i, [x, z, length]] of (
    [
      [-3, 6.6, 11],
      [-5.5, 4.4, 13],
      [-7, 1.2, 14],
      [-6.6, -3, 13],
      [-3.4, -6.6, 11],
      [-5, -5, 12],
    ] as const
  ).entries())
    ringlet(head, `doll-ringlet-${i}`, x, -2, z, length);
  for (const z of [-2.2, 2.2])
    oval(head, 'doll-bow-loop', matte(DRESS, 0.6), -1, 9.4, z * 1.4, 2.6, 1.8, 2.2).rotation.x =
      z * 0.25;
  oval(head, 'doll-bow-knot', matte(0x5e1424, 0.6), -1, 9.2, 0, 1.3, 1.2, 1.2);
  const lids: THREE.Group[] = [];
  const glows: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
  for (const z of [-3, 3]) {
    oval(head, 'doll-cheek', matte(0xe8939d, 0.5), 6.2, -2.6, z * 1.55, 1.9, 1.3, 1);
    oval(head, 'doll-eye-white', glossy(0xf8f4ee, 0.15), 6.6, 1.4, z, 1.9, 2, 1.6);
    oval(head, 'doll-iris', glossy(0x3a2516, 0.12), 7.9, 1.4, z * 1.02, 0.7, 1.55, 1.4);
    oval(head, 'doll-pupil', glossy(0x070403, 0.1), 8.35, 1.4, z * 1.03, 0.4, 0.75, 0.7);
    oval(head, 'doll-glint', glow(0xffffff), 8.6, 2, z * 1.06 + 0.3, 0.2, 0.25, 0.2);
    const red = part(
      head,
      'doll-eye-glow',
      new THREE.CircleGeometry(1.25, 14),
      glow(0xff1830, 0),
      8.8,
      1.4,
      z * 1.03,
    );
    red.rotation.y = Math.PI / 2;
    glows.push(red);
    const lid = new THREE.Group();
    lid.name = 'doll-lid';
    lid.position.set(6.6, 1.4, z);
    head.add(lid);
    const shell = part(
      lid,
      'doll-lid-shell',
      new THREE.SphereGeometry(2.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      glossy(0xf0ddd0, 0.3),
    );
    shell.scale.set(1, 1, 0.85);
    for (let k = 0; k < 4; k++) {
      const lash = part(
        lid,
        'doll-lash',
        new THREE.BoxGeometry(0.15, 1.3, 0.15),
        matte(0x1c120c, 0.6),
        1.6 + k * 0.2,
        0.6,
        (k - 1.5) * 0.6,
      );
      lash.rotation.z = -0.7;
    }
    lids.push(lid);
    const brow = part(
      head,
      'doll-brow',
      new THREE.BoxGeometry(2.8, 0.35, 0.4),
      matte(0x5a3520, 0.6),
      7.2,
      4.6,
      z,
    );
    brow.rotation.z = -0.25;
  }
  oval(head, 'doll-nose', glossy(PORCELAIN, 0.3), 8.6, -0.8, 0, 0.7, 0.8, 0.8);
  for (const y of [-3.9, -4.7])
    oval(head, 'doll-lip', glossy(0xb0283c, 0.25), 8, y, 0, 0.8, 0.5, 1.5);
  oval(head, 'doll-mouth-gap', matte(0x2a0a10, 0.5), 8.4, -4.3, 0, 0.45, 0.25, 0.9);
  // Cracks spread from a chip on the brow; tears run from both eyes.
  const crackPaths: readonly (readonly (readonly [number, number])[])[] = [
    [
      [0, 0],
      [0.8, -1.4],
      [0.4, -2.9],
      [1.3, -4.1],
      [1, -5.8],
      [1.9, -7],
    ],
    [
      [0, 0],
      [-1.2, -0.9],
      [-1.6, -2.4],
      [-2.9, -3.1],
      [-3.4, -4.6],
    ],
    [
      [0, 0],
      [1.4, 0.6],
      [2.4, 0.2],
      [3.4, 1.1],
      [4.6, 0.8],
    ],
    [
      [0.4, -2.9],
      [-0.8, -3.6],
      [-1.1, -5.2],
    ],
    [
      [1.3, -4.1],
      [2.6, -4.4],
      [3.2, -5.9],
      [4.4, -6.4],
    ],
  ];
  const cracks = crackPaths.map((path, i) => {
    const mesh = part(head, `doll-crack-${i}`, revealStrip(path, 0.42), matte(0x2c1a14, 0.8));
    mesh.position.set(8.25, 6.2, 2.6);
    mesh.rotation.y = Math.PI / 2 - 0.35;
    return mesh;
  });
  const tears = [-3, 3].map((z, i) => {
    const path: [number, number][] = [];
    for (let k = 0; k <= 10; k++) path.push([Math.sin(k * 1.3 + i) * 0.35, -k * 1.15]);
    const mesh = part(head, `doll-tear-${i}`, revealStrip(path, 0.95), glossy(BLOOD, 0.15));
    mesh.position.set(8.1, 0.2, z * 1.12);
    mesh.rotation.y = Math.PI / 2;
    return mesh;
  });
  const arm = (name: string, z: number) => {
    const limb = makeLimb(
      body,
      name,
      SHOULDER.x,
      SHOULDER.y,
      z,
      7,
      6.6,
      1.25,
      glossy(PORCELAIN, 0.3),
      glossy(0xe9d9cb, 0.3),
    );
    oval(limb.end, `${name}-hand`, glossy(PORCELAIN, 0.3), 0, -1.3, 0, 1.2, 1.6, 0.8);
    for (let f = 0; f < 3; f++)
      oval(limb.end, `${name}-finger`, glossy(PORCELAIN, 0.3), (f - 1) * 0.6, -3, 0, 0.3, 0.9, 0.3);
    return limb;
  };
  const arms: [Limb, Limb] = [arm('doll-arm-front', 4.8), arm('doll-arm-back', -4.8)];
  const leg = (name: string, z: number) => {
    const limb = makeLimb(
      root,
      name,
      0,
      DOLL_HIP,
      z,
      8.6,
      8,
      1.6,
      matte(0xf6f1ea, 0.8),
      glossy(0xe9d9cb, 0.3),
    );
    oval(limb.end, `${name}-shoe`, glossy(0x0d0b0c, 0.25), 1.2, -1.2, 0, 2.6, 1.3, 1.6);
    part(
      limb.end,
      `${name}-strap`,
      new THREE.TorusGeometry(1.5, 0.22, 4, 10),
      glossy(0x0d0b0c, 0.25),
      0.4,
      -0.2,
      0,
    ).rotation.x = Math.PI / 2;
    return limb;
  };
  const legs: [Limb, Limb] = [leg('doll-leg-front', 2.6), leg('doll-leg-back', -2.6)];
  models.set(root, { plan, body, head, lids, glows, cracks, tears, arms, legs });
  return root;
}

export function dollModel(root: THREE.Group): DollModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native doll');
  return model;
}

export interface DollPose {
  readonly walked: number;
  readonly planted: number;
  /** 0 upright, 1 belly-up crab walk on hands and feet. */
  readonly crab: number;
  /** 0 standing, 1 lying flat on its back. */
  readonly fallen: number;
  readonly crawl: number;
  readonly lean: number;
  readonly sway: number;
  readonly headSpin: number;
  readonly headTilt: number;
  readonly front: { readonly x: number; readonly y: number } | null;
  readonly back: { readonly x: number; readonly y: number } | null;
  readonly lids: readonly [number, number];
  readonly glow: number;
  readonly cracks: number;
  readonly tears: number;
}

/** Ground contact for a crab-walking or crawling hand, in actor-root space. */
function groundHand(walked: number, offset: number, x: number, stride: number) {
  const g = gait(walked, stride, offset, 2.5);
  return { x: x + g.x, y: g.y };
}

export function dollPose(root: THREE.Group, q: DollPose) {
  const m = dollModel(root);
  const crab = q.crab,
    fallen = q.fallen;
  const hip = DOLL_HIP - 6 * crab - (DOLL_HIP - 4.2) * fallen;
  m.body.position.set(-1.5 * crab - 4 * fallen, hip, 0);
  // Crab: torso along the ground, chest up. Fallen: flat on its back, head away from the card.
  m.body.rotation.set(
    0,
    Math.PI * crab,
    -q.lean - (Math.PI / 2) * crab + (Math.PI / 2) * fallen + q.sway,
  );
  m.head.rotation.set(0, q.headSpin, q.headTilt + (Math.PI / 2) * crab);
  m.body.updateWorldMatrix(true, true);
  const stride = 14;
  m.legs.forEach((leg, i) => {
    leg.root.position.set(m.body.position.x, hip, leg.root.position.z);
    const g = gait(q.walked, stride, i * 0.5, 3.2);
    const lift = g.y * (1 - q.planted);
    if (fallen > 0.001) {
      // Legs fall out straight along the floor, toes up, dragged by the crawl.
      reachIn(
        leg,
        root,
        m.body.position.x + mix(g.x, 15 + i * 1.5, fallen),
        mix(2.5 + lift, 1.4, fallen),
        1,
        0,
      );
    } else reachIn(leg, root, g.x + (i ? -1.2 : 1.2) + 5 * crab, 2.5 + lift, 1, 0); // the sole sits 2.5 below the ankle
  });
  const arms = [q.front, q.back];
  m.arms.forEach((arm, i) => {
    let target = arms[i] ?? { x: 1, y: -12.5 };
    if (crab > 0.001) {
      // Hands on the floor behind the upturned head, blended as the doll rolls upright.
      const hand = groundHand(q.walked, 0.25 + i * 0.5, 17, stride);
      const floor = localTarget(arm, root, hand.x, hand.y * (1 - q.planted) + 0.8);
      target = { x: mix(target.x, floor.x, crab), y: mix(target.y, floor.y, crab) };
    }
    if (fallen > 0.001) {
      // Crawling: hands reach past the head and pull along the floor.
      const pull = Math.sin(q.crawl * Math.PI * 2 + i * Math.PI);
      const floor = localTarget(arm, root, -28 - 5 * pull, 1 + Math.max(0, pull) * 2.2);
      target = { x: mix(target.x, floor.x, fallen), y: mix(target.y, floor.y, fallen) };
    }
    reach(arm, target.x, target.y, crab > 0.5 ? 1 : -1);
  });
  m.lids.forEach((lid, i) => (lid.rotation.z = -1.7 * (q.lids[i] ?? 0) + 0.25));
  m.glows.forEach((g) => (g.material.opacity = 0.7 * q.glow));
  m.cracks.forEach((crack, i) =>
    revealFraction(crack, (q.cracks * m.cracks.length - i * 0.6) / 1.2),
  );
  m.tears.forEach((tear, i) => revealFraction(tear, q.tears * (i ? 0.85 : 1)));
}
