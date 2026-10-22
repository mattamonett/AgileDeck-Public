import { clamp, stretchBetweenVectors } from '../../kit';
import { requireSceneObject } from '../../engine/scene-object';
import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { chainsawPlan, sawProgress, type ChainsawPlan } from './chainsaw-choreography';
import { SawGore } from './saw-gore';

export const CHAINSAW_DURATION = 4800;
export const SAW_CONTACT = 1000;
export const SAW_FINISH = 2600;
const SCALE = 0.9;

function oval(
  parent: THREE.Object3D,
  color: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.65 }),
  );
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

function plate(
  parent: THREE.Object3D,
  color: number,
  points: readonly (readonly [number, number])[],
  z: number,
) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide }),
  );
  mesh.position.z = z;
  parent.add(mesh);
  return mesh;
}

/** A chibi chainsaw maniac in a stained apron and a plain hockey mask. */
export function makeChainsawCharacter(): THREE.Group {
  const man = new THREE.Group();
  man.name = 'chainsaw-maniac';
  oval(man, 0xb3a5a1, 0, 0, 0, 21, 23, 12);
  for (let i = 0; i < 7; i++) oval(man, 0x746b70, 0, -17 + i * 6, 11, 19, 0.65, 0.7);
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'left-leg' : 'right-leg';
    leg.position.set(side * 10, -21, 0);
    oval(leg, 0x3e3b42, 0, -9, 0, 9, 14, 8);
    const shin = new THREE.Group();
    shin.name = side < 0 ? 'left-shin' : 'right-shin';
    shin.position.y = -15;
    oval(shin, 0x3e3b42, 0, -5, 0, 7, 9, 6);
    oval(shin, 0x17191c, 3, -11, 3, 10, 6, 10);
    leg.add(shin);
    man.add(leg);
    oval(man, 0xd3c3bc, side * 18, 10, 0, 10, 12, 10);
    for (let i = 0; i < 4; i++) oval(man, 0x82757a, side * 19, 3 + i * 5, 9, 8, 0.55, 0.5);
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(4.3, 4, 1, 10),
      new THREE.MeshStandardMaterial({ color: 0xd5a171, roughness: 0.8 }),
    );
    arm.name = side < 0 ? 'left-forearm' : 'right-forearm';
    man.add(arm);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.2, 1, 10), arm.material);
    upper.name = side < 0 ? 'left-upperarm' : 'right-upperarm';
    man.add(upper);
    const elbow = oval(man, 0xd5a171, 0, 0, 0, 4.4, 4.4, 4.4);
    elbow.name = side < 0 ? 'left-elbow' : 'right-elbow';
  }
  plate(
    man,
    0xe4a13e,
    [
      [-17, 12],
      [17, 12],
      [19, -16],
      [7, -36],
      [-17, -24],
    ],
    14,
  );
  for (let i = 0; i < 8; i++)
    oval(
      man,
      i % 2 ? 0x5a1820 : 0x91322b,
      Math.sin(i * 2.3) * 12,
      -8 - i * 2.4,
      14.8,
      1.2 + (i % 3),
      2 + (i % 2),
      0.5,
    );
  for (const side of [-1, 1]) {
    const strap = oval(man, 0x5d4332, side * 15, 16, 12, 2, 10, 1);
    strap.rotation.z = side * 0.12;
    plate(
      man,
      0xd5c7c1,
      [
        [side * 2, 22],
        [side * 13, 22],
        [side * 8, 12],
      ],
      15,
    );
  }
  plate(
    man,
    0x343d47,
    [
      [-3, 18],
      [4, 18],
      [7, -9],
      [1, -15],
      [-6, -10],
    ],
    16,
  );
  plate(
    man,
    0xb7c4cb,
    [
      [-1, 11],
      [1, 12],
      [4, -9],
      [1, -10],
    ],
    16.2,
  );
  oval(man, 0xc3b298, 0, 35, 0, 24, 25, 16);
  oval(man, 0xdcae80, 23, 32, 0, 6, 9, 6);
  const maskStrap = new THREE.Mesh(
    new THREE.TorusGeometry(24, 1.1, 6, 32),
    new THREE.MeshStandardMaterial({ color: 0x4d3d30, roughness: 0.8 }),
  );
  maskStrap.scale.y = 0.67;
  maskStrap.rotation.x = Math.PI / 2;
  maskStrap.position.y = 31;
  man.add(maskStrap);
  for (let i = 0; i < 12; i++) {
    const angle = (i / 11) * Math.PI;
    const hair = oval(
      man,
      0x16191b,
      Math.cos(angle) * 23,
      44 + Math.sin(angle) * 17,
      -1,
      10,
      9,
      12,
    );
    hair.rotation.z = angle * 0.6;
  }
  oval(man, 0x15191b, -22, 38, -1, 7, 15, 10);
  oval(man, 0x15191b, 21, 40, -1, 7, 15, 10);
  // A plain white hockey mask: eye holes and rows of breathing holes, no markings.
  oval(man, 0xefece2, 0, 33, 12, 19, 22, 4.5);
  for (const side of [-1, 1]) {
    oval(man, 0x171b1d, side * 8, 38, 16.2, 4.6, 3.6, 0.6);
    oval(man, 0xd6d2c6, side * 8, 43, 16, 5.5, 0.9, 0.6);
  }
  for (const [row, count] of [
    [0, 3],
    [1, 4],
    [2, 3],
  ] as const) {
    for (let i = 0; i < count; i++)
      oval(man, 0x2a2e30, (i - (count - 1) / 2) * 4.2, 27 - row * 4, 16.4, 1, 1, 0.4);
  }
  oval(man, 0xd6d2c6, 0, 33, 16, 0.8, 9, 0.5);

  const rig = new THREE.Group();
  rig.name = 'saw-rig';
  const engine = new THREE.Mesh(
    new THREE.BoxGeometry(24, 17, 12),
    new THREE.MeshStandardMaterial({ color: 0xf5cb24, roughness: 0.4 }),
  );
  rig.add(engine);
  oval(rig, 0x252b2e, -2, 0, 7, 6, 6, 1);
  for (let i = 0; i < 3; i++) oval(rig, 0x303333, -8 + i * 4, -5, 7, 0.6, 3, 0.5);
  const bar = oval(rig, 0xc6c9c7, 33, 1, 0, 28, 5, 2);
  bar.name = 'guide-bar';
  oval(rig, 0xe8e8dc, 34, 2, 2, 24, 1, 0.5);
  for (let i = 0; i < 28; i++) {
    const tooth = new THREE.Mesh(
      new THREE.ConeGeometry(2, 3.5, 3),
      new THREE.MeshStandardMaterial({ color: 0x303739, metalness: 0.65, roughness: 0.35 }),
    );
    tooth.name = 'chain-tooth';
    rig.add(tooth);
  }
  for (const x of [-17, 7]) {
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(7, 1.8, 6, 14),
      new THREE.MeshStandardMaterial({ color: 0x242a29 }),
    );
    handle.position.set(x, -3, 6);
    rig.add(handle);
    const hand = oval(rig, 0xe1ae7d, x, -7, 9, 5.5, 5, 4);
    hand.name = x < 0 ? 'rear-hand' : 'front-hand';
    for (let i = 0; i < 3; i++) oval(rig, 0xa67955, x - 3 + i * 3, -7, 12.5, 0.45, 3, 0.5);
  }
  const tip = new THREE.Object3D();
  tip.name = 'saw-tip';
  tip.position.set(61, 1, 0);
  rig.add(tip);
  man.add(rig);
  poseSaw(man, { x: 17, y: 6, angle: -0.25 }, 0);
  return man;
}

