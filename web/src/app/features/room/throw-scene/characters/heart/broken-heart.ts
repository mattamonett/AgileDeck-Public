import * as THREE from 'three';
import { HEART_SCALE, heartEase, heartPlan, type HeartPlan } from './heart-choreography';

export const HEART_SEAM: readonly (readonly [number, number])[] = [
  [0, 9],
  [-2, 3],
  [3, -3],
  [-2, -10],
  [0, -19],
];
export function heartShape(side = 0): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(0, 9);
  const s = side || -1;
  shape.bezierCurveTo(s * 10, 23, s * 25, 15, s * 20, 3);
  shape.bezierCurveTo(s * 17, -5, s * 7, -13, 0, -19);
  if (!side) {
    shape.bezierCurveTo(7, -13, 17, -5, 20, 3);
    shape.bezierCurveTo(25, 15, 10, 23, 0, 9);
  } else {
    for (let i = HEART_SEAM.length - 2; i >= 0; i--) {
      const at = HEART_SEAM[i];
      if (at) shape.lineTo(at[0], at[1]);
    }
  }
  shape.closePath();
  return shape;
}
export interface HeartHalf {
  readonly side: number;
  readonly root: THREE.Group;
  readonly mesh: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial[]>;
}
export interface HeartModel {
  readonly plan: HeartPlan;
  readonly intact: THREE.Group;
  readonly tip: THREE.Object3D;
  readonly sources: readonly THREE.Object3D[];
  readonly halves: readonly HeartHalf[];
}
const models = new WeakMap<THREE.Group, HeartModel>();
function candy(shape: THREE.Shape, name: string) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 4,
    bevelEnabled: true,
    bevelThickness: 1.1,
    bevelSize: 0.9,
    bevelSegments: 4,
    curveSegments: 24,
    steps: 1,
  });
  geometry.translate(0, 0, -2);
  const front = new THREE.MeshStandardMaterial({
    color: 0xed315e,
    roughness: 0.24,
    metalness: 0.15,
    transparent: true,
  });
  const edge = new THREE.MeshStandardMaterial({
    color: 0x971d42,
    roughness: 0.36,
    metalness: 0.12,
    transparent: true,
  });
  const mesh = new THREE.Mesh(geometry, [front, edge]);
  mesh.name = name;
  return mesh;
}
function shine(root: THREE.Group, side: number) {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 6, 12, 3.3),
    new THREE.Vector3(side * 11, 15, 3.3),
    new THREE.Vector3(side * 16, 12, 3.3),
    new THREE.Vector3(side * 17, 8, 3.3),
  ]);
  const gleam = new THREE.Mesh(
    new THREE.TubeGeometry(path, 14, 0.65, 6, false),
    new THREE.MeshBasicMaterial({
      color: 0xffdbe5,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    }),
  );
  gleam.name = 'gleam';
  root.add(gleam);
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.75, 10, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff4ef, transparent: true, depthWrite: false }),
  );
  dot.position.set(side * 17, 5.4, 3.3);
  root.add(dot);
}
export function makeHeart(id = 'heart'): THREE.Group {
  const root = new THREE.Group(),
    intact = new THREE.Group(),
    tip = new THREE.Object3D();
  root.name = 'hopeful-heart';
  intact.name = 'heart-intact';
  intact.add(candy(heartShape(), 'whole-heart'));
  shine(intact, -1);
  shine(intact, 1);
  tip.name = 'heart-tip';
  tip.position.set(0, -19, 3.1);
  intact.add(tip);
  root.add(intact);
  const sources = [-1, 1].map((side) => {
    const source = new THREE.Object3D();
    source.name = `love-source-${side}`;
    source.position.set(side * 11, 15, 3.3);
    intact.add(source);
    return source;
  });
  const halves: HeartHalf[] = [-1, 1].map((side) => {
    const group = new THREE.Group(),
      mesh = candy(heartShape(side), 'candy-half');
    group.name = side < 0 ? 'heart-left' : 'heart-right';
    group.add(mesh);
    shine(group, side);
    group.visible = false;
    root.add(group);
    return { side, root: group, mesh };
  });
  root.scale.setScalar(HEART_SCALE);
  models.set(root, { plan: heartPlan(id), intact, tip, halves, sources });
  return root;
}
export function heartModel(root: THREE.Group): HeartModel {
  const model = models.get(root);
  if (!model) throw Error('Missing native heart model');
  return model;
}
export function heartLowest(half: HeartHalf, angle: number): number {
  const positions = half.mesh.geometry.getAttribute('position');
  let lowest = Infinity;
  for (let i = 0; i < positions.count; i++) {
    lowest = Math.min(
      lowest,
      positions.getX(i) * Math.sin(angle) + positions.getY(i) * Math.cos(angle),
    );
  }
  return lowest;
}
export function heartTravelPulse(p: HeartPlan, ms: number) {
  const phase = (((ms / p.beat) % 1) + 1) % 1;
  const first = Math.sin(Math.PI * Math.min(1, phase / 0.22)) ** 2;
  const second =
    phase > 0.3 && phase < 0.5 ? Math.sin((Math.PI * (phase - 0.3)) / 0.2) ** 2 * 0.5 : 0;
  return (first + second) * (1 - heartEase((ms - p.travel) / (p.hit - p.travel)));
}
