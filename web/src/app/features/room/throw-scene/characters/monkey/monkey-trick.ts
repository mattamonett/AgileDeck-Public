import { clamp } from '../../kit';
import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { requireSceneObject } from '../../engine/scene-object';
import { monkeyPose } from './monkey-model';
import {
  MONKEY_DURATION,
  MONKEY_SCALE,
  monkeyPlan,
  monkeyFacing,
  monkeyPosition,
  monkeyThrowPose,
  monkeyFlight,
  monkeyImpact,
  monkeyCardPoint,
  monkeyCardPose,
  type MonkeyShot,
} from './monkey-choreography';
export { makeMonkey } from './monkey-model';
export { MONKEY_DURATION } from './monkey-choreography';
function oval(x: number, y: number, color: number, roughness = 0.24) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 10),
    new THREE.MeshStandardMaterial({ color, roughness, transparent: true, depthWrite: false }),
  );
  mesh.scale.set(x, y, Math.min(x, y) * 0.6);
  return mesh;
}
function poopPile() {
  const poop = new THREE.Group();
  poop.name = 'monkey-poop';
  for (let i = 0; i < 4; i++) {
    const coil = oval(10 - i * 2.3, 4, i % 2 ? 0x805130 : 0x654329);
    coil.position.set(i * 0.5, i * 5 - 6, 0);
    poop.add(coil);
  }
  for (const side of [-1, 1]) {
    const eye = oval(2.3, 2.5, 0xfff4d9, 0.2);
    eye.position.set(side * 3.5, 0, 6);
    const pupil = oval(1, 1.4, 0x30251f);
    pupil.position.set(side * 3.5, 0, 8);
    poop.add(eye, pupil);
  }
  return poop;
}
export class MonkeyTrick {
  readonly object = new THREE.Group();
  readonly plan;
  get duration() {
    return MONKEY_DURATION * this.plan.pace;
  }
  private readonly clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly planes = [this.clip];
  private readonly actors = new WeakSet<THREE.Group>();
  private readonly grip = new THREE.Vector3();
  private readonly shots;
  constructor(id: string) {
    this.plan = monkeyPlan(id);
    const random = seededRandom(id + ':monkey-goo');
    this.shots = this.plan.shots.map((timing) => {
      const poop = poopPile();
      const marks = Array.from({ length: 5 }, (_, i) => {
        const stain = oval(1, 1, i % 2 ? 0x6a4026 : 0x8d5731);
        stain.name = 'monkey-splat';
        const drip = oval(1, 1, 0x80502c);
        drip.name = 'monkey-drip';
        const head = oval(1, 1, 0x80502c);
        head.name = 'monkey-drip-bead';
        const fleck = oval(1, 1, 0x785031);
        fleck.name = 'monkey-splash';
        this.object.add(stain, drip, head, fleck);
        return {
          stain,
          drip,
          head,
          fleck,
          dx: (random() - 0.5) * 14,
          dy: (random() - 0.5) * 12,
          size: 0.8 + random() * 0.4,
          speed: 0.2 + random() * 0.12,
          scatter: random() * 2 - 1,
        };
      });
      const pool = oval(1, 1, 0x80502c);
      pool.name = 'monkey-puddle';
      this.object.add(poop, pool);
      return { timing, poop, marks, pool };
    });
    for (const part of this.object.children) part.visible = false;
  }
  cardAnimation(facing: number) {
    const frames: Keyframe[] = [];
    for (let ms = 0; ms <= MONKEY_DURATION; ms += 20) {
      const pose = monkeyCardPose(ms, this.plan, facing);
      frames.push({
        offset: ms / MONKEY_DURATION,
        translate: pose.x + 'px ' + pose.y + 'px',
        rotate: pose.angle + 'deg',
        scale: pose.sx + ' 1',
      });
    }
    return { frames, options: { duration: this.duration, easing: 'linear' } };
  }
  update(
    ms: number,
    monkey: THREE.Group,
    source: TargetBounds,
    target: TargetBounds,
    viewport: Point,
  ) {
    ms = Math.round((ms / this.plan.pace) * 1e6) / 1e6;
    const facing = monkeyFacing(source, target);
    const position = monkeyPosition(ms, this.plan, source, target, viewport);
    const previous = monkeyPosition(Math.max(0, ms - 5), this.plan, source, target, viewport);
    const distance = position.x - source.left - source.width / 2;
    const stride = Math.min(1, Math.abs(position.x - previous.x) * 2);
    monkey.position.set(position.x, -position.y, 160);
    monkey.rotation.set(0, 0, 0);
    monkey.scale.set(MONKEY_SCALE * facing, MONKEY_SCALE, MONKEY_SCALE);
    monkey.visible = position.visible;
    monkeyPose(monkey, ms, this.plan, distance, stride);
    this.clip.constant = position.clip;
    if (!this.actors.has(monkey)) {
      monkey.traverse((part) => {
        if (part instanceof THREE.Mesh)
          for (const material of Array.isArray(part.material) ? part.material : [part.material])
            material.clippingPlanes = this.planes;
      });
      this.actors.add(monkey);
    }
    monkey.updateMatrixWorld(true);
    requireSceneObject(requireSceneObject(monkey, 'throwing-arm'), 'poop-grip').getWorldPosition(
      this.grip,
    );
    this.object.visible = ms < MONKEY_DURATION;
    const fade = clamp((MONKEY_DURATION - ms) / 650);
    for (const shot of this.shots) {
      const { timing, poop } = shot;
      const t = clamp((ms - timing.release) / timing.flight);
      const age = ms - timing.release - timing.flight;
      const held = ms < timing.release;
      poop.visible = ms >= timing.release - 300 && age < 0;
      const releasePose = monkeyThrowPose(timing.release, this.plan);
      const pose = held ? monkeyThrowPose(ms, this.plan) : releasePose;
      if (held) poop.position.copy(this.grip);
      else {
        const p = monkeyFlight(ms, this.plan, timing, source, target, viewport);
        poop.position.set(p.x, -p.y, 168 + t * 7);
      }
      poop.scale.set(0.55 * facing, 0.55, 0.55);
      poop.rotation.z = facing * (pose.angle + pose.lean + t * Math.PI * 2);
      poop.traverse((part) => {
        if (part instanceof THREE.Mesh) part.material.clippingPlanes = held ? this.planes : null;
      });
      this.updateMess(ms, timing, age, fade, facing, target, shot);
    }
  }
  private updateMess(
    ms: number,
    timing: MonkeyShot,
    ageMs: number,
    fade: number,
    facing: number,
    b: TargetBounds,
    shot: (typeof this.shots)[number],
  ) {
    const hit = monkeyImpact(timing, b);
    const age = Math.max(0, ageMs / 1000);
    const spread = clamp(age / 0.08);
    for (const [i, mark] of shot.marks.entries()) {
      const raw = {
        x: Math.max(b.left + 4, Math.min(b.left + b.width - 4, hit.x + mark.dx)),
        y: Math.max(b.top + 4, Math.min(b.top + b.height - 4, hit.y + mark.dy)),
      };
      const p = monkeyCardPoint(ms, raw, b, this.plan, facing);
      const flow = clamp(age * mark.speed * this.plan.force);
      const bottom = monkeyCardPoint(
        ms,
        {
          x: raw.x + ((timing.u < 0.5 ? b.left + 2 : b.left + b.width - 2) - raw.x) * flow,
          y: raw.y + (b.top + b.height - 2 - raw.y) * flow,
        },
        b,
        this.plan,
        facing,
      );
      mark.stain.visible = ageMs >= 0 && fade > 0;
      mark.stain.position.set(p.x, -p.y, 176 + i * 0.1);
      mark.stain.scale.set(
        (4 + (i % 2) * 2) * mark.size * spread,
        (3 + (i % 3)) * mark.size * spread,
        0.7,
      );
      mark.stain.material.opacity = fade;
      mark.drip.visible = mark.stain.visible && age > 0.08;
      mark.drip.position.set((p.x + bottom.x) / 2, -(p.y + bottom.y) / 2, 175 + i * 0.1);
      mark.drip.rotation.z = Math.atan2(bottom.x - p.x, bottom.y - p.y);
      mark.drip.scale.set(
        (1.1 + (i % 3) * 0.4) * this.plan.force,
        Math.hypot(bottom.x - p.x, bottom.y - p.y) / 2 + 1,
        0.7,
      );
      mark.drip.material.opacity = fade;
      const fall = Math.max(0, age - 1 / (mark.speed * this.plan.force));
      mark.head.visible = mark.drip.visible && fall < 1;
      mark.head.position.set(
        bottom.x + mark.scatter * fall * 4,
        -Math.min(b.top + b.height + 7, bottom.y + fall * fall * 100),
        178,
      );
      mark.head.scale.set(2.3 * mark.size, (3.5 + Math.sin(flow * Math.PI)) * mark.size, 1.6);
      mark.head.material.opacity = fade * clamp((1 - fall) / 0.2);
      mark.fleck.visible = mark.stain.visible && age < 0.65;
      mark.fleck.position.set(
        p.x + mark.scatter * age * 55,
        -Math.min(b.top + b.height + 8, p.y - age * 45 + age * age * 170),
        180,
      );
      mark.fleck.scale.set(1.5 * mark.size, 2.3 * mark.size, 1.2);
      mark.fleck.rotation.z = age * mark.scatter * 6;
      mark.fleck.material.opacity = fade * clamp((0.65 - age) / 0.15);
    }
    shot.pool.visible = age > 3.3 && fade > 0;
    shot.pool.position.set(
      b.left + b.width * (timing.u < 0.5 ? 0.08 : 0.92),
      -b.top - b.height - 7,
      170,
    );
    shot.pool.scale.set(9 * clamp((age - 3.3) / 1.2) * this.plan.force, 2.1, 0.6);
    shot.pool.material.opacity = fade;
  }
}