export function sawPose(ms: number, plan = chainsawPlan('landing')) {
  if (ms < 550) return { x: 17, y: 6, angle: -0.25 + 1.55 * clamp(ms / 550) };
  if (ms < SAW_CONTACT)
    return {
      x: 17,
      y: 6 + 18 * clamp((ms - 700) / 300),
      angle: 1.3 * (1 - clamp((ms - 700) / 300)),
    };
  const progress = sawProgress(ms, plan);
  const active = ms < SAW_FINISH;
  if (ms >= 3500) {
    const raise = clamp((ms - 3500) / 250);
    return {
      x: 17,
      y: 6 + raise * 42,
      angle: -0.25 + raise * (1.25 + Math.sin(ms / (150 * plan.exit)) * 0.3),
    };
  }
  return {
    x:
      17 +
      7 * Math.sin(progress * Math.PI) +
      (active ? Math.sin(ms * 0.075) * 1.5 * plan.pressure * clamp((ms - SAW_CONTACT) / 80) : 0),
    y: 24 - progress * 58 + clamp((ms - 2900) / 600) * 40,
    angle: ms < 2900 ? 0 : -0.25 * clamp((ms - 2900) / 400),
  };
}

const handPoint = new THREE.Vector3();
const shoulder = new THREE.Vector3();
const direction = new THREE.Vector3();
const elbowPoint = new THREE.Vector3();
function poseSaw(man: THREE.Group, pose: ReturnType<typeof sawPose>, ms: number) {
  const rig = requireSceneObject(man, 'saw-rig');
  rig.position.set(pose.x, pose.y, 19);
  rig.rotation.z = pose.angle;
  rig.updateMatrix();
  for (const [name, hand, x] of [
    ['left-forearm', 'rear-hand', -20],
    ['right-forearm', 'front-hand', 20],
  ] as const) {
    handPoint.copy(requireSceneObject(rig, hand).position).applyMatrix4(rig.matrix);
    shoulder.set(x, 9, 8);
    direction.subVectors(handPoint, shoulder);
    const length = direction.length();
    direction.normalize();
    const bend = Math.sqrt(Math.max(0, 31 ** 2 - (length / 2) ** 2));
    elbowPoint.copy(shoulder).addScaledVector(direction, length / 2);
    const planar = Math.hypot(direction.x, direction.y);
    if (planar > 0.001) {
      elbowPoint.x += (direction.y / planar) * bend;
      elbowPoint.y -= (direction.x / planar) * bend;
    } else elbowPoint.x += bend;
    const prefix = name.startsWith('left') ? 'left' : 'right';
    requireSceneObject(man, `${prefix}-elbow`).position.copy(elbowPoint);
    stretchBetweenVectors(requireSceneObject(man, `${prefix}-upperarm`), shoulder, elbowPoint);
    stretchBetweenVectors(requireSceneObject(man, name), elbowPoint, handPoint);
  }
  let index = 0;
  for (const tooth of rig.children) {
    if (tooth.name !== 'chain-tooth') continue;
    const angle = (index++ / 28) * Math.PI * 2 + ms * 0.018;
    tooth.position.set(33 + Math.cos(angle) * 28, 1 + Math.sin(angle) * 6, 0);
    tooth.rotation.z = angle - Math.PI / 2;
  }
}

