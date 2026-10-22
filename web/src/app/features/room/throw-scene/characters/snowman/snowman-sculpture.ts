import * as THREE from 'three';
import { matte, outline, part } from '../../kit';
import type { SnowmanPlan } from './snowman-choreography';
import { SNOW, starGeometry } from './snowman-model';

const PEBBLE = 0x2a2c33;

export interface SculpturePiece {
  readonly group: THREE.Group;
  readonly keys: readonly (readonly [number, number])[];
  readonly marker: THREE.Object3D | null;
}
/** A sculpture volume as [x, y, radius] in sculpture units: where the blast chunks come from. */
export type SculptureVolume = readonly [number, number, number];

export interface Sculpture {
  readonly pieces: readonly SculpturePiece[];
  readonly volumes: readonly SculptureVolume[];
  /** How much the snowball is pressed flat under the sculpture. */
  readonly flat: number;
}

/** Lumps, a twig and a holly leaf on the pushed snowball, so its rolling is visible. */
export function buildSnowball(spin: THREE.Group): void {
  part(spin, 'snowball-snow', new THREE.SphereGeometry(1, 22, 16), matte(SNOW, 0.95));
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.4,
      e = (i % 2 ? 0.5 : -0.35) + i * 0.1;
    const lump = part(
      spin,
      'snowball-lump',
      new THREE.SphereGeometry(1, 8, 6),
      matte(0xd2e2ee, 0.95),
      Math.cos(a) * Math.cos(e) * 0.93,
      Math.sin(e) * 0.93,
      Math.sin(a) * Math.cos(e) * 0.93,
    );
    lump.scale.set(0.22, 0.16, 0.2);
  }
  const twig = part(
    spin,
    'snowball-twig',
    new THREE.CylinderGeometry(0.035, 0.05, 0.62, 5),
    matte(0x6e4a2c, 0.9),
    0.55,
    0.62,
    0.45,
  );
  twig.rotation.set(0.6, 0, -0.75);
  const leaf = part(
    spin,
    'snowball-holly',
    new THREE.ShapeGeometry(
      outline([
        [0, 0],
        [0.12, 0.1],
        [0.3, 0.06],
        [0.36, 0.18],
        [0.5, 0.12],
        [0.42, 0],
        [0.5, -0.12],
        [0.36, -0.18],
        [0.3, -0.06],
        [0.12, -0.1],
      ]),
    ),
    matte(0x2f7a3c, 0.6),
    -0.3,
    0.2,
    0.95,
  );
  leaf.rotation.set(0, -0.3, 0.4);
  part(
    spin,
    'snowball-berry',
    new THREE.SphereGeometry(0.08, 8, 6),
    matte(0xc8243a, 0.4),
    -0.3,
    0.2,
    1.0,
  );
}

