import * as THREE from 'three';
import { stretchBetween, flat, makeLimb, part, reach, type Limb } from '../../kit';
import type { Point } from '../../flight/flight-math';
import {
  bulletTimePlan,
  FOOT,
  FOREARM,
  HEAD_R,
  NECK,
  SHIN,
  STICK_HIP,
  THIGH,
  TORSO,
  UPPER_ARM,
  type BulletTimePlan,
} from './bullettime-choreography';

const WHITE = 0xffffff,
  INK = 0x1c2621,
  TIE = 0x111214;
/** Line radius of the white strokes and the extra width of the dark outline drawn behind them. */
const STROKE = 1.15;
const OUTLINE = 0.7;
/** Figures pivot about this height (model units), roughly their middle, for flips and tumbles. */
export const PIVOT = 28;
/** Every outline sits this far behind every white stroke, so it only shows around the silhouette. */
const INK_Z = -2.4;

/** A white limb with its dark outline twin, posed together. */
interface StrokeLimb {
  readonly white: Limb;
  readonly ink: Limb;
}
/** One stick man: a pivot group in screen space and a body group whose origin is the floor under the hip. */
export interface StickFigure {
  readonly root: THREE.Group;
  readonly body: THREE.Group;
  readonly torso: readonly [THREE.Mesh, THREE.Mesh];
  readonly head: THREE.Group;
  /** Back limb first, then front; the front pair is drawn nearer the viewer. */
  readonly arms: readonly [StrokeLimb, StrokeLimb];
  readonly legs: readonly [StrokeLimb, StrokeLimb];
  readonly tie: THREE.Group | null;
}
export interface BulletTimeModel {
  readonly plan: BulletTimePlan;
  readonly hero: StickFigure;
  readonly agent: StickFigure;
}
const models = new WeakMap<THREE.Group, BulletTimeModel>();

function solid(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
}

function strokeLimb(
  parent: THREE.Object3D,
  name: string,
  z: number,
  upper: number,
  lower: number,
): StrokeLimb {
  const white = makeLimb(parent, name, 0, 0, z, upper, lower, STROKE, solid(WHITE));
  const ink = makeLimb(
    parent,
    `${name}-outline`,
    0,
    0,
    INK_Z + z * 0.1,
    upper,
    lower,
    STROKE + OUTLINE,
    solid(INK),
  );
  // Round hand and foot caps, so the strokes end like a pen line.
  part(white.end, `${name}-cap`, new THREE.SphereGeometry(FOOT, 12, 8), solid(WHITE));
  part(ink.end, `${name}-cap-outline`, new THREE.SphereGeometry(FOOT + OUTLINE, 12, 8), solid(INK));
  return { white, ink };
}

/** A plain black necktie: knot at the collar and a blade that swings from it. */
function necktie(parent: THREE.Object3D, name: string): THREE.Group {
  const tie = new THREE.Group();
  tie.name = name;
  parent.add(tie);
  const ink = solid(TIE);
  part(tie, `${name}-knot`, new THREE.CircleGeometry(1.15, 12), ink, 0, -0.9, 0);
  flat(
    tie,
    `${name}-blade`,
    ink.clone(),
    [
      [-0.8, -1.6],
      [0.8, -1.6],
      [1.7, -8.4],
      [0, -10.4],
      [-1.7, -8.4],
    ],
    -0.05,
  );
  tie.position.z = 1.6;
  return tie;
}

function stickFigure(parent: THREE.Object3D, name: string, withTie: boolean): StickFigure {
  const root = new THREE.Group();
  root.name = name;
  parent.add(root);
  const body = new THREE.Group();
  body.name = `${name}-body`;
  body.position.y = -PIVOT;
  root.add(body);
  const torso: [THREE.Mesh, THREE.Mesh] = [
    part(
      body,
      `${name}-torso`,
      new THREE.CylinderGeometry(STROKE * 1.1, STROKE * 1.1, 1, 10),
      solid(WHITE),
    ),
    part(
      body,
      `${name}-torso-outline`,
      new THREE.CylinderGeometry(STROKE * 1.1 + OUTLINE, STROKE * 1.1 + OUTLINE, 1, 10),
      solid(INK),
    ),
  ];
  const head = new THREE.Group();
  head.name = `${name}-head`;
  body.add(head);
  part(head, `${name}-face`, new THREE.CircleGeometry(HEAD_R, 32), solid(WHITE), 0, 0, 0.3);
  part(
    head,
    `${name}-face-outline`,
    new THREE.CircleGeometry(HEAD_R + OUTLINE + 0.15, 32),
    solid(INK),
    0,
    0,
    INK_Z,
  );
  const arms: [StrokeLimb, StrokeLimb] = [
    strokeLimb(body, `${name}-arm-back`, -0.7, UPPER_ARM, FOREARM),
    strokeLimb(body, `${name}-arm-front`, 0.9, UPPER_ARM, FOREARM),
  ];
  const legs: [StrokeLimb, StrokeLimb] = [
    strokeLimb(body, `${name}-leg-back`, -0.6, THIGH, SHIN),
    strokeLimb(body, `${name}-leg-front`, 0.6, THIGH, SHIN),
  ];
  const tie = withTie ? necktie(body, `${name}-tie`) : null;
  return { root, body, torso, head, arms, legs, tie };
}