export function chainsawWalk(man: THREE.Group, progress: number, facing: number) {
  man.scale.set(SCALE * facing, SCALE, SCALE);
  man.rotation.set(0, 0, 0);
  for (const [i, name] of ['left-leg', 'right-leg'].entries()) {
    const phase = progress * Math.PI * 12 + i * Math.PI;
    requireSceneObject(man, name).rotation.z = Math.sin(phase) * 0.4;
    requireSceneObject(man, i === 0 ? 'left-shin' : 'right-shin').rotation.z =
      Math.max(0, Math.sin(phase)) * 0.6;
  }
  poseSaw(man, { x: 17, y: 6, angle: -0.25 }, progress * 1000);
}

export function chainsawContact(
  ms: number,
  end: Point,
  facing: number,
  plan = chainsawPlan('landing'),
): Point {
  const pose = sawPose(ms, plan);
  return {
    x: end.x + facing * SCALE * (pose.x + 61 * Math.cos(pose.angle) - Math.sin(pose.angle)),
    y: end.y - SCALE * (pose.y + 61 * Math.sin(pose.angle) + Math.cos(pose.angle)),
  };
}

function blood(geometry: THREE.BufferGeometry, color: number) {
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false }),
  );
}

export class ChainsawTrick {
  readonly object = new THREE.Group();
  readonly plan: ChainsawPlan;
  get duration() {
    return CHAINSAW_DURATION * this.plan.pace;
  }
  private readonly gore: SawGore;
  private readonly cuts = Array.from({ length: 48 }, () =>
    blood(new THREE.PlaneGeometry(1, 1), 0x25080e),
  );
  private readonly lips = Array.from({ length: 48 }, () =>
    blood(new THREE.PlaneGeometry(1, 1), 0xca5368),
  );
  private readonly drips = Array.from({ length: 6 }, () =>
    blood(new THREE.PlaneGeometry(2.5, 1), 0xc32032),
  );
  private readonly drops = Array.from({ length: 6 }, () =>
    blood(new THREE.CircleGeometry(2.5, 12), 0xe33a43),
  );

