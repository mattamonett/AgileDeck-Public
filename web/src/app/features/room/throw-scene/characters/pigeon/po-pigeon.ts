import { clamp } from '../../kit';
import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { pigeonFlap, pigeonExpression } from './pigeon-model';
import {
  PIGEON_DURATION,
  PIGEON_BURST_LENGTH,
  PIGEON_SCALE,
  pigeonPlan,
  pigeonKick,
  pigeonFacing,
  pigeonCardPose,
  pigeonCardPoint,
  pigeonImpactPoint,
  pigeonPacketPoint,
  pigeonDeparture,
  pigeonApproach,
  type PigeonPlan,
} from './pigeon-choreography';
export { makePigeon, pigeonFlap } from './pigeon-model';
export { PIGEON_DURATION, PIGEON_BURSTS, pigeonBurstActive } from './pigeon-choreography';
export const PIGEON_THOUGHT = 'How you like that?';
const JET_SEGMENTS = 18;
const CHUNKS = 12;
const MARKS = 6;
const up = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
function wet<G extends THREE.BufferGeometry>(geometry: G, color: number) {
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }),
  );
}
function glossy<G extends THREE.BufferGeometry>(geometry: G, color: number) {
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.24,
      metalness: 0.03,
      transparent: true,
      depthWrite: false,
    }),
  );
}
function bubble() {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }),
  );
  sprite.name = 'pigeon-thought';
  sprite.userData['text'] = PIGEON_THOUGHT;
  sprite.scale.set(184, 52, 1);
  if (typeof document === 'undefined') return sprite;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  if (!ctx) return sprite;
  ctx.fillStyle = '#fffef8';
  ctx.strokeStyle = '#354255';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(4, 4, 632, 140, 50);
  ctx.fill();
  ctx.stroke();
  for (const [x, y, r] of [
    [320, 151, 12],
    [320, 172, 6],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#283340';
  ctx.font = 'bold 46px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(PIGEON_THOUGHT, 320, 75);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  sprite.material.map = texture;
  return sprite;
}
/** Default route for callers without an event plan; the renderer uses its retained plan. */
export function pigeonPoint(start: Point, end: Point, progress: number): Point {
  return pigeonApproach(
    pigeonPlan('landing'),
    start,
    end,
    { x: Math.max(start.x, end.x) + 80, y: Math.max(start.y, end.y) + 100 },
    progress,
  );
}
export class PigeonTrick {
  readonly object = new THREE.Group();
  readonly plan: PigeonPlan;
  get duration() {
    return PIGEON_DURATION * this.plan.pace;
  }
  private readonly jets = Array.from({ length: 4 * JET_SEGMENTS }, () =>
    glossy(new THREE.CylinderGeometry(1, 1, 1, 8), 0xe5dfc5),
  );
  private readonly chunks = Array.from({ length: 4 * CHUNKS }, (_, i) =>
    glossy(new THREE.SphereGeometry(1, 12, 8), i % 4 ? 0xe9e5ce : 0x69613d),
  );
  private readonly stains = Array.from({ length: 4 * MARKS }, (_, i) =>
    wet(new THREE.SphereGeometry(1, 12, 8), i % 3 ? 0xd9d4b8 : 0x695839),
  );
  private readonly drips = Array.from({ length: 4 * MARKS }, (_, i) =>
    glossy(new THREE.SphereGeometry(1, 12, 8), i % 3 ? 0xe4dfc8 : 0x817450),
  );
  private readonly heads = Array.from({ length: 4 * MARKS }, (_, i) =>
    glossy(new THREE.SphereGeometry(1, 14, 10), i % 3 ? 0xe4dfc8 : 0x817450),
  );
  private readonly flecks = Array.from({ length: 4 * MARKS }, (_, i) =>
    wet(new THREE.SphereGeometry(1, 10, 6), i % 3 ? 0xe5e1cb : 0x6b6040),
  );
  private readonly pools = Array.from({ length: 6 }, (_, i) =>
    glossy(new THREE.SphereGeometry(1, 16, 10), i % 3 ? 0xddd6bc : 0x746644),
  );
  private readonly bubble = bubble();
  private readonly variation: readonly { x: number; y: number; size: number }[];
  constructor(id = 'landing') {
    this.plan = pigeonPlan(id);
    const random = seededRandom(id + ':pigeon-goo');
    this.variation = Array.from({ length: 4 * MARKS }, () => ({
      x: random() * 2 - 1,
      y: random() * 2 - 1,
      size: 0.8 + random() * 0.4,
    }));
    for (const jet of this.jets) jet.name = 'pigeon-jet';
    for (const chunk of this.chunks) chunk.name = 'pigeon-burst-chunk';
    for (const drip of this.drips) drip.name = 'pigeon-runoff';
    for (const part of [...this.stains, ...this.drips]) part.userData['cardSurface'] = true;
    this.object.add(
      ...this.jets,
      ...this.chunks,
      ...this.stains,
      ...this.drips,
      ...this.heads,
      ...this.flecks,
      ...this.pools,
      this.bubble,
    );
    for (const part of this.object.children) part.visible = false;
  }
  cardAnimation(facing: number) {
    const frames: Keyframe[] = [];
    for (let ms = 0; ms <= PIGEON_DURATION; ms += 20) {
      const pose = pigeonCardPose(ms, this.plan, facing);
      frames.push({
        offset: ms / PIGEON_DURATION,
        translate: pose.x + 'px ' + pose.y + 'px',
        rotate: pose.angle + 'deg',
      });
    }
    return { frames, options: { duration: this.duration, easing: 'linear' } };
  }
  update(
    ms: number,
    bird: THREE.Group,
    b: TargetBounds,
    end: Point,
    viewport = {
      x: typeof window === 'undefined' ? 1024 : window.innerWidth,
      y: typeof window === 'undefined' ? 768 : window.innerHeight,
    },
  ) {
    ms = Math.round((ms / this.plan.pace) * 1e6) / 1e6;
    const facing = pigeonFacing(end, b);
    const kick = pigeonKick(ms, this.plan);
    const departure = clamp((ms - this.plan.departure) / (1400 * this.plan.exit));
    const point =
      departure > 0
        ? pigeonDeparture(ms, this.plan, end, viewport, facing)
        : pigeonCardPoint(ms, end, b, this.plan, facing);
    bird.scale.setScalar(PIGEON_SCALE);
    bird.rotation.set(
      0,
      facing < 0 ? Math.PI : 0,
      departure > 0
        ? facing * Math.sin(departure * Math.PI) * 0.4
        : (-pigeonCardPose(ms, this.plan, facing).angle * Math.PI) / 180,
      'ZYX',
    );
    bird.position.set(point.x, -point.y, 160);
    bird.visible = departure < 1;
    pigeonFlap(bird, ms, departure > 0, this.plan.flap, kick);
    pigeonExpression(bird, ms, this.plan);
    this.object.position.set(-end.x, end.y, 0);
    const fade = clamp((PIGEON_DURATION - ms) / 650);
    this.jets.forEach((jet, i) => {
      const burst = Math.floor(i / JET_SEGMENTS);
      const segment = i % JET_SEGMENTS;
      const start = this.plan.bursts[burst];
      if (start === undefined) return;
      const head = clamp((ms - start) / this.plan.flight);
      const tail = clamp((ms - start - PIGEON_BURST_LENGTH) / this.plan.flight);
      const aAge = tail + ((head - tail) * segment) / JET_SEGMENTS;
      const zAge = tail + ((head - tail) * (segment + 1)) / JET_SEGMENTS;
      const a = pigeonPacketPoint(
        ms,
        ms - aAge * this.plan.flight,
        this.plan,
        b,
        end,
        burst,
        facing,
      );
      const z = pigeonPacketPoint(
        ms,
        ms - zAge * this.plan.flight,
        this.plan,
        b,
        end,
        burst,
        facing,
      );
      jet.visible =
        ms >= start && ms < start + this.plan.flight + PIGEON_BURST_LENGTH && head > tail;
      const originZ = 10 + facing * 4.8;
      const az = originZ + aAge * (20 - originZ);
      const zz = originZ + zAge * (20 - originZ);
      direction.set(z.x - a.x, a.y - z.y, zz - az);
      const length = direction.length();
      jet.position.set((a.x + z.x) / 2, -(a.y + z.y) / 2, (az + zz) / 2);
      jet.quaternion.setFromUnitVectors(up, direction.normalize());
      const thickness = (1 + Math.sin(segment * 1.4 + burst) * 0.3) * this.plan.pressure;
      jet.scale.set(thickness, length + 0.15, thickness);
      jet.material.opacity = fade;
    });
    this.chunks.forEach((chunk, i) => {
      const burst = Math.floor(i / CHUNKS);
      const local = i % CHUNKS;
      const start = this.plan.bursts[burst];
      if (start === undefined) return;
      const release = start + local * 12;
      const age = (ms - release) / this.plan.flight;
      const p = pigeonPacketPoint(ms, release, this.plan, b, end, burst, facing);
      chunk.visible = age >= 0 && age < 1;
      const scatter = Math.sin(local * 13 + burst * 7) * Math.sin(clamp(age) * Math.PI);
      const originZ = 10 + facing * 4.8;
      chunk.position.set(p.x + scatter * 3, -p.y, originZ + clamp(age) * (20 - originZ));
      const size = (1.6 + (local % 3) * 0.6) * this.plan.pressure;
      chunk.scale.set(size, size * (local % 4 === 0 ? 1.8 : 1.1), size * 0.7);
      chunk.rotation.z = age * 5 * facing;
      chunk.material.opacity = fade;
    });
    this.stains.forEach((stain, i) => {
      const burst = Math.floor(i / MARKS);
      const local = i % MARKS;
      const start = this.plan.bursts[burst];
      const variation = this.variation[i];
      const drip = this.drips[i];
      const head = this.heads[i];
      const fleck = this.flecks[i];
      if (start === undefined || !variation || !drip || !head || !fleck) return;
      const contact = start + this.plan.flight + local * 15;
      const age = Math.max(0, (ms - contact) / 1000);
      const hit = pigeonImpactPoint(b, this.plan, burst, facing);
      const raw = {
        x: Math.max(b.left + 4, Math.min(b.left + b.width - 4, hit.x + variation.x * 5)),
        y: hit.y + variation.y * 5,
      };
      const p = pigeonCardPoint(ms, raw, b, this.plan, facing);
      const spread = clamp(age / 0.09);
      stain.visible = ms >= contact && fade > 0;
      stain.position.set(p.x, -p.y, 21 + local * 0.1);
      stain.scale.set(
        (4 + (local % 2) * 2) * variation.size * spread,
        (3 + (local % 3)) * variation.size * spread,
        0.7,
      );
      stain.material.opacity = fade;
      const flowSpeed = (0.24 + local * 0.012) * this.plan.pressure;
      const flow = clamp(age * flowSpeed);
      const bottom = pigeonCardPoint(
        ms,
        {
          x: raw.x + ((facing < 0 ? b.left + 2 : b.left + b.width - 2) - raw.x) * flow,
          y: raw.y + (b.top + b.height - 2 - raw.y) * flow,
        },
        b,
        this.plan,
        facing,
      );
      drip.visible = stain.visible && age > 0.08;
      drip.position.set((p.x + bottom.x) / 2, -(p.y + bottom.y) / 2, 20 + local * 0.1);
      drip.rotation.z = Math.atan2(bottom.x - p.x, bottom.y - p.y);
      drip.scale.set(
        (1.8 + (local % 3) * 0.65) * this.plan.pressure,
        Math.hypot(bottom.x - p.x, bottom.y - p.y) / 2 + 2,
        0.6,
      );
      drip.material.opacity = fade;
      const fall = Math.max(0, age - 1 / flowSpeed);
      head.visible = drip.visible && fall < 1.05;
      head.position.set(
        bottom.x + variation.x * fall * 5,
        -Math.min(b.top + b.height + 6, bottom.y + fall * fall * 90),
        24 + local * 0.1,
      );
      head.scale.set(
        2.5 * variation.size * this.plan.pressure,
        (3.8 + Math.sin(flow * Math.PI) * 1.2) * variation.size,
        1.5,
      );
      head.material.opacity = fade * clamp((1.05 - fall) / 0.2);
      fleck.visible = ms >= contact && age < 1.2 && fade > 0;
      fleck.position.set(
        p.x + variation.x * age * 32,
        -Math.min(b.top + b.height + 7, p.y - age * 36 + age * age * 150),
        26,
      );
      fleck.scale.set(1.6 * variation.size, (2 + age) * variation.size, 0.8);
      fleck.rotation.z = variation.x * age * 5;
      fleck.material.opacity = fade * clamp((1.2 - age) / 0.25);
    });
    const first = this.plan.bursts[0] ?? 450;
    this.pools.forEach((pool, i) => {
      const age = (ms - first - this.plan.flight - 850) / 1000;
      const growth = clamp(age / 2.2);
      const hit = pigeonImpactPoint(b, this.plan, 0, facing);
      pool.visible = age > 0 && fade > 0;
      pool.position.set(
        hit.x + (i - 2.5) * 4,
        -b.top - b.height - 6 + Math.sin(i * 4) * 2,
        24 + i * 0.1,
      );
      pool.scale.set((5 + (i % 3) * 3) * growth * this.plan.pressure, (2 + (i % 2)) * growth, 0.6);
      pool.material.opacity = fade;
    });
    this.bubble.visible =
      this.bubble.material.map !== null &&
      ms > first + this.plan.flight + 100 &&
      ms < this.plan.departure;
    const x = Math.max(96, Math.min(viewport.x - 96, end.x));
    const y = Math.max(36, end.y - 85);
    this.bubble.position.set(x, -y, 55);
  }
}
