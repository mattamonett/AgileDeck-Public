import { clamp, ease as smooth } from '../../kit';
import { requireSceneObject } from '../../engine/scene-object';
import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import { landingPoint, type TargetBounds } from '../../landing/landing-geometry';
import { ZombieEntrails } from './zombie-entrails';
import { APPROACH_DRIFT, evenPath } from '../../flight/approach-flow';

export const ZOMBIE_DURATION = 6200;
export const ZOMBIE_CONTACTS = [850, 1500, 2150, 2800, 3450, 4100] as const;
export interface ZombiePlan {
  readonly pace: number;
  readonly yank: number;
  readonly exit: number;
  readonly detour: number;
  readonly hesitation: number;
}
export function zombiePlan(id: string): ZombiePlan {
  const random = seededRandom(id + ':zombie-hunger');
  return {
    pace: 0.9 + random() * 0.2,
    yank: 0.85 + random() * 0.3,
    exit: 90 + random() * 45,
    detour: (random() < 0.5 ? -1 : 1) * (24 + random() * 20),
    hesitation: 0.08 + random() * 0.06,
  };
}

export function zombieLandingPoint(b: TargetBounds, variation: Point, viewport: Point): Point {
  const end = landingPoint('🧟', b, variation);
  if (end.x < 50 && b.left + b.width + 50 < viewport.x) end.x = b.left + b.width + 27;
  else if (end.x > viewport.x - 50 && b.left > 50) end.x = b.left - 27;
  end.y = Math.max(65, Math.min(viewport.y - 42, end.y));
  return end;
}

export function zombieApproach(
  plan: ZombiePlan,
  start: Point,
  end: Point,
  viewport: Point,
  progress: number,
  facing = Math.sign(end.x - start.x) || 1,
): Point {
  const t = clamp(progress);
  if (t === 0) return { ...start };
  if (t === 1) return { ...end };
  // Two halting steps: a dragging near-stall, then an uneven rush to catch up. A share of steady
  // shuffling runs through both halts so the body keeps lurching forward instead of freezing.
  const halt = plan.hesitation;
  const lurch =
    t < 0.3
      ? (t / 0.3) * 0.28
      : t < 0.3 + halt
        ? 0.28
        : t < 0.7
          ? 0.28 + ((t - 0.3 - halt) / (0.4 - halt)) * 0.4
          : t < 0.7 + halt / 2
            ? 0.68
            : 0.68 + ((t - 0.7 - halt / 2) / (0.3 - halt / 2)) * 0.32;
  const travel = lurch * (1 - APPROACH_DRIFT) + t * APPROACH_DRIFT;
  const limitX = (x: number) => Math.max(38, Math.min(viewport.x - 38, x));
  const limitY = (y: number) => Math.max(65, Math.min(viewport.y - 42, y));
  const a = { x: limitX(start.x + (end.x - start.x) * 0.35), y: limitY(start.y + plan.detour) };
  const c = { x: limitX(end.x - facing * 42), y: limitY(end.y + plan.detour) };
  // Pace by distance so the curve itself never adds a stall to the scripted halts.
  return evenPath((u) => {
    const s = 1 - u;
    return {
      x: s ** 3 * start.x + 3 * s * s * u * a.x + 3 * s * u * u * c.x + u ** 3 * end.x,
      y: s ** 3 * start.y + 3 * s * s * u * a.y + 3 * s * u * u * c.y + u ** 3 * end.y,
    };
  }, travel);
}
const SCALE = 0.8;
const pulse = (n: number) => (n <= 0 || n >= 1 ? 0 : Math.sin(n * Math.PI));
const skin = 0x8b9b91;

function oval(
  parent: THREE.Object3D,
  color: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz = 3,
) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

function rag(parent: THREE.Object3D, color: number, points: [number, number][], z: number) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }),
  );
  mesh.position.z = z;
  parent.add(mesh);
  return mesh;
}

