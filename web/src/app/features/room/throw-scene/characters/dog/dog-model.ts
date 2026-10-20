import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';

function oval(
  parent: THREE.Object3D,
  color: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  roughness = 0.8,
) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshStandardMaterial({ color, roughness }),
  );
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
function limb(parent: THREE.Object3D, name: string, radius: number, color: number) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.1, 1, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}
const up = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
function bone(object: THREE.Object3D, ax: number, ay: number, bx: number, by: number) {
  direction.set(bx - ax, by - ay, 0);
  object.position.set((ax + bx) / 2, (ay + by) / 2, 0);
  object.scale.y = direction.length();
  object.quaternion.setFromUnitVectors(up, direction.normalize());
}
export function makeDog(): THREE.Group {
  const dog = new THREE.Group();
  dog.name = 'puppy';
  oval(dog, 0xc98b53, 0, 0, 0, 22, 12, 11);
  oval(dog, 0xf0d5a9, 5, -4, 9, 16, 7, 3);
  oval(dog, 0x986237, -15, 4, 6, 8, 7, 5);
  oval(dog, 0xd49c64, 16, 6, 0, 9, 11, 9);
  const head = new THREE.Group();
  head.name = 'puppy-head';
  head.position.set(20, 14, 0);
  oval(head, 0xe0b17b, 0, 1, 0, 14, 15, 12);
  oval(head, 0xf6dfb9, 8, -5, 0, 11, 7, 10);
  oval(head, 0x2a242b, 17, -3, 0, 3, 3.5, 7, 0.25);
  oval(head, 0xffeee1, 18, -1.6, 4.8, 0.8, 0.6, 0.5, 0.2);
  const tongue = oval(head, 0xee8294, 12, -12, 2, 2.7, 4, 2);
  tongue.name = 'puppy-tongue';
  for (const side of [-1, 1]) {
    oval(head, 0xa67955, 9, -8, side * 8.5, 7, 0.7, 0.8).rotation.z = 0.15;
    oval(head, 0xead9bb, 3, 5, side * 10.8, 4.9, 5.8, 1.8);
    const eye = oval(head, 0x30232b, 3.7, 5.2, side * 12.1, 3.6, 4.6, 1.3, 0.12);
    eye.name = 'puppy-eye';
    oval(eye, 0xffffff, -0.22, 0.32, side * 0.92, 0.3, 0.22, 0.3, 0.05);
    oval(eye, 0xe7f4ff, 0.32, -0.2, side * 0.97, 0.12, 0.1, 0.15, 0.05);
    oval(head, 0xa46f41, 1.6, 11.5, side * 10, 4.3, 1, 1).rotation.z = 0.15;
    const ear = new THREE.Group();
    ear.name = 'puppy-ear';
    ear.position.set(-7, 9, side * 9);
    oval(ear, 0x87573c, -1, -8, 0, 5, 12, 3.2);
    oval(ear, 0xb17a56, 0, -9, side * 2, 2.6, 8, 0.8);
    head.add(ear);
    for (let i = 0; i < 3; i++)
      oval(head, 0xac8967, 10 + i * 2, -5 - (i % 2), side * 9.4, 0.5, 0.5, 0.4);
  }
  dog.add(head);
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(8.5, 1.7, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0x658daa, roughness: 0.5 }),
  );
  collar.rotation.y = Math.PI / 2;
  collar.position.set(15, 7, 0);
  dog.add(collar);
  const tag = oval(dog, 0xf5c967, 13, 0, 10.2, 2, 2.6, 0.6, 0.3);
  tag.name = 'puppy-tag';
  for (const [i, x, z] of [
    [0, -14, 7],
    [1, -14, -7],
    [2, 14, 7],
    [3, 14, -7],
  ] as const) {
    const leg = new THREE.Group();
    leg.name = 'puppy-leg-' + i;
    leg.position.set(x, -3, z);
    limb(leg, 'upper-leg', 3.2, i % 2 ? 0xb27b49 : 0xd49c64);
    limb(leg, 'lower-leg', 2.7, i % 2 ? 0xb27b49 : 0xd49c64);
    const knee = oval(leg, 0xc58f59, 0, -8, 0, 3.3, 3.3, 3.3);
    knee.name = 'knee';
    const paw = oval(leg, 0xf2d8b2, 2, -17, 0, 4.8, 2.8, 4);
    paw.name = 'paw';
    for (let toe = 0; toe < 3; toe++)
      oval(paw, 0xd9b48b, 0.25 + toe * 0.2, -0.13, 0.5, 0.035, 0.38, 0.08);
    const pad = oval(paw, 0xa77270, 0, -0.8, 0.1, 0.48, 0.1, 0.55);
    pad.name = 'paw-pad';
    dog.add(leg);
  }
  const tail = new THREE.Group();
  tail.name = 'puppy-tail';
  tail.position.set(-21, 4, 0);
  tail.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(-5, 6, 0),
          new THREE.Vector3(-5, 14, 0),
          new THREE.Vector3(1, 19, 0),
        ]),
        20,
        2.8,
        8,
        false,
      ),
      new THREE.MeshStandardMaterial({ color: 0xc98b53, roughness: 0.8 }),
    ),
  );
  oval(tail, 0xf4e0bf, 0, 18, 0, 3, 3.5, 3);
  dog.add(tail);
  const nozzle = new THREE.Object3D();
  nozzle.name = 'pee-origin';
  nozzle.position.set(-10, -9, -7);
  dog.add(nozzle);
  dogPose(dog, 0, 0, 0, 1);
  return dog;
}
/** Paw targets keep both ten-unit leg segments connected through running and the rear-leg lift. */
export function dogPose(
  dog: THREE.Group,
  distance: number,
  lift: number,
  head: number,
  wag: number,
  stride = distance > 0 ? 1 : 0,
) {
  for (let i = 0; i < 4; i++) {
    const leg = requireSceneObject(dog, 'puppy-leg-' + i);
    const phase = distance * 0.15 + (i === 0 || i === 3 ? 0 : Math.PI);
    let px = 1 + Math.sin(phase) * 7 * stride;
    let py = -17 + Math.max(0, Math.cos(phase)) * 5 * stride;
    if (i === 1) {
      px -= lift * 9;
      py += lift * 15;
    }
    const length = Math.hypot(px, py);
    const bend = Math.sqrt(Math.max(0, 100 - (length * length) / 4));
    const ex = px / 2 - (py / length) * bend;
    const ey = py / 2 + (px / length) * bend;
    bone(requireSceneObject(leg, 'upper-leg'), 0, 0, ex, ey);
    bone(requireSceneObject(leg, 'lower-leg'), ex, ey, px, py);
    requireSceneObject(leg, 'knee').position.set(ex, ey, 0);
    const paw = requireSceneObject(leg, 'paw');
    paw.position.set(px + 1, py, 0);
    paw.rotation.z = i === 1 ? -lift * 0.9 : 0;
    leg.rotation.x = i === 1 ? lift * 0.85 : 0;
  }
  const skull = requireSceneObject(dog, 'puppy-head');
  skull.rotation.z = head;
  for (const ear of skull.children)
    if (ear.name === 'puppy-ear') {
      ear.rotation.z = -head * 0.4 + Math.sin(distance * 0.15 - 0.7) * 0.12 * stride;
    }
  const tail = requireSceneObject(dog, 'puppy-tail');
  tail.rotation.z = Math.sin(wag * 0.014) * 0.22;
  tail.rotation.y = Math.sin(wag * 0.02) * 0.55;
  const blink = Math.abs(Math.sin(wag * 0.003 + 0.7));
  for (const eye of skull.children)
    if (eye.name === 'puppy-eye') eye.scale.y = 4.6 * (blink < 0.065 ? 0.15 + blink * 13 : 1);
  requireSceneObject(dog, 'puppy-tag').rotation.z = Math.sin(distance * 0.15) * 0.25;
}
export function dogRun(
  dog: THREE.Group,
  distance: number,
  facing: number,
  wag: number,
  stride = distance > 0 ? 1 : 0,
) {
  dog.scale.set(0.9 * facing, 0.9, 0.9);
  dog.rotation.set(0, 0, 0);
  dogPose(dog, distance, 0, -0.06, wag, stride);
}

export function liquid(color: number, geometry: THREE.BufferGeometry) {
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.18,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
}
