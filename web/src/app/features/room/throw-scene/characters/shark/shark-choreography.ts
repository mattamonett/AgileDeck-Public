import { clamp, ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import { landingVariation, type TargetBounds } from '../../landing/landing-geometry';
import { evenParameter, lingeringProgress } from '../../flight/approach-flow';
export const SHARK_DURATION = 5600;
export const SHARK_SCALE = 0.85;
export const sharkEase = ease;
export interface SharkPlan {
  readonly pace: number;
  readonly bites: readonly number[];
  readonly force: number;
  readonly bend: number;
  readonly hover: number;
  readonly tail: number;
  readonly departure: number;
  readonly exit: number;
  readonly spot: Point;
}
export function sharkPlan(id: string): SharkPlan {
  const random = seededRandom(id + ':predatory-shark');
  const count = random() < 0.5 ? 2 : 3;
  return {
    pace: 0.9 + random() * 0.2,
    force: 0.85 + random() * 0.3,
    bend: (random() < 0.5 ? -1 : 1) * (35 + random() * 35),
    hover: 0.03 + random() * 0.06,
    tail: 0.85 + random() * 0.3,
    departure: 3000 + random() * 180,
    exit: 0.9 + random() * 0.2,
    spot: landingVariation(id),
    bites: Array.from({ length: count }, (_, i) => 650 + i * 760 + random() * 40 - 20),
  };
}
export function sharkLandingPoint(
  plan: SharkPlan,
  b: TargetBounds,
  viewport: Point,
  chosenFacing?: number,
): Point {
  let facing = chosenFacing ?? (plan.spot.x < 0.5 ? 1 : -1);
  if (chosenFacing === undefined) {
    if (b.left < 105 && b.left + b.width + 105 < viewport.x) facing = -1;
    else if (b.left + b.width > viewport.x - 105 && b.left > 105) facing = 1;
  }
  return {
    x: facing > 0 ? b.left - 42 : b.left + b.width + 42,
    y: b.top + b.height * (0.35 + plan.spot.y * 0.2),
  };
}
/** The hunting beat is a slow, circling glide that keeps swimming rather than a frozen hover. */
function swimProgress(plan: SharkPlan, progress: number) {
  return lingeringProgress(progress, 0.65, 0.78, plan.hover);
}
function sharkCurve(
  plan: SharkPlan,
  start: Point,
  end: Point,
  viewport: Point,
  facing: number,
  t: number,
): Point {
  const s = 1 - t;
  const x = (n: number) => Math.max(45, Math.min(viewport.x - 45, n));
  const y = (n: number) => Math.max(50, Math.min(viewport.y - 45, n));
  return {
    x:
      s ** 3 * start.x +
      3 * s * s * t * x(start.x + (end.x - start.x) * 0.25) +
      3 * s * t * t * x(end.x - facing * 65) +
      t ** 3 * end.x,
    y:
      s ** 3 * start.y +
      3 * s * s * t * y(start.y + plan.bend) +
      3 * s * t * t * y(end.y + plan.bend) +
      t ** 3 * end.y,
  };
}
/** The curve parameter reached at `progress`, swimming evenly along the curve's length. */
function swimParameter(
  plan: SharkPlan,
  start: Point,
  end: Point,
  viewport: Point,
  facing: number,
  progress: number,
) {
  return evenParameter(
    (t) => sharkCurve(plan, start, end, viewport, facing, t),
    swimProgress(plan, progress),
  );
}
export function sharkApproach(
  plan: SharkPlan,
  start: Point,
  end: Point,
  viewport: Point,
  facing: number,
  progress: number,
): Point {
  return sharkCurve(
    plan,
    start,
    end,
    viewport,
    facing,
    swimParameter(plan, start, end, viewport, facing, progress),
  );
}
export function sharkTangent(
  plan: SharkPlan,
  start: Point,
  end: Point,
  viewport: Point,
  facing: number,
  progress: number,
): Point {
  const t = swimParameter(plan, start, end, viewport, facing, progress);
  const s = 1 - t;
  const x = (n: number) => Math.max(45, Math.min(viewport.x - 45, n));
  const y = (n: number) => Math.max(50, Math.min(viewport.y - 45, n));
  const ax = x(start.x + (end.x - start.x) * 0.25);
  const bx = x(end.x - facing * 65);
  const ay = y(start.y + plan.bend);
  const by = y(end.y + plan.bend);
  return {
    x: 3 * s * s * (ax - start.x) + 6 * s * t * (bx - ax) + 3 * t * t * (end.x - bx),
    y: 3 * s * s * (ay - start.y) + 6 * s * t * (by - ay) + 3 * t * t * (end.y - by),
  };
}
export function sharkTipWorld(pose: {
  x: number;
  y: number;
  jaw: number;
  yaw: number;
  bank: number;
}) {
  const tip = sharkTip(pose.jaw);
  const x = tip.x * Math.cos(pose.yaw);
  return {
    x: pose.x + SHARK_SCALE * (x * Math.cos(pose.bank) - tip.y * Math.sin(pose.bank)),
    y: pose.y - SHARK_SCALE * (x * Math.sin(pose.bank) + tip.y * Math.cos(pose.bank)),
    z: 160 - SHARK_SCALE * tip.x * Math.sin(pose.yaw),
  };
}
export function sharkJaw(ms: number, contact: number, plan: SharkPlan) {
  const open = sharkEase((ms - contact + 350) / 160) * (1 - sharkEase((ms - contact + 120) / 120));
  const recover = sharkEase((ms - contact - 100) / 160);
  return -open * 0.7 * plan.force - recover * 0.08;
}
export function sharkTip(jaw: number): Point {
  return {
    x: 10 + 23.5 * Math.cos(jaw) - 4 * Math.sin(jaw),
    y: -5 + 23.5 * Math.sin(jaw) + 4 * Math.cos(jaw),
  };
}
export function sharkBitePoint(
  plan: SharkPlan,
  b: TargetBounds,
  facing: number,
  index: number,
): Point {
  return {
    x: facing > 0 ? b.left + b.width * 0.1 : b.left + b.width * 0.9,
    y: b.top + b.height * (0.35 + plan.spot.y * 0.2 + index * 0.13),
  };
}
export function sharkCardPose(ms: number, plan: SharkPlan, facing: number) {
  let hit = 0;
  for (const bite of plan.bites) {
    const age = ms - bite;
    if (age >= 0 && age <= 300) hit = Math.sin((age / 300) * Math.PI);
  }
  if (hit === 0) return { x: 0, y: 0, angle: 0, sx: 1 };
  return {
    x: hit * facing * 2.8 * plan.force,
    y: hit * 1.6 * plan.force,
    angle: hit * facing * 1.6 * plan.force,
    sx: 1 - hit * 0.025 * plan.force,
  };
}
export function sharkCardPoint(
  ms: number,
  raw: Point,
  b: TargetBounds,
  plan: SharkPlan,
  facing: number,
): Point {
  const pose = sharkCardPose(ms, plan, facing);
  const a = (pose.angle * Math.PI) / 180;
  const dx = (raw.x - b.left - b.width / 2) * pose.sx;
  const dy = raw.y - b.top - b.height / 2;
  return {
    x: b.left + b.width / 2 + dx * Math.cos(a) - dy * Math.sin(a) + pose.x,
    y: b.top + b.height / 2 + dx * Math.sin(a) + dy * Math.cos(a) + pose.y,
  };
}
export function sharkActorPose(
  ms: number,
  plan: SharkPlan,
  b: TargetBounds,
  end: Point,
  viewport: Point,
  facing: number,
) {
  const departure = clamp((ms - plan.departure) / (1500 * plan.exit));
  if (ms >= plan.departure) {
    const turn = sharkEase(departure / 0.24);
    const swim = sharkEase((departure - 0.12) / 0.88);
    const exitX = facing > 0 ? -110 : viewport.x + 110;
    return {
      x: end.x + (exitX - end.x) * swim,
      y: end.y + Math.sin(departure * Math.PI) * Math.abs(plan.bend),
      yaw: facing > 0 ? turn * Math.PI : Math.PI - turn * Math.PI,
      bank: -facing * Math.sin(departure * Math.PI) * 0.2,
      jaw: -0.08,
      visible: ms < Math.round((plan.departure + 1500 * plan.exit) * 1e6) / 1e6,
      index: -1,
    };
  }
  for (const [index, contact] of plan.bites.entries())
    if (ms >= contact - 350 && ms <= contact + 420) {
      const jaw = sharkJaw(ms, contact, plan);
      const tip = sharkTip(jaw);
      const p = sharkCardPoint(ms, sharkBitePoint(plan, b, facing, index), b, plan, facing);
      const advance =
        sharkEase((ms - contact + 230) / 230) * (1 - sharkEase((ms - contact - 200) / 220));
      return {
        x: end.x + (p.x - facing * SHARK_SCALE * tip.x - end.x) * advance,
        y: end.y + (p.y + SHARK_SCALE * tip.y - end.y) * advance,
        yaw: facing > 0 ? 0 : Math.PI,
        bank: 0,
        jaw,
        visible: true,
        index,
      };
    }
  const last = plan.bites.at(-1) ?? 650;
  return {
    ...end,
    yaw: facing > 0 ? 0 : Math.PI,
    bank: 0,
    jaw: ms > last + 420 ? -0.08 - (1 + Math.sin((ms - last) / 110)) * 0.05 : -0.08,
    visible: true,
    index: -1,
  };
}