export function makeZombie(): THREE.Group {
  const zombie = new THREE.Group();
  zombie.name = 'zombie';
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = `leg-${side}`;
    leg.position.set(side * 7, -18, 0);
    oval(leg, 0x476775, 0, -11, 0, 6, 16, 5);
    rag(
      leg,
      0x567c89,
      [
        [-5, -15],
        [5, -15],
        [8, -35],
        [4, -31],
        [1, -36],
        [-4, -32],
      ],
      5,
    );
    oval(leg, skin, 4, -37, 3, 9, 4, 4);
    for (let i = 0; i < 3; i++) oval(leg, 0xa3aaa0, 9, -38 + i * 2, 6, 2, 1, 1);
    oval(leg, 0xd5d0b9, 1, -16, 6, 2.5, 4, 1);
    zombie.add(leg);
    const arm = new THREE.Group();
    arm.name = `arm-${side}`;
    for (const name of ['upper', 'lower']) {
      const limb = new THREE.Mesh(
        new THREE.CylinderGeometry(2.4, 3, 1, 9),
        new THREE.MeshStandardMaterial({ color: skin }),
      );
      limb.name = name;
      arm.add(limb);
    }
    const hand = new THREE.Group();
    hand.name = 'hand';
    oval(hand, skin, 0, 0, 0, 4, 5, 2.5);
    for (let i = 0; i < 3; i++) {
      const finger = oval(hand, skin, 5, 3 - i * 3, 1, 5, 1.2, 1);
      finger.name = `finger-${i}`;
    }
    arm.add(hand);
    zombie.add(arm);
  }
  oval(zombie, 0xbebbad, 0, 0, 0, 13, 24, 7);
  rag(
    zombie,
    0xd9d0bc,
    [
      [-15, 17],
      [-23, 9],
      [-20, -1],
      [-13, 2],
      [-16, -27],
      [-10, -23],
      [-7, -28],
      [-2, -23],
      [4, -28],
      [15, -26],
      [13, 5],
      [20, 0],
      [18, 16],
      [5, 22],
    ],
    9,
  );
  for (const [x, y, r] of [
    [-10, -12, 3],
    [9, -18, 3.5],
    [13, 11, 2],
    [-4, 3, 1.5],
  ] as const)
    oval(zombie, 0x854345, x, y, 10, r, r * 1.4, 0.5);
  oval(zombie, skin, 0, 22, 0, 5, 9, 5);
  for (let i = 0; i < 3; i++) oval(zombie, 0xe0d8bd, 0, 20 + i * 3, 6, 6, 1.3, 1);
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(4, 39, 3);
  oval(head, skin, 0, 4, 0, 18, 22, 10);
  oval(head, 0x607b72, -18, 0, 0, 4, 6, 3);
  oval(head, 0x607b72, 17, 5, 0, 4, 6, 3);
  oval(head, 0x34463f, 5, 22, 5, 10, 5, 5);
  for (let i = 0; i < 5; i++)
    oval(head, 0xbb727b, i * 3 - 2, 22 + Math.sin(i * 2) * 2, 9, 2.8, 3, 2);
  for (const [x, y, r] of [
    [-7, 5, 6],
    [8, 10, 8],
  ] as const) {
    oval(head, 0x354b44, x, y, 9, r + 2, r + 3, 2);
    oval(head, 0xd7d581, x, y, 11, r, r + 0.5, 2);
    oval(head, 0x526347, x + 1, y - 1, 13, 2, 3, 0.8);
    oval(head, 0xf2edc0, x - 1, y + 2, 13, 1, 1.5, 0.5);
  }
  oval(head, 0x647a70, 2, -3, 10, 4, 3, 2);
  oval(head, 0x263833, 9, -11, 8, 12, 8, 3);
  for (let i = 0; i < 4; i++) oval(head, 0xe4dbb6, i * 4, -6, 12, 1.5, 3, 1);
  const jaw = new THREE.Group();
  jaw.name = 'jaw';
  jaw.position.set(4, -16, 8);
  oval(jaw, skin, 5, 0, 0, 10, 3, 2);
  for (let i = 0; i < 3; i++) oval(jaw, 0xdcd1aa, i * 4 + 1, 3, 3, 1.5, 3, 1);
  oval(jaw, 0xb45c65, 9, -3, 3, 3, 9, 1.4).rotation.z = 0.6;
  head.add(jaw);
  zombie.add(head);
  for (let i = 0; i < 3; i++) oval(head, 0x52695e, -9 + i * 3, 19 - i * 2, 9, 1, 2, 0.5);
  zombieWalk(zombie, 0, 1);
  return zombie;
}

