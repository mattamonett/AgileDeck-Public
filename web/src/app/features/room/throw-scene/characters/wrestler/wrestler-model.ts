import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import { WRESTLER_SCALE } from './wrestler-choreography';
function bone(parent: THREE.Object3D, name: string, radius: number, color: number) {
  const part = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.05, 1, 14),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
  );
  part.name = name;
  parent.add(part);
  if (name === 'thigh' || name === 'shin') {
    const seam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.88, 6),
      new THREE.MeshStandardMaterial({ color: 0x6590b5 }),
    );
    seam.position.set(radius * 0.65, 0, radius * 0.65);
    part.add(seam);
  }
}
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
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshStandardMaterial({ color, roughness: 0.82 }),
  );
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

function lettering(
  parent: THREE.Object3D,
  lines: string[],
  color: string,
  width: number,
  height: number,
  y: number,
  z: number,
) {
  // Real geometry stays readable from either approach direction; never mirror the text.
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 76px Arial, sans-serif';
  ctx.lineJoin = 'round';
  lines.forEach((line, i) => {
    const cy = ((i + 0.5) * 256) / lines.length;
    ctx.strokeStyle = color === '#fff3db' ? '#15252b' : '#fff3db';
    ctx.lineWidth = color === '#fff3db' ? 18 : 5;
    ctx.strokeText(line, 256, cy, 490);
    ctx.fillStyle = color;
    ctx.fillText(line, 256, cy, 490);
  });
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
  );
  label.position.set(0, y, z);
  parent.add(label);
}

