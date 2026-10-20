import * as THREE from 'three';
import type { Point } from './flight-math';

export type FlightShadow = THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

/** A soft ground shadow that follows a plain throw. */
export function makeShadow(): FlightShadow {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(14, 20),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  );
  shadow.scale.set(1.25, 0.28, 1);
  return shadow;
}

/** Keeps the shadow on the straight ground line under the arc, fading and spreading with lift. */
export function placeShadow(
  shadow: FlightShadow,
  point: Point,
  start: Point,
  end: Point,
  t: number,
  lift: number,
): void {
  shadow.position.set(point.x, -(start.y + (end.y - start.y) * t + 25), 0);
  shadow.material.opacity = 0.22 - lift * 0.13;
  shadow.scale.set(1.2 + lift, 0.28 + lift * 0.12, 1);
}
