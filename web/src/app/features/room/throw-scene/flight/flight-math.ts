import type { SharkRoute } from '../characters/shark/shark-trick';
import type { RocketRoute } from '../characters/rocket/rocket-flight';

export interface Point {
  x: number;
  y: number;
}
export interface FlightProfile {
  duration: number;
  height: number;
  spin: number;
  drift: number;
  race?: {
    bounds: { left: number; top: number; width: number; height: number };
    facing: number;
    seed: string;
  };
  rocket?: RocketRoute;
  swim?: SharkRoute;
}

/** Stable variation means every viewer sees the same character of throw. */
export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = Math.imul(state ^ (state >>> 16), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    return ((state ^= state >>> 16) >>> 0) / 4294967296;
  };
}

export function flightProfile(id: string, distance: number, availableRise: number): FlightProfile {
  const random = seededRandom(id);
  return {
    duration: Math.min(1150, 620 + distance * 0.5) + random() * 180,
    height: Math.min(Math.max(35, availableRise), 65 + distance * (0.22 + random() * 0.12)),
    spin: (random() > 0.5 ? 1 : -1) * (2 + random() * 3),
    drift: (random() - 0.5) * 22,
  };
}

export function flightPoint(
  start: Point,
  end: Point,
  profile: FlightProfile,
  progress: number,
): Point {
  const t = Math.max(0, Math.min(1, progress));
  return {
    x: start.x + (end.x - start.x) * t + Math.sin(Math.PI * t) * profile.drift,
    y: start.y + (end.y - start.y) * t - 4 * profile.height * t * (1 - t),
  };
}

/** A straight walk with small hops that fade in and out over the trip. */
export function hopPoint(start: Point, end: Point, t: number, hops: number): Point {
  return {
    x: start.x + (end.x - start.x) * t,
    y:
      start.y +
      (end.y - start.y) * t -
      Math.abs(Math.sin(t * Math.PI * hops)) * 4 * Math.sin(Math.PI * t),
  };
}

export type ImpactKind = 'paper' | 'tomato' | 'cream' | 'petals' | 'liquid' | 'dust' | 'spark';
export function impactKind(emoji: string): ImpactKind {
  if (emoji === '📄') return 'paper';
  if (emoji === '🍅' || emoji === '🍒') return 'tomato';
  if (['🥧', '🍦', '🍰', '🎂'].includes(emoji)) return 'cream';
  if (emoji === '💐') return 'petals';
  if (['🍺', '☕', '💧'].includes(emoji)) return 'liquid';
  if (emoji === '💩') return 'dust';
  return 'spark';
}
