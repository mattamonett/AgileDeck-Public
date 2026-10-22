import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFit,
  cardFrames,
  chooseSide,
  clamp,
  pulse,
  sidePoint,
  sideOf,
  span,
  NEUTRAL_CARD,
  type CardPose,
  type Side,
} from '../../kit';

export const SNOWMAN_DURATION = 12400;
export const SNOWMAN_SCALE = 1.45;
/** Half-width of Flurry's own bottom ball and the gap kept to the snowball he pushes, in model units. */
export const BODY_RADIUS = 8.8;
export const PUSH_GAP = 0.3;
/** The admiring step back from the finished sculpture, in model units. */
export const STEP_BACK = 6;
/** Distance from the kick stand to the fallen carrot's centre, in model units. */
export const KICK_REACH = 6.5;
export const PAT_INTERVAL = 260;
/** Screen depth is foreshortened: a ball pushed toward the viewer sits only a little lower on screen. */
export const DEPTH_SQUASH = 0.25;
/** Screen gravity for flying snow and the carrot, in px per ms². */
export const SNOWMAN_GRAVITY = 0.0011;

export type SnowSculpture = 'snowman' | 'star' | 'tree';
export type SnowBeat = 'wobble' | 'sniffle';

export interface SnowmanPlan {
  readonly kind: '⛄';
  readonly side: Side;
  readonly pace: number;
  /** Canonical ms at which the snowball reaches the card and the approach ends. */
  readonly travel: number;
  readonly bend: number;
  /** Signed sideways wander of the pushing route, in px. */
  readonly wander: number;
  readonly waves: number;
  readonly wavePhase: number;
  /** Shove rhythm of the push: number of surges and their strength. */
  readonly shoves: number;
  readonly shoveDepth: number;
  readonly beat: SnowBeat;
  readonly beatAt: number;
  readonly ballStart: number;
  readonly ballEnd: number;
  readonly sculpture: SnowSculpture;
  readonly pats: number;
  readonly fakeOut: boolean;
  readonly strength: number;
  readonly noseBounce: boolean;
  readonly noseLand: number;
  readonly exitAway: boolean;
  readonly exitSpeed: number;
  readonly exitRise: number;
  readonly phase: number;
  readonly arrive: number;
  readonly build: number;
  readonly buildEnd: number;
  readonly admire: number;
  readonly inhale: number;
  readonly sneeze: number;
  readonly noseHit: number;
  readonly noseLanded: number;
  readonly fetch: number;
  readonly kick: number;
  readonly catchAt: number;
  readonly refit: number;
  readonly refitEnd: number;
  readonly tuck: number;
  readonly roll: number;
  readonly exitEnd: number;
}

/** Signed offset of the fallen carrot from the admiring stand, in model units (positive = toward the card). */
/** When the sneeze bursts the sculpture. */
export const snowmanBlastAt = (p: SnowmanPlan) => p.sneeze + 60;

export const snowmanCarrotOffset = (p: SnowmanPlan) =>
  p.noseBounce ? -(18 + 12 * p.noseLand) : 9 + 5 * p.noseLand;

