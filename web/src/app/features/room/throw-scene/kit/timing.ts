import type { Point } from '../flight/flight-math';

/** Progress, easing and interpolation helpers shared by every performance. */
export const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const ease = (n: number) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};
export const easeOut = (n: number) => 1 - (1 - clamp(n)) ** 3;
export const easeIn = (n: number) => clamp(n) ** 2;
export const span = (ms: number, start: number, duration: number) => clamp((ms - start) / duration);
export const pulse = (ms: number, start: number, duration: number) =>
  Math.sin(Math.PI * span(ms, start, duration));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const mixPoint = (a: Point, b: Point, t: number): Point => ({
  x: mix(a.x, b.x, t),
  y: mix(a.y, b.y, t),
});

/**
 * Progress whose speed dips smoothly to `depth` (a fraction of normal speed) across a window and
 * recovers, so an acted beat slows the body without ever stopping it dead.
 */
export function withSlow(t: number, at: number, length: number, depth: number): number {
  const q = clamp(t);
  const s = Math.max(0, Math.min(length, q - at));
  // Speed is 1 - (1 - depth)·sin²(π·s/length) inside the window; integrate it and renormalise.
  const lost = s / 2 - (length * Math.sin((2 * Math.PI * s) / length)) / (4 * Math.PI);
  return (q - (1 - depth) * lost) / (1 - ((1 - depth) * length) / 2);
}

/**
 * Foot offset and lift for a walk cycle that keeps the stance foot fixed in the world: during
 * stance the foot moves back exactly as far as the body moves forward.
 */
export function gait(distance: number, stride: number, offset: number, lift: number) {
  const c = (((distance / stride + offset) % 1) + 1) % 1;
  if (c < 0.5) return { x: stride / 4 - (stride / 2) * (c / 0.5), y: 0, swing: 0 };
  const s = (c - 0.5) / 0.5;
  return { x: -stride / 4 + (stride / 2) * ease(s), y: Math.sin(Math.PI * s) * lift, swing: s };
}
