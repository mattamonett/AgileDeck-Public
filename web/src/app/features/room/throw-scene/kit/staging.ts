import type { Point } from '../flight/flight-math';
import type { TargetBounds } from '../landing/landing-geometry';
import { clamp } from './timing';

/** Where an actor stands and travels relative to the card and the viewport. */
export type Side = -1 | 1;
export const sideOf = (n: number): Side => (n < 0 ? -1 : 1);

/** Keeps the seeded side unless the card is too close to that viewport edge on first placement. */
export function chooseSide(
  side: Side,
  b: TargetBounds,
  view: Point,
  chosen?: number,
  room = 70,
): Side {
  if (chosen !== undefined) return sideOf(chosen);
  if (side > 0 && b.left < room) return -1;
  if (side < 0 && b.left + b.width > view.x - room) return 1;
  return side;
}
/** Side +1 stands left of the card facing right; -1 stands right of it facing left. */
export function sidePoint(side: Side, b: TargetBounds, view: Point, gap: number, v: number): Point {
  const x = side > 0 ? b.left - gap : b.left + b.width + gap;
  return { x: Math.max(16, Math.min(view.x - 16, x)), y: b.top + b.height * v };
}

export function bezier(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
}
/** Point at a fraction of a curve's arc length, so travel speed along it is even. */
export function alongCurve(curve: (u: number) => Point, fraction: number, samples = 32): Point {
  let total = 0,
    previous = curve(0);
  const lengths: number[] = [0];
  for (let i = 1; i <= samples; i++) {
    const at = curve(i / samples);
    total += Math.hypot(at.x - previous.x, at.y - previous.y);
    lengths.push(total);
    previous = at;
  }
  const want = clamp(fraction) * total;
  let i = 1;
  while (i < samples && (lengths[i] ?? total) < want) i++;
  const a = lengths[i - 1] ?? 0,
    b = lengths[i] ?? total;
  return curve((i - 1 + (b > a ? (want - a) / (b - a) : 0)) / samples);
}
export function keepInView(p: Point, view: Point, margin = 24, top = 56): Point {
  return {
    x: Math.max(margin, Math.min(view.x - margin, p.x)),
    y: Math.max(top, Math.min(view.y - margin, p.y)),
  };
}

/**
 * Bezier route from the sender to a stand point beside the card. Routes that must reach the far
 * side pass beneath the card instead of crossing its face.
 */
export function sideRoute(
  start: Point,
  end: Point,
  b: TargetBounds,
  view: Point,
  side: Side,
  bend: number,
  t: number,
): Point {
  const cx = b.left + b.width / 2;
  const crosses = (start.x - cx) * (end.x - cx) < 0 && Math.abs(start.x - cx) > b.width / 2;
  const dx = end.x - start.x;
  let c1: Point, c2: Point;
  if (crosses) {
    const under = Math.min(view.y - 30, b.top + b.height + 42 + 12 * bend);
    c1 = { x: start.x + dx * 0.3, y: Math.max(start.y, under) };
    c2 = { x: end.x - side * 46, y: under };
  } else {
    c1 = { x: start.x + dx * 0.35, y: start.y - bend * 70 };
    c2 = { x: end.x - side * 52, y: end.y - bend * 28 };
  }
  return keepInView(
    bezier(start, keepInView(c1, view), keepInView(c2, view), end, clamp(t)),
    view,
    16,
    40,
  );
}
