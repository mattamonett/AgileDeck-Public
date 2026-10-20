import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
interface RoadPoint extends Point {
  readonly distance: number;
}
const courses = new Map<string, readonly RoadPoint[]>();
export function carCourse(
  seed: string,
  spot: Point,
  start: Point,
  end: Point,
  board: TargetBounds,
  target: TargetBounds,
  facing: number,
  progress: number,
) {
  progress = Math.max(0, Math.min(1, progress));
  if (progress === 0) return { point: { ...start }, distance: 0 };
  const toward = Math.sign(target.left + target.width / 2 - start.x) || facing;
  const key = [
    seed,
    start.x,
    start.y,
    end.x,
    end.y,
    board.left,
    board.top,
    board.width,
    board.height,
    target.left,
    target.top,
    target.width,
    target.height,
    facing,
  ].join(':');
  let road = courses.get(key);
  if (!road) {
    const lane =
      target.top + target.height + 48 + spot.y * 4 <= board.top + board.height - 12
        ? target.top + target.height + 48 + spot.y * 4
        : target.top - 48 - spot.y * 4;
    const outside = end.x - facing * (20 + spot.x * 8);
    const span = Math.hypot(end.x - start.x, end.y - start.y);
    const points3d =
      facing === toward
        ? [
            new THREE.Vector3(start.x, start.y),
            new THREE.Vector3(
              start.x + (end.x - start.x) * 0.42,
              start.y + (end.y - start.y) * 0.42 + (spot.y - 0.5) * Math.min(58, span * 0.25),
            ),
            new THREE.Vector3(
              end.x - facing * Math.min(36, Math.abs(end.x - start.x) * 0.16),
              end.y,
            ),
            new THREE.Vector3(end.x, end.y),
          ]
        : [
            new THREE.Vector3(start.x, start.y),
            new THREE.Vector3(start.x, lane),
            new THREE.Vector3(outside, lane),
            new THREE.Vector3(outside, end.y),
            new THREE.Vector3(end.x, end.y),
          ];
    const curve = new THREE.CatmullRomCurve3(points3d, false, 'centripetal');
    const points: RoadPoint[] = [{ ...start, distance: 0 }];
    let previous = start;
    let distance = 0;
    for (let i = 1; i <= 160; i++) {
      const raw = curve.getPoint(i / 160);
      const point =
        i === 160
          ? end
          : {
              x: Math.max(board.left + 12, Math.min(board.left + board.width - 12, raw.x)),
              y: Math.max(board.top + 12, Math.min(board.top + board.height - 12, raw.y)),
            };
      distance += Math.hypot(point.x - previous.x, point.y - previous.y);
      points.push({ ...point, distance });
      previous = point;
    }
    road = points;
    if (courses.size >= 32) courses.clear();
    courses.set(key, road);
  }
  const distance = (road.at(-1)?.distance ?? 0) * progress;
  if (progress === 1) return { point: { ...end }, distance };
  let previous = road[0];
  for (const point of road) {
    if (previous && point.distance >= distance) {
      const t =
        (distance - previous.distance) / Math.max(0.000001, point.distance - previous.distance);
      return {
        point: {
          x: previous.x + (point.x - previous.x) * t,
          y: previous.y + (point.y - previous.y) * t,
        },
        distance,
      };
    }
    previous = point;
  }
  return { point: { ...end }, distance };
}
