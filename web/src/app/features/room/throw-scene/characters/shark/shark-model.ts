import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import { sharkEase, SHARK_SCALE, type SharkPlan } from './shark-choreography';
import type { Point } from '../../flight/flight-math';
function oval(
  parent: THREE.Object3D,
  color: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  roughness = 0.4,
) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshStandardMaterial({ color, roughness }),
  );
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
function fin(parent: THREE.Object3D, points: readonly Point[], z: number) {
  const shape = new THREE.Shape();
  const first = points[0];
  if (!first) throw new Error('A shark fin needs points');
  shape.moveTo(first.x, first.y);
  for (const p of points.slice(1)) shape.lineTo(p.x, p.y);
  shape.closePath();
  const mesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: 1.2,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.7,
      bevelThickness: 0.6,
    }),
    new THREE.MeshStandardMaterial({ color: 0x536e7c, roughness: 0.4 }),
  );
  mesh.position.z = z;
  parent.add(mesh);
  return mesh;
}
export function makeShark(): THREE.Group {
  const shark = new THREE.Group();
  shark.name = 'predatory-shark';
  oval(shark, 0x6b8590, -2, 0, 0, 32, 14, 13);
  oval(shark, 0x718b96, 25, 3, 0, 13, 10, 10);
  oval(shark, 0xd9e2df, 2, -7, 0, 28, 7, 10);
  fin(
    shark,
    [
      { x: -17, y: 10 },
      { x: -8, y: 35 },
      { x: -3, y: 25 },
      { x: 7, y: 10 },
    ],
    -0.6,
  );
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.x = -29;
  oval(tail, 0x667f8b, -8, 0, 0, 14, 6, 5);
  fin(
    tail,
    [
      { x: -14, y: 1 },
      { x: -30, y: 26 },
      { x: -25, y: 6 },
      { x: -22, y: 0 },
      { x: -27, y: -18 },
      { x: -14, y: -5 },
      { x: -8, y: 0 },
    ],
    -0.6,
  );
  shark.add(tail);
  const jaw = new THREE.Group();
  jaw.name = 'jaw';
  jaw.position.set(10, -5, 0);
  oval(jaw, 0xdce7e3, 12, -3, 0, 14, 4, 10);
  shark.add(jaw);
  for (const side of [-1, 1]) {
    const mouth = oval(shark, 0x2e111a, 22, -5, side * 12, 12, 4, 1.5);
    mouth.name = 'mouth-' + side;
    oval(shark, 0x92777c, 22, 0.3, side * 13, 13, 1.2, 1);
    oval(jaw, 0xad7075, 12, 0, side * 10, 13, 1.4, 1.1);
    for (let i = 0; i < 6; i++) {
      const upper = new THREE.Mesh(
        new THREE.ConeGeometry(1.75, 5, 4),
        new THREE.MeshStandardMaterial({ color: 0xf4ede0, roughness: 0.32 }),
      );
      upper.rotation.z = Math.PI;
      upper.position.set(12.5 + i * 4.2, -0.5, side * 14);
      upper.name = 'upper-tooth';
      shark.add(upper);
      const lower = new THREE.Mesh(
        new THREE.ConeGeometry(1.6, 5, 4),
        new THREE.MeshStandardMaterial({ color: 0xeee8dd, roughness: 0.32 }),
      );
      lower.position.set(2.5 + i * 4.2, 1.5, side * 11);
      lower.name = 'lower-tooth';
      jaw.add(lower);
    }
    const eye = oval(shark, 0x15232c, 25, 6, side * 9.5, 2.2, 2.1, 1.4, 0.12);
    oval(eye, 0xbdd8df, -0.22, 0.32, side * 0.85, 0.22, 0.18, 0.25, 0.15);
    const brow = oval(shark, 0x4c6370, 25.5, 8.1, side * 9.7, 3.3, 0.7, 1);
    brow.rotation.z = -0.12;
    oval(shark, 0x304653, 34, 3, side * 5, 1.1, 0.5, 0.8);
    for (let i = 0; i < 5; i++)
      oval(shark, 0x344a56, 7 - i * 3, 0, side * 12.2, 0.7, 5 - i * 0.45, 0.8).rotation.z = -0.15;
    const flipper = new THREE.Group();
    flipper.name = 'pectoral-' + side;
    flipper.position.set(-2, -4, side * 9);
    fin(
      flipper,
      [
        { x: 0, y: 0 },
        { x: -22, y: -22 },
        { x: -17, y: -6 },
        { x: 8, y: 0 },
      ],
      0,
    );
    flipper.rotation.y = side * 0.2;
    shark.add(flipper);
  }
  const tip = new THREE.Object3D();
  tip.name = 'shark-bite-tip';
  tip.position.set(23.5, 4, 0);
  jaw.add(tip);
  return shark;
}
export function sharkSwim(shark: THREE.Group, ms: number, tailRate = 1, jawAngle = -0.08) {
  const tail = requireSceneObject(shark, 'tail');
  tail.rotation.y = Math.sin((ms / 160) * tailRate) * 0.26;
  tail.rotation.z = Math.sin((ms / 160) * tailRate + 0.5) * 0.035;
  requireSceneObject(shark, 'jaw').rotation.z = jawAngle;
  const gape = Math.max(0, -jawAngle);
  for (const side of [-1, 1]) {
    const mouth = requireSceneObject(shark, 'mouth-' + side);
    mouth.scale.y = 4 + gape * 10;
    mouth.position.y = -5 - gape * 5;
    requireSceneObject(shark, 'pectoral-' + side).rotation.x =
      side * (0.08 + Math.sin(ms / 370) * 0.07);
  }
}
export function sharkTravel(
  shark: THREE.Group,
  plan: SharkPlan,
  ms: number,
  progress: number,
  tangent: Point,
  facing: number,
) {
  const length = Math.max(0.001, Math.hypot(tangent.x, tangent.y));
  const heading = Math.acos(Math.max(-1, Math.min(1, tangent.x / length)));
  const bank = (-tangent.y / length) * 0.25;
  const settle = sharkEase((progress - 0.78) / 0.22);
  const yaw = heading * (1 - settle) + (facing < 0 ? Math.PI : 0) * settle;
  shark.scale.setScalar(SHARK_SCALE);
  shark.rotation.set(0, yaw, bank * (1 - settle), 'ZYX');
  shark.visible = true;
  sharkSwim(shark, ms, plan.tail);
}
