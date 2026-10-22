import * as THREE from 'three';
import { matte, outline, part } from '../../kit';
import { BEAR_PIE_RADIUS } from './bear-choreography';

/** Each bite takes three overlapping tooth scallops out of the rim. */
const TEETH: readonly (readonly [number, number, number])[] = [
  [-0.3, BEAR_PIE_RADIUS + 0.4, 2.1],
  [0, BEAR_PIE_RADIUS - 0.5, 2.5],
  [0.3, BEAR_PIE_RADIUS + 0.4, 2.1],
];
/** Pie outline radius at angle theta: a crimped crust with the given bites taken out of it. */
function bearPieRadius(theta: number, notches: readonly number[]): number {
  let r = BEAR_PIE_RADIUS + 0.22 * Math.sin(theta * 20);
  const dx = Math.cos(theta),
    dy = Math.sin(theta);
  for (const a of notches)
    for (const [off, radial, rho] of TEETH) {
      const cx = Math.cos(a + off) * radial,
        cy = Math.sin(a + off) * radial;
      const along = dx * cx + dy * cy,
        disc = along * along - (cx * cx + cy * cy) + rho * rho;
      if (disc < 0) continue;
      r = Math.min(r, Math.max(0.3, along - Math.sqrt(disc)));
    }
  return r;
}
function radialPoints(radius: (theta: number) => number): [number, number][] {
  return Array.from({ length: 120 }, (_, i) => {
    const a = (i / 120) * Math.PI * 2,
      r = radius(a);
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
}
function radialPath(radius: (theta: number) => number): THREE.Path {
  const path = new THREE.Path();
  radialPoints(radius).forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
  path.closePath();
  return path;
}

/** One state of the pie: crust shell, crimped rim, pumpkin filling and cream, with bites removed. */
export function pieStage(
  parent: THREE.Object3D,
  index: number,
  notches: readonly number[],
): THREE.Group {
  const stage = new THREE.Group();
  stage.name = `bear-pie-stage-${index}`;
  parent.add(stage);
  const outer = (a: number) => bearPieRadius(a, notches);
  const inner = (a: number) => Math.min(BEAR_PIE_RADIUS - 1.15, outer(a) - 0.35);
  const base = new THREE.ExtrudeGeometry(outline(radialPoints(outer)), {
    depth: 1.6,
    bevelEnabled: false,
  });
  base.translate(0, 0, -1.6);
  part(stage, 'bear-pie-shell', base, matte(0xc4884a, 0.75));
  const ring = outline(radialPoints(outer));
  ring.holes.push(radialPath(inner));
  const rim = new THREE.ExtrudeGeometry(ring, {
    depth: 0.9,
    bevelEnabled: true,
    bevelThickness: 0.35,
    bevelSize: 0.22,
    bevelSegments: 2,
  });
  part(stage, 'bear-pie-rim', rim, matte(0xe3a85e, 0.6));
  const filling = new THREE.ExtrudeGeometry(outline(radialPoints(inner)), {
    depth: 0.95,
    bevelEnabled: false,
  });
  part(stage, 'bear-pie-filling', filling, matte(0xd8691f, 0.45));
  const cream = part(
    stage,
    'bear-pie-cream',
    new THREE.SphereGeometry(1, 14, 10),
    matte(0xfff6e6, 0.5),
    0.4,
    0.5,
    1.3,
  );
  cream.scale.set(2, 1.8, 1.1);
  return stage;
}
