import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFit,
  cardFrames,
  chooseSide,
  clamp,
  ease,
  pulse,
  sidePoint,
  span,
  NEUTRAL_CARD,
  type CardPose,
  type Side,
} from '../../kit';

export const TURKEY_DURATION = 10400;
export const TURKEY_SCALE = 1.15;
/** Gap between the card's near edge and the turkey's feet, in model units. */
export const TURKEY_GAP = 22;
/** The floor line beside the card, as a fraction of the card height. */
export const TURKEY_FLOOR_V = 1.04;
/** Loose body feathers on the model that can be shaken off in the panic. */
export const TURKEY_LOOSE = 6;
/** Height of the body centre above the feet, so the strut leaves from the sender's card centre. */
export const TURKEY_BODY_CENTRE = 30;
export const PECK_WIND = 180;
export const PECK_STRIKE = 70;
export const PECK_HOLD = 70;
export const PECK_RECOIL = 150;
export const TRIGGER_LENGTH = 520;

export type TurkeyBeat = 'gobble' | 'glance' | 'puff';
export type TurkeyTrigger = 'wobble' | 'flip' | 'lunge';
export type TurkeyEscape = 'run' | 'flight';

export interface TurkeyPeck {
  /** Canonical ms at which the beak tip meets the card. */
  readonly at: number;
  /** Across the card from its near edge (the side the turkey stands on). */
  readonly u: number;
  readonly v: number;
  readonly strength: number;
}

export interface TurkeyPlan {
  readonly kind: '🦃';
  readonly side: Side;
  readonly pace: number;
  /** Canonical ms at which the strut arrives at the stand point. */
  readonly travel: number;
  readonly bend: number;
  readonly weave: number;
  readonly stride: number;
  readonly surge: number;
  readonly cadence: number;
  readonly beat: TurkeyBeat;
  readonly beatAt: number;
  readonly beatDepth: number;
  readonly earlyFan: boolean;
  readonly shimmies: number;
  readonly swivel: number;
  readonly fanHold: number;
  readonly pecks: readonly TurkeyPeck[];
  readonly trigger: TurkeyTrigger;
  readonly shock: number;
  readonly jump: number;
  readonly escape: TurkeyEscape;
  readonly exitRise: number;
  /** Indices of the model's loose feathers that come off, in release order. */
  readonly loose: readonly number[];
  readonly births: readonly number[];
  readonly falls: readonly number[];
  readonly sways: readonly number[];
  readonly phase: number;
  readonly displayStart: number;
  readonly displayEnd: number;
  readonly triggerAt: number;
  readonly startle: number;
  readonly land: number;
  readonly departure: number;
  readonly exitEnd: number;
  readonly recover: number;
}

const BEATS: readonly TurkeyBeat[] = ['gobble', 'glance', 'puff'];
const TRIGGERS: readonly TurkeyTrigger[] = ['wobble', 'flip', 'lunge'];

