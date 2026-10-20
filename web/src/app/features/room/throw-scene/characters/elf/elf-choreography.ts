import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  bezier,
  cardFrames,
  chooseSide,
  clamp,
  ease,
  keepInView,
  mix,
  pulse,
  sidePoint,
  span,
  NEUTRAL_CARD,
  type CardPose,
  type Side,
} from '../../kit';

export const ELF_DURATION = 11000;
export const ELF_SCALE = 1.4;
/** The elf's floor line, just under the card's bottom edge so its hands reach the card's waist. */
export const ELF_FLOOR_V = 1.01;
/** Ribbon colours: festive red, gold and blue. */
export const ELF_RIBBONS = [0xc8202f, 0xe2b23a, 0x2f6fd0] as const;
/** Length of loose ribbon dragged behind the elf once it has come off the card, in px at full size. */
export const ELF_TRAIL = 60;
/** Each wrap is pulled back off the card in this many ms. */
export const ELF_PEEL = 170;
/** Top running speed on the way out, px per ms. */
export const ELF_SPRINT = 1.4;

export interface ElfPlan {
  readonly kind: '🧝';
  readonly side: Side;
  readonly pace: number;
  /** Canonical ms at which the approach ends at the card. */
  readonly travel: number;
  readonly bend: number;
  /** Amplitude of the fussy zig-zag in the route, 0.55..1. */
  readonly winding: number;
  /** Number of S-turns in the route. */
  readonly weaves: number;
  /** Size and count of the brisk trot surges along the way. */
  readonly surge: number;
  readonly surges: number;
  /** Acted beat on the way: a happy skip (true) or a fussy spool check while still walking (false). */
  readonly skip: boolean;
  readonly beatAt: number;
  readonly ribbon: number;
  readonly wraps: number;
  readonly wrapMs: number;
  readonly squeeze: number;
  readonly waistV: number;
  readonly bowU: number;
  /** The bow is first tied crooked and fussily straightened, or tied straight and patted. */
  readonly crooked: boolean;
  /** Clockwise screen degrees the crooked bow leans. */
  readonly crook: number;
  /** The slipped spool rolls back away from the card (true) or on past it, downhill under the card. */
  readonly rollBack: boolean;
  readonly rollSpeed: number;
  readonly rollSlope: number;
  /** Leaves holding the spool high in triumph (true) or hugging it and scurrying. */
  readonly proud: boolean;
  readonly phase: number;
  readonly arrive: number;
  readonly pull: number;
  readonly attach: number;
  readonly wrapStart: number;
  readonly wrapEnd: number;
  readonly tie: number;
  readonly tied: number;
  readonly fixed: number;
  readonly slip: number;
  readonly grab: number;
  readonly unthread: number;
  readonly bowGone: number;
  readonly unthreadEnd: number;
  readonly snatch: number;
  readonly exitEnd: number;
}

