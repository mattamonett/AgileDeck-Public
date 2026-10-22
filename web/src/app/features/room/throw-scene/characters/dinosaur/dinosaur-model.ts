import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import { DINO_SCALE, dinoPlan, type DinoPlan } from './dinosaur-choreography';
import { stretchBetweenVectors } from '../../kit';

const plans = new WeakMap<THREE.Group, DinoPlan>();
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
    new THREE.MeshStandardMaterial({ color, roughness: 0.72 }),
  );
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
function marker(parent: THREE.Object3D, name: string, x: number, y: number, z: number) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
function bone(parent: THREE.Object3D, name: string, width: number, color: number) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(width, width * 0.8, 1, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.75 }),
  );
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}
function tooth(parent: THREE.Object3D, x: number, y: number, z: number, up: boolean) {
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(1.2, 3.5, 10),
    new THREE.MeshStandardMaterial({ color: 0xfff4da, roughness: 0.5 }),
  );
  mesh.position.set(x, y, z);
  mesh.rotation.z = up ? 0 : Math.PI;
  parent.add(mesh);
}
export function makeDinosaur(id = 'dinosaur'): THREE.Group {
  const root = new THREE.Group(),
    body = new THREE.Group();
  root.name = 'little-tyrannosaur';
  body.name = 'body';
  root.add(body);
  oval(body, 'torso', 0x72a36c, -2, 32, 0, 15, 18, 10);
  oval(body, 'belly', 0xd1de9e, 5, 30, 6, 9, 13, 7);
  oval(body, 'neck', 0x72a36c, 7, 43, 0, 8, 12, 7).rotation.z = -0.3;
  for (let i = 0; i < 7; i++) {
    const spine = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 5, 8),
      new THREE.MeshStandardMaterial({ color: 0x4b7552 }),
    );
    spine.position.set(-12 + i * 1.7, 34 + i * 2.1, 0);
    spine.rotation.z = 0.8;
    body.add(spine);
    for (const z of [-8.7, 8.7])
      oval(body, 'scale-spot', 0x5c8b5c, -8 + (i % 3) * 4, 25 + i * 2.5, z, 1.6, 1, 0.5);
  }
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(-13, 31, 0);
  body.add(tail);
  let previous = tail;
  for (const [i, length] of [12, 10, 8].entries()) {
    const link = new THREE.Group();
    link.name = `tail-link-${i}`;
    previous.add(link);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(3.8 - i * 1.15, 2.8 - i * 1.05, length, 12),
      new THREE.MeshStandardMaterial({ color: 0x608f60, roughness: 0.78 }),
    );
    mesh.position.x = -length / 2;
    mesh.rotation.z = Math.PI / 2;
    link.add(mesh);
    oval(link, 'tail-joint', 0x608f60, 0, 0, 0, 3.7 - i, 3.7 - i, 3.7 - i);
    const end = new THREE.Group();
    end.name = `tail-end-${i}`;
    end.position.x = -length;
    link.add(end);
    previous = end;
    if (i === 2) oval(end, 'tail-tip', 0x4e7d54, -0.3, 0, 0, 0.9, 0.9, 0.9);
  }
  for (let i = 0; i < 2; i++) {
    const leg = new THREE.Group();
    leg.name = `leg-${i}`;
    leg.position.set(i ? 5 : -6, 24, i ? 4 : -4);
    body.add(leg);
    oval(leg, 'haunch', 0x5f8e60, 0, -1, 0, 6.5, 8, 6);
    bone(leg, 'upper-leg', 4.2, 0x608f61);
    bone(leg, 'lower-leg', 2.9, 0x77a66d);
    oval(leg, 'knee', 0x6c9968, 0, -13, 0, 3.5, 3.5, 3.5);
    const foot = new THREE.Group();
    foot.name = 'foot';
    leg.add(foot);
    oval(foot, 'pad', 0x75a36a, 2, 2, 0, 6.5, 2, 4);
    for (let j = 0; j < 3; j++) {
      oval(foot, 'toe', 0x75a36a, 5 + j * 1.7, 1.5, (j - 1) * 2.5, 3.5, 1.5, 1.4);
      const claw = new THREE.Mesh(
        new THREE.ConeGeometry(1, 3, 10),
        new THREE.MeshStandardMaterial({ color: 0xffefce, roughness: 0.6 }),
      );
      claw.position.set(8 + j * 1.7, 1.2, (j - 1) * 2.5);
      claw.rotation.z = -Math.PI / 2;
      foot.add(claw);
    }
    marker(foot, 'sole', 0, 0, 0);
    marker(foot, 'toe-forward', 9, 0, 0);
    const arm = new THREE.Group();
    arm.name = `arm-${i}`;
    arm.position.set(10, 35, i ? 6.5 : -6.5);
    body.add(arm);
    bone(arm, 'upper-arm', 1.9, 0x5b885b);
    bone(arm, 'forearm', 1.4, 0x71a26a);
    oval(arm, 'elbow', 0x699663, 2, -2, 0, 1.8, 1.8, 1.8);
    const hand = new THREE.Group();
    hand.name = 'hand';
    arm.add(hand);
    oval(hand, 'palm', 0x75a46d, 0, 0, 0, 2.3, 1.8, 1.7);
    for (const z of [-0.9, 0.9]) {
      oval(hand, 'finger', 0x75a46d, 2, -0.5, z, 2, 0.7, 0.6);
      tooth(hand, 3.8, -0.7, z, true);
    }
    marker(hand, 'wrist', 0, 0, 0);
  }
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(6, 48, 0);
  body.add(head);
  oval(head, 'skull', 0x78a871, 7, 5, 0, 11, 11, 8.5);
  oval(head, 'muzzle', 0x78a871, 18, 4, 0, 13, 7, 8);
  for (const z of [-7.3, 7.3]) {
    oval(head, 'mouth-dark', 0x382b31, 15, -1, z, 12, 2.3, 0.9);
    oval(head, 'nostril', 0x355d42, 27, 7, z, 1.1, 0.8, 0.4);
    const eye = new THREE.Group();
    eye.name = z > 0 ? 'eye-front' : 'eye-back';
    eye.position.set(6, 10, z > 0 ? 8 : -8);
    head.add(eye);
    oval(eye, 'white', 0xfff3ce, 0, 0, 0, 3.9, 4.2, 0.9);
    oval(eye, 'amber', 0xd8a53a, 0.7, -0.2, z > 0 ? 0.7 : -0.7, 2.3, 2.8, 0.7);
    oval(eye, 'pupil', 0x203a32, 1, -0.2, z > 0 ? 1.2 : -1.2, 0.95, 2.2, 0.4);
    oval(eye, 'glint', 0xffffff, 0.2, 1.2, z > 0 ? 1.6 : -1.6, 0.7, 0.7, 0.3);
    const brow = oval(head, z > 0 ? 'brow-front' : 'brow-back', 0x588752, 6, 14, z, 4.8, 1.5, 1);
    brow.rotation.z = -0.18;
    oval(head, 'cheek', 0xa3b879, 10, 1, z, 3.3, 2, 0.8);
    for (let i = 0; i < 6; i++) tooth(head, 3 + i * 4.1, -2, z * 0.72, false);
  }
  const jaw = new THREE.Group();
  jaw.name = 'jaw';
  jaw.position.set(2, -2, 0);
  head.add(jaw);
  oval(jaw, 'chin', 0x608e5e, 12, -3, 0, 13, 3.6, 7.5);
  oval(jaw, 'tongue', 0xd9948f, 12, -0.4, 0, 8, 1.2, 5.5);
  for (const z of [-4.5, 4.5]) for (let i = 0; i < 5; i++) tooth(jaw, 4.5 + i * 4.1, -0.2, z, true);
  marker(head, 'upper-lip', 29, -1, 6);
  marker(jaw, 'lower-lip', 25, -0.3, 6);
  root.scale.setScalar(DINO_SCALE);
  plans.set(root, dinoPlan(id));
  return root;
}
export function nativeDinoPlan(root: THREE.Group): DinoPlan {
  const p = plans.get(root);
  if (!p) throw Error('Missing native dinosaur plan');
  return p;
}
function limb(
  root: THREE.Object3D,
  target: THREE.Vector3,
  length: number,
  upper: string,
  lower: string,
  joint: string,
  end: string,
  bend: number,
) {
  const local = root.worldToLocal(target.clone()),
    d = local.length(),
    normal = new THREE.Vector3(-local.y, local.x, 0);
  if (normal.lengthSq() < 1e-8) normal.set(1, 0, 0);
  const knee = local
    .clone()
    .multiplyScalar(0.5)
    .add(
      normal
        .normalize()
        .multiplyScalar(bend * Math.sqrt(Math.max(0, length * length - (d * d) / 4))),
    );
  stretchBetweenVectors(requireSceneObject(root, upper), new THREE.Vector3(), knee);
  stretchBetweenVectors(requireSceneObject(root, lower), knee, local);
  requireSceneObject(root, joint).position.copy(knee);
  requireSceneObject(root, end).position.copy(local);
}
export function dinoPlant(root: THREE.Group, goals: readonly THREE.Vector3[], angle = 0, turn = 0) {
  const body = requireSceneObject(root, 'body');
  root.updateMatrixWorld(true);
  let low = -Infinity,
    high = Infinity;
  goals.forEach((target, i) => {
    const leg = requireSceneObject(root, `leg-${i}`),
      local = leg.worldToLocal(target.clone());
    const reach = Math.sqrt(Math.max(0, 27.95 ** 2 - local.x ** 2 - local.z ** 2));
    low = Math.max(low, local.y - reach);
    high = Math.min(high, local.y + reach);
  });
  body.position.y += Math.max(low, Math.min(high, 0));
  root.updateMatrixWorld(true);
  goals.forEach((target, i) => {
    const leg = requireSceneObject(root, `leg-${i}`);
    limb(leg, target, 14, 'upper-leg', 'lower-leg', 'knee', 'foot', -1);
    const foot = requireSceneObject(leg, 'foot'),
      desired = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, turn, angle));
    foot.quaternion.copy(leg.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(desired);
  });
}
export function dinoDetails(
  root: THREE.Group,
  ms: number,
  open: number,
  moving: number,
  startled: number,
  look: number,
) {
  const p = nativeDinoPlan(root),
    head = requireSceneObject(root, 'head');
  head.rotation.set(0, -0.6 * look, open * 0.1 - startled * 0.2);
  requireSceneObject(head, 'jaw').rotation.z = -0.04 - open * 0.7 - startled * 0.25;
  const blink =
    (ms + p.phase * 170) % 2800 > 2630
      ? Math.max(0.08, Math.abs(((ms + p.phase * 170) % 2800) - 2715) / 85)
      : 1;
  for (const name of ['eye-front', 'eye-back']) {
    const eye = requireSceneObject(head, name);
    eye.scale.y = blink * (1 + startled * 0.3);
    requireSceneObject(eye, 'pupil').position.x = 1 - look * 0.9;
  }
  for (const name of ['brow-front', 'brow-back']) {
    const brow = requireSceneObject(head, name);
    brow.position.y = 14 + startled * 2;
    brow.rotation.z = -0.18 + startled * 0.3;
  }
  for (let i = 0; i < 3; i++)
    requireSceneObject(root, `tail-link-${i}`).rotation.z =
      0.08 + Math.sin(ms / 170 + p.phase - i * 0.6) * 0.09 * moving - open * 0.04;
  root.updateMatrixWorld(true);
  for (let i = 0; i < 2; i++) {
    const arm = requireSceneObject(root, `arm-${i}`),
      body = requireSceneObject(root, 'body');
    const t = body.localToWorld(
      new THREE.Vector3(
        15 + Math.sin(ms / 80 + i) * open * 0.8 - startled,
        31 + Math.cos(ms / 90 + i) * open * 1.6 + startled * 7,
        i ? 7 : -7,
      ),
    );
    limb(arm, t, 5, 'upper-arm', 'forearm', 'elbow', 'hand', i ? 1 : -1);
  }
}
export function dinoMouth(root: THREE.Group): THREE.Vector3 {
  root.updateMatrixWorld(true);
  return requireSceneObject(root, 'upper-lip')
    .getWorldPosition(new THREE.Vector3())
    .lerp(requireSceneObject(root, 'lower-lip').getWorldPosition(new THREE.Vector3()), 0.5);
}

export function ink(color: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
