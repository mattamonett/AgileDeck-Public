import * as THREE from 'three';
import { glow, outline, part } from '../../kit';

export interface Drift {
  readonly mesh: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial | THREE.MeshStandardMaterial
  >;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly turn: number;
  readonly flutter: number;
  readonly delay: number;
}
export interface Puff {
  readonly group: THREE.Group;
  readonly materials: readonly THREE.MeshBasicMaterial[];
}

const Z_GLYPH: readonly (readonly [number, number])[] = [
  [-1, 1],
  [1, 1],
  [1, 0.62],
  [-0.3, -0.62],
  [1, -0.62],
  [1, -1],
  [-1, -1],
  [-1, -0.62],
  [0.3, 0.62],
  [-1, 0.62],
];
const FEATHER: readonly (readonly [number, number])[] = [
  [0, -2.8],
  [0.7, -2],
  [1, -0.4],
  [0.8, 1.4],
  [0.3, 2.6],
  [0, 3],
  [-0.4, 2.4],
  [-0.9, 1.2],
  [-1, -0.6],
  [-0.6, -2],
];

/** Twelve straws: the first five shake loose from the knocking hand, the rest spill from the head. */
export function looseStraws(parent: THREE.Object3D, r: () => number): Drift[] {
  const straws: Drift[] = [];
  for (let i = 0; i < 12; i++) {
    const length = 4 + r() * 2.5;
    const g = new THREE.CylinderGeometry(0.5, 0.42, length, 5);
    const mesh = part(parent, `scarecrow-loose-straw-${i}`, g, glow(i % 2 ? 0xd9ab3c : 0xf3d167));
    const knock = i < 5;
    straws.push({
      mesh,
      vx: knock ? -(10 + r() * 60) * (r() < 0.3 ? -1 : 1) : (r() * 2 - 1) * 70,
      vy: -(knock ? 50 + r() * 80 : 40 + r() * 100),
      spin: (r() * 2 - 1) * 7,
      turn: r() * Math.PI,
      flutter: 2 + r() * 3,
      delay: knock ? i * 25 : (i - 5) * 30,
    });
  }
  return straws;
}

/** Two feathers shaken loose from the startled crow. */
export function looseFeathers(parent: THREE.Object3D, r: () => number): Drift[] {
  const feathers: Drift[] = [];
  for (let i = 0; i < 2; i++) {
    const mesh = part(
      parent,
      `scarecrow-crow-feather-${i}`,
      new THREE.ShapeGeometry(outline(FEATHER)),
      glow(0x262a3c),
    );
    feathers.push({
      mesh,
      vx: 55 + r() * 20,
      vy: -(20 + r() * 30),
      spin: 0,
      turn: r() * 0.6,
      flutter: 1.6 + r(),
      delay: 30 + i * 60,
    });
  }
  return feathers;
}

/** Three outlined Z puffs for the dozing scarecrow. */
export function snorePuffs(parent: THREE.Object3D): Puff[] {
  const snores: Puff[] = [];
  for (let i = 0; i < 3; i++) {
    const group = new THREE.Group();
    group.name = `scarecrow-snore-${i}`;
    parent.add(group);
    const rim = part(
      group,
      `scarecrow-snore-rim-${i}`,
      new THREE.ShapeGeometry(outline(Z_GLYPH.map(([x, y]) => [x * 1.35, y * 1.3] as const))),
      glow(0x44506a),
    );
    const fill = part(
      group,
      `scarecrow-snore-fill-${i}`,
      new THREE.ShapeGeometry(outline(Z_GLYPH)),
      glow(0xf6f1e2),
      0,
      0,
      0.1,
    );
    snores.push({ group, materials: [rim.material, fill.material] });
  }
  return snores;
}

/** Three short strokes that burst from the crow's beak. */
export function cawStrokes(parent: THREE.Object3D): Puff[] {
  const caws: Puff[] = [];
  for (let i = 0; i < 3; i++) {
    const group = new THREE.Group();
    group.name = `scarecrow-caw-${i}`;
    parent.add(group);
    const under = part(
      group,
      `scarecrow-caw-under-${i}`,
      new THREE.PlaneGeometry(1, 1.9),
      glow(0xfff4d6),
    );
    const line = part(
      group,
      `scarecrow-caw-line-${i}`,
      new THREE.PlaneGeometry(0.8, 1),
      glow(0x2c2c3a),
      0,
      0,
      0.1,
    );
    caws.push({ group, materials: [under.material, line.material] });
  }
  return caws;
}
