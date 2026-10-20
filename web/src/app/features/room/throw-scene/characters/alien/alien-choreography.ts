import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { evenPath } from '../../flight/approach-flow';
import { clamp, ease } from '../../kit';

export const ALIEN_DURATION = 4700;
export interface AlienPlan {
  readonly pace: number;
  readonly side: number;
  readonly malfunction: boolean;
  readonly tilt: number;
  readonly scans: number;
  readonly bend: number;
  readonly hesitation: number;
  readonly exitDistance: number;
  readonly blink: number;
}
export const beat = (ms: number, from: number, to: number) => ease((ms - from) / (to - from));

export function alienPlan(id: string): AlienPlan {
  const random = seededRandom(`${id}:alien-inspection`);
  return {
    pace: 0.9 + random() * 0.22,
    side: random() < 0.5 ? 1 : -1,
    malfunction: random() < 0.45,
    tilt: 8 + random() * 4,
    scans: 2 + Math.floor(random() * 2),
    bend: (random() - 0.5) * 56,
    hesitation: 0.08 + random() * 0.12,
    exitDistance: 42 + random() * 26,
    blink: 0.3 + random() * 0.35,
  };
}
export function alienFacing(plan: AlienPlan, b: TargetBounds, viewport: Point): number {
  const left = b.left;
  const right = viewport.x - b.left - b.width;
  if (plan.side === 1 && left < 65 && right > left) return -1;
  if (plan.side === -1 && right < 65 && left > right) return 1;
  return plan.side;
}
export function alienLandingPoint(plan: AlienPlan, b: TargetBounds, viewport: Point): Point {
  const facing = alienFacing(plan, b, viewport);
  return {
    x: facing > 0 ? Math.max(23, b.left - 27) : Math.min(viewport.x - 23, b.left + b.width + 27),
    y: Math.max(52, Math.min(viewport.y - 28, b.top + b.height - 21)),
  };
}
/** A curious detour, a hesitation, then a tangent aimed into the chosen edge. */
export function alienApproach(
  plan: AlienPlan,
  start: Point,
  end: Point,
  facing: number,
  viewport: Point,
  progress: number,
): Point {
  const t = clamp(progress);
  const cx = Math.max(23, Math.min(viewport.x - 23, end.x - facing * 65));
  const cy = Math.max(52, Math.min(viewport.y - 28, start.y + plan.bend));
  // Pace the detour by distance so the hesitation is the only slow beat, and keep a little drift
  // through that hesitation so the creep never reads as standing still.
  const creep = ease(t - plan.hesitation * Math.sin(Math.PI * t) ** 2) * 0.85 + ease(t) * 0.15;
  return evenPath((u) => {
    const v = 1 - u;
    return {
      x: v ** 3 * start.x + 3 * v * v * u * start.x + 3 * v * u * u * cx + u ** 3 * end.x,
      y: v ** 3 * start.y + 3 * v * v * u * cy + 3 * v * u * u * end.y + u ** 3 * end.y,
    };
  }, creep);
}
/** Shared by the DOM card and the actor's contact geometry. Canonical milliseconds. */
export function alienCardPose(plan: AlienPlan, ms: number, facing: number) {
  const lift = beat(ms, 400, 850) * (1 - beat(ms, 2550, 3100));
  const scanning = beat(ms, 1000, 1120) * (1 - beat(ms, 2220, 2360));
  const tremble = Math.sin(((ms - 1000) / 1200) * Math.PI * 2 * plan.scans) * scanning;
  const kick = plan.malfunction
    ? Math.sin(clamp((ms - 2070) / 360) * Math.PI * 4) *
      (1 - beat(ms, 2200, 2430)) *
      beat(ms, 2070, 2100)
    : 0;
  return {
    lift,
    scanning,
    angle: facing * (lift * plan.tilt + tremble * 0.55 + kick * 1.8),
    rise: -lift * 2,
    kick,
  };
}
export function alienCardPoint(
  plan: AlienPlan,
  b: TargetBounds,
  ms: number,
  facing: number,
  u: number,
  v: number,
): Point {
  const pose = alienCardPose(plan, ms, facing);
  const pivot = facing > 0 ? b.width : 0;
  const dx = b.width * u - pivot;
  const dy = b.height * (v - 1);
  const a = (pose.angle * Math.PI) / 180;
  return {
    x: b.left + pivot + dx * Math.cos(a) - dy * Math.sin(a),
    y: b.top + b.height + dx * Math.sin(a) + dy * Math.cos(a) + pose.rise,
  };
}
export function alienCardAnimation(
  facing: number,
  plan = alienPlan('landing'),
  size: Pick<TargetBounds, 'width' | 'height'> = { width: 84, height: 122 },
): { frames: Keyframe[]; options: KeyframeAnimationOptions } {
  const frames: Keyframe[] = [];
  for (let i = 0; i <= 160; i++) {
    const pose = alienCardPose(plan, (i / 160) * 3300, facing);
    const angle = (pose.angle * Math.PI) / 180;
    // Keep the existing rotateY reveal centered; translate the center along the corner's arc.
    const dx =
      ((facing * size.width) / 2) * (1 - Math.cos(angle)) + (size.height / 2) * Math.sin(angle);
    const dy =
      ((-facing * size.width) / 2) * Math.sin(angle) +
      (size.height / 2) * (1 - Math.cos(angle)) +
      pose.rise;
    frames.push({
      offset: i / 160,
      transformOrigin: '50% 50%',
      rotate: `${pose.angle}deg`,
      translate: `${dx}px ${dy}px`,
    });
  }
  return { frames, options: { duration: 3300 * plan.pace, easing: 'linear' } };
}
