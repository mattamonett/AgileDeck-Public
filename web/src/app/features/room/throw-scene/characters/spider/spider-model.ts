import * as THREE from 'three';
import { spiderPlan, type SpiderPlan } from './spider-choreography';
import { gait, glossy, glow, makeLimb, matte, oval, part, reach, type Limb } from '../../kit';

const CHITIN = 0x2a1b2b,
  BELLY = 0x1c1220,
  JOINT = 0x4a2d40;

/** Leg layout seen from above: angle from the heading and resting reach, per leg pair. */
const LEGS = [
  { angle: 0.72, reach: 25 },
  { angle: 1.3, reach: 23 },
  { angle: 1.95, reach: 23 },
  { angle: 2.5, reach: 26 },
] as const;
export const SPIDER_LEG_ORDER = [0, 1, 0, 1, 1, 0, 1, 0] as const;

export interface SpiderLeg {
  readonly limb: Limb;
  readonly side: number;
  readonly pair: number;
}
export interface SpiderModel {
  readonly plan: SpiderPlan;
  readonly body: THREE.Group;
  readonly abdomen: THREE.Mesh;
  readonly legs: readonly SpiderLeg[];
  readonly fangs: readonly THREE.Mesh[];
  readonly fangTip: THREE.Object3D;
  readonly spinneret: THREE.Object3D;
  readonly palps: readonly Limb[];
}
const models = new WeakMap<THREE.Group, SpiderModel>();

function bristles(
  parent: THREE.Object3D,
  name: string,
  cx: number,
  rx: number,
  ry: number,
  count: number,
) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const hair = part(
      parent,
      `${name}-${i}`,
      new THREE.ConeGeometry(0.35, 2.2, 4),
      matte(0x3d2a3a, 0.9),
      cx + Math.cos(a) * rx,
      Math.sin(a) * ry,
      1.2,
    );
    hair.rotation.z = a - Math.PI / 2;
  }
}

export function makeSpider(id: string): THREE.Group {
  const plan = spiderPlan(id);
  const root = new THREE.Group();
  root.name = 'halloween-spider';
  root.rotation.order = 'ZYX';
  const body = new THREE.Group();
  body.name = 'spider-body';
  root.add(body);
  oval(body, 'spider-cephalothorax', glossy(CHITIN, 0.45), 4, 0, 0.5, 6.2, 5.2, 3.6);
  oval(body, 'spider-carapace-groove', matte(0x3e2638, 0.6), 4.5, 0, 3.6, 3.2, 0.5, 0.4);
  const abdomen = oval(body, 'spider-abdomen', glossy(BELLY, 0.5), -8.5, 0, 1, 9.4, 7.6, 6);
  // Pale skull-like markings and a red chevron make the abdomen read at card size.
  oval(body, 'spider-mark-skull', matte(0xb8a89a, 0.7), -6.5, 0, 6.6, 2.4, 2.8, 0.4);
  for (const y of [-1, 1])
    oval(body, 'spider-mark-eye', matte(0x1c1220, 0.7), -6, y * 1, 6.9, 0.7, 0.8, 0.3);
  for (let i = 0; i < 3; i++) {
    const chevron = part(
      body,
      `spider-chevron-${i}`,
      new THREE.TorusGeometry(2.2 - i * 0.4, 0.35, 4, 10, Math.PI * 0.8),
      glow(0xb3122a),
      -10.8 - i * 2.1,
      0,
      6.3 - i * 0.3,
    );
    chevron.rotation.z = Math.PI / 2 + Math.PI * 0.1;
  }
  bristles(body, 'spider-hair', -8.5, 8.8, 7, 14);
  bristles(body, 'spider-head-hair', 4, 5.8, 4.8, 8);
  const eyes: [number, number, number][] = [
    [9.4, 1.1, 1.1],
    [9.4, -1.1, 1.1],
    [8.6, 2.5, 0.6],
    [8.6, -2.5, 0.6],
    [7.7, 1.6, 0.5],
    [7.7, -1.6, 0.5],
    [7.2, 2.9, 0.45],
    [7.2, -2.9, 0.45],
  ];
  for (const [x, y, r] of eyes) {
    oval(body, 'spider-eye', glossy(0x5a0710, 0.1), x, y, 3, r, r, r * 0.8);
    oval(
      body,
      'spider-eye-glint',
      glow(0xff6f6f),
      x + r * 0.3,
      y + r * 0.3,
      3 + r * 0.7,
      r * 0.3,
      r * 0.3,
      0.2,
    );
  }
  const fangs: THREE.Mesh[] = [];
  for (const y of [-1, 1]) {
    oval(body, 'spider-chelicera', glossy(0x3a2132, 0.4), 10.6, y * 1.7, 0.4, 2.2, 1.6, 1.6);
    const fang = part(
      body,
      `spider-fang-${y > 0 ? 1 : 0}`,
      new THREE.ConeGeometry(0.55, 3.4, 6),
      glossy(0x0e090c, 0.2),
      12.6,
      y * 1.4,
      0,
    );
    fang.rotation.z = -Math.PI / 2 - y * 0.45;
    fangs.push(fang);
  }
  const fangTip = new THREE.Object3D();
  fangTip.name = 'spider-fang-tip';
  fangTip.position.set(14.1, 0, 0);
  body.add(fangTip);
  const spinneret = new THREE.Object3D();
  spinneret.name = 'spider-spinneret';
  spinneret.position.set(-17.6, 0, 0.5);
  body.add(spinneret);
  oval(body, 'spider-spinneret-nub', matte(0x4a3040, 0.7), -17.2, 0, 0.6, 1, 0.8, 0.8);
  const legs: SpiderLeg[] = [];
  for (const side of [1, -1])
    LEGS.forEach((leg, pair) => {
      const a = leg.angle * side;
      const limb = makeLimb(
        body,
        `spider-leg-${side > 0 ? 'l' : 'r'}${pair}`,
        4 + Math.cos(a) * 3.6,
        Math.sin(a) * 3.6,
        0.6 - pair * 0.1,
        13,
        13.5,
        1.05,
        glossy(CHITIN, 0.5),
        glossy(JOINT, 0.4),
      );
      const tarsus = part(
        limb.end,
        `spider-tarsus-${side}-${pair}`,
        new THREE.ConeGeometry(0.62, 5.4, 6),
        glossy(CHITIN, 0.5),
        0,
        -2.7,
        0,
      );
      tarsus.rotation.z = Math.PI;
      for (let k = 0; k < 3; k++)
        oval(
          limb.end,
          `spider-leg-hair`,
          matte(0x3d2a3a, 0.9),
          (k - 1) * 0.6,
          -1 - k * 1.2,
          0.5,
          0.2,
          0.7,
          0.2,
        );
      legs.push({ limb, side, pair });
    });
  const palps = [1, -1].map((y) => {
    const limb = makeLimb(
      body,
      `spider-palp-${y}`,
      9.4,
      y * 2.6,
      0.5,
      3.6,
      3.4,
      0.7,
      glossy(CHITIN, 0.5),
    );
    reach(limb, 5, y * 3.2, y > 0 ? 1 : -1);
    return limb;
  });
  models.set(root, { plan, body, abdomen, legs, fangs, fangTip, spinneret, palps });
  return root;
}

