import { clamp, ease } from '../../kit';
import { seededRandom, type Point } from '../../flight/flight-math';
import { landingVariation, type TargetBounds } from '../../landing/landing-geometry';
import { architectStrokes, strokeLength, strokePoint } from './architect-drawing';
import { laneRoute, lingeringProgress } from '../../flight/approach-flow';
export const ARCHITECT_DURATION = 9000;
export const ARCHITECT_WIPE_MS = 1400;
export const ARCHITECT_SCALE = 0.9;
export const architectEase = ease;
export interface ArchitectStrokeTime {
  readonly start: number;
  readonly end: number;
}
export interface ArchitectPlan {
  readonly pace: number;
  readonly wipe: number;
  readonly drawStart: number;
  readonly drawEnd: number;
  readonly strokes: readonly ArchitectStrokeTime[];
  readonly pressure: number;
  readonly pause: number;
  readonly detour: number;
  readonly step: number;
  readonly glasses: boolean;
  readonly departure: number;
  readonly exit: number;
  readonly spot: Point;
}
export function architectPlan(id: string): ArchitectPlan {
  const r = seededRandom(id + ':architect-whiteboard');
  const wipe = 1400 + r() * 160 - 80;
  const drawStart = wipe + 520;
  const duration = 3500 + r() * 240;
  const lift = 24 + r() * 10;
  const weights = architectStrokes.map((stroke) => strokeLength(stroke) * (0.85 + r() * 0.3));
  const total = weights.reduce((a, b) => a + b, 0);
  let time = drawStart;
  const strokes = weights.map((weight) => {
    const start = time;
    time += ((duration - lift * (weights.length - 1)) * weight) / total;
    const end = time;
    time += lift;
    return { start, end };
  });
  const drawEnd = time - lift;
  return {
    pace: 0.92 + r() * 0.16,
    wipe,
    drawStart,
    drawEnd,
    strokes,
    pressure: 0.85 + r() * 0.3,
    pause: 0.035 + r() * 0.05,
    detour: 12 + r() * 15,
    step: 0.9 + r() * 0.2,
    glasses: r() < 0.5,
    departure: drawEnd + 1250 + r() * 130,
    exit: 0.9 + r() * 0.15,
    spot: landingVariation(id),
  };
}
export function architectLandingPoint(
  p: ArchitectPlan,
  b: TargetBounds,
  view: Point,
  source: Point,
  chosenFacing?: number,
): Point {
  const toward = source.x < b.left + b.width / 2 ? 1 : -1;
  let facing = chosenFacing ?? (p.spot.x < 0.32 ? -toward : toward);
  if (chosenFacing === undefined) {
    if (b.left < 70 && b.left + b.width + 70 < view.x) facing = -1;
    else if (b.left + b.width > view.x - 70 && b.left > 70) facing = 1;
  }
  return { x: facing > 0 ? b.left - 28 : b.left + b.width + 28, y: b.top + b.height - 44 };
}
export function architectApproach(
  p: ArchitectPlan,
  start: Point,
  end: Point,
  view: Point,
  t: number,
  b: TargetBounds,
): Point {
  const u = lingeringProgress(t, 0.68, 0.8, p.pause);
  if ((start.x - b.left - b.width / 2) * (end.x - b.left - b.width / 2) < 0) {
    const lane =
      b.top + b.height + 70 < view.y - 50 ? b.top + b.height + 70 : Math.max(80, b.top - 48);
    return laneRoute(start, end, lane, u);
  }
  return {
    x: start.x + (end.x - start.x) * u,
    y:
      start.y +
      (end.y - start.y) * u +
      Math.sin(u * Math.PI) *
        Math.min(p.detour, Math.max(0, view.y - 50 - Math.max(start.y, end.y))),
  };
}
export function architectInkPoint(raw: readonly [number, number], b: TargetBounds): Point {
  return { x: b.left + 4 + raw[0] * (b.width - 8), y: b.top + b.height * (0.1 + 0.84 * raw[1]) };
}
export function architectPen(p: ArchitectPlan, ms: number) {
  let previous: readonly [number, number] = [0.94, 0.92];
  for (let i = 0; i < p.strokes.length; i++) {
    const timing = p.strokes[i],
      stroke = architectStrokes[i];
    if (!timing || !stroke) continue;
    if (ms < timing.start) {
      const prior = p.strokes[i - 1];
      const t = architectEase(
        (ms - (prior?.end ?? p.drawStart)) / (timing.start - (prior?.end ?? p.drawStart) || 1),
      );
      const to = strokePoint(stroke, 0);
      return {
        point: [
          previous[0] + (to[0] - previous[0]) * t,
          previous[1] + (to[1] - previous[1]) * t,
        ] as const,
        drawing: false,
        stroke: i,
      };
    }
    if (ms <= timing.end)
      return {
        point: strokePoint(stroke, (ms - timing.start) / (timing.end - timing.start)),
        drawing: true,
        stroke: i,
      };
    previous = strokePoint(stroke, 1);
  }
  return { point: previous, drawing: false, stroke: architectStrokes.length };
}
export function architectWipe(ms: number, p: ArchitectPlan) {
  const t = clamp(ms / p.wipe) * 6;
  const row = Math.min(5, Math.floor(t));
  const across = architectEase(t - row);
  const turn = architectEase(Math.min(across / 0.08, (1 - across) / 0.08));
  const next = row < 5 ? architectEase((across - 0.9) / 0.1) / 6 : 0;
  return {
    row,
    across,
    point: [row % 2 ? 1 - across : across, (row + 0.5) / 6 + next] as const,
    turn,
  };
}
export function architectCardPose(ms: number, p: ArchitectPlan, facing: number) {
  if (ms <= 0 || ms >= p.drawEnd) return { x: 0, y: 0, angle: 0 };
  const q = ms < p.wipe ? architectWipe(ms, p) : null;
  const drag = q ? Math.sin(q.across * Math.PI) * (q.row % 2 ? -1 : 1) * p.pressure : 0;
  return { x: drag * 0.7, y: 0, angle: facing * drag * 0.35 };
}
export function architectCardPoint(
  ms: number,
  point: Point,
  p: ArchitectPlan,
  b: TargetBounds,
  facing: number,
): Point {
  const pose = architectCardPose(ms, p, facing);
  const a = (pose.angle * Math.PI) / 180;
  const x = point.x - b.left - b.width / 2,
    y = point.y - b.top - b.height / 2;
  return {
    x: b.left + b.width / 2 + x * Math.cos(a) - y * Math.sin(a) + pose.x,
    y: b.top + b.height / 2 + x * Math.sin(a) + y * Math.cos(a),
  };
}
