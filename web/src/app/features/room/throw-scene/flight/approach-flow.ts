import { ease } from '../kit';
import type { Point } from './flight-math';

/** Share of a steady ease that keeps an approach moving through its acted hesitation. */
export const APPROACH_DRIFT = 0.45;

/** A smooth, monotone ease from rest through `at` at time `middle` and back to rest at 1. */
function easeThrough(t: number, middle: number, at: number): number {
  const before = at / middle,
    after = (1 - at) / (1 - middle);
  // Capped by three times each secant, so the Hermite segments never run backwards.
  const slope = Math.min(3 * before, 3 * after, 1.5 * Math.sqrt(before * after));
  if (t < middle) {
    const u = t / middle;
    return (3 * u * u - 2 * u ** 3) * at + (u ** 3 - u * u) * middle * slope;
  }
  const u = (t - middle) / (1 - middle);
  return at + (3 * u * u - 2 * u ** 3) * (1 - at) + (u ** 3 - 2 * u * u + u) * (1 - middle) * slope;
}

/**
 * Approach timing that eases toward `at` by `split`, lingers there for `linger` of the
 * approach, then eases on. The linger is a slow forward drift rather than a dead stop: a
 * steady ease through the same beat is blended in so the body never brakes to zero part-way
 * along its route, while still passing `at` in the middle of the linger.
 */
export function lingeringProgress(
  t: number,
  split: number,
  at: number,
  linger: number,
  drift = APPROACH_DRIFT,
): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const beat =
    t < split
      ? ease(t / split) * at
      : t < split + linger
        ? at
        : at + ease((t - split - linger) / (1 - split - linger)) * (1 - at);
  return beat * (1 - drift) + easeThrough(t, split + linger / 2, at) * drift;
}

/** The curve parameter that lies `u` of the way along the curve's length. */
export function evenParameter(path: (u: number) => Point, u: number, samples = 48): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const lengths = [0];
  let previous = path(0),
    total = 0;
  for (let i = 1; i <= samples; i++) {
    const at = path(i / samples);
    total += Math.hypot(at.x - previous.x, at.y - previous.y);
    lengths.push(total);
    previous = at;
  }
  if (total < 1e-9) return u;
  const goal = u * total;
  for (let i = 1; i <= samples; i++) {
    const a = lengths[i - 1] ?? 0,
      b = lengths[i] ?? total;
    if (b >= goal) return (i - 1 + (b > a ? (goal - a) / (b - a) : 0)) / samples;
  }
  return 1;
}

/** How far along the curve's length (0..1) the parameter `u` lies. */
export function lengthFraction(path: (u: number) => Point, u: number, samples = 48): number {
  let previous = path(0),
    before = 0,
    total = 0;
  for (let i = 1; i <= samples; i++) {
    const at = path(i / samples),
      step = Math.hypot(at.x - previous.x, at.y - previous.y);
    if (i / samples <= u) before += step;
    total += step;
    previous = at;
  }
  return total > 0 ? before / total : u;
}

/** Re-times a curve so equal steps of `u` travel equal distances along it. */
export function evenPath(path: (u: number) => Point, u: number, samples = 48): Point {
  return path(evenParameter(path, u, samples));
}

interface RouteLine {
  readonly kind: 'line';
  readonly from: Point;
  readonly to: Point;
  readonly length: number;
}
interface RouteTurn {
  readonly kind: 'turn';
  readonly from: Point;
  readonly via: Point;
  readonly to: Point;
  readonly length: number;
}
type RoutePiece = RouteLine | RouteTurn;

function turnPoint(piece: RouteTurn, s: number): Point {
  const q = 1 - s;
  return {
    x: q * q * piece.from.x + 2 * q * s * piece.via.x + s * s * piece.to.x,
    y: q * q * piece.from.y + 2 * q * s * piece.via.y + s * s * piece.to.y,
  };
}
function line(from: Point, to: Point): RouteLine {
  return { kind: 'line', from, to, length: Math.hypot(to.x - from.x, to.y - from.y) };
}
function turn(from: Point, via: Point, to: Point): RouteTurn {
  const piece: RouteTurn = { kind: 'turn', from, via, to, length: 0 };
  let length = 0,
    previous = from;
  for (let i = 1; i <= 8; i++) {
    const at = turnPoint(piece, i / 8);
    length += Math.hypot(at.x - previous.x, at.y - previous.y);
    previous = at;
  }
  return { ...piece, length };
}

/** Walks a corner route at an even pace, rounding each corner so the body turns without stopping. */
export function roundedRoute(corners: readonly Point[], u: number, radius = 22): Point {
  const points = corners.filter((point, i) => {
    const before = corners[i - 1];
    return !before || Math.hypot(point.x - before.x, point.y - before.y) > 1e-6;
  });
  const first = points[0],
    last = points.at(-1);
  if (!first || !last) throw new Error('Missing approach route');
  if (u <= 0 || points.length === 1) return { ...first };
  if (u >= 1) return { ...last };
  const pieces: RoutePiece[] = [];
  let from = first;
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1],
      corner = points[i],
      after = points[i + 1];
    if (!before || !corner || !after) continue;
    const inLength = Math.hypot(corner.x - before.x, corner.y - before.y);
    const outLength = Math.hypot(after.x - corner.x, after.y - corner.y);
    const r = Math.min(
      radius,
      inLength * (i === 1 ? 1 : 0.5),
      outLength * (i === points.length - 2 ? 1 : 0.5),
    );
    const entry = {
      x: corner.x - ((corner.x - before.x) / inLength) * r,
      y: corner.y - ((corner.y - before.y) / inLength) * r,
    };
    const exit = {
      x: corner.x + ((after.x - corner.x) / outLength) * r,
      y: corner.y + ((after.y - corner.y) / outLength) * r,
    };
    pieces.push(line(from, entry), turn(entry, corner, exit));
    from = exit;
  }
  pieces.push(line(from, last));
  const total = pieces.reduce((sum, piece) => sum + piece.length, 0);
  let remaining = u * total;
  for (const piece of pieces) {
    if (remaining > piece.length) {
      remaining -= piece.length;
      continue;
    }
    const s = piece.length > 0 ? remaining / piece.length : 0;
    return piece.kind === 'line'
      ? {
          x: piece.from.x + (piece.to.x - piece.from.x) * s,
          y: piece.from.y + (piece.to.y - piece.from.y) * s,
        }
      : evenPath((q) => turnPoint(piece, q), s, 8);
  }
  return { ...last };
}

/** The walk below (or above) a card used when a walker must cross to its far side. */
export function laneRoute(start: Point, end: Point, lane: number, u: number): Point {
  return roundedRoute([start, { x: start.x, y: lane }, { x: end.x, y: lane }, end], u);
}
