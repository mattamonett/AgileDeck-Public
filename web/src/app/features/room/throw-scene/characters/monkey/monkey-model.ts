import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import { monkeyThrowPose, type MonkeyPlan } from './monkey-choreography';
import { stretchBetween } from '../../kit';

function oval(
  parent: THREE.Object3D,
  color: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  roughness = 0.7,
) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshStandardMaterial({ color, roughness }),
  );
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
function joint(parent: THREE.Object3D, name: string, radius: number, color: number) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.05, 1, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
  );
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}
export function makeMonkey(): THREE.Group {
  const monkey = new THREE.Group();
  monkey.name = 'mischievous-monkey';
  const body = new THREE.Group();
  body.name = 'monkey-body';
  monkey.add(body);
  oval(body, 0x835735, 0, 0, 0, 14, 18, 10);
  oval(body, 0xc4915c, 0, -2, 8, 9, 13, 3);
  const head = new THREE.Group();
  head.name = 'monkey-head';
  head.position.y = 30;
  oval(head, 0x895b39, 0, 0, 0, 17, 17, 12);
  for (const side of [-1, 1]) {
    oval(head, 0x895b39, side * 17, -2, 0, 7.5, 8, 4.5);
    oval(head, 0xd9a471, side * 18, -2, 3.8, 4.8, 5.5, 1.3);
    oval(head, 0xefc695, side * 5.5, 1, 10, 8, 11, 3);
    const eye = oval(head, 0x2f2c31, side * 5.5, 3, 13, 3.3, 4.4, 1.3, 0.15);
    eye.name = side < 0 ? 'monkey-eye-left' : 'monkey-eye-right';
    oval(eye, 0xffffff, -0.25, 0.35, 0.9, 0.28, 0.22, 0.25, 0.1);
    oval(head, 0x6e432b, side * 5.5, 10, 10.5, 4.5, 1.1, 1.3).name = 'monkey-brow';
    const arm = new THREE.Group();
    arm.name = side > 0 ? 'throwing-arm' : 'holding-arm';
    arm.position.set(side * 11, 9, 7);
    joint(arm, 'upper-arm', 3.2, 0x895b39);
    joint(arm, 'forearm', 2.9, 0x895b39);
    oval(arm, 0x895b39, 0, 0, 0, 3.4, 3.4, 3.4).name = 'elbow';
    const hand = new THREE.Group();
    hand.name = 'hand';
    oval(hand, 0xe9bd8c, 0, 0, 0, 4.5, 4, 3.5);
    for (let finger = 0; finger < 4; finger++)
      oval(hand, 0xe9bd8c, (finger - 1.5) * 1.6, 3, 1, 1.1, 3.2, 1.1).rotation.z =
        (finger - 1.5) * 0.06;
    oval(hand, 0xe0ad7b, -4, 0, 1, 1.5, 3, 1.5).rotation.z = -0.7;
    const grip = new THREE.Object3D();
    grip.name = 'poop-grip';
    grip.position.set(0, 6.9, 3);
    hand.add(grip);
    arm.add(hand);
    body.add(arm);
    const leg = new THREE.Group();
    leg.name = 'monkey-leg-' + side;
    leg.position.set(side * 7, -12, 0);
    joint(leg, 'upper-leg', 3.6, 0x895b39);
    joint(leg, 'lower-leg', 3.2, 0x895b39);
    oval(leg, 0x895b39, 0, 0, 0, 3.8, 3.8, 3.8).name = 'knee';
    const foot = new THREE.Group();
    foot.name = 'foot';
    oval(foot, 0xd8a573, 2, 0, 3, 6, 3, 4);
    for (let toe = 0; toe < 3; toe++) oval(foot, 0xe9bd8c, 5.5, 0, 1 + toe * 2, 2, 2, 1.6);
    leg.add(foot);
    monkey.add(leg);
  }
  oval(head, 0xe1b17d, 0, -5, 12, 11, 6.5, 4);
  oval(head, 0x4d352b, -2, -1, 15, 1.2, 0.8, 0.8);
  oval(head, 0x4d352b, 2, -1, 15, 1.2, 0.8, 0.8);
  oval(head, 0x46312c, 0, -7, 16, 7.5, 3.1, 1.2);
  const teeth = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1.8, 1),
    new THREE.MeshStandardMaterial({ color: 0xffe9c2 }),
  );
  teeth.position.set(0, -6, 17);
  head.add(teeth);
  oval(head, 0xcb807b, 0, -8.5, 17, 3.6, 1, 0.5);
  body.add(head);
  const tail = new THREE.Group();
  tail.name = 'monkey-tail';
  tail.position.set(-10, -6, -5);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-14, -3, 0),
    new THREE.Vector3(-19, 7, 0),
    new THREE.Vector3(-10, 14, 0),
    new THREE.Vector3(-4, 8, 0),
    new THREE.Vector3(-11, 5, 0),
  ]);
  tail.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(curve, 30, 2.6, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x895b39, roughness: 0.7 }),
    ),
  );
  body.add(tail);
  return monkey;
}
function limb(
  root: THREE.Object3D,
  x: number,
  y: number,
  length: number,
  bendSide: number,
  arm: boolean,
) {
  const distance = Math.hypot(x, y);
  const bend = Math.sqrt(Math.max(0, length * length - (distance * distance) / 4));
  const ex = x / 2 - ((bendSide * y) / Math.max(0.001, distance)) * bend;
  const ey = y / 2 + ((bendSide * x) / Math.max(0.001, distance)) * bend;
  stretchBetween(requireSceneObject(root, arm ? 'upper-arm' : 'upper-leg'), 0, 0, ex, ey);
  stretchBetween(requireSceneObject(root, arm ? 'forearm' : 'lower-leg'), ex, ey, x, y);
  requireSceneObject(root, arm ? 'elbow' : 'knee').position.set(ex, ey, 0);
  requireSceneObject(root, arm ? 'hand' : 'foot').position.set(x, y, 0);
}
export function monkeyPose(
  monkey: THREE.Group,
  ms: number,
  plan: MonkeyPlan,
  distance: number,
  stride: number,
) {
  const pose = monkeyThrowPose(ms, plan);
  const body = requireSceneObject(monkey, 'monkey-body');
  body.position.x = pose.shift;
  body.rotation.z = pose.lean;
  const throwArm = requireSceneObject(monkey, 'throwing-arm');
  limb(throwArm, pose.x - 11, pose.y - 9, 15, 1, true);
  requireSceneObject(throwArm, 'hand').rotation.z = pose.angle;
  const last = plan.shots.at(-1);
  const taunt =
    last && ms > last.release + last.flight && ms < plan.retreat
      ? Math.sin(((ms - last.release - last.flight) / 750) * Math.PI) * 0.15
      : 0;
  const holding = requireSceneObject(monkey, 'holding-arm');
  limb(holding, -8, -15 + taunt * 18, 15, -1, true);
  requireSceneObject(monkey, 'monkey-head').rotation.z = taunt;
  for (const side of [-1, 1]) {
    const phase = distance * 0.17 * plan.step + (side < 0 ? Math.PI : 0);
    limb(
      requireSceneObject(monkey, 'monkey-leg-' + side),
      Math.sin(phase) * stride * 4,
      -11 + Math.max(0, Math.cos(phase)) * stride * 3,
      13,
      -side,
      false,
    );
    const eye = requireSceneObject(monkey, side < 0 ? 'monkey-eye-left' : 'monkey-eye-right');
    const blink = Math.abs(Math.sin(ms / 530 + plan.force * 2));
    eye.scale.y =
      4.4 * (plan.wink && taunt > 0.1 && side < 0 ? 0.15 : blink < 0.07 ? 0.15 + blink * 11 : 1);
  }
  requireSceneObject(monkey, 'monkey-tail').rotation.z =
    Math.sin(ms / 230) * 0.06 + pose.lean * 0.4;
}