const up = new THREE.Vector3(0, 1, 0);
function segment(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const delta = b.clone().sub(a);
  mesh.position.copy(a).addScaledVector(delta, 0.5);
  mesh.scale.y = delta.length();
  mesh.quaternion.setFromUnitVectors(up, delta.normalize());
}

/** Fixed length upper arm and forearm, with a bent elbow; hands never detach. */
function reach(zombie: THREE.Group, side: number, x: number, y: number, grab: number) {
  const arm = requireSceneObject(zombie, `arm-${side}`);
  const shoulder = new THREE.Vector3(side * 10, 12, side < 0 ? 5 : 12);
  const hand = new THREE.Vector3(x, y, shoulder.z);
  const delta = hand.clone().sub(shoulder);
  const length = Math.min(37.5, delta.length());
  delta.normalize();
  hand.copy(shoulder).addScaledVector(delta, length);
  const elbow = shoulder.clone().addScaledVector(delta, length / 2);
  const bend = Math.sqrt(19 ** 2 - (length / 2) ** 2);
  elbow.x += delta.y * bend;
  elbow.y -= delta.x * bend;
  segment(requireSceneObject(arm, 'upper'), shoulder, elbow);
  segment(requireSceneObject(arm, 'lower'), elbow, hand);
  requireSceneObject(arm, 'hand').position.copy(hand);
  for (let i = 0; i < 3; i++)
    requireSceneObject(arm, `finger-${i}`).rotation.z = -grab * (0.7 + i * 0.2);
}

export function zombieWalk(zombie: THREE.Group, t: number, facing: number) {
  zombie.scale.set(SCALE * facing, SCALE, SCALE);
  zombie.rotation.set(0, 0, facing * (0.08 + Math.sin(t * 29) * 0.06));
  for (const side of [-1, 1])
    requireSceneObject(zombie, `leg-${side}`).rotation.z =
      Math.sin(t * 24 + side) * (side < 0 ? 0.28 : 0.48);
  requireSceneObject(zombie, 'head').rotation.z = -0.17 + Math.sin(t * 21) * 0.07;
  requireSceneObject(zombie, 'jaw').rotation.z = -0.16;
  reach(zombie, -1, 22, 13 + Math.sin(t * 17) * 4, 0.2);
  reach(zombie, 1, 20, -4 + Math.sin(t * 13) * 5, 0.3);
}

export function zombieBitePoints(id: string): Point[] {
  const random = seededRandom(id + ':zombie-bites');
  return ZOMBIE_CONTACTS.map((_, i) =>
    i === 5
      ? { x: 0.39 + random() * 0.08, y: 0.55 + random() * 0.1 }
      : { x: 0.08 + random() * 0.16, y: 0.25 + random() * 0.48 },
  );
}

export function zombieCardPose(ms: number, facing: number, plan: ZombiePlan) {
  const bite = ZOMBIE_CONTACTS.reduce((sum, hit) => sum + pulse((ms - hit) / 260), 0);
  const pull = pulse((ms - 4270) / 790) * plan.yank;
  const snap = pulse((ms - 5050) / 420);
  return {
    x: facing * (-bite * 2.5 - pull * 6 + snap * 4),
    y: pull * 2 - snap * 2,
    rotate: facing * (bite * 2 + pull * 4 - snap * 2),
    sx: 1 - pull * 0.035,
    sy: 1 + pull * 0.025,
  };
}

