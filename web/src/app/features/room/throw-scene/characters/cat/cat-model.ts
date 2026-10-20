import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import { requireSceneObject } from '../../engine/scene-object';

export const CAT_CLAW_REACH = 6.3;
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
  const part = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshStandardMaterial({ color, roughness }),
  );
  part.position.set(x, y, z);
  part.scale.set(sx, sy, sz);
  parent.add(part);
  return part;
}
function boneMesh(parent: THREE.Object3D, name: string, color: number, radius: number) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.1, 1, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
  );
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}
const up = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
function segment(object: THREE.Object3D, ax: number, ay: number, bx: number, by: number) {
  direction.set(bx - ax, by - ay, 0);
  object.position.set((ax + bx) / 2, (ay + by) / 2, 0);
  object.scale.y = direction.length();
  object.quaternion.setFromUnitVectors(up, direction.normalize());
}
export function makeCat(): THREE.Group {
  const cat = new THREE.Group();
  cat.name = 'ginger-kitten';
  const body = oval(cat, 0xdba05f, 0, 0, 0, 18, 13, 11);
  body.name = 'kitten-body';
  oval(cat, 0xf3d4a4, 4, -4, 8, 12, 7, 4);
  for (let i = 0; i < 3; i++) oval(cat, 0xb7783d, -11 + i * 6, 7, 8.5, 1.5, 4, 2).rotation.z = 0.25;
  const head = new THREE.Group();
  head.name = 'kitten-head';
  head.position.set(17, 14, 0);
  oval(head, 0xe7b06f, 0, 0, 0, 15, 15, 13);
  oval(head, 0xffe5be, 8, -5, 0, 9, 5.5, 9.5);
  oval(head, 0xba7d77, 14, -3, 0, 2, 1.6, 4.2, 0.4);
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.name = 'kitten-ear';
    ear.position.set(side > 0 ? -7 : -1, 16, side * 8);
    const outline = new THREE.Shape();
    outline.moveTo(-5, -4);
    outline.lineTo(5, -4);
    outline.lineTo(1, 7);
    outline.closePath();
    const outer = new THREE.Mesh(
      new THREE.ExtrudeGeometry(outline, {
        depth: 3.4,
        bevelEnabled: true,
        bevelSize: 0.6,
        bevelThickness: 0.6,
        bevelSegments: 2,
      }),
      new THREE.MeshStandardMaterial({ color: 0xe7b06f, roughness: 0.8 }),
    );
    outer.position.z = side > 0 ? 0 : -3.4;
    ear.add(outer);
    const inset = new THREE.Shape();
    inset.moveTo(-2.8, -2);
    inset.lineTo(2.8, -2);
    inset.lineTo(0.7, 4.3);
    inset.closePath();
    const inner = new THREE.Mesh(
      new THREE.ShapeGeometry(inset),
      new THREE.MeshStandardMaterial({ color: 0xe9a4a4, side: THREE.DoubleSide }),
    );
    inner.position.z = side * 4.1;
    ear.add(inner);
    head.add(ear);
    oval(head, 0xffe5be, 8, -5, side * 7, 4.5, 4.2, 4);
    oval(head, 0xf9eacf, 3.5, 3.8, side * 11.8, 5.1, 5.5, 1.8);
    const eye = oval(head, 0x548f7b, 4, 3.9, side * 13, 4.2, 4.8, 1.3, 0.14);
    eye.name = 'kitten-eye';
    oval(eye, 0x1c282a, 0.1, 0, side * 0.85, 0.35, 0.85, 0.28, 0.1);
    oval(eye, 0xffffff, -0.25, 0.32, side * 0.93, 0.28, 0.22, 0.22, 0.05);
    oval(eye, 0xffffff, 0.35, -0.2, side * 0.97, 0.1, 0.1, 0.12, 0.05);
    oval(head, 0xc0864b, 2, 10, side * 10, 4, 0.9, 1).rotation.z = 0.18;
    oval(head, 0x885e47, 11, -7, side * 8, 4, 0.6, 0.6).rotation.z = 0.15;
    for (let i = 0; i < 3; i++) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(7, -4 - i * 1.3, side * 10),
        new THREE.Vector3(12, -4 - i * 1.8, side * 12.5),
        new THREE.Vector3(17, -4 - i * 2.1, side * 14.5),
      ]);
      const whisker = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 8, 0.25, 5, false),
        new THREE.MeshStandardMaterial({ color: 0xf5ead7 }),
      );
      whisker.name = 'whisker';
      head.add(whisker);
    }
  }
  for (let i = 0; i < 3; i++)
    oval(head, 0xb98048, -3 + i * 4, 11, 9, 1, 3.8, 1).rotation.z = (i - 1) * 0.22;
  const tongue = oval(head, 0xed8e9f, 11, -10, 5, 2, 3, 1.2);
  tongue.name = 'kitten-tongue';
  tongue.visible = false;
  cat.add(head);
  for (const [i, x, z] of [
    [0, -12, 7],
    [1, -12, -7],
    [2, 13, 7],
    [3, 13, -7],
  ] as const) {
    const leg = new THREE.Group();
    leg.name = 'kitten-leg-' + i;
    leg.position.set(x, -3, z);
    boneMesh(leg, 'upper-leg', i % 2 ? 0xbe854d : 0xdba05f, 2.8);
    boneMesh(leg, 'lower-leg', i % 2 ? 0xbe854d : 0xdba05f, 2.5);
    const knee = oval(leg, 0xd8a164, 0, -8, 0, 3, 3, 3);
    knee.name = 'knee';
    const paw = new THREE.Group();
    paw.name = 'paw';
    oval(paw, 0xffe6bd, 0, 0, 0, 4.8, 2.7, 4.3);
    oval(paw, 0xe6a6a8, 0, -2.4, 0, 2.3, 0.35, 2.4);
    for (let j = 0; j < 3; j++) {
      oval(paw, 0xe6a6a8, 2, -2.2, (j - 1) * 2, 0.8, 0.4, 0.8);
      const claw = new THREE.Mesh(
        new THREE.ConeGeometry(0.7, 2.6, 6),
        new THREE.MeshStandardMaterial({ color: 0xf5eed9, roughness: 0.6 }),
      );
      claw.position.set(5, 0, (j - 1) * 2);
      claw.rotation.z = -Math.PI / 2;
      claw.name = 'claw';
      claw.visible = false;
      paw.add(claw);
      const tip = new THREE.Object3D();
      tip.name = 'claw-tip-' + j;
      tip.position.set(CAT_CLAW_REACH, 0, (j - 1) * 2);
      paw.add(tip);
    }
    leg.add(paw);
    cat.add(leg);
  }
  const tail = new THREE.Group();
  tail.name = 'kitten-tail';
  tail.position.set(-17, 4, 0);
  let parent: THREE.Object3D = tail;
  for (const [i, length] of [10, 8, 6].entries()) {
    const joint = new THREE.Group();
    joint.name = 'tail-joint-' + i;
    const piece = boneMesh(joint, 'tail-bone', i === 2 ? 0xf3d4a4 : 0xdba05f, 2.5 - i * 0.3);
    segment(piece, 0, 0, 0, length);
    oval(joint, 0xdba05f, 0, 0, 0, 2.6 - i * 0.3, 2.6 - i * 0.3, 2.6 - i * 0.3);
    if (i > 0) joint.position.y = i === 1 ? 10 : 8;
    parent.add(joint);
    parent = joint;
    const stripe = new THREE.Mesh(
      new THREE.TorusGeometry(2.4 - i * 0.3, 0.45, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0xab703c }),
    );
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = length * 0.6;
    joint.add(stripe);
  }
  oval(parent, 0xf3d4a4, 0, 6, 0, 2.3, 2.3, 2.3);
  cat.add(tail);
  catRig(cat, [null, null, null, null], 0, 0, 0, 0, 1, 0, 0, false);
  return cat;
}
export function catRig(
  cat: THREE.Group,
  targets: readonly (Point | null)[],
  distance: number,
  stride: number,
  groundOffset: number,
  held: number,
  eyes: number,
  headTilt: number,
  tailTime: number,
  claws: boolean,
  farHeld = held,
) {
  for (let i = 0; i < 4; i++) {
    const leg = requireSceneObject(cat, 'kitten-leg-' + i);
    const target = targets[i];
    const phase = distance * 0.12 + (i === 0 || i === 3 ? 0 : Math.PI);
    const px = target?.x ?? 1 + Math.sin(phase) * 5 * stride;
    const py = target?.y ?? -17 + groundOffset + Math.max(0, Math.cos(phase)) * 4 * stride;
    const length = Math.hypot(px, py);
    const bend = Math.sqrt(Math.max(0, 225 - (length * length) / 4));
    const side = i < 2 ? 1 : -1;
    const ex = px / 2 - ((side * py) / Math.max(0.001, length)) * bend;
    const ey = py / 2 + ((side * px) / Math.max(0.001, length)) * bend;
    segment(requireSceneObject(leg, 'upper-leg'), 0, 0, ex, ey);
    segment(requireSceneObject(leg, 'lower-leg'), ex, ey, px, py);
    requireSceneObject(leg, 'knee').position.set(ex, ey, 0);
    const paw = requireSceneObject(leg, 'paw');
    paw.position.set(px, py, 0);
    const curl = i === 2 ? held : i === 3 ? farHeld : 0;
    paw.rotation.set((-Math.PI / 2) * curl, 0, (-Math.PI / 2) * curl, 'ZYX');
    for (const claw of paw.children) if (claw.name === 'claw') claw.visible = claws && i === 2;
  }
  const head = requireSceneObject(cat, 'kitten-head');
  head.rotation.z = headTilt;
  for (const part of head.children) {
    if (part.name === 'kitten-eye') part.scale.y = 4.8 * eyes;
    if (part.name === 'kitten-ear') {
      part.rotation.z = -headTilt * 0.5;
      part.rotation.x = Math.sin(tailTime / 260) * 0.08;
    }
  }
  requireSceneObject(cat, 'kitten-tail').rotation.z = 0.55 + Math.sin(tailTime / 160) * 0.2;
  requireSceneObject(cat, 'tail-joint-0').rotation.z = 0.65;
  requireSceneObject(cat, 'tail-joint-1').rotation.z =
    -0.85 + Math.sin(tailTime / 210 - 0.6) * 0.15;
  requireSceneObject(cat, 'tail-joint-2').rotation.z = -0.95 + Math.sin(tailTime / 130 - 1) * 0.25;
}
export function catWalk(
  cat: THREE.Group,
  distance: number,
  facing: number,
  time: number,
  stride: number,
) {
  cat.scale.set(0.9 * facing, 0.9, 0.9);
  cat.rotation.set(0, 0, 0);
  catRig(cat, [null, null, null, null], distance, stride, 0, 0, 0.8, -0.08, time, false);
  requireSceneObject(cat, 'kitten-tongue').visible = false;
}

export function paper<G extends THREE.BufferGeometry>(color: number, geometry: G) {
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
}
