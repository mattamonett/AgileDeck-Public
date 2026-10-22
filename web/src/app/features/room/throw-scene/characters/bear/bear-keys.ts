import type { Point } from '../../flight/flight-math';
import { clamp, ease, mix } from '../../kit';
import { BEAR_STRIDE, type BearReach } from './bear-model';

/** One full-body pose the bear blends between. */
export interface BearKey {
  readonly hip: Point;
  readonly pitch: number;
  readonly roll: number;
  readonly headPitch: number;
  readonly headTurn: number;
  readonly headTilt: number;
  readonly jaw: number;
  readonly eyes: number;
  readonly cheeks: number;
  readonly ears: number;
  readonly sniff: number;
  readonly tail: number;
  readonly breath: number;
  readonly feet: readonly [BearReach, BearReach];
}
export function mixReach(a: BearReach, b: BearReach, t: number, arc = 0): BearReach {
  return {
    x: mix(a.x, b.x, t),
    y: mix(a.y, b.y, t) + arc * Math.sin(Math.PI * clamp(t)),
    angle: mix(a.angle, b.angle, t),
  };
}
export function mixKey(a: BearKey, b: BearKey, t: number, arc = 0): BearKey {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    hip: { x: mix(a.hip.x, b.hip.x, t), y: mix(a.hip.y, b.hip.y, t) },
    pitch: mix(a.pitch, b.pitch, t),
    roll: mix(a.roll, b.roll, t),
    headPitch: mix(a.headPitch, b.headPitch, t),
    headTurn: mix(a.headTurn, b.headTurn, t),
    headTilt: mix(a.headTilt, b.headTilt, t),
    jaw: mix(a.jaw, b.jaw, t),
    eyes: mix(a.eyes, b.eyes, t),
    cheeks: mix(a.cheeks, b.cheeks, t),
    ears: mix(a.ears, b.ears, t),
    sniff: mix(a.sniff, b.sniff, t),
    tail: mix(a.tail, b.tail, t),
    breath: mix(a.breath, b.breath, t),
    feet: [mixReach(a.feet[0], b.feet[0], t, arc), mixReach(a.feet[1], b.feet[1], t, arc)],
  };
}
/** Hip height that sets the rump's ellipsoid on the floor for a spine pitch. */
export function sitHip(pitch: number): number {
  return Math.hypot(9.5 * Math.sin(pitch), 9 * Math.cos(pitch)) - 0.5 * Math.cos(pitch);
}
/** Foot offset and lift for the walk cycle, as the kit's gait with this bear's stride. */
export function gaitStep(walked: number, offset: number) {
  const c = (((walked / BEAR_STRIDE + offset) % 1) + 1) % 1;
  if (c < 0.5) return { x: BEAR_STRIDE / 4 - (BEAR_STRIDE / 2) * (c / 0.5), y: 0 };
  const s = (c - 0.5) / 0.5;
  return { x: -BEAR_STRIDE / 4 + (BEAR_STRIDE / 2) * ease(s), y: Math.sin(Math.PI * s) * 3 };
}