export function zombieCardAnimation(facing = 1, plan = zombiePlan('landing')) {
  const frames: Keyframe[] = [];
  for (let ms = 0; ms <= 5600; ms += 40) {
    const p = zombieCardPose(ms, facing, plan);
    frames.push({
      offset: ms / 5600,
      translate: `${p.x}px ${p.y}px`,
      rotate: `${p.rotate}deg`,
      scale: `${p.sx} ${p.sy}`,
    });
  }
  return { frames, options: { duration: 5600 * plan.pace, easing: 'linear' } };
}

function blood(color: number, chunk = false) {
  return new THREE.Mesh(
    chunk ? new THREE.IcosahedronGeometry(3.5, 0) : new THREE.CircleGeometry(1, 10),
    new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, depthTest: false }),
  );
}

export class ZombieTrick {
  readonly object = new THREE.Group();
  readonly points: Point[];
  readonly plan: ZombiePlan;
  get duration() {
    return ZOMBIE_DURATION * this.plan.pace;
  }
  private readonly entrails: ZombieEntrails;
  private readonly grip = new THREE.Vector3();
  private readonly wounds = ZOMBIE_CONTACTS.map(() => blood(0x751d2a));
  private readonly drips = ZOMBIE_CONTACTS.map(() => blood(0xae2033));
  private readonly debris = Array.from({ length: 72 }, (_, i) =>
    blood(i % 4 ? 0xc42c3c : 0xc98780, i % 4 === 0),
  );
  private readonly randoms: number[];
  constructor(id: string) {
    this.plan = zombiePlan(id);
    this.entrails = new ZombieEntrails(id);
    this.points = zombieBitePoints(id);
    const random = seededRandom(id + ':zombie-spray');
    this.randoms = this.debris.map(() => random());
    this.object.add(...this.wounds, ...this.drips, ...this.debris, this.entrails.object);
  }
  contact(index: number, b: TargetBounds, facing: number, ms = 0): Point {
    const point = this.points[index];
    if (!point) throw new Error(`Missing zombie bite ${index}`);
    const p = zombieCardPose(ms, facing, this.plan);
    const angle = (p.rotate * Math.PI) / 180;
    const x = b.width * ((facing > 0 ? point.x : 1 - point.x) - 0.5) * p.sx;
    const y = b.height * (point.y - 0.5) * p.sy;
    return {
      x: b.left + b.width / 2 + x * Math.cos(angle) - y * Math.sin(angle) + p.x,
      y: b.top + b.height / 2 + x * Math.sin(angle) + y * Math.cos(angle) + p.y,
    };
  }
  cardAnimation(facing: number) {
    return zombieCardAnimation(facing, this.plan);
  }
  update(
    ms: number,
    zombie: THREE.Group,
    b: TargetBounds,
    end: Point,
    viewport = {
      x: typeof window === 'undefined' ? 1024 : window.innerWidth,
      y: typeof window === 'undefined' ? 768 : window.innerHeight,
    },
  ) {
    ms /= this.plan.pace;
    const facing = end.x < b.left + b.width / 2 ? 1 : -1;
    const fade = clamp((ZOMBIE_DURATION - ms) / 250);
    const index = Math.min(5, Math.max(0, Math.floor((ms - 525) / 650)));
    const hit = ZOMBIE_CONTACTS[index] ?? 4100;
    const contact = this.contact(index, b, facing, ms);
    const previous = index
      ? this.contact(index - 1, b, facing, ms)
      : { x: end.x + facing * 24 * SCALE, y: end.y - 26 * SCALE };
    const move = smooth((ms - (hit - 325)) / 260);
    const retreat = Math.sin(clamp((ms - hit) / 290) * Math.PI) * 8;
    const departure = smooth((ms - 4850) / 1200);
    zombieWalk(zombie, ms / 1700, facing);
    zombie.rotation.set(0, smooth((ms - 4770) / 280) * Math.PI, 0);
    if (ms >= 525 && departure === 0)
      for (const side of [-1, 1])
        requireSceneObject(zombie, `leg-${side}`).rotation.z = side * 0.09;
    requireSceneObject(zombie, 'head').rotation.z = 0;
    const bite = Math.sin(clamp((ms - hit + 110) / 220) * Math.PI);
    requireSceneObject(zombie, 'jaw').rotation.z = -0.45 * (1 - bite);
    const x = previous.x + (contact.x - previous.x) * move;
    const y = previous.y + (contact.y - previous.y) * move;
    const tug = Math.sin(clamp((ms - 4270) / 790) * Math.PI) * 15 * this.plan.yank;
    const distance = Math.max(this.plan.exit, facing > 0 ? x + 70 : viewport.x - x + 70);
    zombie.position.set(
      x - facing * (24 * SCALE + retreat + tug + departure * distance),
      -y - 26 * SCALE + (departure > 0 ? Math.abs(Math.sin(ms / 130)) * 2 : 0),
      165,
    );
    if (ms < 525) {
      const bump = Math.sin(clamp(ms / 400) * Math.PI) * 14;
      zombie.position.set(end.x + facing * bump, -end.y, 165);
    }
    reach(zombie, -1, 20 + bite * 2, 25, bite);
    reach(zombie, 1, 20 + bite * 2, 7, bite);
    zombie.visible = ms < ZOMBIE_DURATION;
    zombie.traverse((part) => {
      if (part instanceof THREE.Mesh) {
        const materials = Array.isArray(part.material) ? part.material : [part.material];
        for (const material of materials) {
          material.transparent = true;
          material.opacity = fade;
        }
      }
    });
    // The effect parent follows the target; all positions below are in viewport coordinates.
    this.object.position.set(-end.x, end.y, 0);
    this.wounds.forEach((wound, i) => {
      const hit = ZOMBIE_CONTACTS[i] ?? 4100;
      const p = this.contact(i, b, facing, ms),
        age = Math.max(0, (ms - hit) / 1000);
      wound.visible = ms >= hit;
      wound.position.set(p.x, -p.y, 14);
      wound.scale.set(7, 5, 1);
      wound.material.opacity = fade;
      const drip = this.drips[i];
      if (!drip) return;
      const length = Math.min(b.top + b.height - p.y, age * 58);
      drip.visible = age > 0;
      drip.position.set(p.x, -p.y - length / 2, 15);
      drip.scale.set(1.7, length / 2, 1);
      drip.material.opacity = fade;
    });
    this.debris.forEach((piece, i) => {
      const biteIndex = Math.floor(i / 12),
        r = this.randoms[i] ?? 0.5;
      const age = (ms - (ZOMBIE_CONTACTS[biteIndex] ?? 4100)) / 1000;
      const p = this.contact(biteIndex, b, facing, ms);
      const ground = b.top + b.height + 7;
      const x = p.x + facing * (r - 0.35) * 145 * Math.max(0, age);
      const y = p.y - (45 + r * 100) * age + 220 * age * age;
      const fallTime = (45 + r * 100 + Math.sqrt((45 + r * 100) ** 2 + 880 * (ground - p.y))) / 440;
      piece.visible = age >= 0;
      piece.position.set(
        age > fallTime ? p.x + facing * (r - 0.35) * 145 * fallTime : x,
        -Math.min(ground, y),
        18,
      );
      piece.rotation.z = Math.min(Math.max(0, age), fallTime) * (r - 0.5) * 15;
      piece.scale.set(i % 4 ? 2 : 1, age > fallTime ? 0.7 : i % 4 ? 3 : 1, 1);
      piece.material.opacity = fade;
    });
    zombie.updateWorldMatrix(true, true);
    requireSceneObject(requireSceneObject(zombie, 'arm--1'), 'hand').getWorldPosition(this.grip);
    this.entrails.update(
      ms,
      this.contact(5, b, facing, ms),
      { x: this.grip.x, y: -this.grip.y },
      b.top + b.height + 8,
      facing,
      fade,
    );
  }
}
