import { clamp, mix } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';

type RoadSample = Point & { distance: number };
const roadCache = new Map<string, readonly RoadSample[]>();

/** Seeded, gentle wandering like the rocket, with a horizontal final approach. */
export function racePoint(
  start: Point,
  end: Point,
  t: number,
  bounds: TargetBounds,
  approach = end.x < bounds.left + bounds.width / 2 ? 1 : -1,
  seed = 'race',
): Point {
  t = clamp(t);
  if (t === 0) return { ...start };
  if (t === 1) return { ...end };
  const key = [
    start.x,
    start.y,
    end.x,
    end.y,
    bounds.left,
    bounds.top,
    bounds.width,
    bounds.height,
    approach,
    seed,
  ].join(':');
  let road = roadCache.get(key);
  if (!road) {
    const facing = approach;
    const margin = Math.min(42, bounds.width / 8, bounds.height / 8);
    const left = bounds.left + margin;
    const right = bounds.left + bounds.width - margin;
    const top = bounds.top + margin;
    const bottom = bounds.top + bounds.height - margin;
    const random = seededRandom(seed + ':car-route');
    const phaseX = random() * Math.PI * 2;
    const phaseY = random() * Math.PI * 2;
    const waves = 0.35 + random() * 0.35;
    const width = Math.min(
      bounds.width * (0.1 + random() * 0.1),
      Math.max(30, Math.abs(end.x - start.x) * 0.08),
    );
    const height = bounds.height * (0.2 + random() * 0.12);
    const room = Math.max(12, facing > 0 ? end.x - left : right - end.x);
    const reach = Math.min(100, room * 0.65);
    const control = {
      x: Math.max(left, Math.min(right, start.x + Math.cos(phaseX) * bounds.width * 0.18)),
      y: Math.max(top, Math.min(bottom, start.y + Math.sin(phaseY) * bounds.height * 0.22)),
    };
    const samples: RoadSample[] = [{ ...start, distance: 0 }];
    let previous = start;
    let distance = 0;
    for (let i = 1; i <= 240; i++) {
      const u = i / 240,
        v = 1 - u;
      const base = {
        x:
          v ** 3 * start.x +
          3 * v * v * u * control.x +
          3 * v * u * u * (end.x - facing * reach) +
          u ** 3 * end.x,
        y: v ** 3 * start.y + 3 * v * v * u * control.y + 3 * v * u * u * end.y + u ** 3 * end.y,
      };
      // Random broad sweeps fade out with zero slope at both anchors. No rocket loops.
      const envelope = u < 0.78 ? Math.sin((Math.PI * u) / 0.78) ** 2 : 0;
      const dx = Math.sin(u * Math.PI * 2 * waves + phaseX) * width * envelope;
      const dy = Math.sin(u * Math.PI * 2 * waves + phaseY) * height * envelope;
      const roomX = Math.max(0, dx < 0 ? base.x - left : right - base.x);
      const roomY = Math.max(0, dy < 0 ? base.y - top : bottom - base.y);
      const point = {
        x: base.x + Math.tanh(dx / Math.max(1, roomX)) * roomX,
        y: base.y + Math.tanh(dy / Math.max(1, roomY)) * roomY,
      };
      distance += Math.hypot(point.x - previous.x, point.y - previous.y);
      samples.push({ ...point, distance });
      previous = point;
    }
    road = samples;
    // Reflow replaces routes; keep this cache bounded across rooms and throws.
    if (roadCache.size >= 32) roadCache.clear();
    roadCache.set(key, road);
  }
  const last = road[road.length - 1];
  if (!last) return { ...end };
  // Arc-length sampling prevents sudden speed changes through the sweeping bends.
  const distance = last.distance * (0.65 * t + 0.35 * t * t);
  let previous = road[0];
  for (const point of road) {
    if (previous && point.distance >= distance) {
      const u =
        (distance - previous.distance) / Math.max(0.0001, point.distance - previous.distance);
      return { x: mix(previous.x, point.x, u), y: mix(previous.y, point.y, u) };
    }
    previous = point;
  }
  return { ...end };
}
