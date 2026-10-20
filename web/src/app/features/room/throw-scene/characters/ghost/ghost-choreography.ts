import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  chooseSide,
  clamp,
  ease,
  easeOut,
  mix,
  pulse,
  sidePoint,
  span,
  withSlow,
  NEUTRAL_CARD,
  type CardPose,
  type Side,
} from '../../kit';

export const GHOST_DURATION = 8200;
/** Model units from the hem to the crown of the sheet. */
export const GHOST_HEIGHT = 40;
/** Half the sheet's widest girth, in model units. */
export const GHOST_HALF_WIDTH = 13;
export const GHOST_SHOUT = 'BOO!';
/** The runaway's legs, as a fraction of card height, from its bottom edge to the sneaker soles. */
export const SPIRIT_LEG = 0.3;

/** Weaves in on a wobbly float, or fades nearly invisible part way and reappears near the card. */
export type GhostApproach = 'weave' | 'fade';
/** Clutches its belly with both hands, or points after the runaway while it laughs. */
export type GhostLaugh = 'belly' | 'point';
/** Floats up and away, or sinks through the floor. */
export type GhostExit = 'rise' | 'sink';

export interface GhostPlan {
  readonly kind: '👻';
  readonly side: Side;
  readonly pace: number;
  readonly approach: GhostApproach;
  readonly bend: number;
  readonly phase: number;
  /** Canonical ms at which the float ends beside the card. */
  readonly travel: number;
  /** Sideways weave of the float in px, and how many half waves it makes. */
  readonly weave: number;
  readonly waves: number;
  /** Route fraction where a fading ghost is faintest. */
  readonly fadeAt: number;
  /** Hover height above the floor in model units, and how high it rises while it looms. */
  readonly hover: number;
  readonly rise: number;
  /** How hard the BOO lunges and how much the ghost swells. */
  readonly lunge: number;
  readonly swell: number;
  /** The card's spirit: leap height (card heights), lateral reach (card widths) and spin in degrees. */
  readonly leapHeight: number;
  readonly leapReach: number;
  readonly leapSpin: number;
  /** First dash heading in radians (0 is away from the ghost, positive is down the screen). */
  readonly heading: number;
  /** Panicked swerves: each turns the heading by the given radians after a dash of the given card heights. */
  readonly swerves: readonly { readonly turn: number; readonly dash: number }[];
  readonly laugh: GhostLaugh;
  readonly exit: GhostExit;
  /** Horizontal drift of the exit in px. */
  readonly drift: number;
  readonly boo: number;
  readonly leap: number;
  readonly land: number;
  readonly bolt: number;
  readonly runEnd: number;
  readonly laughStart: number;
  readonly laughEnd: number;
  readonly exitEnd: number;
  readonly restore: number;
  readonly restoreEnd: number;
}

