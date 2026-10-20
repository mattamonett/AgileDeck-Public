import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import {
  ROCKET_NOZZLE,
  ROCKET_SCALE,
  ROCKET_TIP,
  rocketPlan,
  type RocketPlan,
} from './rocket-choreography';

const plans = new WeakMap<THREE.Group, RocketPlan>();
function metal(color: number, roughness = 0.35, metalness = 0.4) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function marker(parent: THREE.Object3D, name: string, x: number, y: number, z: number) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
function mesh(
  parent: THREE.Object3D,
  name: string,
  g: THREE.BufferGeometry,
  m: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const o = new THREE.Mesh(g, m);
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
export function makeRocket(id: string): THREE.Group {
  const root = new THREE.Group();
  root.name = 'overenthusiastic-rocket';
  plans.set(root, rocketPlan(id));
  root.scale.setScalar(ROCKET_SCALE);
  mesh(
    root,
    'hull',
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, -12),
        new THREE.Vector2(5.5, -12),
        new THREE.Vector2(7, -8),
        new THREE.Vector2(7, 12),
        new THREE.Vector2(6.5, 16),
      ],
      24,
    ),
    metal(0xf0efe7, 0.28, 0.22),
  );
  mesh(root, 'red-nose', new THREE.ConeGeometry(7, 14, 24), metal(0xc64f42, 0.3, 0.2), 0, 23);
  marker(root, 'nose-tip', 0, ROCKET_TIP, 0);
  for (const y of [-9, 13])
    mesh(
      root,
      'hull-band',
      new THREE.CylinderGeometry(7.08, 7.08, 0.65, 24),
      metal(0x9eb2bc, 0.24, 0.75),
      0,
      y,
    );
  const port = mesh(
    root,
    'port-rim',
    new THREE.TorusGeometry(4.7, 0.75, 10, 24),
    metal(0xa5bcc4, 0.22, 0.8),
    0,
    6,
    7.1,
  );
  mesh(
    port,
    'port-glass',
    new THREE.SphereGeometry(1, 20, 12),
    new THREE.MeshPhysicalMaterial({
      color: 0x438fae,
      roughness: 0.1,
      metalness: 0.15,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
    0,
    0,
    0.3,
  ).scale.set(4.1, 4.1, 0.8);
  const gleam = mesh(
    port,
    'window-gleam',
    new THREE.CircleGeometry(1, 16),
    new THREE.MeshBasicMaterial({ color: 0xc4f1f7 }),
    -1.2,
    1.3,
    1.2,
  );
  gleam.scale.set(0.8, 1.5, 1);
  gleam.rotation.z = -0.5;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    mesh(
      port,
      'port-rivet',
      new THREE.SphereGeometry(0.4, 8, 6),
      metal(0xf4d6a0, 0.3, 0.55),
      Math.cos(a) * 4.7,
      Math.sin(a) * 4.7,
      0.7,
    );
  }
  for (const x of [-2.7, 2.7])
    for (const y of [-5, 1, 11])
      mesh(root, 'hull-rivet', new THREE.SphereGeometry(0.35, 8, 6), metal(0xa5adb1), x, y, 6.5);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(5, -1, 7, -5);
  shape.lineTo(8, -14);
  shape.quadraticCurveTo(4, -10, 0, -9);
  shape.closePath();
  for (const [i, side] of [-1, 1].entries()) {
    const fin = new THREE.Group();
    fin.name = `fin-${i}`;
    fin.position.set(side * 6.5, -3, -0.7);
    fin.scale.x = side;
    root.add(fin);
    mesh(
      fin,
      'fin-panel',
      new THREE.ExtrudeGeometry(shape, {
        depth: 1.4,
        bevelEnabled: true,
        bevelThickness: 0.3,
        bevelSize: 0.3,
        bevelSegments: 2,
        steps: 1,
      }),
      metal(0xb94c40, 0.42, 0.25),
    );
    marker(fin, 'fin-root', 0, 0, 0);
  }
  const rear = new THREE.Group();
  rear.name = 'rear-fin';
  rear.position.set(0, -3, -6.2);
  rear.rotation.y = Math.PI / 2;
  root.add(rear);
  mesh(
    rear,
    'fin-panel',
    new THREE.ExtrudeGeometry(shape, {
      depth: 1,
      bevelEnabled: true,
      bevelThickness: 0.2,
      bevelSize: 0.2,
      bevelSegments: 2,
      steps: 1,
    }),
    metal(0xa34337, 0.42, 0.25),
  );
  mesh(
    root,
    'engine-collar',
    new THREE.CylinderGeometry(5.2, 4.1, 5, 20),
    metal(0x81959e, 0.3, 0.65),
    0,
    -14.5,
  );
  mesh(
    root,
    'engine-bell',
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(3.7, -16),
        new THREE.Vector2(4, -17),
        new THREE.Vector2(5.1, -20),
        new THREE.Vector2(4.3, -20),
        new THREE.Vector2(3.2, -17),
      ],
      24,
    ),
    metal(0x566a74, 0.28, 0.8),
  );
  const aperture = mesh(
    root,
    'nozzle-aperture',
    new THREE.CircleGeometry(4.3, 24),
    new THREE.MeshBasicMaterial({ color: 0x253840 }),
    0,
    ROCKET_NOZZLE,
  );
  aperture.rotation.x = Math.PI / 2;
  marker(root, 'nozzle', 0, ROCKET_NOZZLE, 0);
  const plume = new THREE.Group();
  plume.name = 'engine-plume';
  plume.position.y = ROCKET_NOZZLE;
  root.add(plume);
  marker(plume, 'plume-origin', 0, 0, 0);
  marker(plume, 'plume-tip', 0, -30, 0);
  const fire = new THREE.Shape();
  fire.moveTo(0, 0);
  fire.bezierCurveTo(5, -4, 5, -10, 2, -18);
  fire.quadraticCurveTo(1, -24, 0, -30);
  fire.quadraticCurveTo(-2, -24, -3, -15);
  fire.bezierCurveTo(-6, -9, -4, -3, 0, 0);
  mesh(
    plume,
    'orange-plume',
    new THREE.ShapeGeometry(fire),
    new THREE.MeshBasicMaterial({
      color: 0xf59b47,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const core = mesh(
    plume,
    'white-core',
    new THREE.ShapeGeometry(fire),
    new THREE.MeshBasicMaterial({
      color: 0xffeed0,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    0,
    0,
    0.1,
  );
  core.scale.set(0.5, 0.7, 1);
  mesh(
    plume,
    'blue-throat',
    new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xb7edf4 }),
    0,
    -2,
    0.2,
  ).scale.set(2.3, 4, 1);
  return root;
}
export function nativeRocketPlan(root: THREE.Group): RocketPlan {
  const p = plans.get(root);
  if (!p) throw Error('Missing native rocket plan');
  return p;
}
export function rocketDetails(root: THREE.Group, ms: number, power: number, cough: boolean) {
  const plume = requireSceneObject(root, 'engine-plume');
  plume.visible = power > 0.01;
  plume.scale.set(0.8 + power * 0.35, 0.18 + power * 0.9, 1);
  for (let i = 0; i < 2; i++)
    requireSceneObject(root, `fin-${i}`).rotation.z =
      Math.sin(ms / 80 + i * Math.PI) * power * 0.035;
  const glass = requireSceneObject(root, 'port-glass');
  if (!(glass instanceof THREE.Mesh) || !(glass.material instanceof THREE.MeshPhysicalMaterial))
    throw Error('Missing rocket window');
  glass.material.color.setHex(cough ? 0xe2aa47 : 0x438fae);
}

export function ink(color: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
