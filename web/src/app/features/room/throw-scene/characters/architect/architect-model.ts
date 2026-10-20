import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import { requireSceneObject } from '../../engine/scene-object';
function oval(
  parent: THREE.Object3D,
  name: string,
  color: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.78 }),
  );
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
function bone(parent: THREE.Object3D, name: string, radius: number, color: number) {
  const part = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.05, 1, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
  );
  part.name = name;
  parent.add(part);
}

export function makeArchitect(): THREE.Group {
  const man = new THREE.Group();
  man.name = 'architect';
  const skin = 0xd9a27f;
  const shirt = oval(man, 'checked-shirt', 0xb3c6d4, 0, 2, 0, 15, 21, 9);
  // A small repeating fabric texture follows the torso, including its curved sides.
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#b3c6d4';
      ctx.fillRect(0, 0, 64, 64);
      ctx.strokeStyle = '#718a9d';
      ctx.lineWidth = 2;
      for (let n = 0; n < 64; n += 16) {
        ctx.beginPath();
        ctx.moveTo(n, 0);
        ctx.lineTo(n, 64);
        ctx.moveTo(0, n);
        ctx.lineTo(64, n);
        ctx.stroke();
      }
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(5, 4);
      shirt.material.map = map;
      shirt.material.color.setHex(0xffffff);
    }
  }
  oval(man, 'belt', 0x45372b, 0, -16, 1, 14, 2.4, 9);
  oval(man, 'buckle', 0xa8a9a4, 0, -16, 10, 2.8, 2, 0.6);
  for (let i = 0; i < 5; i++) oval(man, 'button', 0xf0eee4, 0, 15 - i * 6, 9.2, 0.7, 0.7, 0.5);
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'left-leg' : 'right-leg';
    leg.position.set(side * 7, -17, 0);
    man.add(leg);
    bone(leg, 'thigh', 5.7, 0x304e60);
    bone(leg, 'shin', 5.1, 0x304e60);
    oval(leg, 'knee', 0x304e60, 0, 0, 0, 5.5, 5.5, 5.5);
    const shoe = new THREE.Group();
    shoe.name = 'shoe';
    leg.add(shoe);
    oval(shoe, 'shoe-upper', 0x343337, 1, -1, 3, 7, 3.5, 9);
    oval(shoe, 'shoe-sole', 0x20242b, 1, -3, 3, 7.4, 1, 9.2);
    const collar = oval(man, 'collar', 0xc5d4de, side * 5, 20, 7, 4, 6, 1.5);
    collar.rotation.z = side * 0.5;
    const arm = new THREE.Group();
    arm.name = side < 0 ? 'left-arm' : 'right-arm';
    arm.position.set(side * 14, 13, 7);
    man.add(arm);
    bone(arm, 'upper-arm', 4.7, 0xaabecf);
    bone(arm, 'forearm', 3.4, skin);
    const elbow = new THREE.Group();
    elbow.name = 'elbow';
    arm.add(elbow);
    oval(elbow, 'elbow-joint', skin, 0, 0, 0, 3.5, 3.5, 3.5);
    oval(elbow, 'rolled-cuff', 0xc9d7e1, 0, 3, 0, 4.8, 3, 4.8);
    const hand = new THREE.Group();
    hand.name = 'hand';
    arm.add(hand);
    oval(hand, 'palm', skin, 0, 0, 0, 3.8, 4.2, 2.5);
    for (let i = 0; i < 3; i++)
      oval(hand, 'grip-finger', skin, 2.1, -1 + i * 1.8, 2.7, 2.1, 0.8, 1).rotation.z = -0.2;
    oval(hand, 'thumb', skin, -2.5, 1, 2.1, 1.1, 2.5, 1.4).rotation.z = -0.5;
    const contact = new THREE.Object3D();
    contact.name = 'grip-contact';
    hand.add(contact);
  }
  oval(man, 'neck', skin, 0, 24, 0, 6, 7, 6);
  oval(man, 'face', skin, 0, 39, 0, 13, 17, 10);
  oval(man, 'brown-hair', 0x544537, 0, 51, -1, 13.2, 6, 10);
  for (const side of [-1, 1]) {
    oval(man, 'ear', skin, side * 13, 39, 0, 3, 5, 3);
    oval(man, 'side-hair', 0x64503c, side * 11, 46, 0, 2.5, 7, 7);
  }
  oval(man, 'trimmed-beard', 0x614934, 0, 29, 5, 11, 7.5, 6);
  oval(man, 'mouth', 0xd3a080, 0, 30, 11, 4, 1, 0.8);
  for (const side of [-1, 1]) {
    oval(man, 'mustache', 0x73563b, side * 2.7, 32, 10.5, 3, 1.2, 1);
    const eye = new THREE.Group();
    eye.name = side < 0 ? 'left-eye' : 'right-eye';
    eye.position.set(side * 5.5, 41, 9);
    man.add(eye);
    oval(eye, 'eye-white', 0xeee5d9, 0, 0, 0, 3.5, 2.2, 1.2);
    oval(eye, 'iris', 0x6b7778, 0, 0, 1.2, 1.3, 1.6, 0.5);
    oval(eye, 'pupil', 0x202a2b, 0, 0, 1.7, 0.6, 1, 0.3);
    oval(eye, 'eye-glint', 0xffffff, -0.35, 0.6, 2, 0.3, 0.4, 0.2);
    oval(man, 'brow', 0x66503c, side * 5.5, 45, 9, 4, 1, 1);
    const frame = new THREE.Mesh(
      new THREE.TorusGeometry(4.5, 0.45, 6, 20),
      new THREE.MeshStandardMaterial({ color: 0xaaa9a3, metalness: 0.65, roughness: 0.3 }),
    );
    frame.scale.y = 0.65;
    frame.name = side < 0 ? 'left-glasses' : 'right-glasses';
    frame.position.set(side * 6, 41, 11);
    man.add(frame);
    oval(man, 'glasses-temple', 0xaaa9a3, side * 11.5, 41, 4, 0.45, 0.5, 7).rotation.y =
      side * 0.15;
  }
  oval(man, 'bridge', 0xaaa9a3, 0, 41.5, 11, 2, 0.45, 0.5);
  oval(man, 'nose', skin, 0, 36, 10, 2.8, 3.5, 3);
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 39;
  for (const part of [...man.children])
    if (part.position.y >= 29) {
      man.remove(part);
      part.position.y -= 39;
      head.add(part);
    }
  man.add(head);
  const marker = new THREE.Group();
  marker.name = 'green-marker';
  man.add(marker);
  oval(marker, 'white-barrel', 0xf4f1e8, 0, 5, 3, 1.6, 5, 1.6);
  oval(marker, 'green-band', 0x16764c, 0, 9, 3, 1.65, 1.4, 1.65);
  oval(marker, 'marker-nib', 0x18382c, 0, 11.3, 3, 0.65, 1, 0.65);
  const tip = new THREE.Object3D();
  tip.name = 'marker-tip';
  tip.position.set(0, 12, 3);
  marker.add(tip);
  const eraser = new THREE.Group();
  eraser.name = 'eraser';
  man.add(eraser);
  oval(eraser, 'eraser-handle', 0x344c59, 0, 10, 3, 1.3, 11, 1.3);
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(12, 22, 4),
    new THREE.MeshStandardMaterial({ color: 0x344c59, roughness: 0.7 }),
  );
  pad.name = 'eraser-pad';
  pad.position.set(0, 23, 3);
  eraser.add(pad);
  const felt = new THREE.Mesh(
    new THREE.BoxGeometry(11.6, 21.6, 1),
    new THREE.MeshStandardMaterial({ color: 0x929488, roughness: 1 }),
  );
  felt.position.set(0, 23, 5);
  eraser.add(felt);
  const wipe = new THREE.Object3D();
  wipe.name = 'eraser-contact';
  wipe.position.set(0, 23, 5);
  eraser.add(wipe);
  oval(man, 'marker-pocket', 0x718a9d, -7, 8, 9.5, 4, 5, 1);
  oval(man, 'eraser-holster', 0x45372b, 7, -14, 9.5, 4, 5, 2);
  return man;
}

