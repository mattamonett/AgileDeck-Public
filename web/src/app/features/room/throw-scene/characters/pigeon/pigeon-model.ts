import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import type { Point } from '../../flight/flight-math';
import { PIGEON_SCALE, pigeonEase, type PigeonPlan } from './pigeon-choreography';

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
export function makePigeon(): THREE.Group {
  const bird = new THREE.Group();
  bird.name = 'cheeky-pigeon';
  const body = new THREE.Group();
  body.name = 'pigeon-body';
  bird.add(body);
  oval(body, 0x8793a1, 0, 16, 0, 17, 13, 10);
  oval(body, 0xaeb9c3, 8, 14, 5, 12, 10, 7);
  const tail = new THREE.Group();
  tail.name = 'pigeon-tail';
  tail.position.set(-13, 17, 0);
  body.add(tail);
  for (let i = 0; i < 5; i++)
    oval(
      tail,
      i % 2 ? 0x424d60 : 0x566374,
      -10,
      2 + i * 1.1,
      (i - 2) * 2.4,
      14,
      2.2,
      2,
    ).rotation.z = -0.15 + (i - 2) * 0.06;
  oval(body, 0x627486, 11, 27, 0, 7.5, 12, 7);
  for (const side of [-1, 1]) {
    oval(body, 0x507f76, 11, 26, side * 6.4, 6, 8, 1.8, 0.28);
    oval(body, 0x696688, 10, 22, side * 7.2, 5.5, 3, 1.2, 0.25);
    for (let i = 0; i < 3; i++)
      oval(body, 0x80a39c, 9 + i * 2, 27 + i, side * 7.7, 0.65, 3, 0.4, 0.25);
    const wing = new THREE.Group();
    wing.name = 'wing-' + side;
    wing.position.set(-2, 20, side * 8);
    oval(wing, side > 0 ? 0x9daab8 : 0x697a8b, -6, -2, 0, 9, 6.5, 3);
    const fore = new THREE.Group();
    fore.name = 'fore-wing';
    fore.position.set(-13, -2, 0);
    oval(fore, side > 0 ? 0x9daab8 : 0x697a8b, -5, 0, 0, 8, 4.7, 2.7);
    for (let i = 0; i < 5; i++) {
      const feather = oval(
        fore,
        i % 2 ? 0x64778c : 0x77899b,
        -7 - i * 1.8,
        -2 + i * 1.4,
        side * 1.8,
        8 + i * 0.4,
        1.8,
        1,
      );
      feather.rotation.z = -0.2 + i * 0.1;
    }
    for (let i = 0; i < 2; i++)
      oval(wing, 0x364456, -4 - i * 5, -2, side * 3.1, 1.4, 5, 0.5).rotation.z = -0.35;
    wing.add(fore);
    body.add(wing);
    const leg = new THREE.Group();
    leg.name = 'pigeon-leg-' + side;
    leg.position.set(3, 10, side * 5.5);
    bird.add(leg);
    for (const name of ['upper-leg', 'lower-leg']) {
      const bone = new THREE.Mesh(
        new THREE.CylinderGeometry(1.25, 1.4, 1, 10),
        new THREE.MeshStandardMaterial({ color: 0xb77482 }),
      );
      bone.name = name;
      leg.add(bone);
    }
    oval(leg, 0xc88e98, 0, 0, 0, 1.6, 1.6, 1.6).name = 'knee';
    const foot = new THREE.Group();
    foot.name = 'talon';
    oval(foot, 0xc893a0, 0, 0.5, 0, 2.3, 1.2, 2);
    for (let toe = 0; toe < 3; toe++) {
      const finger = oval(foot, 0xcc93a0, 2.5, 0.3, (toe - 1) * 1.6, 4.2, 0.85, 0.85);
      finger.rotation.y = (toe - 1) * -0.16;
      oval(foot, 0x4f4653, 6.5, 0.1, (toe - 1) * 2.2, 1.1, 0.5, 0.55);
    }
    oval(foot, 0xc893a0, -3, 0.4, 0, 3.5, 0.9, 1).rotation.z = -0.15;
    leg.add(foot);
  }
  const head = new THREE.Group();
  head.name = 'pigeon-head';
  head.position.set(14, 37, 0);
  oval(head, 0x75879a, 0, 0, 0, 9.5, 9, 8);
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(3.2, 10, 12),
    new THREE.MeshStandardMaterial({ color: 0x303d50 }),
  );
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(10, -2, 0);
  head.add(beak);
  oval(head, 0xe1d9c6, 7, 0, 0, 3.5, 2.2, 3.1);
  for (const side of [-1, 1]) {
    oval(head, 0xb0bac2, 3, 2, side * 7.3, 3.8, 3.9, 1.2);
    const eye = oval(head, 0xd9954a, 3.5, 2, side * 8.2, 2.9, 3.2, 0.8, 0.2);
    eye.name = 'pigeon-eye';
    oval(eye, 0x172537, 0.1, 0, side * 0.8, 0.55, 0.63, 0.3, 0.15);
    oval(eye, 0xffffff, -0.28, 0.3, side * 0.95, 0.23, 0.2, 0.18, 0.1);
    oval(head, 0x425670, 3, 6, side * 7.3, 3.6, 0.8, 0.7).rotation.z = -0.15;
  }
  body.add(head);
  const rump = new THREE.Object3D();
  rump.name = 'pigeon-rump';
  rump.position.set(-14, 7, 6);
  body.add(rump);
  pigeonFlap(bird, 0, false);
  return bird;
}
const up = new THREE.Vector3(0, 1, 0);
const vector = new THREE.Vector3();
function bone(part: THREE.Object3D, ax: number, ay: number, bx: number, by: number) {
  vector.set(bx - ax, by - ay, 0);
  part.position.set((ax + bx) / 2, (ay + by) / 2, 0);
  part.scale.y = vector.length();
  part.quaternion.setFromUnitVectors(up, vector.normalize());
}
export function pigeonFlap(bird: THREE.Group, ms: number, flying: boolean, speed = 1, kick = 0) {
  requireSceneObject(bird, 'pigeon-body').position.y = -kick * 2.5;
  for (const side of [-1, 1]) {
    const wing = requireSceneObject(bird, 'wing-' + side);
    const phase = ms * 0.019 * speed + side * 0.18;
    wing.rotation.z = flying ? 0.2 + Math.sin(phase) * 0.8 : 0.08 + kick * 0.08;
    wing.rotation.x = flying ? side * (0.15 + Math.cos(phase) * 0.24) : 0;
    requireSceneObject(wing, 'fore-wing').rotation.z = flying
      ? -0.15 + Math.sin(phase - 0.5) * 0.36
      : -0.12;
    const leg = requireSceneObject(bird, 'pigeon-leg-' + side);
    leg.position.y = 10 - kick * 2.5;
    const px = flying ? -4 : 0;
    const py = flying ? -5 : -leg.position.y;
    const length = Math.hypot(px, py);
    const bend = Math.sqrt(Math.max(0, 81 - (length * length) / 4));
    const ex = px / 2 + (py / length) * bend;
    const ey = py / 2 - (px / length) * bend;
    bone(requireSceneObject(leg, 'upper-leg'), 0, 0, ex, ey);
    bone(requireSceneObject(leg, 'lower-leg'), ex, ey, px, py);
    requireSceneObject(leg, 'knee').position.set(ex, ey, 0);
    requireSceneObject(leg, 'talon').position.set(px, py, 0);
  }
  requireSceneObject(bird, 'pigeon-tail').rotation.z =
    (flying ? Math.sin(ms / 120) * 0.08 : 0) + kick * 0.2;
}
export function pigeonExpression(bird: THREE.Group, ms: number, plan: PigeonPlan) {
  const head = requireSceneObject(bird, 'pigeon-head');
  const last = plan.bursts.at(-1) ?? 2340;
  const cheek =
    ms > last + 160 && ms < plan.departure ? Math.sin(((ms - last - 160) / 950) * Math.PI) : 0;
  head.rotation.y = cheek * -0.25;
  head.rotation.z = cheek * -0.1;
  head.traverse((part) => {
    if (part.name === 'pigeon-eye') {
      const blink = Math.abs(Math.sin(ms / 540 + plan.spot.y * 4));
      part.scale.y = 3.2 * (blink < 0.07 ? 0.15 + blink * 11 : 1);
    }
  });
}
export function pigeonTravel(
  bird: THREE.Group,
  plan: PigeonPlan,
  progress: number,
  ms: number,
  start: Point,
  end: Point,
  point: Point,
  previous: Point,
  contactFacing: number,
) {
  const facing = Math.sign(end.x - start.x) || contactFacing;
  const settle = pigeonEase((progress - 0.75) / 0.25);
  const angle = Math.max(
    -0.65,
    Math.min(0.65, Math.atan2(previous.y - point.y, Math.max(0.1, Math.abs(point.x - previous.x)))),
  );
  const yaw = facing < 0 ? Math.PI : 0;
  const finalYaw = contactFacing < 0 ? Math.PI : 0;
  bird.scale.setScalar(PIGEON_SCALE);
  bird.rotation.set(0, yaw + (finalYaw - yaw) * settle, facing * angle * (1 - settle), 'ZYX');
  pigeonFlap(bird, ms, progress < 0.985, plan.flap);
  pigeonExpression(bird, ms, plan);
}