export function spiderModel(root: THREE.Group): SpiderModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native spider');
  return model;
}

export interface SpiderPose {
  readonly walked: number;
  readonly planted: number;
  /** 0 walking with legs spread, 1 hanging with legs drawn in. */
  readonly fold: number;
  readonly pitch: number;
  /** Front leg pair raised in a threat display. */
  readonly rear: number;
  readonly fangs: number;
  readonly pump: number;
  readonly twitch: number;
}

/** Feet follow a tetrapod gait so each planted foot stays put while the body moves over it. */
export function spiderPose(root: THREE.Group, q: SpiderPose) {
  const m = spiderModel(root);
  const stride = 16;
  m.legs.forEach(({ limb, side, pair }, i) => {
    const rest = LEGS[pair] ?? LEGS[0];
    const g = gait(q.walked, stride, (SPIDER_LEG_ORDER[i] ?? 0) * 0.5, 1);
    const swing = g.swing * (1 - q.planted);
    const radius = rest.reach * (1 - 0.12 * swing) * (1 - 0.42 * q.fold);
    let a = rest.angle * side;
    // Hanging: legs gather forward and back around the body. Rearing: front legs lift and splay.
    a = a * (1 - 0.25 * q.fold);
    if (pair < 2) a += side * (pair ? 0.15 : 0.35) * q.rear;
    const reachOut = radius * (pair < 2 ? 1 - 0.18 * q.rear : 1);
    const twitch = Math.sin(q.twitch * 9 + i * 1.7) * 0.06 * Math.min(1, q.twitch);
    const fx = Math.cos(a + twitch) * reachOut + g.x * (1 - q.planted) * (pair === 0 ? 0.6 : 1),
      fy = Math.sin(a + twitch) * reachOut;
    const rx = limb.root.position.x,
      ry = limb.root.position.y;
    reach(limb, fx + 4 - rx, fy - ry, side > 0 ? -1 : 1);
    limb.root.rotation.x = side * (0.55 * q.rear * (pair < 2 ? 1 : 0));
  });
  m.body.rotation.y = 0;
  root.rotation.y = -q.pitch;
  m.abdomen.scale.set(
    9.4 * (1 + 0.06 * q.pump),
    7.6 * (1 + 0.08 * q.pump),
    6 * (1 + 0.08 * q.pump),
  );
  m.fangs.forEach((fang, i) => {
    const y = i ? 1 : -1;
    fang.rotation.z = -Math.PI / 2 - y * (0.45 + 0.5 * q.fangs);
  });
}
