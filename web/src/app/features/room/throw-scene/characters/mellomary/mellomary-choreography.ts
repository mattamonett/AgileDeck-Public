import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFrames,
  chooseSide,
  clamp,
  ease,
  easeOut,
  sidePoint,
  span,
  withSlow,
  NEUTRAL_CARD,
  type CardPose,
  type Side,
} from '../../kit';

/** Model units from the shoe soles to the top of her hair; she stands a little shorter than the card. */
export const MELLO_HEIGHT = 64;
/** How far the face turns from profile toward the viewer while she faces left or right. */
export const MELLO_BIAS = 0.6;
/** Forward distance (model units) from her feet to the card edge: close for the scare, bell-clear for the tune. */
export const SCARE_GAP = 7;
export const SERENADE_GAP = 21;
/** How long an exit note floats before it has faded. */
export const EXIT_NOTE_LIFE = 900;

/** Marches in with the horn up, or creeps in like a mischievous imp. */
export type MelloApproach = 'march' | 'creep';
/** Springs into a jester pose that frightens the card, or plays it a tune that makes it hop for joy. */
export type MelloAct = 'scare' | 'serenade';
/** A crisp about-face, or a jester twirl on her toes, before she marches away. */
export type MelloTurn = 'snap' | 'twirl';

/** One note of the tune: it leaves the bell on the beat, lands on the card face and makes the card hop. */
export interface MelloNote {
  readonly at: number;
  readonly land: number;
  /** Landing spot across and down the card face. */
  readonly u: number;
  readonly v: number;
  /** Arc height in px at the 122 px card height. */
  readonly arc: number;
  /** The hop it gives the card, in px at the 122 px card height, and how long that hop lasts. */
  readonly hop: number;
  readonly hopLength: number;
  /** A beamed pair rather than a single eighth note. */
  readonly beamed: boolean;
}

export interface MelloPlan {
  readonly kind: '🎺';
  readonly side: Side;
  readonly pace: number;
  readonly approach: MelloApproach;
  readonly act: MelloAct;
  readonly bend: number;
  readonly phase: number;
  /** A march may turn a crisp 90° corner when the thrower sits above the card on her side. */
  readonly flank: boolean;
  /** How far the bell tips up while the horn is at her lips, in radians. */
  readonly hornsUp: number;
  /** Canonical ms at which the approach ends at the stand point. */
  readonly travel: number;
  /** March: route fraction of the horn flash. Creep: sneaking surges and the "shh" peeks. */
  readonly flashAt: number;
  readonly sneaks: number;
  readonly peeks: readonly number[];
  readonly peekDepth: number;
  // ---------- Scare ----------
  /** A half-rise and duck before the real pop. */
  readonly fakeOut: boolean;
  readonly crouch: number;
  readonly fake: number;
  readonly pop: number;
  /** 0..1 width of the flung arms and height of the kicked leg. */
  readonly spread: number;
  readonly kick: number;
  /** Peak flinch angle in degrees, and how long the card shivers. */
  readonly flinch: number;
  readonly shiver: number;
  readonly poseEnd: number;
  readonly bowAt: number;
  readonly bowEnd: number;
  // ---------- Serenade ----------
  readonly raise: number;
  readonly lips: number;
  readonly playStart: number;
  readonly period: number;
  readonly notes: readonly MelloNote[];
  /** Canonical ms each trailing note leaves the bell while she marches off still playing. */
  readonly exitNotes: readonly number[];
  // ---------- Departure ----------
  readonly turn: MelloTurn;
  /** Vertical drift of the exit route in px, and its length in ms. */
  readonly drift: number;
  readonly exit: number;
  readonly depart: number;
  readonly turned: number;
  readonly exitEnd: number;
  readonly end: number;
}