  constructor(id = 'landing') {
    this.plan = chainsawPlan(id);
    this.gore = new SawGore(id);
    const surface = [...this.cuts, ...this.lips, ...this.drips, ...this.drops];
    surface.forEach((part) => {
      part.userData['cardSurface'] = true;
    });
    this.object.add(...surface, this.gore.object);
  }
  cardAnimation(facing: number) {
    const frames: Keyframe[] = [];
    for (let ms = 0; ms <= CHAINSAW_DURATION; ms += 40) {
      const active = clamp((ms - SAW_CONTACT) / 100) * clamp((SAW_FINISH - ms) / 150);
      const vibration = Math.sin(ms * 0.075) * active * this.plan.pressure;
      const release = ms > 2600 && ms < 3200 ? Math.sin(((ms - 2600) / 600) * Math.PI) : 0;
      frames.push({
        offset: ms / CHAINSAW_DURATION,
        translate: `${facing * vibration * 0.8}px ${release}px`,
        scale: `${1 - Math.abs(vibration) * 0.012} 1`,
        filter: `brightness(${1 - active * 0.06})`,
      });
    }
    return { frames, options: { duration: this.duration, easing: 'linear' } };
  }

  update(
    ms: number,
    man: THREE.Group,
    b: TargetBounds,
    end: Point,
    viewport = {
      x: typeof window === 'undefined' ? 1024 : window.innerWidth,
      y: typeof window === 'undefined' ? 768 : window.innerHeight,
    },
  ) {
    ms = Math.round((ms / this.plan.pace) * 1e6) / 1e6;
    const facing = end.x < b.left + b.width / 2 ? 1 : -1;
    const depart = clamp((ms - 3700) / 750);
    const fade = clamp((CHAINSAW_DURATION - ms) / 250);
    chainsawWalk(man, depart * this.plan.exit, facing);
    poseSaw(man, sawPose(ms, this.plan), ms);
    man.rotation.y = clamp((ms - 3500) / 250) * Math.PI;
    const distance = facing > 0 ? end.x + 90 : viewport.x - end.x + 90;
    man.position.set(
      end.x - facing * depart * distance,
      -end.y + Math.sin(depart * Math.PI * 5) * 3,
      165,
    );
    man.visible = ms < CHAINSAW_DURATION;
    man.traverse((part) => {
      if (part instanceof THREE.Mesh) {
        const materials = Array.isArray(part.material) ? part.material : [part.material];
        for (const material of materials) {
          material.transparent = true;
          material.opacity = fade;
        }
      }
    });
    this.object.position.set(-end.x, end.y, 0);
    const inside = (p: Point) =>
      p.x > b.left + 3 &&
      p.x < b.left + b.width - 3 &&
      p.y > b.top + 3 &&
      p.y < b.top + b.height - 3;
    this.cuts.forEach((cut, i) => {
      const time = SAW_CONTACT + (i * (SAW_FINISH - SAW_CONTACT)) / this.cuts.length;
      const a = chainsawContact(time, end, facing, this.plan);
      const z = chainsawContact(
        Math.min(ms, time + (SAW_FINISH - SAW_CONTACT) / this.cuts.length),
        end,
        facing,
        this.plan,
      );
      cut.visible = ms >= time && inside(a) && inside(z);
      cut.position.set((a.x + z.x) / 2, -(a.y + z.y) / 2, 10);
      cut.rotation.z = Math.atan2(-(z.y - a.y), z.x - a.x);
      const open = clamp((ms - time) / 400);
      cut.scale.set(Math.hypot(z.x - a.x, z.y - a.y) + 1, 2 + open * 5 * this.plan.pressure, 1);
      cut.material.opacity = fade;
      const lip = this.lips[i];
      if (lip) {
        lip.visible = cut.visible;
        lip.position.copy(cut.position);
        lip.position.x += 1.8;
        lip.position.z = 11;
        lip.rotation.copy(cut.rotation);
        lip.scale.set(cut.scale.x * 1.03, 1 + open, 1);
        lip.material.opacity = fade;
      }
    });
    this.drips.forEach((drip, i) => {
      const contact = SAW_CONTACT + 80 + i * 240;
      const point = chainsawContact(contact, end, facing, this.plan);
      const age = Math.max(0, (ms - contact - 120) / 1000);
      const length = Math.max(
        0,
        Math.min(b.top + b.height - point.y - 4, age * (15 + (i % 3) * 7)),
      );
      drip.visible = age > 0 && length > 0 && inside(point);
      drip.position.set(point.x, -point.y - length / 2, 11);
      drip.scale.y = length;
      drip.material.opacity = fade;
      const drop = this.drops[i];
      if (!drop) return;
      drop.visible = drip.visible;
      drop.position.set(point.x, -point.y - length, 12);
      drop.scale.set(0.8, 1.4, 1);
      drop.material.opacity = fade;
    });
    this.gore.update(ms, b, facing, this.plan.pressure, fade, (time) =>
      chainsawContact(time, end, facing, this.plan),
    );
  }
}
