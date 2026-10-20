import type { Point } from '../flight/flight-math';

/**
 * Samples an approach's real position function and reports, relative to its mean step, the
 * slowest step between 15 % and 85 % of the approach and the pace at any moment. Each sample
 * sums `substeps` finer chords, so a tight turn still counts the distance actually travelled.
 */
export function approachPace(position: (t: number) => Point, samples = 400, substeps = 1) {
  const steps: number[] = [];
  let previous = position(0);
  for (let i = 1; i <= samples; i++) {
    let travelled = 0;
    for (let j = 1; j <= substeps; j++) {
      const at = position((i - 1 + j / substeps) / samples);
      travelled += Math.hypot(at.x - previous.x, at.y - previous.y);
      previous = at;
    }
    steps.push(travelled);
  }
  const mean = steps.reduce((sum, step) => sum + step, 0) / samples;
  const pace = (t: number) =>
    (steps[Math.max(0, Math.min(samples - 1, Math.floor(t * samples)))] ?? 0) / mean;
  let slowest = Infinity;
  for (let i = Math.ceil(samples * 0.15); i < Math.floor(samples * 0.85); i++)
    slowest = Math.min(slowest, pace(i / samples));
  return { slowest, pace };
}