export function melloPlan(id: string): MelloPlan {
  const r = seededRandom(`${id}:mellomary`);
  const side: Side = r() < 0.5 ? -1 : 1;
  const pace = 0.94 + r() * 0.12;
  const approach: MelloApproach = r() < 0.5 ? 'march' : 'creep';
  const act: MelloAct = r() < 0.5 ? 'scare' : 'serenade';
  const bend = r() * 2 - 1;
  const phase = r() * Math.PI * 2;
  const flank = r() < 0.6;
  const hornsUp = 0.08 + r() * 0.14;
  const travel = approach === 'march' ? 2300 + r() * 400 : 2900 + r() * 450;
  const flashAt = 0.32 + r() * 0.26;
  const sneaks = 4 + Math.floor(r() * 3);
  const firstPeek = 0.28 + r() * 0.12;
  const peeks = r() < 0.5 ? [firstPeek] : [firstPeek, firstPeek + 0.27 + r() * 0.08];
  const peekDepth = 0.26 + r() * 0.12;

  const fakeOut = r() < 0.4;
  const crouch = travel + 420 + r() * 220;
  const fake = crouch + 120;
  const pop = fakeOut ? fake + 660 + r() * 120 : crouch + 180 + r() * 140;
  const spread = r();
  const kick = r();
  const flinch = 8 + r() * 6;
  const shiver = 600 + r() * 400;
  const poseEnd = pop + 160 + 850 + r() * 450;
  const bowAt = poseEnd + 360;
  const bowEnd = bowAt + 950;

  const raise = travel + 260;
  const lips = raise + 380;
  const playStart = lips + 280 + r() * 140;
  const period = 340 + r() * 90;
  const count = 3 + Math.floor(r() * 3);
  const flight = 520 + r() * 120;
  // Every alternative's values are drawn, so each choice keeps the same seed position.
  const tune: MelloNote[] = [];
  for (let i = 0; i < count; i++) {
    const at = playStart + i * period,
      last = i === count - 1;
    tune.push({
      at,
      land: at + flight,
      u: 0.28 + r() * 0.44,
      v: 0.18 + r() * 0.34,
      arc: 16 + r() * 16,
      hop: (5 + r() * 3.5) * (last ? 1.4 : 1),
      hopLength: period * (last ? 1.3 : 0.9),
      beamed: r() < 0.35,
    });
  }
  const trailing = r() < 0.5 ? 2 : 3;

  const turn: MelloTurn = r() < 0.5 ? 'snap' : 'twirl';
  const drift = (12 + r() * 40) * (r() < 0.5 ? -1 : 1);
  const exit = 1700 + r() * 400;
  const notes = act === 'serenade' ? tune : [];
  const lastNote = notes.at(-1);
  const tuneEnd = lastNote
    ? Math.max(playStart + count * period, lastNote.land + lastNote.hopLength)
    : playStart;
  const depart = act === 'scare' ? bowEnd : tuneEnd + 140;
  const turned = depart + (turn === 'snap' ? 340 : 780);
  const exitNotes =
    act === 'serenade'
      ? Array.from({ length: trailing }, (_, i) => depart + 160 + i * period * 1.2)
      : [];
  const exitEnd = turned + exit;
  const end = Math.max(exitEnd + 300, (exitNotes.at(-1) ?? 0) + EXIT_NOTE_LIFE + 40);
  return {
    kind: '🎺',
    side,
    pace,
    approach,
    act,
    bend,
    phase,
    flank,
    hornsUp,
    travel,
    flashAt,
    sneaks,
    peeks,
    peekDepth,
    fakeOut,
    crouch,
    fake,
    pop,
    spread,
    kick,
    flinch,
    shiver,
    poseEnd,
    bowAt,
    bowEnd,
    raise,
    lips,
    playStart,
    period,
    notes,
    exitNotes,
    turn,
    drift,
    exit,
    depart,
    turned,
    exitEnd,
    end,
  };
}

/** The actor stands a little shorter than the card. */
export const melloScale = (b: TargetBounds) => b.height / (MELLO_HEIGHT + 11);
/** She stands on the card's bottom edge line. */
export const melloFloor = (b: TargetBounds) => b.top + b.height;

export function melloLandingPoint(
  p: MelloPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  const side = chooseSide(p.side, b, view, chosen);
  const gap = p.act === 'scare' ? SCARE_GAP : SERENADE_GAP;
  return sidePoint(side, b, view, gap * Math.cos(MELLO_BIAS) * melloScale(b), 1);
}

/**
 * Fraction of the route covered. A march keeps an even tempo and brakes for a flank corner; a creep
 * surges sneak by sneak and slows right down for each peek, without ever stopping dead.
 */
export function melloProgress(p: MelloPlan, ms: number, corner?: number): number {
  const t = clamp(ms / p.travel);
  let u = t;
  if (p.approach === 'creep') {
    for (const at of p.peeks) u = withSlow(u, at - 0.07, 0.16, p.peekDepth);
    const k = p.sneaks;
    u = (0.45 * u + 0.55 * (u / 2 - Math.sin(2 * Math.PI * k * u) / (4 * Math.PI * k))) / 0.725;
  } else if (corner !== undefined) {
    u = withSlow(u, corner - 0.05, 0.1, 0.3);
  }
  // Ease the ends only; the acted beats keep their own shape between them.
  const eased =
    u < 0.1
      ? (u * u) / 0.2 / 0.9
      : u > 0.9
        ? 1 - ((1 - u) * (1 - u)) / 0.2 / 0.9
        : (u - 0.05) / 0.9;
  return clamp(eased);
}

