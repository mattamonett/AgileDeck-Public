import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';

function oval(
  parent: THREE.Object3D,
  name: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  color: number,
  metallic = false,
) {
  const part = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshStandardMaterial({
      color,
      roughness: metallic ? 0.28 : 0.48,
      metalness: metallic ? 0.65 : 0.06,
    }),
  );
  part.name = name;
  part.position.set(x, y, z);
  part.scale.set(sx, sy, sz);
  parent.add(part);
  return part;
}
function joint(parent: THREE.Object3D, name: string, x: number, y: number, z = 0) {
  const part = new THREE.Group();
  part.name = name;
  part.position.set(x, y, z);
  parent.add(part);
  return part;
}
export function makeAlien(): THREE.Group {
  const alien = new THREE.Group();
  oval(alien, 'suit', 0, 2, 0, 10, 16, 6, 0x33485c, true);
  oval(alien, 'chest', 1, 7, 5, 7.5, 10, 2, 0x9eb4c6, true);
  oval(alien, 'collar', 0, 17, 1, 8, 3, 5, 0x596c87, true);
  oval(alien, 'badge', -3, 9, 7, 2, 2, 0.7, 0x6affd5);
  for (let i = 0; i < 3; i++)
    oval(alien, `belt-light-${i}`, -5 + i * 5, -7, 6, 1, 1, 0.6, 0x80ffe3);
  const head = joint(alien, 'head', 0, 31, 1);
  oval(head, 'cranium', 0, 0, 0, 16, 19, 9, 0xa3dd9f);
  oval(head, 'chin', 0, -11, 2, 9, 9, 6, 0x90d18e);
  for (const side of [-1, 1]) {
    const eye = joint(head, `eye-${side}`, side * 7, 2, 8);
    eye.rotation.z = -side * 0.35;
    oval(eye, 'eye-lens', 0, 0, 0, 4.8, 8.6, 2, 0x10232b);
    oval(eye, 'eye-glint', -1, 3.5, 2, 1.2, 2.1, 0.5, 0xe4fff5);
    oval(eye, 'eye-glint-small', 1.4, -2, 2, 0.6, 0.8, 0.3, 0x73b9b0);
    oval(head, `cheek-${side}`, side * 10, -7, 7, 3.3, 1.6, 0.6, 0x80bf8f);
    const leg = joint(alien, side < 0 ? 'left-leg' : 'right-leg', side * 5, -10);
    oval(leg, 'thigh', 0, -5.5, 0, 3.3, 7, 3.2, 0x52687c, true);
    const knee = joint(leg, 'knee', 0, -11);
    oval(knee, 'kneecap', 0, 0, 2, 3.5, 3.4, 2, 0xa9c3c9, true);
    oval(knee, 'shin', 0, -5.5, 0, 2.8, 6, 3, 0x748b9c, true);
    oval(knee, 'boot', 3, -11, 2, 6.5, 3, 4, 0x293c50, true);
    oval(knee, 'sole', 3, -13, 2, 6.7, 1.2, 4.1, 0x83e6bf);
  }
  oval(head, 'mouth', 0, -12, 8, 3, 0.7, 0.5, 0x375e47);
  for (const name of ['lifting', 'probe']) {
    const arm = joint(
      alien,
      `${name}-arm`,
      name === 'lifting' ? 5 : 8,
      name === 'lifting' ? 13 : 8,
      name === 'lifting' ? 3 : 8,
    );
    oval(arm, 'shoulder', 0, 0, 0, 4.3, 4.3, 4, 0x748b9c, true);
    oval(arm, 'upper-arm', 0, -13, 0, 2.8, 14, 2.8, 0x83c68f);
    const elbow = joint(arm, 'elbow', 0, -26);
    oval(elbow, 'elbow-joint', 0, 0, 0, 3, 3, 3, 0x98db9e);
    oval(elbow, 'forearm', 0, -13, 0, 2.4, 14, 2.5, 0x93d79b);
    const hand = joint(elbow, `${name}-hand`, 0, -26);
    oval(hand, 'cuff', 0, 2, 0, 3.4, 2.5, 3.4, 0x596c87, true);
    oval(hand, 'palm', 0, -1, 1, 3.5, 3.6, 2.4, 0xa3dd9f);
    for (let i = 0; i < 3; i++)
      oval(hand, `finger-${i}`, -2.5 + i * 2.5, -3, 3, 0.95, 2.2, 1, 0xafe5a5);
    if (name === 'probe') {
      const tool = joint(hand, 'probe', 0, 0);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -3, 0),
        new THREE.Vector3(4, -5, 0),
        new THREE.Vector3(7, 4, 0),
        new THREE.Vector3(14, 8, 0),
        new THREE.Vector3(23, 8, 0),
      ]);
      tool.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(curve, 24, 1.5, 8, false),
          new THREE.MeshStandardMaterial({ color: 0xb0c5d5, roughness: 0.25, metalness: 0.85 }),
        ),
      );
      oval(tool, 'probe-grip', 0, -3, 0, 3, 4, 2, 0x354c68, true);
      oval(tool, 'probe-collar', 19, 8, 0, 3, 3, 3, 0x596c87, true);
      oval(tool, 'probe-tip', 24, 8, 0, 3.4, 2.5, 2.5, 0x92ffe0);
    }
  }
  return alien;
}
/** Linked bones keep wrist, fingers and tool together while the card lifts. */
export function alienReach(
  alien: THREE.Group,
  name: 'lifting' | 'probe',
  x: number,
  y: number,
  wristAngle: number,
) {
  const arm = requireSceneObject(alien, `${name}-arm`);
  const elbow = requireSceneObject(arm, 'elbow');
  const hand = requireSceneObject(elbow, `${name}-hand`);
  const dx = x - arm.position.x;
  const dy = y - arm.position.y;
  const distance = Math.min(51.8, Math.max(1, Math.hypot(dx, dy)));
  const bend = Math.acos(distance / 52);
  arm.rotation.z = Math.atan2(dx, -dy) - bend;
  elbow.rotation.z = bend * 2;
  hand.rotation.z = wristAngle - arm.rotation.z - elbow.rotation.z;
}
export function alienWalk(alien: THREE.Group, stride: number, facing: number, weight = 1) {
  alien.scale.x = Math.abs(alien.scale.x) * facing;
  for (const [index, name] of ['left-leg', 'right-leg'].entries()) {
    const leg = requireSceneObject(alien, name);
    const phase = stride * Math.PI * 12 + index * Math.PI;
    leg.rotation.z = Math.sin(phase) * 0.36 * weight;
    requireSceneObject(leg, 'knee').rotation.z = -Math.max(0, Math.cos(phase)) * 0.55 * weight;
  }
}

export function ring(radius: number, color: number, arc = Math.PI * 2) {
  return new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.65, radius, 32, 1, 0, arc),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
}