export function ghostPlan(id: string): GhostPlan {
  const r = seededRandom(`${id}:ghost`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const approach: GhostApproach = r() < 0.5 ? 'weave' : 'fade';
  const bend = r() * 2 - 1;
  const phase = r() * Math.PI * 2;
  const travel = 1900 + r() * 600;
  const weave = (approach === 'weave' ? 14 + r() * 9 : 6 + r() * 6) * (r() < 0.5 ? -1 : 1);
  const waves = 2 + Math.floor(r() * 2);
  const fadeAt = 0.4 + r() * 0.2;
  const hover = 5 + r() * 5;
  const rise = 9 + r() * 7;
  const lunge = 0.7 + r() * 0.6;
  const swell = 0.14 + r() * 0.12;
  const leapHeight = 0.45 + r() * 0.35;
  const leapReach = 0.95 + r() * 0.35;
  const leapSpin = (r() < 0.5 ? -1 : 1) * (10 + r() * 22);
  const heading = (r() * 2 - 1) * 0.95;
  const count = r() < 0.5 ? 1 : 2;
  const first = r() < 0.5 ? -1 : 1;
  const swerves = Array.from({ length: count }, (_, i) => ({
    turn: first * (i % 2 ? -1 : 1) * (0.7 + r() * 0.6),
    dash: 0.7 + r() * 0.7,
  }));
  const laugh: GhostLaugh = r() < 0.5 ? 'belly' : 'point';
  const exit: GhostExit = r() < 0.5 ? 'rise' : 'sink';
  const drift = (20 + r() * 40) * (r() < 0.5 ? -1 : 1);
  const boo = travel + 650 + r() * 300;
  const leap = boo + 140;
  const land = leap + 520;
  const bolt = land + 220 + r() * 200;
  const runEnd = bolt + 1300 + r() * 500;
  const laughStart = leap + 320;
  const laughEnd = laughStart + 1300 + r() * 400;
  const exitEnd = laughEnd + 1300 + r() * 300;
  const restore = runEnd + 250;
  const restoreEnd = restore + 700;
  return {
    kind: '👻',
    side,
    pace,
    approach,
    bend,
    phase,
    travel,
    weave,
    waves,
    fadeAt,
    hover,
    rise,
    lunge,
    swell,
    leapHeight,
    leapReach,
    leapSpin,
    heading,
    swerves,
    laugh,
    exit,
    drift,
    boo,
    leap,
    land,
    bolt,
    runEnd,
    laughStart,
    laughEnd,
    exitEnd,
    restore,
    restoreEnd,
  };
}

/** The ghost stands a touch shorter than the card while it hovers, and swells past it to loom. */
export const ghostScale = (b: TargetBounds) => b.height / (GHOST_HEIGHT + 8);
/** The floor is the card's bottom edge line. */
export const ghostFloor = (b: TargetBounds) => b.top + b.height;

/** Where the hem's centre hovers beside the card once the float ends. */
export function ghostLandingPoint(
  p: GhostPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  const side = chooseSide(p.side, b, view, chosen, 80);
  const s = ghostScale(b);
  const stand = sidePoint(side, b, view, (GHOST_HALF_WIDTH + 2) * s, 1);
  return { x: stand.x, y: stand.y - p.hover * s };
}

/** Fraction of the float covered: eased at both ends, slowing (never stopping) as it nears the card. */
export function ghostProgress(p: GhostPlan, ms: number): number {
  const t = clamp(ms / p.travel);
  const slow = withSlow(t, 0.62, 0.26, 0.65);
  return clamp(slow < 0.1 ? (slow * slow) / 0.2 / 0.9 : (slow - 0.05) / 0.9);
}

/** How visible the ghost is, 0..1; a fading approach thins out to a wisp and returns. */
export function ghostVisibility(p: GhostPlan, ms: number): number {
  const appear = ease(ms / 260);
  if (p.approach !== 'fade' || ms >= p.travel) return appear;
  const t = ms / p.travel;
  return appear * (1 - 0.85 * Math.sin(Math.PI * clamp((t - p.fadeAt + 0.2) / 0.4)) ** 2);
}

/** 0..1 build of the loom: the ghost rises, swells and raises its arms. */
export const ghostLoom = (p: GhostPlan, ms: number) =>
  ease((ms - p.travel) / (p.boo - p.travel - 60));
/** The BOO itself: a sharp lunge that peaks just after the shout and relaxes. */
export function ghostShout(p: GhostPlan, ms: number): number {
  if (ms < p.boo - 90) return 0;
  return ms < p.boo + 40 ? easeOut((ms - p.boo + 90) / 130) : 1 - ease((ms - p.boo - 40) / 520);
}
/** Laughter strength, 0..1, easing in and out of the fit. */
export const ghostLaughing = (p: GhostPlan, ms: number) =>
  ease((ms - p.laughStart) / 220) * (1 - ease((ms - p.laughEnd + 260) / 260));

// ---------- The real card: dread, jolt, the empty pale body and its recovery ----------

export interface GhostCardLook {
  readonly pose: CardPose;
  /** 0 the card's normal colour, 1 drained pale while its spirit is away. */
  readonly pale: number;
}

export function ghostCardLook(
  p: GhostPlan,
  ms: number,
  side: Side,
  b: TargetBounds,
): GhostCardLook {
  if (ms <= p.travel || ms >= p.restoreEnd) return { pose: NEUTRAL_CARD, pale: 0 };
  // A small trembling of dread grows while the ghost looms.
  const dread = ghostLoom(p, ms) * (1 - span(ms, p.boo, 60));
  const jolt = pulse(ms, p.boo, 220);
  const slump = ease((ms - p.leap) / 240) * (1 - ease((ms - p.restore) / 420));
  // The empty body keeps shivering, less and less, until its colour returns with a last shudder.
  const shiver = slump * (1 - 0.6 * span(ms, p.leap, p.runEnd - p.leap));
  const shudder = pulse(ms, p.restore + 120, 420);
  const angle =
    0.9 * dread * Math.sin(ms / 17) +
    -side * 3.5 * slump +
    1.1 * shiver * Math.sin(ms / 23) +
    2.2 * shudder * Math.sin(ms / 30);
  const pale =
    ease((ms - p.leap) / 140) * (1 - ease((ms - p.restore) / (p.restoreEnd - p.restore)));
  const a = (angle * Math.PI) / 180,
    dy = b.height / 2;
  return {
    // The jolt stiffens it upward in fright; the slump settles about the base.
    pose: {
      x: dy * Math.sin(a),
      y: dy * (1 - Math.cos(a)) - 0.07 * b.height * jolt + 0.025 * b.height * slump,
      angle,
      sx: 1 - 0.06 * jolt + 0.02 * slump,
      sy: 1 + 0.08 * jolt - 0.04 * slump,
    },
    pale,
  };
}

/** Keyframes for the real card, including the colour drained from its body; the vote stays readable. */
export function ghostFrames(p: GhostPlan, facing: number, b: TargetBounds) {
  const side: Side = facing < 0 ? -1 : 1;
  const frames: Keyframe[] = [];
  for (let ms = 0; ms <= GHOST_DURATION; ms += 20) {
    const look =
      ms + 20 > GHOST_DURATION ? { pose: NEUTRAL_CARD, pale: 0 } : ghostCardLook(p, ms, side, b);
    const q = look.pose;
    frames.push({
      offset: ms / GHOST_DURATION,
      translate: `${q.x}px ${q.y}px`,
      rotate: `${q.angle}deg`,
      scale: `${q.sx} ${q.sy}`,
      filter: `saturate(${1 - 0.8 * look.pale}) brightness(${1 + 0.12 * look.pale})`,
      opacity: 1 - 0.38 * look.pale,
    });
  }
  if (frames.at(-1)?.offset !== 1)
    frames.push({
      offset: 1,
      translate: '0px 0px',
      rotate: '0deg',
      scale: '1 1',
      filter: 'saturate(1) brightness(1)',
      opacity: 1,
    });
  return { frames, options: { duration: GHOST_DURATION * p.pace, easing: 'linear' } };
}

// ---------- The card's frightened spirit ----------

export type SpiritStage = 'hidden' | 'leap' | 'scramble' | 'run' | 'gone';
export interface SpiritState {
  readonly stage: SpiritStage;
  /** Pose of the runaway copy relative to the card's layout box. */
  readonly pose: CardPose;
  /** 0..1 how far the eyes and legs have sprouted. */
  readonly sprout: number;
  /** Leg cycle in cycles, and how hard the legs are working (0 standing, 1 flat-out). */
  readonly cycle: number;
  readonly effort: number;
  /** Screen direction of travel (1 right, -1 left) for mirroring the legs. */
  readonly facing: Side;
  /** 0..1 skid at a swerve, for dust and lean. */
  readonly skid: number;
}

/** Card-centre offsets (px) of the route: the landing spot, each swerve corner and the off-screen exit. */
export function spiritRoute(p: GhostPlan, b: TargetBounds, view: Point, side: Side): Point[] {
  const legs = SPIRIT_LEG * b.height;
  const landed = { x: side * p.leapReach * b.width, y: -legs };
  const points: Point[] = [landed];
  let angle = p.heading,
    at = landed;
  const dir = (a: number) => ({ x: side * Math.cos(a), y: Math.sin(a) });
  // The first dash, then each swerve's dash; the last heading carries it off the screen.
  const dashes = [0.9, ...p.swerves.map((s) => s.dash)];
  dashes.forEach((dash, i) => {
    if (i > 0) angle += p.swerves[i - 1]?.turn ?? 0;
    // Never run straight back through the ghost.
    angle = Math.max(-1.45, Math.min(1.45, angle));
    const d = dir(angle);
    at = { x: at.x + d.x * dash * b.height, y: at.y + d.y * dash * b.height };
    points.push(at);
  });
  const d = dir(angle);
  // Ray from the last corner to beyond the viewport edge, clearing the card and its legs.
  const cx = b.left + b.width / 2 + at.x,
    cy = b.top + b.height / 2 + at.y;
  const margin = Math.hypot(b.width, b.height) + legs + 30;
  const tx =
    d.x > 1e-6 ? (view.x + margin - cx) / d.x : d.x < -1e-6 ? (-margin - cx) / d.x : Infinity;
  const ty =
    d.y > 1e-6 ? (view.y + margin - cy) / d.y : d.y < -1e-6 ? (-margin - cy) / d.y : Infinity;
  const t = Math.max(0, Math.min(tx, ty));
  points.push({ x: at.x + d.x * t, y: at.y + d.y * t });
  return points;
}

function routeLength(points: readonly Point[]): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      c = points[i];
    lengths.push((lengths[i - 1] ?? 0) + (a && c ? Math.hypot(c.x - a.x, c.y - a.y) : 0));
  }
  return lengths;
}