/** Builds the plan's authored sculpture on the snowball. */
export function buildSculpture(sculpture: THREE.Group, plan: SnowmanPlan): Sculpture {
  const pieces: SculpturePiece[] = [];
  const volumes: SculptureVolume[] = [];
  const p = plan,
    R = p.ballEnd;
  const add = (
    name: string,
    x: number,
    y: number,
    keys: readonly (readonly [number, number])[],
    marker: THREE.Vector3 | null,
  ) => {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(x, y, 0);
    sculpture.add(group);
    let m: THREE.Object3D | null = null;
    if (marker) {
      m = new THREE.Object3D();
      m.name = `${name}-pat`;
      m.position.copy(marker);
      group.add(m);
    }
    const piece = { group, keys, marker: m };
    pieces.push(piece);
    return group;
  };
  const pebble = (parent: THREE.Object3D, x: number, y: number, z: number, size: number) =>
    part(
      parent,
      'sculpture-pebble',
      new THREE.SphereGeometry(size, 8, 6),
      matte(PEBBLE, 0.5),
      x,
      y,
      z,
    );
  if (p.sculpture === 'snowman') {
    // A tiny portrait of Flurry himself.
    const r1 = 0.66 * R,
      c1 = 2 * R + 0.8 * r1,
      r2 = 0.46 * R,
      c2 = c1 + r1 + 0.8 * r2;
    volumes.push([0, R, R], [0, c1, r1], [0, c2, r2]);
    part(
      add('sculpture-body', 0, c1, [[0, 1]], new THREE.Vector3(-0.5 * r1, 0.866 * r1, 0)),
      'sculpture-body-ball',
      new THREE.SphereGeometry(r1, 18, 12),
      matte(SNOW, 0.95),
    );
    part(
      add('sculpture-head', 0, c2, [[1, 1]], new THREE.Vector3(-0.5 * r2, 0.866 * r2, 0)),
      'sculpture-head-ball',
      new THREE.SphereGeometry(r2, 16, 12),
      matte(SNOW, 0.95),
    );
    const face = add('sculpture-face', 0, c2, [[2, 1]], null);
    for (const az of [-0.35, 0.35])
      pebble(face, Math.sin(az) * r2 * 0.95, r2 * 0.25, Math.cos(az) * r2 * 0.92, 0.1 * R);
    const nose = part(
      face,
      'sculpture-nose',
      new THREE.ConeGeometry(0.09 * R, 0.4 * R, 8),
      matte(0xf07a22, 0.6),
      0.1 * R,
      0,
      r2 * 1.05,
    );
    nose.rotation.set(Math.PI / 2, 0, 0);
    const arms = add('sculpture-arms', 0, c1, [[3, 1]], null);
    for (const s of [-1, 1]) {
      const twig = part(
        arms,
        'sculpture-twig',
        new THREE.CylinderGeometry(0.035 * R, 0.05 * R, 0.85 * r1, 5),
        matte(0x6e4a2c, 0.9),
        s * r1 * 1.25,
        r1 * 0.45,
        0,
      );
      twig.rotation.z = -s * 0.85;
    }
    const buttons = add('sculpture-buttons', 0, c1, [[4, 1]], null);
    for (const y of [0.25, -0.2]) pebble(buttons, 0, y * r1, r1 * 0.97, 0.08 * R);
    return { flat: 0, pieces, volumes };
  }
  if (p.sculpture === 'star') {
    const flat = 0.4,
      top = 2 * R * (1 - flat),
      S = 1.05 * R;
    volumes.push(
      [0, R * (1 - flat), R],
      [0, top + 0.7 * S, 0.7 * S],
      [-0.85 * R, top, 0.3 * R],
      [0.85 * R, top, 0.3 * R],
    );
    const star = add(
      'sculpture-star',
      0,
      top - 0.15 * R,
      [
        [1, 0.6],
        [2, 1],
      ],
      new THREE.Vector3(-0.45 * S, 0.81 * S + 0.25 * S, 0.27 * R),
    );
    part(star, 'sculpture-star-snow', starGeometry(S, 0.5 * R), matte(SNOW, 0.9), 0, 0.81 * S, 0);
    const snowballs = add('sculpture-snowballs', 0, 0, [[3, 1]], null);
    for (const s of [-1, 1])
      part(
        snowballs,
        'sculpture-small-ball',
        new THREE.SphereGeometry(0.28 * R, 12, 8),
        matte(SNOW, 0.95),
        s * 0.85 * R,
        1.02 * R + 0.2 * R,
        0.1 * R,
      );
    pebble(
      add('sculpture-sparkle', 0, top - 0.15 * R + 0.81 * S, [[4, 1]], null),
      0,
      0,
      0.3 * R,
      0.09 * R,
    );
    return { flat, pieces, volumes };
  }
  const flat = 0.25;
  const cones: readonly (readonly [number, number, number])[] = [
    [0.95 * R, 1.15 * R, 2 * R * (1 - flat) - 0.15 * R],
    [0.72 * R, 0.95 * R, 0],
    [0.5 * R, 0.8 * R, 0],
  ];
  let y = 0;
  volumes.push([0, R * (1 - flat), R]);
  cones.forEach(([radius, height, base], k) => {
    y = k ? y + (cones[k - 1]?.[1] ?? 0) * 0.62 : base;
    const cone = new THREE.ConeGeometry(radius, height, 12, 1);
    cone.translate(0, height / 2, 0);
    part(
      add(
        `sculpture-tier-${k}`,
        0,
        y,
        [[k, 1]],
        new THREE.Vector3(-0.45 * radius, 0.55 * height, 0),
      ),
      `sculpture-tier-${k}-snow`,
      cone,
      matte(SNOW, 0.9),
    );
    volumes.push([0, y + height * 0.35, radius * 0.8]);
  });
  const crown = y + (cones[2]?.[1] ?? 0);
  part(
    add('sculpture-topper', 0, crown, [[3, 1]], null),
    'sculpture-topper-ball',
    new THREE.SphereGeometry(0.2 * R, 10, 8),
    matte(SNOW, 0.95),
  );
  const ornaments = add('sculpture-ornaments', 0, 0, [[4, 1]], null);
  [
    [-0.35, 2.05],
    [0.3, 2.55],
    [-0.1, 3.05],
  ].forEach(([u, v]) =>
    pebble(ornaments, (u ?? 0) * R, (v ?? 0) * R - 0.15 * R, 0.55 * R, 0.08 * R),
  );
  return { flat, pieces, volumes };
}