export function turkeyPlan(id: string): TurkeyPlan {
  const r = seededRandom(`${id}:turkey-v2`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.92 + r() * 0.16;
  const travel = 2000 + r() * 500;
  const bend = r() * 2 - 1;
  const weave = r();
  const stride = 13 + r() * 4;
  const surge = 0.15 + r() * 0.15;
  const cadence = 4.5 + r() * 3;
  const beat = BEATS[Math.floor(r() * BEATS.length)] ?? 'gobble';
  const beatAt = 0.38 + r() * 0.22;
  const beatDepth = 0.3 + r() * 0.15;
  const earlyFan = r() < 0.5;
  const display = 800 + r() * 500;
  const shimmies = r() < 0.5 ? 2 : 3;
  const swivel = 0.25 + r() * 0.65;
  const fanHold = 0.35 + r() * 0.65;
  const displayStart = travel + 140;
  const displayEnd = displayStart + display;
  const count = 2 + Math.floor(r() * 3);
  const pecks: TurkeyPeck[] = [];
  let at = displayEnd + 300 + r() * 120;
  for (let k = 0; k < count; k++) {
    // The last peck is the hardest: the pompous one that sets the card off.
    const strength = (0.75 + r() * 0.35) * (k === count - 1 ? 1.3 : 1);
    // Pecks land near the card's edge, below the value and within reach of the neck.
    pecks.push({ at, u: 0.04 + r() * 0.14, v: 0.6 + r() * 0.22, strength });
    at += 360 + r() * 140;
  }
  const lastPeck = pecks[count - 1]?.at ?? displayEnd;
  const trigger = TRIGGERS[Math.floor(r() * TRIGGERS.length)] ?? 'wobble';
  const triggerAt = lastPeck + PECK_HOLD + PECK_RECOIL + 320 + r() * 180;
  const shock = 0.85 + r() * 0.35;
  const startle = triggerAt + 260 + r() * 260;
  const jump = 14 + r() * 10;
  const land = startle + 420;
  const escape: TurkeyEscape = r() < 0.5 ? 'run' : 'flight';
  const exitRise = r() * 2 - 1;
  const departure = land + 60;
  const exitEnd = departure + (escape === 'run' ? 1200 : 1400) + r() * 300;
  const feathers = 3 + Math.floor(r() * 4);
  const order = Array.from({ length: TURKEY_LOOSE }, (_, i) => ({ i, key: r() }))
    .sort((a, b) => a.key - b.key)
    .map((o) => o.i);
  const loose = order.slice(0, feathers);
  const births = loose.map((_, k) =>
    k < 3 ? startle + 150 + k * 55 + r() * 30 : departure + 120 + (k - 3) * 130 + r() * 40,
  );
  const falls = loose.map(() => r());
  const sways = loose.map(() => r());
  const phase = r() * Math.PI * 2;
  return {
    kind: '🦃',
    side,
    pace,
    travel,
    bend,
    weave,
    stride,
    surge,
    cadence,
    beat,
    beatAt,
    beatDepth,
    earlyFan,
    shimmies,
    swivel,
    fanHold,
    pecks,
    trigger,
    shock,
    jump,
    escape,
    exitRise,
    loose,
    births,
    falls,
    sways,
    phase,
    displayStart,
    displayEnd,
    triggerAt,
    startle,
    land,
    departure,
    exitEnd,
    recover: triggerAt + TRIGGER_LENGTH + 380,
  };
}

/** Feet beside the card on the chosen side; the side survives reflow, edges flip it on first placement. */
export function turkeyLandingPoint(
  p: TurkeyPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  return sidePoint(
    chooseSide(p.side, b, view, chosen),
    b,
    view,
    TURKEY_GAP * TURKEY_SCALE * cardFit(b),
    TURKEY_FLOOR_V,
  );
}
export const turkeyFloor = (b: TargetBounds) => b.top + b.height * TURKEY_FLOOR_V;

/** Off-screen on the side away from the card: along the floor for a run, up and away for a flight. */
export function turkeyExitPoint(p: TurkeyPlan, b: TargetBounds, view: Point, side: Side): Point {
  const stand = turkeyLandingPoint(p, b, view, side);
  const x = side > 0 ? -130 : view.x + 130;
  if (p.escape === 'run')
    return { x, y: Math.max(90, Math.min(view.y - 6, stand.y + p.exitRise * 60)) };
  return { x, y: Math.max(40, stand.y - 120 - 70 * (p.exitRise + 1)) };
}

/** How strongly the seeded acted beat (gobble, glance or puff) is playing at approach fraction t. */
export function turkeyBeatAmount(p: TurkeyPlan, t: number): number {
  return Math.sin(Math.PI * clamp((t - p.beatAt + 0.09) / 0.18)) ** 2;
}

/**
 * Strut speed: a surge on every pompous step, a slower (never stopped) acted beat, and smooth
 * acceleration from the sender and braking at the card.
 */
export function turkeyStrutSpeed(p: TurkeyPlan, t: number): number {
  const envelope = ease(t / 0.13) * ease((1 - t) / 0.13);
  const rhythm = 1 + p.surge * Math.sin(Math.PI * 2 * p.cadence * t + p.phase);
  return envelope * rhythm * (1 - p.beatDepth * turkeyBeatAmount(p, t));
}

const STRUT_CELLS = 240;
function strutIntegral(p: TurkeyPlan, t: number): number {
  const x = clamp(t) * STRUT_CELLS,
    whole = Math.floor(x);
  let sum = 0,
    previous = turkeyStrutSpeed(p, 0);
  for (let i = 1; i <= whole; i++) {
    const next = turkeyStrutSpeed(p, i / STRUT_CELLS);
    sum += (previous + next) / 2;
    previous = next;
  }
  const rest = x - whole;
  if (rest > 0) {
    const next = turkeyStrutSpeed(p, Math.min(1, (whole + 1) / STRUT_CELLS));
    sum += (rest * (previous + (previous + (next - previous) * rest))) / 2;
  }
  return sum / STRUT_CELLS;
}
/** Fraction of the route covered at approach fraction t. */
export function turkeyStrut(p: TurkeyPlan, t: number): number {
  return clamp(strutIntegral(p, t) / strutIntegral(p, 1));
}

/** Damped knock: zero at the moment of contact, a quick push and a springy settle. */
function knock(t: number): number {
  if (t <= 0) return 0;
  return (1 - Math.exp(-t / 16)) * Math.exp(-t / 170) * Math.cos(t / 55);
}

/** The card is knocked away from each peck, then comes alive and startles the turkey. */
export function turkeyCardPose(p: TurkeyPlan, ms: number, facing: number): CardPose {
  const first = p.pecks[0]?.at ?? p.triggerAt;
  if (ms < first || ms >= p.recover) return NEUTRAL_CARD;
  let x = 0,
    y = 0,
    angle = 0,
    sx = 1,
    sy = 1;
  for (const peck of p.pecks) {
    const k = knock(ms - peck.at) * peck.strength;
    x += facing * 3.4 * k;
    y += 0.9 * k;
    // A knock below the centre swings the bottom away and the top toward the turkey.
    angle += -facing * (peck.v - 0.5) * 12 * k;
    sx -= 0.015 * Math.max(0, k);
  }
  const t = ms - p.triggerAt;
  if (t > 0) {
    if (p.trigger === 'wobble') {
      const shake = (1 - Math.exp(-t / 30)) * Math.exp(-t / 200);
      angle += 8 * p.shock * Math.sin(t / 42) * shake;
      y -= 5 * p.shock * pulse(t, 0, 220);
    } else if (p.trigger === 'flip') {
      // A fast half-turn that flashes the card's face back at the turkey.
      const turn = Math.sin(Math.PI * span(t, 0, 300));
      sx -= 0.32 * p.shock * turn;
      angle += facing * 3 * p.shock * turn;
      y -= 4 * p.shock * turn;
    } else {
      const lunge = ease(t / 80) * (1 - ease((t - 140) / 280));
      x -= facing * 15 * p.shock * lunge;
      angle -= facing * 4 * p.shock * lunge;
      sx += 0.04 * lunge;
      sy += 0.03 * lunge;
    }
  }
  const settle = 1 - span(ms, p.recover - 250, 250);
  return {
    x: x * settle,
    y: y * settle,
    angle: angle * settle,
    sx: 1 + (sx - 1) * settle,
    sy: 1 + (sy - 1) * settle,
  };
}

export function turkeyFrames(p: TurkeyPlan, facing: number) {
  return cardFrames(TURKEY_DURATION, p.pace, (ms) => turkeyCardPose(p, ms, facing));
}