export function makeWrestler(): THREE.Group {
  const man = new THREE.Group();
  man.name = 'john-schlee-na';
  const skin = 0xdca078;
  oval(man, 'orange-shirt', 0xf47b08, 0, 1, 0, 20, 21, 10);
  oval(man, 'neck', skin, 0, 23, 0, 9, 9, 7);
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'left-leg' : 'right-leg';
    leg.position.set(side * 10, -17, 0);
    man.add(leg);
    bone(leg, 'thigh', 8, 0x285b91);
    bone(leg, 'shin', 6.7, 0x285b91);
    oval(leg, 'knee', 0x285b91, 0, 0, 0, 7, 7, 7);
    const shoe = new THREE.Group();
    shoe.name = 'boot';
    leg.add(shoe);
    oval(shoe, 'boot-upper', 0x242931, 1, 0, 3, 9, 5, 10);
    oval(shoe, 'boot-sole', 0x111a22, 1, -4, 3, 9.4, 1.2, 10.3);
    oval(shoe, 'denim-cuff', 0x6590b5, 0, 5, 0, 7, 2, 7);
    for (let i = 0; i < 3; i++) oval(shoe, 'boot-lace', 0x85909b, 1, 2 - i * 1.6, 10, 3, 0.35, 0.4);
    const arm = new THREE.Group();
    arm.name = side < 0 ? 'left-arm' : 'right-arm';
    arm.position.set(side * 19, 13, 3);
    man.add(arm);
    oval(arm, 'sleeve', 0xf47b08, 0, -3, 0, 9, 10, 9);
    bone(arm, 'upper-arm', 6.8, skin);
    bone(arm, 'forearm', 6, skin);
    oval(arm, 'elbow', skin, 0, 0, 0, 6.5, 6.5, 6.5);
    const hand = new THREE.Group();
    hand.name = 'hand';
    arm.add(hand);
    oval(hand, 'wristband', 0x1d4f80, 0, 5, 0, 6.3, 2.5, 6.3);
    oval(hand, 'wristband-stripe', 0xfff3db, 0, 6.3, 0, 6.4, 0.5, 6.4);
    oval(hand, 'palm', skin, 0, 0, 0, 5.8, 5, 3);
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Group();
      finger.name = 'finger-' + i;
      finger.position.set((i - 1.5) * 2.4, -3, 0);
      hand.add(finger);
      oval(finger, 'finger-bone', skin, 0, -3, 1, 1.2, 3.5, 1.5);
      oval(finger, 'knuckle', skin, 0, 0, 1, 1.4, 1.5, 1.4);
    }
    oval(hand, 'thumb', skin, side * 6, 0, 1, 1.6, 3.2, 1.6).rotation.z = -side * 0.5;
    const tip = new THREE.Object3D();
    tip.name = 'fingertip';
    tip.position.set(-1.2, -9.5, 2.5);
    hand.add(tip);
    const contact = new THREE.Object3D();
    contact.name = 'shoulder-contact';
    contact.position.set(side * 8, -2, 4);
    arm.add(contact);
  }
  oval(man, 'head', skin, 0, 37, 0, 16, 19, 12);
  for (const side of [-1, 1]) {
    oval(man, 'ear', skin, side * 16, 37, 0, 4, 7, 4);
    oval(man, 'sideburn', 0x514437, side * 13, 30, 7, 3, 10, 4);
  }
  oval(man, 'full-beard', 0x514437, 0, 26, 8, 14, 12, 7);
  // Salt-and-pepper strands keep the broad beard from reading as a flat mask.
  for (let i = 0; i < 25; i++) {
    const x = ((i * 7) % 23) - 11;
    const y = 18 + ((i * 11) % 13);
    oval(
      man,
      'beard-strand',
      i % 3 ? 0x766653 : 0xa89b85,
      x,
      y,
      12 + 2 * (1 - Math.abs(x) / 14),
      0.35,
      1.8,
      0.3,
    );
  }
  oval(man, 'mouth', 0xb78062, 0, 28, 15.1, 6, 1.2, 0.6);
  for (const side of [-1, 1]) {
    oval(man, 'mustache', 0x493c2d, side * 4, 31, 14, 5.5, 2.5, 2);
    const eye = new THREE.Group();
    eye.name = side < 0 ? 'left-eye' : 'right-eye';
    eye.position.set(side * 7, 40, 10.7);
    man.add(eye);
    oval(eye, 'eye-white', 0xf1e5d0, 0, 0, 0, 4, 3, 1.5);
    oval(eye, 'iris', 0x657373, 0, 0, 1.3, 1.9, 2.2, 0.7);
    oval(eye, 'pupil', 0x1a2022, 0, 0, 1.9, 0.9, 1.3, 0.3);
    oval(eye, 'eye-glint', 0xffffff, -0.5, 0.8, 2.2, 0.5, 0.6, 0.2);
    const brow = oval(man, 'brow', 0x493c2d, side * 7, 45, 11, 5.5, 1.5, 1);
    brow.rotation.z = side * 0.12;
    const shape = new THREE.Shape();
    shape.moveTo(-6, -4);
    shape.lineTo(5, -4);
    shape.quadraticCurveTo(7, -4, 7, -2);
    shape.lineTo(8, 5);
    shape.lineTo(-8, 5);
    shape.lineTo(-7, -2);
    shape.quadraticCurveTo(-7, -4, -6, -4);
    const hole = new THREE.Path();
    hole.moveTo(-5, -2);
    hole.lineTo(-6, 3);
    hole.lineTo(6, 3);
    hole.lineTo(5, -2);
    hole.closePath();
    shape.holes.push(hole);
    const frame = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color: 0x171b1d, roughness: 0.35 }),
    );
    frame.position.set(side * 8, 39, 13);
    frame.name = side < 0 ? 'left-glasses' : 'right-glasses';
    man.add(frame);
    oval(man, 'glasses-temple', 0x171b1d, side * 15, 39, 5, 0.8, 0.8, 8);
  }
  oval(man, 'glasses-bridge', 0x171b1d, 0, 41, 14, 2.5, 1, 1);
  oval(man, 'nose', skin, 0, 35, 14, 4, 4, 4);
  oval(man, 'blue-cap', 0x184f80, 0, 53, -1, 17, 12, 12);
  oval(man, 'orange-cap-band', 0xf38b16, 0, 49, 6, 17, 2, 9);
  oval(man, 'orange-brim', 0xef8010, 0, 47, 13, 18, 2.5, 10);
  lettering(man, ['NEVER', 'GIVE UP'], '#ff941b', 23, 12, 56, 11);
  lettering(man, ['JOHN', 'SCHLEE-NA'], '#fff3db', 33, 20, 3, 10.5);
  const body = new THREE.Group();
  body.name = 'wrestler-body';
  for (const child of [...man.children])
    if (!child.name.endsWith('-leg')) {
      man.remove(child);
      body.add(child);
    }
  man.add(body);
  const head = new THREE.Group();
  head.name = 'wrestler-head';
  head.position.y = 37;
  for (const child of [...body.children])
    if (child.position.y >= 18 && child.name !== 'neck') {
      body.remove(child);
      child.position.y -= 37;
      head.add(child);
    }
  body.add(head);
  oval(body, 'shirt-collar', 0xc55404, 0, 20, 2, 9, 2, 7);
  oval(body, 'shirt-hem', 0xc55404, 0, -17, 0, 18, 2, 9);
  for (const side of [-1, 1]) oval(head, 'cheek', 0xca8b65, side * 10, -2, 8, 3.7, 3, 2);
  oval(head, 'teeth', 0xfff3db, 0, -8, 15.5, 4, 0.7, 0.4);
  wrestlerWalk(man, 0, 1, 0, 1);
  return man;
}

