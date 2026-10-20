import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import { BABY_SCALE } from './baby-choreography';
const SKIN = 0xe1aa88;
export function babyOval(
  parent: THREE.Object3D,
  name: string,
  color: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  wet = false,
) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshStandardMaterial({ color, roughness: wet ? 0.2 : 0.7 }),
  );
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
function bone(parent: THREE.Object3D, name: string, radius: number) {
  const part = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.1, 1, 12),
    new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 }),
  );
  part.name = name;
  parent.add(part);
}
export function makeBabyBrent(): THREE.Group {
  const baby = new THREE.Group();
  baby.name = 'baby-brent';
  const torso = new THREE.Group();
  torso.name = 'torso';
  baby.add(torso);
  babyOval(torso, 'belly', SKIN, 0, 0, 0, 13, 16, 10);
  babyOval(torso, 'navel', 0xc28a6c, 0, -1, 10, 1.2, 1.2, 0.5);
  const diaper = new THREE.Group();
  diaper.name = 'diaper';
  torso.add(diaper);
  babyOval(diaper, 'diaper-padding', 0xfffcf1, 0, -12, 0, 15, 10, 11);
  babyOval(diaper, 'waistband', 0xc9dce8, 0, -7, 1, 14.5, 2.2, 10.5);
  babyOval(diaper, 'diaper-stain', 0x6b4923, 0, -17, 10, 8, 4, 1, true).visible = false;
  const leak = new THREE.Object3D();
  leak.name = 'diaper-seam';
  leak.position.set(0, -21, 9);
  diaper.add(leak);
  for (const side of [-1, 1]) {
    babyOval(diaper, 'diaper-tab', 0x8ebcd3, side * 11, -11, 8, 3, 2.5, 1);
    for (let i = 0; i < 3; i++)
      babyOval(diaper, 'stitch', 0xc9dce8, side * (8 + i * 2), -17, 9, 0.4, 0.6, 0.4);
    const arm = new THREE.Group();
    arm.name = side < 0 ? 'left-arm' : 'right-arm';
    arm.position.set(side * 6, 8, 6);
    torso.add(arm);
    bone(arm, 'upper-arm', 4.5);
    bone(arm, 'forearm', 3.9);
    babyOval(arm, 'elbow', SKIN, 0, 0, 0, 4.3, 4.3, 4.3);
    const hand = new THREE.Group();
    hand.name = 'hand';
    arm.add(hand);
    babyOval(hand, 'palm', SKIN, 0, 0, 0, 4.5, 3.1, 3.4);
    for (let i = 0; i < 4; i++)
      babyOval(hand, 'finger', SKIN, (i - 1.5) * 1.7, -2.8, 2.5, 0.8, 1.7, 1.3);
    babyOval(hand, 'thumb', SKIN, 4, 1, 0, 1.3, 2, 1.5);
    const finger = new THREE.Object3D();
    finger.name = 'wipe-fingertip';
    finger.position.set(0.85, -4.5, 3.8);
    hand.add(finger);
    const thumb = new THREE.Object3D();
    thumb.name = 'thumb-tip';
    thumb.position.set(4, 3, 0);
    hand.add(thumb);
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'left-leg' : 'right-leg';
    leg.position.set(side * 7, -10, 0);
    torso.add(leg);
    bone(leg, 'thigh', 5.7);
    bone(leg, 'shin', 4.7);
    babyOval(leg, 'knee', SKIN, 0, 0, 0, 5.2, 5.2, 5.2);
    const foot = new THREE.Group();
    foot.name = 'foot';
    leg.add(foot);
    babyOval(foot, 'sole', SKIN, 0, 0, 3, 5, 3, 6);
    for (let i = 0; i < 4; i++) babyOval(foot, 'toe', SKIN, (i - 1.5) * 2, 0, 7, 0.9, 1.3, 1.8);
  }
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 25;
  torso.add(head);
  babyOval(torso, 'neck', SKIN, 0, 17, 0, 5.5, 6, 5.5);
  babyOval(head, 'face', SKIN, 0, 0, 0, 17, 20, 13);
  babyOval(head, 'chin', SKIN, 0, -12, 3, 11, 8, 10);
  babyOval(head, 'back-hair', 0x99744d, 0, 7, -5, 17.2, 14, 10);
  for (const side of [-1, 1]) {
    babyOval(head, 'ear', SKIN, side * 17, -1, 0, 3.6, 6, 3.5);
    babyOval(head, 'inner-ear', 0xc78770, side * 18, -1, 2, 1.7, 3.4, 1.3);
    babyOval(head, 'temple-hair', 0xa18460, side * 14, 9, 2, 2.6, 8, 6);
    const eye = new THREE.Group();
    eye.name = side < 0 ? 'left-eye' : 'right-eye';
    eye.position.set(side * 6.5, 2, 11.8);
    head.add(eye);
    babyOval(eye, 'eye-white', 0xfff4e6, 0, 0, 0, 4.5, 3.2, 1.8);
    babyOval(eye, 'iris', 0x7493a0, 0, 0, 1.5, 2.3, 2.6, 0.6, true);
    babyOval(eye, 'pupil', 0x273238, 0, 0, 2, 1.2, 1.5, 0.3);
    babyOval(eye, 'eye-glint', 0xffffff, -0.6, 0.9, 2.3, 0.6, 0.7, 0.2);
    babyOval(eye, 'small-glint', 0xffffff, 0.8, -0.6, 2.2, 0.25, 0.3, 0.2);
    babyOval(head, side < 0 ? 'left-brow' : 'right-brow', 0x987852, side * 6.5, 7, 12, 4.8, 1.1, 1);
    babyOval(head, 'cheek', 0xe4a08a, side * 10, -4, 10, 4.8, 3.8, 2);
    babyOval(head, 'mustache', 0x9a846b, side * 3, -7, 12.5, 3.5, 1.2, 1);
  }
  for (let i = 0; i < 11; i++)
    babyOval(
      head,
      'hair-tuft',
      i % 2 ? 0xb1936b : 0x9b784e,
      -8 + i * 1.4,
      18.5 + Math.sin(i) * 1.4,
      3,
      1.2,
      4,
      2,
    ).rotation.z = -0.25;
  babyOval(head, 'nose', SKIN, 0, -2, 13, 3.6, 4, 4);
  babyOval(head, 'goatee', 0xa79b85, 0, -14, 10, 6, 3.5, 2);
  for (let i = 0; i < 9; i++)
    babyOval(
      head,
      'gray-stubble',
      i % 2 ? 0xd3cbbb : 0x837867,
      -4 + i,
      -14 + Math.sin(i) * 1.5,
      12,
      0.3,
      1.2,
      0.3,
    );
  babyOval(head, 'mouth', 0x652f32, 0, -10, 13, 4, 1.1, 1);
  babyOval(head, 'lower-lip', 0xd9887b, 0, -11.8, 13.2, 3.8, 0.7, 0.7);
  babyOval(head, 'tongue', 0xe9a092, 0, -11.4, 14, 2.4, 0.5, 0.4);
  for (const side of [-1, 1])
    babyOval(
      head,
      side < 0 ? 'left-tear-source' : 'right-tear-source',
      0x83daf1,
      side * 6.5,
      -1,
      14.2,
      0.8,
      0.8,
      0.5,
      true,
    ).visible = false;
  babyCrawl(baby, 0, 1, 0, 1);
  return baby;
}
const up = new THREE.Vector3(0, 1, 0);
function segment(part: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const line = b.clone().sub(a);
  part.position.copy(a).add(b).multiplyScalar(0.5);
  part.scale.y = line.length();
  part.quaternion.setFromUnitVectors(up, line.normalize());
}
export function babyLimb(
  root: THREE.Object3D,
  target: THREE.Vector3,
  arm: boolean,
  bendHint?: THREE.Vector3,
) {
  const length = arm ? 18 : 14,
    distance = target.length();
  const bend =
    bendHint
      ?.clone()
      .addScaledVector(target, -bendHint.dot(target) / Math.max(1e-6, distance * distance)) ??
    (arm
      ? new THREE.Vector3(-target.y, target.x, 0)
      : new THREE.Vector3(0, 0, 1).addScaledVector(
          target,
          -target.z / Math.max(1e-6, distance * distance),
        ));
  if (bend.lengthSq() < 1e-6) bend.set(1, 0, 0);
  bend
    .normalize()
    .multiplyScalar(
      (arm && root.position.x < 0 ? -1 : 1) *
        Math.sqrt(Math.max(0, length * length - (distance * distance) / 4)),
    );
  const joint = target.clone().multiplyScalar(0.5).add(bend),
    origin = new THREE.Vector3();
  segment(requireSceneObject(root, arm ? 'upper-arm' : 'thigh'), origin, joint);
  segment(requireSceneObject(root, arm ? 'forearm' : 'shin'), joint, target);
  requireSceneObject(root, arm ? 'elbow' : 'knee').position.copy(joint);
  requireSceneObject(root, arm ? 'hand' : 'foot').position.copy(target);
}
export function babyArmTo(baby: THREE.Group, side: number, world: THREE.Vector3) {
  const arm = requireSceneObject(baby, side < 0 ? 'left-arm' : 'right-arm');
  babyLimb(arm, arm.worldToLocal(world.clone()), true);
  requireSceneObject(arm, 'hand').rotation.set(0, 0, 0);
}
/** Both the crawl and seated pose use the same connected shoulders, hips and fixed bones. */
export function babyPose(
  baby: THREE.Group,
  sit: number,
  facing: number,
  distance: number,
  stride: number,
  step: number,
) {
  baby.scale.setScalar(BABY_SCALE);
  baby.rotation.set(0, 0, 0);
  const torso = requireSceneObject(baby, 'torso');
  torso.position.set(-facing * 4 * (1 - sit), -2 * (1 - sit), 0);
  torso.rotation.set(0, 0, -facing * 0.9 * (1 - sit));
  const head = requireSceneObject(baby, 'head');
  head.rotation.set(0, facing * 0.12 * (1 - sit), facing * 0.7 * (1 - sit));
  for (const side of [-1, 1]) {
    requireSceneObject(baby, side < 0 ? 'left-arm' : 'right-arm').position.set(
      side * 6 * sit,
      8,
      6 + side * 4 * (1 - sit),
    );
    requireSceneObject(baby, side < 0 ? 'left-leg' : 'right-leg').position.set(
      side * 7 * sit,
      -10,
      side * 5 * (1 - sit),
    );
  }
  baby.updateMatrixWorld(true);
  for (const side of [-1, 1]) {
    const phase = distance * 0.16 * step + (side < 0 ? Math.PI : 0),
      swing = Math.sin(phase) * stride * (1 - sit),
      lift = Math.max(0, Math.cos(phase)) * stride * (1 - sit);
    const palm = new THREE.Vector3(
      facing * 14 * (1 - sit) + side * (4 + sit * 10) + swing * 2,
      -22 + lift * 3,
      7 + side * 2 * (1 - sit),
    );
    babyArmTo(baby, side, baby.localToWorld(palm));
    const leg = requireSceneObject(baby, side < 0 ? 'left-leg' : 'right-leg');
    const hip = baby.worldToLocal(leg.getWorldPosition(new THREE.Vector3()));
    const kneeY = -21 + lift * 3,
      dy = kneeY - hip.y;
    const knee = new THREE.Vector3(
      hip.x + facing * Math.sqrt(Math.max(0, 14 * 14 - dy * dy)),
      kneeY,
      hip.z,
    );
    const crawlFoot = knee
      .clone()
      .add(new THREE.Vector3(-facing * Math.sqrt(14 * 14 - 4 * 4), 4, 0));
    const foot = crawlFoot.lerp(new THREE.Vector3(side * 13, -22, 6), sit);
    const localFoot = leg.worldToLocal(baby.localToWorld(foot));
    const localKnee = leg
      .worldToLocal(baby.localToWorld(knee))
      .add(new THREE.Vector3(0, 0, 8 * sit));
    babyLimb(leg, localFoot, false, localKnee.sub(localFoot.clone().multiplyScalar(0.5)));
  }
}
export function babyCrawl(
  baby: THREE.Group,
  distance: number,
  facing: number,
  stride = 1,
  step = 1,
) {
  baby.visible = true;
  babyPose(baby, 0, facing, distance, stride, step);
  const blink = Math.abs(Math.sin(distance * 0.018 + 1));
  for (const side of ['left', 'right'])
    requireSceneObject(baby, side + '-eye').scale.y = blink < 0.055 ? 0.15 + blink * 13 : 1;
  requireSceneObject(baby, 'mouth').scale.y = 1;
}

export function wet(name: string, color: number) {
  const part = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.18, transparent: true }),
  );
  part.name = name;
  return part;
}
