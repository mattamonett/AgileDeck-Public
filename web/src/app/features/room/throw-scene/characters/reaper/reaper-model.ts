import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import { reaperEase } from './reaper-choreography';

const planes = new WeakMap<THREE.Group, THREE.Plane>();
function oval(
  parent: THREE.Object3D,
  color: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
  );
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
function bone(parent: THREE.Object3D, name: string, radius: number, color: number) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.1, 1, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}
const up = new THREE.Vector3(0, 1, 0);
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const direction = new THREE.Vector3();
function segment(object: THREE.Object3D, ax: number, ay: number, bx: number, by: number, z = 0) {
  a.set(ax, ay, z);
  b.set(bx, by, z);
  direction.subVectors(b, a);
  object.position.copy(a).addScaledVector(direction, 0.5);
  object.scale.y = direction.length();
  object.quaternion.setFromUnitVectors(up, direction.normalize());
}
function hand(parent: THREE.Object3D, name: string) {
  const palm = new THREE.Group();
  palm.name = name;
  oval(palm, 0xddd2af, 0, 0, 0, 3, 3.5, 2);
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Group();
    finger.name = 'finger';
    finger.position.set(-2.4 + i * 1.6, -2, 1);
    const upper = bone(finger, 'finger-bone', 0.65, 0xe8dcb7);
    segment(upper, 0, 0, 0, -3.5);
    oval(finger, 0xc5b890, 0, -3.5, 0, 0.9, 0.9, 0.9);
    const tip = bone(finger, 'fingertip', 0.55, 0xd7c79d);
    segment(tip, 0, -3.5, 1.1, -5.7);
    palm.add(finger);
  }
  oval(palm, 0xdaceaa, -3.1, -0.3, 1, 1, 2.7, 1).rotation.z = -0.5;
  parent.add(palm);
  return palm;
}
export function makeGrimReaper(): THREE.Group {
  const reaper = new THREE.Group();
  reaper.name = 'grim-reaper';
  const robe = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 22, 52, 20),
    new THREE.MeshStandardMaterial({ color: 0x181925, roughness: 0.96 }),
  );
  robe.position.y = -8;
  reaper.add(robe);
  for (let i = -3; i <= 3; i++) {
    const fold = oval(reaper, i % 2 ? 0x30313d : 0x10121c, i * 5.4, -11, 11, 2.8, 24, 3);
    fold.name = 'robe-fold';
    fold.rotation.z = -i * 0.035;
  }
  for (let i = 0; i < 9; i++) {
    const hem = new THREE.Mesh(
      new THREE.ConeGeometry(3.5, 8 + (i % 3) * 3, 4),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0x272938 : 0x151723, roughness: 0.96 }),
    );
    hem.position.set(-20 + i * 5, -34, 6 + Math.sin((i / 8) * Math.PI) * 8);
    hem.rotation.z = Math.PI;
    hem.name = 'robe-hem';
    reaper.add(hem);
  }
  oval(reaper, 0x292b39, 0, 29, 0, 19, 24, 12);
  oval(reaper, 0x070911, 1, 27, 11, 14, 18, 4);
  oval(reaper, 0xdad2b5, 2, 30, 14, 10, 12, 3);
  oval(reaper, 0x0c0d15, 2, 18.5, 16, 7, 4, 1);
  const jaw = oval(reaper, 0xcbbd98, 2, 16, 15, 8, 3, 2);
  jaw.name = 'jaw';
  for (const side of [-1, 1]) {
    oval(reaper, 0x151521, 2 + side * 4.5, 31, 17, 3.5, 4.2, 1);
    const glow = oval(reaper, 0xc9454c, 2 + side * 4.5, 31, 18, 0.7, 1, 0.5);
    glow.material.emissive.setHex(0x8a192b);
    glow.name = 'death-eye';
    oval(reaper, 0xebe1c4, 2 + side * 6.5, 24, 17, 3.2, 2.5, 1.5);
    const brow = oval(reaper, 0xf0e4c5, 2 + side * 4.5, 35, 17, 4, 1, 1);
    brow.rotation.z = side * 0.15;
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'left-leg' : 'right-leg';
    leg.position.set(side * 8, -28, 0);
    oval(leg, 0x10121b, 0, -7, 0, 4, 10, 4);
    oval(leg, 0x0b0d14, 2, -15, 3, 6, 2, 5);
    reaper.add(leg);
  }
  oval(reaper, 0x11111a, 2, 25, 18, 1.8, 2.6, 0.5);
  for (let i = 0; i < 6; i++) {
    oval(reaper, 0xede1ba, -4 + i * 2.3, 20, 17, 0.85, 2, 0.6);
    oval(reaper, 0xcdbc98, -4 + i * 2.3, 16.7, 17, 0.8, 1.5, 0.6);
  }
  const free = new THREE.Group();
  free.name = 'free-arm';
  free.position.set(-13, 10, 7);
  bone(free, 'free-upperarm', 4.4, 0x252735);
  bone(free, 'free-forearm', 3.8, 0x191c29);
  const elbow = oval(free, 0x292b38, 0, 0, 0, 4.5, 4.5, 4.5);
  elbow.name = 'free-elbow';
  hand(free, 'harvest-hand');
  reaper.add(free);
  const arm = new THREE.Group();
  arm.name = 'sickle-arm';
  arm.position.set(12, 12, 7);
  bone(arm, 'scythe-upperarm', 4.8, 0x292b38);
  bone(arm, 'scythe-forearm', 4, 0x202332);
  segment(requireSceneObject(arm, 'scythe-upperarm'), 0, 0, -Math.sqrt(21), -10);
  segment(requireSceneObject(arm, 'scythe-forearm'), -Math.sqrt(21), -10, 0, -20);
  oval(arm, 0x30323f, -Math.sqrt(21), -10, 0, 4.8, 4.8, 4.8);
  const sickle = new THREE.Group();
  sickle.name = 'sickle';
  sickle.position.set(0, -20, 2);
  const staff = bone(sickle, 'scythe-staff', 1.7, 0x5c443b);
  segment(staff, 0, -44, 0, 28);
  for (let i = 0; i < 5; i++) {
    const wrap = new THREE.Mesh(
      new THREE.TorusGeometry(2, 0.4, 5, 12),
      new THREE.MeshStandardMaterial({ color: 0x93816b }),
    );
    wrap.position.y = -6 + i * 2;
    wrap.rotation.x = Math.PI / 2;
    sickle.add(wrap);
  }
  oval(sickle, 0x858b91, 0, 27, 0, 3, 3, 3);
  const blade = new THREE.Shape();
  blade.moveTo(0, 28);
  blade.bezierCurveTo(5, 62, 44, 66, 48, 38);
  blade.bezierCurveTo(33, 51, 12, 49, 5, 26);
  blade.closePath();
  const metal = new THREE.Mesh(
    new THREE.ExtrudeGeometry(blade, {
      depth: 1.4,
      bevelEnabled: true,
      bevelThickness: 0.25,
      bevelSize: 0.35,
      bevelSegments: 1,
      curveSegments: 24,
    }),
    new THREE.MeshStandardMaterial({
      color: 0xb8c4d0,
      metalness: 0.8,
      roughness: 0.24,
      side: THREE.DoubleSide,
    }),
  );
  sickle.add(metal);
  for (let i = 0; i < 3; i++) {
    const stain = oval(sickle, 0x83172e, 27 + i * 5, 55 - i * 2.5, 2.3, 4, 0.8, 0.35);
    stain.name = 'scythe-blood';
    stain.rotation.z = -0.35;
    stain.visible = false;
    stain.material.roughness = 0.2;
  }
  for (let i = 0; i < 7; i++)
    oval(sickle, 0x64727f, 8 + i * 4.7, 47 + Math.sin((i / 6) * Math.PI) * 8, 2, 0.7, 1.6, 0.3);
  const tip = new THREE.Object3D();
  tip.name = 'sickle-tip';
  tip.position.set(48, 38, 0);
  sickle.add(tip);
  const grip = hand(sickle, 'scythe-hand');
  grip.position.z = 3.2;
  grip.rotation.z = -0.35;
  arm.add(sickle);
  reaper.add(arm);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 100000);
  reaper.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial)
      child.material.clippingPlanes = [plane];
  });
  planes.set(reaper, plane);
  reaperHand(reaper, 0, 1);
  return reaper;
}
export function reaperHand(reaper: THREE.Group, ms: number, strength: number) {
  const reach = reaperEase((ms - 1900) / 700) * (1 - reaperEase((ms - 3450) / 400));
  const hx = -1 + reach * 20;
  const hy = -25 + reach * 28;
  const length = Math.hypot(hx, hy);
  const bend = Math.sqrt(Math.max(0, 17 ** 2 - (length * length) / 4));
  const ex = hx / 2 - (hy / length) * bend;
  const ey = hy / 2 + (hx / length) * bend;
  const arm = requireSceneObject(reaper, 'free-arm');
  arm.rotation.z = 0;
  segment(requireSceneObject(arm, 'free-upperarm'), 0, 0, ex, ey);
  segment(requireSceneObject(arm, 'free-forearm'), ex, ey, hx, hy);
  requireSceneObject(arm, 'free-elbow').position.set(ex, ey, 0);
  const palm = requireSceneObject(arm, 'harvest-hand');
  palm.position.set(hx, hy, 2);
  palm.rotation.z = -reach * 0.65;
  for (const finger of palm.children)
    if (finger.name === 'finger')
      finger.rotation.x = -reaperEase((ms - 2850) / 450) * 0.9 * strength;
}
export function reaperWalk(reaper: THREE.Group, progress: number, facing: number) {
  reaper.scale.set(0.9 * facing, 0.9, 0.9);
  reaper.rotation.set(0, 0, 0);
  for (const name of ['left-leg', 'right-leg']) requireSceneObject(reaper, name).rotation.z = 0;
  for (const fold of reaper.children)
    if (fold.name === 'robe-fold' || fold.name === 'robe-hem') {
      fold.rotation.x = Math.sin(progress * Math.PI * 5 + fold.position.x * 0.08) * 0.07;
    }
  requireSceneObject(reaper, 'sickle-arm').rotation.z = -0.45;
  reaperHand(reaper, 0, 1);
  const plane = planes.get(reaper);
  if (plane) plane.constant = 100000;
}
export function reaperPortalClip(reaper: THREE.Group, floor: number, active: boolean) {
  const plane = planes.get(reaper);
  if (plane) plane.constant = active ? floor : 100000;
}
