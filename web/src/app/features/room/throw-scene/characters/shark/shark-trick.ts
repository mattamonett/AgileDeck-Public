import { clamp } from '../../kit';
import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { requireSceneObject } from '../../engine/scene-object';
import { SharkTears } from './shark-tears';
import { sharkSwim } from './shark-model';
import {
  SHARK_DURATION,
  SHARK_SCALE,
  sharkPlan,
  sharkActorPose,
  sharkCardPose,
} from './shark-choreography';
export { makeShark, sharkSwim } from './shark-model';
export interface SharkRoute {
  amplitude: number;
  waves: number;
  phase: number;
  duration: number;
  viewport?: Point;
}
export function sharkRoute(seed: string): SharkRoute {
  const random = seededRandom(seed + ':shark');
  return {
    amplitude: 12 + random() * 10,
    waves: 0.65 + random() * 0.35,
    phase: random() * Math.PI * 2,
    duration: 2100,
  };
}
/** Default steady swim for standalone motion callers; the renderer retains the event plan. */
export function sharkPoint(start: Point, end: Point, route: SharkRoute, progress: number): Point {
  const t = clamp(progress);
  if (t === 0) return { ...start };
  if (t === 1) return { ...end };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return { x: start.x + dx * t, y: start.y + dy * t };
  const nx = -dy / distance;
  const ny = dx / distance;
  let amplitude = Math.min(route.amplitude, distance * 0.05);
  if (route.viewport) {
    const roomX = Math.max(
      0,
      Math.min(start.x, end.x, route.viewport.x - start.x, route.viewport.x - end.x) - 24,
    );
    const roomY = Math.max(
      0,
      Math.min(start.y, end.y, route.viewport.y - start.y, route.viewport.y - end.y) - 24,
    );
    if (Math.abs(nx) > 0.001) amplitude = Math.min(amplitude, roomX / Math.abs(nx));
    if (Math.abs(ny) > 0.001) amplitude = Math.min(amplitude, roomY / Math.abs(ny));
  }
  const sway =
    Math.sin(t * Math.PI * 2 * route.waves + route.phase) * Math.sin(t * Math.PI) ** 2 * amplitude;
  return { x: start.x + dx * t + nx * sway, y: start.y + dy * t + ny * sway };
}
export class SharkTrick {
  readonly object = new THREE.Group();
  readonly plan;
  get duration() {
    return SHARK_DURATION * this.plan.pace;
  }
  private readonly tears: SharkTears;
  private readonly grip = new THREE.Vector3();
  constructor(id: string) {
    this.plan = sharkPlan(id);
    this.tears = new SharkTears(id, this.plan);
    this.object.add(this.tears.object);
  }
  cardAnimation(facing: number) {
    const frames: Keyframe[] = [];
    for (let ms = 0; ms <= SHARK_DURATION; ms += 20) {
      const pose = sharkCardPose(ms, this.plan, facing);
      frames.push({
        offset: ms / SHARK_DURATION,
        translate: pose.x + 'px ' + pose.y + 'px',
        rotate: pose.angle + 'deg',
        scale: pose.sx + ' 1',
      });
    }
    return { frames, options: { duration: this.duration, easing: 'linear' } };
  }
  update(
    ms: number,
    shark: THREE.Group,
    b: TargetBounds,
    end: Point,
    viewport = {
      x: typeof window === 'undefined' ? 1024 : window.innerWidth,
      y: typeof window === 'undefined' ? 768 : window.innerHeight,
    },
  ) {
    ms = Math.round((ms / this.plan.pace) * 1e6) / 1e6;
    const facing = end.x < b.left + b.width / 2 ? 1 : -1;
    const pose = sharkActorPose(ms, this.plan, b, end, viewport, facing);
    shark.position.set(pose.x, -pose.y, 160);
    shark.scale.setScalar(SHARK_SCALE);
    shark.visible = pose.visible;
    shark.rotation.set(0, pose.yaw, pose.bank, 'ZYX');
    sharkSwim(shark, ms, this.plan.tail, pose.jaw);
    shark.updateMatrixWorld(true);
    requireSceneObject(shark, 'shark-bite-tip').getWorldPosition(this.grip);
    this.object.position.set(-end.x, end.y, 0);
    this.object.visible = ms < SHARK_DURATION;
    this.tears.update(
      ms,
      this.plan,
      b,
      end,
      viewport,
      facing,
      { x: this.grip.x, y: -this.grip.y },
      clamp((SHARK_DURATION - ms) / 650),
    );
  }
}
