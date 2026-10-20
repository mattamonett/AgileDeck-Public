import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
const SKIN = 0xb47b53;
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
  roughness = 0.6,
) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshStandardMaterial({ color, roughness }),
  );
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
function bone(parent: THREE.Object3D, name: string, radius: number) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.05, 1, 12),
    new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.65 }),
  );
  mesh.name = name;
  parent.add(mesh);
}
function lapel(parent: THREE.Object3D, side: number) {
  const s = new THREE.Shape();
  s.moveTo(side * 6, 23);
  s.lineTo(side * 17, 15);
  s.lineTo(side * 12, 12);
  s.lineTo(side * 7, -11);
  s.lineTo(side * 2, 7);
  s.closePath();
  const mesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(s, {
      depth: 0.8,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.35,
      bevelThickness: 0.3,
      steps: 1,
    }),
    new THREE.MeshStandardMaterial({ color: 0x35373a, roughness: 0.4 }),
  );
  mesh.position.z = 9;
  parent.add(mesh);
}
export function makeNillSmith(): THREE.Group {
  const man = new THREE.Group();
  man.name = 'nill-smith';
  const body = new THREE.Group();
  body.name = 'nill-body';
  man.add(body);
  oval(body, 'suit-jacket', 0x202329, 0, 1, 0, 18, 23, 10);
  oval(body, 'white-shirt', 0xf6f1e6, 0, 13, 9, 8, 13, 2);
  oval(body, 'waistcoat', 0x2a2c30, 0, -5, 10, 10, 15, 1.4);
  oval(body, 'tie-knot', 0x17191e, 0, 18, 12, 2.7, 3, 1);
  oval(body, 'tie', 0x181b20, 0, 7, 12, 3.2, 9, 1);
  oval(body, 'tie-bar', 0xc4c6bd, 0, 9, 13, 3, 0.5, 0.4, 0.3);
  for (let i = 0; i < 3; i++)
    oval(body, 'waistcoat-button', 0x777e83, 0, -3 - i * 6, 11.8, 0.75, 0.75, 0.4);
  for (const side of [-1, 1]) {
    lapel(body, side);
    oval(body, 'collar', 0xfffbf0, side * 4, 22, 10, 3, 5.5, 1).rotation.z = -side * 0.4;
    const arm = new THREE.Group();
    arm.name = side > 0 ? 'right-arm' : 'left-arm';
    arm.position.set(side * 15, 13, 7);
    bone(arm, 'upper-arm', 4.8);
    bone(arm, 'forearm', 4.2);
    oval(arm, 'elbow', 0x24272c, 0, 0, 0, 4.7, 4.7, 4.7);
    const hand = new THREE.Group();
    hand.name = 'open-hand';
    oval(hand, 'shirt-cuff', 0xf1eee6, 0, 4.2, 0, 4.4, 1.8, 3.8);
    oval(hand, 'palm', SKIN, 0, 0, 0, 4.6, 5.2, 2.2);
    for (let i = 0; i < 4; i++)
      oval(
        hand,
        'finger',
        SKIN,
        (i - 1.5) * 2.2,
        -6,
        0,
        1.05,
        3.8 - Math.abs(i - 1.5) * 0.4,
        1.2,
      ).rotation.z = (i - 1.5) * 0.07;
    oval(hand, 'thumb', SKIN, side * 5.5, -0.5, 0, 1.5, 3.3, 1.5).rotation.z = -side * 0.55;
    const grip = new THREE.Object3D();
    grip.name = 'palm-contact';
    hand.add(grip);
    arm.add(hand);
    body.add(arm);
    const leg = new THREE.Group();
    leg.name = side > 0 ? 'right-leg' : 'left-leg';
    leg.position.set(side * 8, -18, 0);
    bone(leg, 'thigh', 5.8);
    bone(leg, 'shin', 5.2);
    oval(leg, 'knee', 0x282b31, 0, 0, 0, 5.7, 5.7, 5.7);
    const shoe = new THREE.Group();
    shoe.name = 'dress-shoe';
    oval(shoe, 'shoe-upper', 0x171c20, 2, -1, 3, 7.5, 3.6, 8, 0.25);
    oval(shoe, 'shoe-sole', 0x0c1116, 2, -3, 3, 8, 1.1, 8.5, 0.6);
    leg.add(shoe);
    man.add(leg);
  }
  oval(body, 'neck', SKIN, 0, 26, 0, 6, 7, 6);
  const head = new THREE.Group();
  head.name = 'nill-head';
  head.position.set(0, 41, 0);
  body.add(head);
  oval(head, 'face', SKIN, 0, 0, 0, 12.8, 17.5, 10);
  oval(head, 'jawline', 0xad7350, 0, -8, 2, 11, 8, 8);
  oval(head, 'short-hair', 0x292522, 0, 14, -1, 13, 5, 10);
  for (const side of [-1, 1]) {
    oval(head, 'ear', SKIN, side * 13, 0, 0, 3, 5.2, 3);
    oval(head, 'hair-temple', 0x312a25, side * 11.5, 9, -1, 1.7, 5.7, 6);
    const eye = oval(
      head,
      side < 0 ? 'left-eye' : 'right-eye',
      0xeee4ce,
      side * 5.4,
      2,
      9,
      3.2,
      1.5,
      1,
    );
    oval(eye, 'iris', 0x463428, 0, 0, 0.7, 0.4, 0.7, 0.5, 0.2);
    oval(eye, 'eye-glint', 0xffffff, -0.1, 0.25, 1.1, 0.1, 0.16, 0.2, 0.1);
    oval(head, 'brow', 0x3b2b23, side * 5.5, 6, 9, 4, 0.9, 1).rotation.z = -side * 0.07;
    oval(head, 'cheek', 0xba815a, side * 8, -2, 7, 3.5, 3.5, 2);
    oval(head, 'mustache', 0x3c2c24, side * 2.7, -7, 11, 3.1, 1.2, 0.8);
    oval(head, 'goatee-side', 0x362a24, side * 5, -11, 9, 1.3, 4, 1.3);
  }
  oval(head, 'nose', SKIN, 0, -3, 10, 3.4, 3.6, 3.6);
  oval(head, 'lower-lip', 0x956246, 0, -9.5, 11, 3.6, 0.8, 0.8);
  oval(head, 'mouth-opening', 0x493026, 0, -8.7, 10.8, 3, 0.6, 0.8);
  oval(head, 'goatee-chin', 0x302722, 0, -14, 8.8, 4.7, 2.5, 2);
  return man;
}
const up = new THREE.Vector3(0, 1, 0);
const line = new THREE.Vector3();
function segment(part: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  line.subVectors(b, a);
  part.position.copy(a).add(b).multiplyScalar(0.5);
  part.scale.y = line.length();
  part.quaternion.setFromUnitVectors(up, line.normalize());
}
export function nillLimb(root: THREE.Object3D, target: THREE.Vector3, arm: boolean) {
  const length = arm ? 18 : 17;
  const distance = target.length();
  const bend = arm
    ? new THREE.Vector3(-target.y, target.x, 0)
    : new THREE.Vector3(0, 0, 1).addScaledVector(
        target,
        -target.z / Math.max(0.000001, distance * distance),
      );
  if (bend.lengthSq() < 0.000001) bend.set(1, 0, 0);
  bend
    .normalize()
    .multiplyScalar(
      (arm && root.position.x < 0 ? -1 : 1) *
        Math.sqrt(Math.max(0, length * length - (distance * distance) / 4)),
    );
  const joint = target.clone().multiplyScalar(0.5).add(bend);
  const origin = new THREE.Vector3();
  segment(requireSceneObject(root, arm ? 'upper-arm' : 'thigh'), origin, joint);
  segment(requireSceneObject(root, arm ? 'forearm' : 'shin'), joint, target);
  requireSceneObject(root, arm ? 'elbow' : 'knee').position.copy(joint);
  requireSceneObject(root, arm ? 'open-hand' : 'dress-shoe').position.copy(target);
}
export function nillArmTo(man: THREE.Group, side: number, target: THREE.Vector3, yaw: number) {
  const arm = requireSceneObject(man, side > 0 ? 'right-arm' : 'left-arm');
  nillLimb(arm, arm.worldToLocal(target.clone()), true);
  requireSceneObject(arm, 'open-hand').rotation.y = yaw;
}
export function nillLegs(
  man: THREE.Group,
  distance: number,
  stride: number,
  rate: number,
  planted?: { x: number; y: number },
) {
  man.updateMatrixWorld(true);
  for (const side of [-1, 1]) {
    const leg = requireSceneObject(man, side > 0 ? 'right-leg' : 'left-leg');
    const phase = distance * 0.18 * rate + (side < 0 ? Math.PI : 0);
    if (planted)
      nillLimb(
        leg,
        leg.worldToLocal(new THREE.Vector3(planted.x + side * 8 * 0.8, -planted.y - 48 * 0.8, 160)),
        false,
      );
    else
      nillLimb(
        leg,
        new THREE.Vector3(
          Math.sin(phase) * stride * 5,
          -30 + Math.max(0, Math.cos(phase)) * stride * 4,
          0,
        ),
        false,
      );
  }
}
export function nillWalk(man: THREE.Group, distance: number, facing: number, stride = 1, rate = 1) {
  man.scale.setScalar(0.8);
  man.rotation.set(0, facing * 0.2, 0);
  man.visible = true;
  const body = requireSceneObject(man, 'nill-body');
  body.rotation.set(0, 0, 0);
  body.position.x = 0;
  for (const side of [-1, 1]) {
    const phase = distance * 0.18 * rate + (side < 0 ? Math.PI : 0);
    nillLimb(
      requireSceneObject(man, side > 0 ? 'right-arm' : 'left-arm'),
      new THREE.Vector3(Math.sin(phase) * stride * 4, -27, 0),
      true,
    );
    requireSceneObject(
      requireSceneObject(man, side > 0 ? 'right-arm' : 'left-arm'),
      'open-hand',
    ).rotation.y = 0;
  }
  nillLegs(man, distance, stride, rate);
}