export function elfPlan(id: string): ElfPlan {
  const r = seededRandom(`${id}:elf-v2`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const travel = 2050 + r() * 400;
  const bend = r() * 2 - 1;
  const winding = 0.55 + r() * 0.45;
  const weaves = r() < 0.5 ? 2 : 3;
  const surge = 0.1 + r() * 0.1;
  const surges = 3 + Math.floor(r() * 3);
  const skip = r() < 0.5;
  const beatAt = 0.38 + r() * 0.22;
  const ribbon = Math.min(2, Math.floor(r() * 3));
  const wraps = r() < 0.5 ? 2 : 3;
  const wrapMs = 430 + r() * 90;
  const squeeze = 0.8 + r() * 0.4;
  const waistV = 0.68 + r() * 0.06;
  const bowU = 0.06 + r() * 0.04;
  const crooked = r() < 0.5;
  const crook = (r() < 0.5 ? -1 : 1) * (16 + r() * 10);
  const rollBack = r() < 0.5;
  const rollSpeed = 0.8 + r() * 0.45;
  const rollSlope = r() * 2 - 1;
  const proud = r() < 0.5;
  const phase = r() * Math.PI * 2;
  const chase = wraps * ELF_PEEL + 850 + r() * 420;
  const exitTime = 1500 + r() * 250;
  const arrive = travel;
  const pull = arrive + 140;
  const attach = pull + 320;
  const wrapStart = attach + 180;
  const wrapEnd = wrapStart + wraps * wrapMs;
  const tie = wrapEnd + 120;
  const tied = tie + 680;
  const fixed = tied + (crooked ? 1080 : 560);
  const slip = fixed + 480;
  const grab = slip + 300;
  const unthread = grab + 80;
  const bowGone = unthread + 220;
  const unthreadEnd = bowGone + wraps * ELF_PEEL;
  const snatch = slip + chase;
  const exitEnd = snatch + exitTime;
  return {
    kind: '🧝',
    side,
    pace,
    travel,
    bend,
    winding,
    weaves,
    surge,
    surges,
    skip,
    beatAt,
    ribbon,
    wraps,
    wrapMs,
    squeeze,
    waistV,
    bowU,
    crooked,
    crook,
    rollBack,
    rollSpeed,
    rollSlope,
    proud,
    phase,
    arrive,
    pull,
    attach,
    wrapStart,
    wrapEnd,
    tie,
    tied,
    fixed,
    slip,
    grab,
    unthread,
    bowGone,
    unthreadEnd,
    snatch,
    exitEnd,
  };
}

export const elfFloor = (b: TargetBounds) => b.top + b.height * ELF_FLOOR_V;

/** Nominal stand point beside the card; the trick refines x from the measured hand. */
export function elfLandingPoint(p: ElfPlan, b: TargetBounds, view: Point, chosen?: number): Point {
  return sidePoint(chooseSide(p.side, b, view, chosen), b, view, 14, ELF_FLOOR_V);
}

/**
 * Brisk trot speed along the route: it accelerates off the sender, surges in little bursts, and
 * either skips (a burst) or slows to fuss with the spool without ever stopping, then brakes neatly.
 */
export function elfSpeed(p: ElfPlan, t: number): number {
  const startUp = 0.2 + 0.8 * ease(t / 0.13);
  const brake = 0.05 + 0.95 * ease((1 - t) / 0.12);
  const trot = 1 + p.surge * Math.sin(Math.PI * 2 * p.surges * t + p.phase);
  const beat = pulse(t, p.beatAt - 0.08, 0.16);
  return startUp * brake * trot * (p.skip ? 1 + 0.3 * beat : 1 - 0.5 * beat);
}

const SPEED_STEPS = 96;
/** Fraction of the route length covered at normalized approach time t (integrated speed). */
export function elfApproach(p: ElfPlan, t: number): number {
  const u = clamp(t);
  let total = 0,
    done = 0;
  for (let i = 0; i < SPEED_STEPS; i++) {
    const a = i / SPEED_STEPS,
      c = (i + 1) / SPEED_STEPS;
    const area = (elfSpeed(p, a) + elfSpeed(p, c)) / (2 * SPEED_STEPS);
    if (c <= u) done += area;
    else if (a < u) done += area * (u - a) * SPEED_STEPS;
    total += area;
  }
  return total > 0 ? done / total : u;
}

/** The winding route: the side route plus a seeded zig-zag that fades out before the card. */
export function elfRoute(
  p: ElfPlan,
  u: number,
  start: Point,
  end: Point,
  b: TargetBounds,
  view: Point,
  side: Side,
): Point {
  const cx = b.left + b.width / 2;
  const crosses = (start.x - cx) * (end.x - cx) < 0 && Math.abs(start.x - cx) > b.width / 2;
  const dx = end.x - start.x,
    dy = end.y - start.y,
    length = Math.hypot(dx, dy) || 1;
  let c1: Point, c2: Point;
  if (crosses) {
    // Beneath the card, then up to the stand point from below, so the brisk stop needs no U-turn.
    const under = Math.min(view.y - 30, b.top + b.height + 42 + 12 * p.bend);
    c1 = { x: start.x + dx * 0.3, y: Math.max(start.y, under) };
    c2 = { x: end.x - side * 6, y: Math.max(end.y + 24, under) };
  } else {
    c1 = { x: start.x + dx * 0.35, y: start.y - p.bend * 70 };
    c2 = { x: end.x - side * 52, y: end.y - p.bend * 28 };
  }
  const base = keepInView(
    bezier(start, keepInView(c1, view), keepInView(c2, view), end, clamp(u)),
    view,
    16,
    40,
  );
  const amount = p.winding * 16 * Math.min(1, length / 220);
  const w = amount * Math.sin(Math.PI * 2 * p.weaves * u) * Math.sin(Math.PI * clamp(u)) ** 1.5;
  return keepInView({ x: base.x - (dy / length) * w, y: base.y + (dx / length) * w }, view, 16, 40);
}

export const elfStrandStart = (p: ElfPlan, k: number) => p.wrapStart + k * p.wrapMs;
/** The tug that cinches each wrap. */
export const elfCinch = (p: ElfPlan, k: number) => elfStrandStart(p, k) + p.wrapMs * 0.74;
/** The last wrap laid is the first one pulled back off the card. */
export const elfPeelStart = (p: ElfPlan, k: number) => p.bowGone + (p.wraps - 1 - k) * ELF_PEEL;
export const elfPeel = (p: ElfPlan, ms: number, k: number) =>
  ease((ms - elfPeelStart(p, k)) / ELF_PEEL);
/** Visible length of wrap k across the card face, 0..1. */
export function elfStrand(p: ElfPlan, ms: number, k: number): number {
  if (k >= p.wraps) return 0;
  return ease((ms - elfStrandStart(p, k)) / (p.wrapMs * 0.5)) * (1 - elfPeel(p, ms, k));
}
/** Height of wrap k at the far edge; every wrap meets at the waist on the near edge. */
export const elfStrandV = (p: ElfPlan, k: number) => p.waistV + (k - (p.wraps - 1) / 2) * 0.03;
/** Number of cinched wraps still squeezing the card. */
export function elfTightness(p: ElfPlan, ms: number): number {
  let tight = 0;
  for (let k = 0; k < p.wraps; k++)
    tight += ease((ms - elfCinch(p, k) + 50) / 150) * (1 - elfPeel(p, ms, k));
  return tight;
}

/** Growth of the bow parts while tying, and their collapse when the spool pulls the bow undone. */
export function elfBow(p: ElfPlan, ms: number) {
  const undo = 1 - ease((ms - p.unthread) / 160);
  const knotUndo = 1 - ease((ms - p.unthread - 80) / 140);
  return {
    knot: ease((ms - p.tie - 80) / 120) * knotUndo,
    first: ease((ms - p.tie - 130) / 240) * undo,
    second: ease((ms - p.tie - 330) / 240) * undo,
    tails: ease((ms - p.tie - 540) / 140) * undo,
  };
}
export const elfPushes = (p: ElfPlan) => [p.tied + 380, p.tied + 700] as const;
/** Clockwise screen degrees of the bow relative to the card. */
export function elfBowAngle(p: ElfPlan, ms: number): number {
  if (!p.crooked) return Math.sign(p.crook) * 2.5 * pulse(ms, p.tied - 160, 260);
  const [first, second] = elfPushes(p);
  const c = p.crook;
  if (ms < first) return c;
  if (ms < second) return mix(c, -0.3 * c, ease((ms - first) / 140));
  const settle = ms - second - 120;
  const wobble = settle > 0 ? 0.12 * c * Math.sin(settle / 45) * Math.exp(-settle / 120) : 0;
  return mix(-0.3 * c, 0, ease((ms - second) / 120)) + wobble;
}

/** Screen direction of the spool's pull on the card's near edge once it rolls away. */
export function elfPullDir(p: ElfPlan, side: Side): Point {
  const raw = p.rollBack ? { x: -side, y: 0.25 } : { x: 0.3 * side, y: 1 };
  const l = Math.hypot(raw.x, raw.y);
  return { x: raw.x / l, y: raw.y / l };
}
export const elfChaseDir = (p: ElfPlan, side: Side): Side =>
  (p.rollBack ? -side : side) > 0 ? 1 : -1;
/** Screen slope (down per px travelled) of the floor the spool rolls along. */
export const elfSlope = (p: ElfPlan) =>
  p.rollBack ? 0.14 * p.rollSlope : 0.36 + 0.08 * p.rollSlope;

/**
 * Cinched wraps squeeze the card's waist, each tug yanks it toward the elf, the bow fix nudges
 * it, and the escaping spool tugs it about the near edge until every wrap is off and it springs back.
 */
export function elfCardPose(p: ElfPlan, ms: number, facing: number): CardPose {
  if (ms < p.attach || ms >= p.unthreadEnd + 900) return NEUTRAL_CARD;
  const side = facing < 0 ? -1 : 1;
  const tight = elfTightness(p, ms);
  let sx = 1 - 0.042 * p.squeeze * tight,
    sy = 1 + 0.012 * p.squeeze * tight,
    x = 0,
    y = 0,
    angle = 0;
  // Pressing the ribbon end onto the near edge pushes the card away a touch.
  const press = pulse(ms, p.attach, 220);
  x += side * 1.4 * press;
  angle -= side * 0.8 * press;
  for (let k = 0; k < p.wraps; k++) {
    const snap = pulse(ms, elfCinch(p, k) - 60, 240) * p.squeeze;
    sx -= 0.03 * snap;
    sy += 0.01 * snap;
    x -= side * 2.6 * snap;
    // Pulled by the near edge below the centre, the card's foot swings toward the elf.
    angle += side * 2 * snap;
  }
  const knot = pulse(ms, p.tied - 160, 220);
  sx -= 0.02 * knot * p.squeeze;
  y -= knot;
  if (p.crooked)
    for (const at of elfPushes(p)) {
      const nudge = pulse(ms, at, 180);
      angle -= Math.sign(p.crook) * 0.9 * nudge;
      x += side * 0.6 * nudge;
    }
  else y += 0.8 * (pulse(ms, p.tied + 120, 120) + pulse(ms, p.tied + 280, 120));
  const dir = elfPullDir(p, side);
  const torque = -side * 0.5 * dir.y - (p.waistV - 0.5) * dir.x;
  let pull = 0.6 * ease((ms - p.unthread) / 120) * (1 - ease((ms - p.unthreadEnd) / 120));
  pull += pulse(ms, p.unthread, 220);
  for (let k = 0; k < p.wraps; k++) pull += pulse(ms, elfPeelStart(p, k) - 20, 190);
  x += dir.x * 3 * pull;
  y += dir.y * 2 * pull;
  angle += torque * 7 * pull;
  const release = ms - p.unthreadEnd;
  if (release > 0) {
    const decay = Math.exp(-release / 230);
    angle += side * 2.4 * Math.sin(release / 65) * decay;
    sx += 0.04 * Math.sin(release / 55) * decay;
  }
  const settle = 1 - span(ms, p.unthreadEnd + 650, 250);
  return {
    x: x * settle,
    y: y * settle,
    angle: angle * settle,
    sx: 1 + (sx - 1) * settle,
    sy: 1 + (sy - 1) * settle,
  };
}

export function elfFrames(p: ElfPlan, facing: number) {
  return cardFrames(ELF_DURATION, p.pace, (ms) => elfCardPose(p, ms, facing));
}

const ROLL_EASE = 240;
const rollShape = (tau: number) =>
  Math.max(0, tau) - ROLL_EASE * (1 - Math.exp(-Math.max(0, tau) / ROLL_EASE));
/** Spool position along the floor (px from the stand point) from its slip until well after the catch. */
export function elfSpoolTravel(p: ElfPlan, ms: number, s0: number, sc: number): number {
  return s0 + ((sc - s0) * rollShape(ms - p.slip)) / rollShape(p.snatch - p.slip);
}
/** Height of the falling spool above its rolling position: a drop, one small bounce, then rolling. */
export function elfSpoolLift(p: ElfPlan, ms: number, h0: number, fit: number): number {
  const tau = ms - p.slip,
    g = 0.0019,
    h = Math.max(0, h0);
  const fall = Math.sqrt((2 * h) / g);
  if (tau < fall) return h - 0.5 * g * tau * tau;
  return 5 * fit * p.rollSpeed * Math.sin(Math.PI * clamp((tau - fall) / 210));
}
/**
 * Elf position along the floor (px from the stand point): towed by the ribbon after the grab, at the
 * catch exactly at ec, then running out at a steadily rising speed to `total` by the exit.
 */
export function elfChase(p: ElfPlan, ms: number, ec: number, total: number): number {
  const tau = ms - p.slip,
    tg = p.grab - p.slip,
    tc = p.snatch - p.slip;
  if (tau <= tg) return 0;
  if (tau <= tc) {
    const x = (tau - tg) / (tc - tg);
    return ec * (2 * x * x - x * x * x);
  }
  const d = tau - tc,
    run = p.exitEnd - p.snatch;
  const vc = ec / (tc - tg);
  // Speeds up to a brisk sprint, never faster than ELF_SPRINT px/ms, and keeps that pace once off-screen.
  const acc = Math.min(
    Math.max(0.0003, (2 * (total - ec - vc * run)) / (run * run)),
    Math.max(0, ELF_SPRINT - vc) / run,
  );
  const t = Math.min(d, run);
  return ec + vc * t + 0.5 * acc * t * t + (vc + acc * run) * Math.max(0, d - run);
}