/** Run progress 0..1: bursts off the line, then brakes (never to a stop) at each swerve. */
export function spiritRunProgress(p: GhostPlan, t: number, corners: readonly number[]): number {
  let u = clamp(t);
  for (const c of corners) u = withSlow(u, c - 0.07, 0.14, 0.4);
  const burst = 0.12;
  return clamp(
    u < burst ? (u * u) / (2 * burst) / (1 - burst / 2) : (u - burst / 2) / (1 - burst / 2),
  );
}

export function spiritState(
  p: GhostPlan,
  ms: number,
  b: TargetBounds,
  view: Point,
  side: Side,
): SpiritState {
  const hidden: SpiritState = {
    stage: 'hidden',
    pose: NEUTRAL_CARD,
    sprout: 0,
    cycle: 0,
    effort: 0,
    facing: side,
    skid: 0,
  };
  if (ms < p.leap) return hidden;
  if (ms >= p.runEnd) return { ...hidden, stage: 'gone' };
  const route = spiritRoute(p, b, view, side);
  const landed = route[0] ?? { x: 0, y: 0 };
  const sprout = easeOut((ms - p.leap - 60) / 300);
  if (ms < p.land) {
    // Leaps up and out of its body, spinning, and lands beside it on its new legs.
    const t = (ms - p.leap) / (p.land - p.leap);
    const x = mix(0, landed.x, easeOut(t));
    const y = mix(0, landed.y, t) - 4 * p.leapHeight * b.height * t * (1 - t);
    const spin = p.leapSpin * Math.sin(Math.PI * t);
    const stretch = 0.12 * pulse(ms, p.leap, 200);
    return {
      stage: 'leap',
      sprout,
      cycle: 3 * t,
      effort: 0.5 * t,
      facing: side,
      skid: 0,
      pose: { x, y, angle: spin, sx: 1 - stretch * 0.5, sy: 1 + stretch },
    };
  }
  const first = route[1] ?? landed;
  const heading = Math.atan2(first.y - landed.y, first.x - landed.x);
  const toward: Side = Math.cos(heading) < -0.05 ? -1 : Math.cos(heading) > 0.05 ? 1 : side;
  if (ms < p.bolt) {
    // Wheel-spinning legs before they find any grip: a squash on landing, then leaning hard to go.
    const t = ms - p.land;
    const squash = 0.14 * pulse(ms, p.land, 180);
    const lean = toward * 9 * ease(t / 160);
    return {
      stage: 'scramble',
      sprout,
      cycle: (t / 1000) * 14,
      effort: 1,
      facing: toward,
      skid: 0.6,
      pose: {
        x: landed.x,
        y: landed.y + squash * b.height * 0.5,
        angle: lean + 2 * Math.sin(t / 25),
        sx: 1 + squash,
        sy: 1 - squash,
      },
    };
  }
  const lengths = routeLength(route);
  const total = lengths.at(-1) ?? 1;
  const corners = lengths.slice(1, -1).map((l) => l / total);
  const t = (ms - p.bolt) / (p.runEnd - p.bolt);
  const s = spiritRunProgress(p, t, corners) * total;
  let i = 1;
  while (i < route.length - 1 && (lengths[i] ?? total) < s) i++;
  const a = route[i - 1] ?? landed,
    c = route[i] ?? landed;
  const l0 = lengths[i - 1] ?? 0,
    l1 = lengths[i] ?? total;
  const k = l1 > l0 ? (s - l0) / (l1 - l0) : 0;
  const dx = c.x - a.x;
  // A nearly vertical dash keeps facing the way it was already running.
  const facing: Side = Math.abs(dx) > 0.2 * (l1 - l0) ? (dx < 0 ? -1 : 1) : toward;
  const skid = Math.max(0, ...corners.map((corner) => 1 - Math.abs(t - corner) / 0.07));
  const bounce = Math.abs(Math.sin(s / (0.11 * b.height))) * 0.05 * b.height;
  return {
    stage: 'run',
    sprout,
    cycle: s / (0.32 * b.height),
    effort: 1,
    facing,
    skid,
    pose: {
      x: mix(a.x, c.x, k),
      y: mix(a.y, c.y, k) - bounce,
      angle: facing * (10 - 14 * skid) + 3 * Math.sin(s / (0.11 * b.height)),
      sx: 1,
      sy: 1 + 0.04 * Math.sin(s / (0.055 * b.height)),
    },
  };
}

/** Where the ghost leaves: up and away over the table, or straight down through the floor. */
export function ghostExitPoint(p: GhostPlan, b: TargetBounds, view: Point, stand: Point): Point {
  if (p.exit === 'sink')
    return { x: stand.x, y: ghostFloor(b) + GHOST_HEIGHT * ghostScale(b) * 1.6 };
  return {
    x: Math.max(-80, Math.min(view.x + 80, stand.x + p.drift)),
    y: -GHOST_HEIGHT * ghostScale(b) * 1.6,
  };
}