export function snowmanPlan(id: string): SnowmanPlan {
  const r = seededRandom(`${id}:snowman-v2`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const travel = 2400 + r() * 400;
  const bend = r() * 2 - 1;
  const wander = (r() * 2 - 1) * 30;
  const waves = r() < 0.5 ? 1 : 2;
  const wavePhase = r() * Math.PI;
  const shoves = 3 + Math.floor(r() * 3);
  const shoveDepth = 0.08 + r() * 0.08;
  const beat: SnowBeat = r() < 0.5 ? 'wobble' : 'sniffle';
  const beatAt = 0.36 + r() * 0.24;
  const ballStart = 5.2 + r() * 0.5;
  const ballEnd = 6.6 + r() * 1.1;
  const sculptureRoll = r();
  const sculpture: SnowSculpture =
    sculptureRoll < 1 / 3 ? 'snowman' : sculptureRoll < 2 / 3 ? 'star' : 'tree';
  const pats = 3 + Math.floor(r() * 3);
  const fakeOut = r() < 0.5;
  const strength = 0.85 + r() * 0.35;
  const noseBounce = r() < 0.5;
  const noseLand = r();
  const exitAway = r() < 0.5;
  const exitSpeed = 0.85 + r() * 0.35;
  const exitRise = r() * 2 - 1;
  const phase = r() * Math.PI * 2;
  const arrive = travel;
  const build = arrive + 220;
  const buildEnd = build + pats * PAT_INTERVAL;
  const admire = buildEnd + 80;
  const inhale = admire + 800;
  const sneeze = inhale + (fakeOut ? 1250 : 850);
  const noseHit = sneeze + 170;
  const noseLanded = noseBounce ? noseHit + 640 : sneeze + 560;
  const fetch = Math.max(noseLanded + 150, sneeze + 1050);
  const offset = noseBounce ? -(18 + 12 * noseLand) : 9 + 5 * noseLand;
  const walk = Math.abs(offset) - KICK_REACH;
  const kick = fetch + 300 + walk * 22;
  const catchAt = kick + 400;
  const refit = catchAt + 120;
  const refitEnd = refit + 380;
  const tuck = refitEnd + 380;
  const roll = tuck + 480;
  const exitEnd = roll + 1350 / exitSpeed;
  return {
    kind: '⛄',
    side,
    pace,
    travel,
    bend,
    wander,
    waves,
    wavePhase,
    shoves,
    shoveDepth,
    beat,
    beatAt,
    ballStart,
    ballEnd,
    sculpture,
    pats,
    fakeOut,
    strength,
    noseBounce,
    noseLand,
    exitAway,
    exitSpeed,
    exitRise,
    phase,
    arrive,
    build,
    buildEnd,
    admire,
    inhale,
    sneeze,
    noseHit,
    noseLanded,
    fetch,
    kick,
    catchAt,
    refit,
    refitEnd,
    tuck,
    roll,
    exitEnd,
  };
}

export const snowmanScale = (b: TargetBounds) => SNOWMAN_SCALE * cardFit(b);
/** Distance from Flurry's root to the centre of the snowball he pushes, in model units. */
export const snowmanLead = (radius: number) => BODY_RADIUS + PUSH_GAP + radius;
export const snowmanBallRadius = (p: SnowmanPlan, progress: number) =>
  p.ballStart + (p.ballEnd - p.ballStart) * clamp(progress);

/** Stand point: far enough from the card that the finished snowball rests against its edge. */
export function snowmanLandingPoint(
  p: SnowmanPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  const side = chooseSide(p.side, b, view, chosen);
  const gap = (snowmanLead(p.ballEnd) + p.ballEnd) * snowmanScale(b);
  return sidePoint(side, b, view, gap, 1.05);
}

/** Relative pushing speed: eased start and stop, shove surges, and a slowed (never stopped) acted beat. */
export function snowmanSpeed(p: SnowmanPlan, t: number): number {
  const u = clamp(t);
  const envelope =
    u < 0.12
      ? Math.sin((Math.PI / 2) * (u / 0.12)) ** 2
      : u > 0.88
        ? Math.sin((Math.PI / 2) * ((1 - u) / 0.12)) ** 2
        : 1;
  const rhythm = 1 + p.shoveDepth * Math.sin(Math.PI * 2 * p.shoves * u + p.phase);
  const d = Math.abs(u - p.beatAt),
    width = 0.14;
  const beat = d < width ? 0.5 * (1 + Math.cos((Math.PI * d) / width)) : 0;
  return Math.max(0.015, envelope) * (rhythm - (p.beat === 'wobble' ? 0.42 : 0.38) * beat);
}
/** How strongly the acted beat is playing at approach fraction t. */
export function snowmanBeat(p: SnowmanPlan, t: number): number {
  const d = Math.abs(t - p.beatAt);
  return d < 0.14 ? 0.5 * (1 + Math.cos((Math.PI * d) / 0.14)) : 0;
}

function integrate(p: SnowmanPlan, t: number): number {
  const steps = Math.max(1, Math.ceil(clamp(t) * 120)),
    h = clamp(t) / steps;
  let sum = 0;
  for (let i = 0; i < steps; i++)
    sum += (snowmanSpeed(p, i * h) + snowmanSpeed(p, (i + 1) * h)) * 0.5 * h;
  return sum;
}
/** Fraction of the route length covered at approach fraction t. */
export function snowmanProgress(p: SnowmanPlan, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return integrate(p, t) / integrate(p, 1);
}

export const snowmanPatContact = (p: SnowmanPlan, i: number) => p.build + i * PAT_INTERVAL + 150;

/**
 * Card response: a soft nudge as the snowball comes to rest against it, taps from the patting, then the
 * sneeze shoves the bottom away from Flurry and leaves it shivering, with a ping if the carrot hits it.
 */
export function snowmanCardPose(p: SnowmanPlan, ms: number, facing: number): CardPose {
  if (ms < p.arrive || ms >= p.sneeze + 1650) return NEUTRAL_CARD;
  const s = sideOf(facing);
  let x = 0,
    angle = 0,
    sx = 1,
    sy = 1;
  const bump = pulse(ms, p.arrive, 280);
  x += s * 1.4 * bump;
  angle -= s * 0.7 * bump;
  for (let i = 0; i < p.pats; i++) {
    const tap = pulse(ms, snowmanPatContact(p, i), 140);
    x += s * 0.45 * tap;
    angle -= s * 0.3 * tap;
  }
  const hit = ms - (p.sneeze + 60);
  if (hit > 0) {
    const decay = Math.exp(-hit / 380) * (1 - span(ms, p.sneeze + 1250, 400));
    const shove = pulse(ms, p.sneeze + 60, 260) * p.strength;
    x += s * 5.5 * shove + Math.sin(hit / 16 + p.phase) * 1.1 * decay * p.strength;
    angle += -s * 3.5 * shove + Math.sin(hit / 23) * 1.8 * decay * p.strength;
    sy -= 0.03 * shove;
    sx += 0.012 * Math.sin(hit / 19) * decay;
    if (p.noseBounce) {
      const ping = pulse(ms, p.noseHit, 140);
      x += s * 1.6 * ping;
      angle -= s * 1.2 * ping;
    }
  }
  return { x, y: 0, angle, sx, sy };
}

export function snowmanFrames(p: SnowmanPlan, facing: number) {
  return cardFrames(SNOWMAN_DURATION, p.pace, (ms) => snowmanCardPose(p, ms, facing));
}

/** Frost creeping in from the card edges after the sneeze: 0 none, 1 fully grown. */
export function snowmanFrost(p: SnowmanPlan, ms: number): number {
  return span(ms, p.sneeze + 80, 900) ** 0.7 * (0.72 + 0.28 * Math.min(1, p.strength));
}
