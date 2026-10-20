import { seededRandom, type Point } from '../../flight/flight-math';

export interface RocketRoute {
  bend: number;
  waves: number;
  phase: number;
  loop: boolean;
  loopStart: number;
  direction: number;
  duration: number;
  viewport?: Point;
}

export function rocketRoute(seed: string): RocketRoute {
  const random = seededRandom(seed + ':rocket');
  const loop = random() < 0.4;
  return {
    bend: 0.7 + random() * 0.6,
    waves: 1 + random() * 1.1,
    phase: random() * Math.PI * 2,
    loop,
    loopStart: 0.25 + random() * 0.18,
    direction: random() < 0.5 ? -1 : 1,
    duration: 1650 + random() * 250 + (loop ? 200 : 0),
  };
}

/** Smooth detours taper away at both anchors, including for throws within the same card. */
export function rocketPoint(start: Point, end: Point, route: RocketRoute, t: number): Point {
  if (t <= 0) return { ...start };
  if (t >= 1) return { ...end };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  const ux = distance > 1 ? dx / distance : 1;
  const uy = distance > 1 ? dy / distance : 0;
  const envelope = Math.sin(Math.PI * t) ** 2;
  // Accelerate gently off the pad, leaving enough time to read the turns.
  const travel = t * (0.7 + 0.3 * t);
  // Use the visible table's scale, so even nearby cards get a sweeping route.
  const across = route.viewport
    ? Math.abs(uy) * route.viewport.x + Math.abs(ux) * route.viewport.y
    : Math.max(500, distance * 0.9);
  const along = route.viewport
    ? Math.abs(ux) * route.viewport.x + Math.abs(uy) * route.viewport.y
    : Math.max(600, distance);
  const width = Math.min(620, across * 0.7) * route.bend;
  const wander = Math.min(280, along * 0.25);
  let forward =
    distance * travel + Math.sin(t * Math.PI * 2 + route.phase * 0.7) * wander * envelope;
  let sideways = Math.sin(t * Math.PI * 2 * route.waves + route.phase) * width * envelope;
  if (route.loop) {
    const s = Math.max(0, Math.min(1, (t - route.loopStart) / 0.34));
    const angle = s * Math.PI * 2;
    const radius = Math.min(135, 45 + across * 0.12);
    // A cycloidal turn doubles back naturally; sin² makes entry/exit velocity continuous.
    forward += Math.sin(angle) * Math.sin(Math.PI * s) ** 2 * radius * 1.8;
    sideways += (1 - Math.cos(angle)) * radius * route.direction;
  }
  const point = {
    x: start.x + ux * forward - uy * sideways,
    y: start.y + uy * forward + ux * sideways,
  };
  // Smoothly shrink excursions near viewport edges rather than clipping the path into corners.
  const base = { x: start.x + dx * travel, y: start.y + dy * travel };
  const offsetX = point.x - base.x;
  const offsetY = point.y - base.y;
  const roomX =
    offsetX < 0
      ? Math.max(0, base.x - 24)
      : route.viewport
        ? Math.max(0, route.viewport.x - 24 - base.x)
        : Infinity;
  const roomY =
    offsetY < 0
      ? Math.max(0, base.y - 24)
      : route.viewport
        ? Math.max(0, route.viewport.y - 24 - base.y)
        : Infinity;
  return {
    x:
      base.x + (Number.isFinite(roomX) ? Math.tanh(offsetX / Math.max(1, roomX)) * roomX : offsetX),
    y:
      base.y + (Number.isFinite(roomY) ? Math.tanh(offsetY / Math.max(1, roomY)) * roomY : offsetY),
  };
}
