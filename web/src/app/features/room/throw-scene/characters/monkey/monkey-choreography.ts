import { clamp, ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { lingeringProgress, roundedRoute } from '../../flight/approach-flow';

export const MONKEY_DURATION = 7000;
export const MONKEY_SCALE = 0.8;
export const monkeyEase = ease;
export interface MonkeyShot {
  readonly release: number;
  readonly flight: number;
  readonly arc: number;
  readonly bend: number;
  readonly u: number;
  readonly v: number;
}
export interface MonkeyPlan {
  readonly pace: number;
  readonly force: number;
  readonly pause: number;
  readonly step: number;
  readonly retreat: number;
  readonly duck: number;
  readonly wink: boolean;
  readonly shots: readonly MonkeyShot[];
}
export function monkeyPlan(id: string): MonkeyPlan {
  const random = seededRandom(id + ':monkey-mischief');
  return {
    pace: 0.9 + random() * 0.2,
    force: 0.85 + random() * 0.3,
    pause: 80 + random() * 100,
    step: 0.85 + random() * 0.3,
    retreat: 4000 + random() * 200,
    duck: 160 + random() * 160,
    wink: random() < 0.5,
    shots: Array.from({ length: 4 }, (_, i) => ({
      release: 820 + i * 650 + random() * 50 - 25,
      flight: 580 + random() * 140,
      arc: 50 + random() * 35,
      bend: random() * 30 - 15,
      u: (i % 2 ? 0.79 : 0.21) + random() * 0.05 - 0.025,
      v: 0.22 + i * 0.16 + random() * 0.05,
    })),
  };
}
export function monkeyFacing(source: TargetBounds, target: TargetBounds) {
  return target.left + target.width / 2 >= source.left + source.width / 2 ? 1 : -1;
}
export function monkeyStage(source: TargetBounds, target: TargetBounds, viewport: Point): Point {
  const facing = monkeyFacing(source, target);
  return {
    x: Math.max(
      36,
      Math.min(viewport.x - 36, source.left + source.width / 2 + facing * (source.width / 2 + 31)),
    ),
    y: source.top + source.height - 14,
  };
}
export function monkeyPosition(
  ms: number,
  plan: MonkeyPlan,
  source: TargetBounds,
  target: TargetBounds,
  viewport: Point,
) {
  const stage = monkeyStage(source, target, viewport);
  const cx = source.left + source.width / 2;
  const peekY = source.top + 14;
  const rise = 46;
  const reach = Math.hypot(stage.x - cx, stage.y - peekY);
  const appear = 250 + plan.pause + 300;
  // The peek over the card slows to a curious look while the monkey keeps easing out, never freezing.
  const travel = lingeringProgress(
    ms / appear,
    250 / appear,
    rise / (rise + reach),
    plan.pause / appear,
  );
  const step = clamp((travel * (rise + reach) - rise) / reach);
  const retreat = monkeyEase((ms - plan.retreat) / 550);
  const duck = monkeyEase((ms - plan.retreat - 550 - plan.duck) / 300);
  const out = step * (1 - retreat);
  const at =
    retreat > 0
      ? { x: cx + (stage.x - cx) * out, y: peekY + out * (stage.y - peekY) }
      : roundedRoute([{ x: cx, y: peekY + rise }, { x: cx, y: peekY }, stage], travel, 12);
  return {
    x: at.x,
    y: at.y + duck * 55,
    clip: source.top + out * (source.height + 10),
    visible: ms < plan.retreat + 550 + plan.duck + 300,
    out,
  };
}
export function monkeyThrowPose(ms: number, plan: MonkeyPlan) {
  for (const shot of plan.shots)
    if (ms >= shot.release - 300 && ms <= shot.release + 220) {
      const windup =
        monkeyEase((ms - shot.release + 300) / 180) *
        (1 - monkeyEase((ms - shot.release + 80) / 80));
      const fling =
        monkeyEase((ms - shot.release + 80) / 80) * (1 - monkeyEase((ms - shot.release) / 220));
      return {
        x: 18 - windup * 26 + fling * (16 + plan.force * 2),
        y: -5 + windup * 36 + fling * 21,
        angle: -windup * 0.35 + fling * 0.1,
        lean: -windup * 0.06 + fling * 0.06 * plan.force,
        shift: fling * 3 * plan.force,
      };
    }
  return { x: 18, y: -5, angle: 0, lean: 0, shift: 0 };
}
export function monkeyReleasePoint(
  plan: MonkeyPlan,
  shot: MonkeyShot,
  source: TargetBounds,
  target: TargetBounds,
  viewport: Point,
): Point {
  const stage = monkeyPosition(shot.release, plan, source, target, viewport);
  const pose = monkeyThrowPose(shot.release, plan);
  const facing = monkeyFacing(source, target);
  const gx = pose.x - Math.sin(pose.angle) * 6.9;
  const gy = pose.y + Math.cos(pose.angle) * 6.9;
  return {
    x:
      stage.x +
      facing * MONKEY_SCALE * (pose.shift + gx * Math.cos(pose.lean) - gy * Math.sin(pose.lean)),
    y: stage.y - MONKEY_SCALE * (gx * Math.sin(pose.lean) + gy * Math.cos(pose.lean)),
  };
}
export function monkeyImpact(shot: MonkeyShot, b: TargetBounds): Point {
  return { x: b.left + b.width * shot.u, y: b.top + b.height * shot.v };
}
export function monkeyCardPose(ms: number, plan: MonkeyPlan, facing: number) {
  let hit = 0;
  for (const shot of plan.shots) {
    const age = ms - shot.release - shot.flight;
    if (age >= 0 && age < 220) hit = Math.sin((age / 220) * Math.PI);
  }
  if (hit === 0) return { x: 0, y: 0, angle: 0, sx: 1 };
  return {
    x: facing * hit * 2 * plan.force,
    y: hit * 1.5 * plan.force,
    angle: facing * hit * 1.1 * plan.force,
    sx: 1 - hit * 0.016 * plan.force,
  };
}
export function monkeyCardPoint(
  ms: number,
  raw: Point,
  b: TargetBounds,
  plan: MonkeyPlan,
  facing: number,
): Point {
  const pose = monkeyCardPose(ms, plan, facing);
  const angle = (pose.angle * Math.PI) / 180;
  const dx = (raw.x - b.left - b.width / 2) * pose.sx;
  const dy = raw.y - b.top - b.height / 2;
  return {
    x: b.left + b.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle) + pose.x,
    y: b.top + b.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) + pose.y,
  };
}
export function monkeyFlight(
  ms: number,
  plan: MonkeyPlan,
  shot: MonkeyShot,
  source: TargetBounds,
  target: TargetBounds,
  viewport: Point,
): Point {
  const start = monkeyReleasePoint(plan, shot, source, target, viewport);
  const facing = monkeyFacing(source, target);
  const end = monkeyCardPoint(ms, monkeyImpact(shot, target), target, plan, facing);
  const t = clamp((ms - shot.release) / shot.flight);
  const s = 1 - t;
  const controlY = Math.max(45, Math.min(start.y, end.y) - shot.arc);
  return {
    x: s * s * start.x + 2 * s * t * ((start.x + end.x) / 2 + shot.bend) + t * t * end.x,
    y: s * s * start.y + 2 * s * t * controlY + t * t * end.y,
  };
}