const up = new THREE.Vector3(0, 1, 0);
function segment(part: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const line = b.clone().sub(a);
  part.position.copy(a).add(b).multiplyScalar(0.5);
  part.scale.y = line.length();
  part.quaternion.setFromUnitVectors(up, line.normalize());
}
export function architectLimb(root: THREE.Object3D, target: THREE.Vector3, arm: boolean) {
  const length = arm ? 22 : 19;
  const distance = target.length();
  const bend = arm
    ? new THREE.Vector3(-target.y, target.x, 0)
    : new THREE.Vector3(0, 0, 1).addScaledVector(
        target,
        -target.z / Math.max(1e-8, distance * distance),
      );
  if (bend.lengthSq() < 1e-8) bend.set(1, 0, 0);
  bend
    .normalize()
    .multiplyScalar(
      (arm && root.position.x < 0 ? -1 : 1) *
        Math.sqrt(Math.max(0, length * length - (distance * distance) / 4)),
    );
  const joint = target.clone().multiplyScalar(0.5).add(bend);
  segment(requireSceneObject(root, arm ? 'upper-arm' : 'thigh'), new THREE.Vector3(), joint);
  segment(requireSceneObject(root, arm ? 'forearm' : 'shin'), joint, target);
  requireSceneObject(root, arm ? 'elbow' : 'knee').position.copy(joint);
  requireSceneObject(root, arm ? 'hand' : 'shoe').position.copy(target);
}
export function architectArmTo(man: THREE.Group, side: number, point: THREE.Vector3, angle = 0) {
  const arm = requireSceneObject(man, side > 0 ? 'right-arm' : 'left-arm');
  architectLimb(arm, arm.worldToLocal(point.clone()), true);
  requireSceneObject(arm, 'hand').rotation.set(0, 0, angle);
}
export function architectProps(man: THREE.Group, facing: number, swapped: boolean, stowed = false) {
  const marker = requireSceneObject(man, 'green-marker'),
    eraser = requireSceneObject(man, 'eraser');
  for (const [prop, side] of [
    [marker, swapped ? facing : -facing],
    [eraser, swapped ? -facing : facing],
  ] as const) {
    const hand = requireSceneObject(
      requireSceneObject(man, side > 0 ? 'right-arm' : 'left-arm'),
      'hand',
    );
    if (stowed) {
      man.add(prop);
      prop.position.set(prop === marker ? -7 : 7, -2, 7);
      prop.rotation.set(0, 0, prop === marker ? 0 : Math.PI);
    } else {
      hand.add(prop);
      prop.position.set(0, 0, 0);
      prop.rotation.set(0, 0, 0);
    }
  }
}
export function architectLegs(
  man: THREE.Group,
  distance: number,
  stride: number,
  rate: number,
  planted?: Point,
) {
  man.updateMatrixWorld(true);
  for (const side of [-1, 1]) {
    const leg = requireSceneObject(man, side > 0 ? 'right-leg' : 'left-leg');
    const phase = distance * 0.14 * rate + (side < 0 ? Math.PI : 0);
    const target = planted
      ? leg.worldToLocal(new THREE.Vector3(planted.x + side * 7 * 0.9, -planted.y - 49 * 0.9, 165))
      : new THREE.Vector3(
          Math.sin(phase) * stride * 6,
          -32 + Math.max(0, Math.cos(phase)) * stride * 4,
          0,
        );
    architectLimb(leg, target, false);
  }
}
export function architectWalk(
  man: THREE.Group,
  distance: number,
  facing: number,
  stride = 1,
  step = 1,
  stowed = false,
) {
  man.scale.setScalar(0.9);
  man.rotation.set(0, facing * 0.16, 0);
  man.updateMatrixWorld(true);
  for (const side of [-1, 1]) {
    const arm = requireSceneObject(man, side > 0 ? 'right-arm' : 'left-arm');
    const phase = distance * 0.14 * step + (side < 0 ? Math.PI : 0);
    architectArmTo(
      man,
      side,
      arm.localToWorld(new THREE.Vector3(Math.sin(phase) * stride * 4, -28, 0)),
      side * 0.1,
    );
  }
  architectLegs(man, distance, stride, step);
  architectProps(man, facing, false, stowed);
}