const up = new THREE.Vector3(0, 1, 0);
function segment(part: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const line = b.clone().sub(a);
  part.position.copy(a).add(b).multiplyScalar(0.5);
  part.scale.y = line.length();
  part.quaternion.setFromUnitVectors(up, line.normalize());
}
export function wrestlerLimb(
  root: THREE.Object3D,
  target: THREE.Vector3,
  arm: boolean,
  bendTurn = 0,
) {
  const length = arm ? 22 : 24,
    distance = target.length();
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
  if (arm && distance > 1e-6) bend.applyAxisAngle(target.clone().normalize(), Math.PI * bendTurn);
  const joint = target.clone().multiplyScalar(0.5).add(bend);
  segment(requireSceneObject(root, arm ? 'upper-arm' : 'thigh'), new THREE.Vector3(), joint);
  segment(requireSceneObject(root, arm ? 'forearm' : 'shin'), joint, target);
  requireSceneObject(root, arm ? 'elbow' : 'knee').position.copy(joint);
  requireSceneObject(root, arm ? 'hand' : 'boot').position.copy(target);
}
export function wrestlerHand(man: THREE.Group, side: number) {
  return requireSceneObject(requireSceneObject(man, side < 0 ? 'left-arm' : 'right-arm'), 'hand');
}
export function wrestlerArmTo(
  man: THREE.Group,
  side: number,
  target: THREE.Vector3,
  open = 0,
  bendTurn = 0,
) {
  const arm = requireSceneObject(man, side < 0 ? 'left-arm' : 'right-arm');
  wrestlerLimb(arm, arm.worldToLocal(target.clone()), true, bendTurn);
  const hand = wrestlerHand(man, side);
  hand.rotation.set(0, 0, 0);
  for (let i = 0; i < 4; i++)
    requireSceneObject(hand, 'finger-' + i).rotation.x = (1 - open) * Math.PI * 0.48;
}
export function wrestlerLegTo(man: THREE.Group, side: number, target: THREE.Vector3) {
  const leg = requireSceneObject(man, side < 0 ? 'left-leg' : 'right-leg');
  wrestlerLimb(leg, leg.worldToLocal(target.clone()), false);
}
export function wrestlerRunLimbs(
  man: THREE.Group,
  distance: number,
  facing: number,
  stride: number,
  step: number,
  victory = false,
  intro = 1,
) {
  man.updateMatrixWorld(true);
  for (const side of [-1, 1]) {
    const phase = distance * 0.15 * step + (side < 0 ? Math.PI : 0);
    const raised = victory && side === -facing;
    const run = raised
      ? new THREE.Vector3(side * 28, 28, 9)
      : new THREE.Vector3(side * 21 + Math.sin(phase) * stride * 8, -12, 10);
    const hand = new THREE.Vector3(side * 31, 33, 9).lerp(run, intro);
    wrestlerArmTo(man, side, man.localToWorld(hand), 0, raised ? 1 : 1 - intro);
    wrestlerLegTo(
      man,
      side,
      man.localToWorld(
        new THREE.Vector3(
          side * 10 + Math.sin(phase) * stride * 10,
          -54 + Math.max(0, Math.cos(phase)) * stride * 8,
          0,
        ),
      ),
    );
  }
}
export function wrestlerWalk(
  man: THREE.Group,
  distance: number,
  facing: number,
  stride = 1,
  step = 1,
) {
  man.scale.setScalar(WRESTLER_SCALE);
  man.rotation.set(0, 0, 0);
  man.visible = true;
  requireSceneObject(man, 'wrestler-body').rotation.set(0, 0, -facing * 0.08 * stride);
  wrestlerRunLimbs(man, distance, facing, stride, step);
}

export function paperChip() {
  const shape = new THREE.Shape();
  shape.moveTo(-2, -1);
  shape.lineTo(2, 0);
  shape.lineTo(0.5, 3);
  shape.closePath();
  return new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color: 0xf1e6cc, transparent: true, side: THREE.DoubleSide }),
  );
}