/** Strength (0..1) of a creeping "shh" peek, or of the march's horn flash. */
export function melloPeek(p: MelloPlan, ms: number): number {
  if (p.approach !== 'creep') return 0;
  const t = ms / p.travel;
  if (t >= 1) return 0;
  return Math.max(0, ...p.peeks.map((at) => Math.sin(Math.PI * clamp((t - at + 0.08) / 0.2)) ** 2));
}
export function melloFlash(p: MelloPlan, ms: number): number {
  if (p.approach !== 'march') return 0;
  const t = ms / p.travel;
  return t >= 1 ? 0 : Math.sin(Math.PI * clamp((t - p.flashAt) / 0.12));
}

// ---------- The card's response ----------

/** How far the card has flinched away from her pose, 0..1, including the smaller fake-out twitch. */
export function melloFright(p: MelloPlan, ms: number): number {
  if (p.act !== 'scare') return 0;
  const hit = p.pop + 60;
  const rise = easeOut((ms - hit) / 140);
  const recover = ease((ms - hit - 140 - p.shiver) / 900);
  const twitch = p.fakeOut ? 0.28 * Math.sin(Math.PI * span(ms, p.fake + 140, 320)) : 0;
  return Math.max(rise * (1 - recover), twitch);
}
/** Shiver strength, 0..1, while the card trembles after the flinch. */
export function melloShiver(p: MelloPlan, ms: number): number {
  if (p.act !== 'scare') return 0;
  const start = p.pop + 160;
  return ease((ms - start) / 80) * (1 - ease((ms - start - p.shiver + 200) / 200));
}

/** One happy hop of the card, from the note that lands on it. */
function hopAt(p: MelloPlan, ms: number): { lift: number; squash: number; tilt: number } {
  for (let i = 0; i < p.notes.length; i++) {
    const note = p.notes[i];
    if (!note) continue;
    const s = (ms - note.land) / note.hopLength;
    if (s < 0 || s >= 1) continue;
    const air = clamp((s - 0.14) / 0.64);
    const lift = note.hop * Math.sin(Math.PI * air);
    // Crouch on the beat, stretch in the air, squash a little on landing and recover.
    const squash =
      s < 0.14
        ? -Math.sin((Math.PI * s) / 0.14)
        : s < 0.78
          ? 0.6 * Math.sin(Math.PI * air)
          : -0.7 * Math.sin((Math.PI * (s - 0.78)) / 0.22);
    return { lift, squash, tilt: (i % 2 ? 1 : -1) * 2.4 * Math.sin(Math.PI * air) };
  }
  return { lift: 0, squash: 0, tilt: 0 };
}

/**
 * The card's pose. A scare flinches it away from her about its far bottom corner, cringing narrow,
 * then it shivers and leans slowly back. A tune makes it hop on each landing note, crouching,
 * stretching and squashing with its base kept on the table.
 */
export function melloCardPose(p: MelloPlan, ms: number, side: Side, b: TargetBounds): CardPose {
  const k = b.height / 122;
  if (p.act === 'scare') {
    const fright = melloFright(p, ms);
    const shake = melloShiver(p, ms) * 1.3 * Math.sin((ms - p.pop) / 22);
    if (fright < 1e-6 && Math.abs(shake) < 1e-6) return NEUTRAL_CARD;
    const angle = side * (p.flinch * fright + shake);
    const sx = 1 - 0.07 * fright,
      sy = 1 - 0.025 * fright;
    const a = (angle * Math.PI) / 180;
    // Pivot on the far bottom corner, so the card leans away from her rather than spinning in place.
    const cx = (side * b.width) / 2,
      cy = b.height / 2;
    const rx = cx * sx * Math.cos(a) - cy * sy * Math.sin(a),
      ry = cx * sx * Math.sin(a) + cy * sy * Math.cos(a);
    return { x: cx - rx, y: cy - ry - 3 * k * fright, angle, sx, sy };
  }
  const hop = hopAt(p, ms);
  if (hop.lift === 0 && hop.squash === 0) return NEUTRAL_CARD;
  const sy = 1 + 0.06 * hop.squash,
    sx = 1 - 0.035 * hop.squash;
  return { x: 0, y: (b.height / 2) * (1 - sy) - hop.lift * k, angle: side * hop.tilt, sx, sy };
}

export function melloFrames(p: MelloPlan, facing: number, b: TargetBounds) {
  const side: Side = facing < 0 ? -1 : 1;
  return cardFrames(p.end, p.pace, (ms) => melloCardPose(p, ms, side, b));
}

/** Where a note lands on the unrotated card. */
export function noteTarget(note: MelloNote, b: TargetBounds): Point {
  return { x: b.left + b.width * note.u, y: b.top + b.height * note.v };
}

/** Off-screen exit away from the card, drifting a little up or down the table. */
export function melloExitPoint(p: MelloPlan, b: TargetBounds, view: Point, side: Side): Point {
  const floor = melloFloor(b);
  return {
    x: side > 0 ? -120 : view.x + 120,
    y: Math.max(80, Math.min(view.y - 20, floor + p.drift)),
  };
}
