import * as THREE from 'three';

/** A strip whose centre line is supplied each frame; vertices are reused. */
export function stripGeometry(segments: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((segments + 1) * 6), 3));
  const index: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  g.setIndex(index);
  return g;
}
const stripA = new THREE.Vector3(),
  stripB = new THREE.Vector3(),
  stripC = new THREE.Vector3();
export function setStrip(
  geometry: THREE.BufferGeometry,
  segments: number,
  at: (t: number, out: THREE.Vector3) => void,
  width: (t: number) => number,
) {
  const positions = geometry.getAttribute('position');
  const step = 0.5 / segments;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    at(t, stripA);
    at(Math.min(1, t + step), stripB);
    at(Math.max(0, t - step), stripC);
    const dx = stripB.x - stripC.x,
      dy = stripB.y - stripC.y;
    const length = Math.hypot(dx, dy) || 1,
      half = width(t) / 2;
    const nx = (-dy / length) * half,
      ny = (dx / length) * half;
    positions.setXYZ(i * 2, stripA.x + nx, stripA.y + ny, stripA.z);
    positions.setXYZ(i * 2 + 1, stripA.x - nx, stripA.y - ny, stripA.z);
  }
  positions.needsUpdate = true;
  geometry.computeBoundingSphere();
}

export function lineGeometry(points: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points * 3), 3));
  return g;
}
const linePoint = new THREE.Vector3();
export function setLine(
  geometry: THREE.BufferGeometry,
  at: (t: number, out: THREE.Vector3) => void,
) {
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    at(i / (positions.count - 1), linePoint);
    positions.setXYZ(i, linePoint.x, linePoint.y, linePoint.z);
  }
  positions.needsUpdate = true;
  geometry.computeBoundingSphere();
}