/** Two white stick men side by side in one group: the hero, and the agent in his necktie. */
export function makeBulletTime(id: string): THREE.Group {
  const plan = bulletTimePlan(id);
  const root = new THREE.Group();
  root.name = 'bullettime';
  const hero = stickFigure(root, 'bullettime-hero', false);
  const agent = stickFigure(root, 'bullettime-agent', true);
  models.set(root, { plan, hero, agent });
  stickPose(hero, GUARD);
  stickPose(agent, GUARD);
  return root;
}

export function bulletTimeModel(root: THREE.Group): BulletTimeModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native Bullet Time');
  return model;
}

/**
 * A stick man's pose in body space: x forward, y up, the floor at y = 0. Hands and feet are targets
 * for the ends of the limbs; the elbows and knees solve themselves with fixed segment lengths.
 */
export interface StickPose {
  readonly hip: Point;
  /** Torso angle from upright, forward positive, in radians. */
  readonly lean: number;
  /** Extra head tilt along the neck. */
  readonly nod: number;
  /** Back hand, then front hand. */
  readonly hands: readonly [Point, Point];
  readonly feet: readonly [Point, Point];
  /** Elbow bend directions (negative bends the elbow down and back) and knee directions. */
  readonly elbows: readonly [number, number];
  readonly knees: readonly [number, number];
  /** Necktie swing in radians. */
  readonly tie: number;
}
export const GUARD: StickPose = {
  hip: { x: 0, y: STICK_HIP - 0.5 },
  lean: 0.06,
  nod: 0,
  hands: [
    { x: 7, y: 40 },
    { x: 11, y: 44 },
  ],
  feet: [
    { x: -4.5, y: FOOT },
    { x: 5, y: FOOT },
  ],
  elbows: [-1, -1],
  knees: [1, 1],
  tie: 0,
};

export function shoulderOf(q: StickPose): Point {
  return { x: q.hip.x + TORSO * Math.sin(q.lean), y: q.hip.y + TORSO * Math.cos(q.lean) };
}
export function headOf(q: StickPose): Point {
  const s = shoulderOf(q),
    a = q.lean + q.nod;
  return { x: s.x + (NECK + HEAD_R) * Math.sin(a), y: s.y + (NECK + HEAD_R) * Math.cos(a) };
}

function poseLimb(limb: StrokeLimb, root: Point, target: Point, bend: number) {
  for (const l of [limb.white, limb.ink]) {
    l.root.position.x = root.x;
    l.root.position.y = root.y;
    reach(l, target.x - root.x, target.y - root.y, bend);
  }
}

export function stickPose(f: StickFigure, q: StickPose) {
  const s = shoulderOf(q),
    h = headOf(q);
  for (const mesh of f.torso)
    stretchBetween(mesh, q.hip.x, q.hip.y, s.x, s.y, mesh === f.torso[0] ? 0 : INK_Z);
  f.head.position.set(h.x, h.y, 0);
  f.arms.forEach((arm, i) => poseLimb(arm, s, q.hands[i] ?? s, q.elbows[i] ?? -1));
  f.legs.forEach((leg, i) => poseLimb(leg, q.hip, q.feet[i] ?? q.hip, q.knees[i] ?? 1));
  if (f.tie) {
    // The knot sits just below the collar and the blade hangs down the chest, swinging with the body.
    f.tie.position.set(
      s.x - 0.6 * Math.sin(q.lean),
      s.y - 0.6 * Math.cos(q.lean),
      f.tie.position.z,
    );
    f.tie.rotation.z = -q.lean + q.tie;
  }
}
