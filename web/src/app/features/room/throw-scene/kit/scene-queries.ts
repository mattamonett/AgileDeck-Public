import * as THREE from 'three';
import type { Point } from '../flight/flight-math';

const lowestVertex = new THREE.Vector3();
/** Lowest world-space y of every visible mesh, from its real transformed vertices. */
export function lowestWorldY(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  let lowest = Infinity;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !visibleInTree(o, root)) return;
    const points = o.geometry.getAttribute('position');
    for (let i = 0; i < points.count; i++)
      lowest = Math.min(
        lowest,
        lowestVertex.fromBufferAttribute(points, i).applyMatrix4(o.matrixWorld).y,
      );
  });
  return lowest;
}
function visibleInTree(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = o; at; at = at.parent) {
    if (!at.visible) return false;
    if (at === root) return true;
  }
  return true;
}

/** World position of a named marker after the actor has been posed for this frame. */
const markerPoint = new THREE.Vector3();
export function screenOf(marker: THREE.Object3D): Point {
  marker.updateWorldMatrix(true, false);
  marker.getWorldPosition(markerPoint);
  return { x: markerPoint.x, y: -markerPoint.y };
}

export function setOpacity(root: THREE.Object3D, opacity: number) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.Line)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      m.transparent = true;
      m.opacity = opacity;
    }
  });
}
