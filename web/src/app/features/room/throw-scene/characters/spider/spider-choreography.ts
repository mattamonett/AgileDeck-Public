import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  bezier,
  cardFrames,
  chooseSide,
  clamp,
  ease,
  mix,
  pulse,
  span,
  withSlow,
  NEUTRAL_CARD,
  type CardPose,
  type Side,
} from '../../kit';

export const SPIDER_DURATION = 9000;
export const SPIDER_SCALE = 1.1;
/** Where the spider sits on the card while it works: above the value, near the top. */
export const SPIDER_HUB = { u: 0.5, v: 0.22 } as const;

export interface SpiderPlan {
  readonly kind: '🕷️';
  readonly side: Side;
  readonly pace: number;
  readonly travel: number;
  readonly bend: number;
  readonly bursts: readonly number[];
  readonly plummet: boolean;
  readonly spokes: number;
  readonly turn: Side;
  readonly squeeze: number;
  readonly bites: number;
  readonly biteAngle: number;
  readonly climb: boolean;
  readonly phase: number;
  readonly descend: number;
  readonly landed: number;
  readonly weave: number;
  readonly tighten: number;
  readonly rear: number;
  readonly strikes: readonly number[];
  readonly departure: number;
  readonly exitEnd: number;
}

export function spiderPlan(id: string): SpiderPlan {
  const r = seededRandom(`${id}:giant-spider-v2`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const travel = 1450 + r() * 400;
  const bend = r() * 2 - 1;
  const bursts = [0.25 + r() * 0.15, 0.55 + r() * 0.15];
  const plummet = r() < 0.5;
  const spokes = r() < 0.5 ? 6 : 8;
  const turn: Side = r() < 0.5 ? -1 : 1;
  const squeeze = 0.85 + r() * 0.35;
  const bites = r() < 0.5 ? 1 : 2;
  const biteAngle = (r() * 2 - 1) * 0.5;
  const climb = r() < 0.5;
  const phase = r() * Math.PI * 2;
  const descend = travel + 120;
  const landed = descend + (plummet ? 900 : 1100);
  const weave = landed + 240;
  const tighten = weave + spokes * 120 + 620;
  const rear = tighten + 460;
  const strikes = Array.from({ length: bites }, (_, i) => rear + 300 + i * 760);
  const departure = (strikes.at(-1) ?? rear) + 900;
  const exitEnd = departure + (climb ? 1250 : 1500);
  return {
    kind: '🕷️',
    side,
    pace,
    travel,
    bend,
    bursts,
    plummet,
    spokes,
    turn,
    squeeze,
    bites,
    biteAngle,
    climb,
    phase,
    descend,
    landed,
    weave,
    tighten,
    rear,
    strikes,
    departure,
    exitEnd,
  };
}

/** The dragline hangs from just above the viewport, over the card. */
export function spiderAnchor(b: TargetBounds, side: Side): Point {
  return { x: b.left + b.width * (0.5 - side * 0.08), y: -40 };
}
/** Landing point used for facing: the side of the card the spider scuttles in from. */
export function spiderLandingPoint(
  p: SpiderPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  const side = chooseSide(p.side, b, view, chosen);
  return { x: side > 0 ? b.left - 20 : b.left + b.width + 20, y: b.top };
}

/** Skittering progress: bursts of speed with sudden slow, wary creeps between them — never a dead stop. */
export function spiderProgress(p: SpiderPlan, t: number): number {
  let u = clamp(t);
  for (const at of p.bursts) u = withSlow(u, at, 0.1, 0.42);
  return ease(u) * 0.2 + u * 0.8;
}

/** Scuttles from the sender up the side of the table and out of view above the card. */
export function spiderRoute(
  p: SpiderPlan,
  u: number,
  start: Point,
  b: TargetBounds,
  view: Point,
  side: Side,
): Point {
  const anchor = spiderAnchor(b, side);
  const outer = side > 0 ? Math.max(30, b.left - 70) : Math.min(view.x - 30, b.left + b.width + 70);
  return bezier(
    start,
    { x: mix(start.x, outer, 0.5), y: start.y - 40 - p.bend * 40 },
    { x: outer, y: Math.min(b.top - 40, 120) },
    anchor,
    clamp(u),
  );
}

/** Legs gather and the body turns head-down over the last moments of the climb. */
export function spiderFold(p: SpiderPlan, ms: number): number {
  return span(ms, p.travel - 240, 240);
}

/** Card-local position of the spider's body on its line or on the card. */
export function spiderDrop(p: SpiderPlan, ms: number): number {
  const t = span(ms, p.descend, p.landed - p.descend);
  if (!p.plummet) {
    // Lowers in steps: pays out silk, pauses, then settles.
    const steps = 3,
      k = Math.min(steps - 1, Math.floor(t * steps)),
      within = t * steps - k;
    return (k + ease(Math.min(1, within / 0.7))) / steps;
  }
  // Drops fast, overshoots as the dragline stretches, and bounces to rest.
  const fall = ease(Math.min(1, t / 0.55));
  const after = (t - 0.55) / 0.45;
  const bounce = t > 0.55 ? Math.sin(after * Math.PI * 2.5) * Math.exp(-after * 4) * 0.08 : 0;
  return Math.min(1.08, fall + bounce);
}

export function spiderBiteSpot(p: SpiderPlan, i: number): { u: number; v: number } {
  const a = p.biteAngle + (i ? 0.9 * p.turn : 0);
  return { u: 0.5 + Math.sin(a) * 0.22, v: 0.1 + (1 - Math.cos(a)) * 0.05 };
}

export function spiderCardPose(p: SpiderPlan, ms: number, facing: number): CardPose {
  if (ms < p.landed || ms >= p.departure + 700) return NEUTRAL_CARD;
  // The spider's weight lands; the tightening web compresses the card; each bite makes it convulse.
  const land = pulse(ms, p.landed, 220);
  const press = ease((ms - p.tighten) / 420) * (1 - ease((ms - p.departure) / 500));
  let angle = 0,
    x = 0,
    y = 2.5 * land;
  for (const s of p.strikes) {
    const t = ms - s;
    if (t < 0) continue;
    const shake = Math.exp(-t / 220);
    angle += Math.sin(t / 26) * 4 * shake * p.squeeze;
    x += Math.sin(t / 19) * 1.6 * shake;
    y += 2 * pulse(ms, s, 120);
  }
  angle += -facing * 1.2 * press * Math.sin(ms / 140 + p.phase) * 0.4;
  return {
    x,
    y,
    angle,
    sx: 1 - 0.07 * press * p.squeeze + 0.03 * land,
    sy: 1 - 0.05 * press * p.squeeze - 0.04 * land,
  };
}

export function spiderFrames(p: SpiderPlan, facing: number) {
  return cardFrames(SPIDER_DURATION, p.pace, (ms) => spiderCardPose(p, ms, facing));
}
