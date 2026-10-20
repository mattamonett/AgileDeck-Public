import * as THREE from 'three';
import { trumpPhrase } from './trump-choreography';
import { nillLimb } from '../nill/nill-model';
import { requireSceneObject } from '../../engine/scene-object';
import type { Point } from '../../flight/flight-math';
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
  roughness = 0.78,
) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshStandardMaterial({ color, roughness }),
  );
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

function bone(parent: THREE.Object3D, name: string, radius: number, color: number) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.04, 1, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
  );
  mesh.name = name;
  parent.add(mesh);
}
function shaped(
  parent: THREE.Object3D,
  name: string,
  points: readonly (readonly [number, number])[],
  color: number,
  z: number,
) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const mesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: 1,
      bevelEnabled: true,
      bevelSize: 0.3,
      bevelThickness: 0.3,
      bevelSegments: 2,
      steps: 1,
    }),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5 }),
  );
  mesh.name = name;
  mesh.position.z = z;
  parent.add(mesh);
  return mesh;
}

export function textSprite(lines: readonly string[], bubble: boolean): THREE.Sprite | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (bubble) {
    ctx.fillStyle = '#fffdf5';
    ctx.strokeStyle = '#263744';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(5, 5, 630, 200, 55);
    ctx.fill();
    ctx.stroke();
    for (const [x, y, r] of [
      [300, 222, 13],
      [320, 247, 6],
    ]) {
      if (x === undefined || y === undefined || r === undefined) continue;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.fillStyle = bubble ? '#263744' : '#ffffff';
  ctx.font = bubble ? 'bold 49px Arial' : 'bold 80px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) =>
    ctx.fillText(line, 320, (bubble ? 103 : 128) + (i - (lines.length - 1) / 2) * 64),
  );
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map, depthTest: false, depthWrite: false }),
  );
  sprite.scale.set(bubble ? 192 : 25, bubble ? 77 : 10, 1);
  return sprite;
}

export function makeTrump(id: string): THREE.Group {
  const man = new THREE.Group();
  man.name = 'donald-trump';
  const skin = 0xe6ac87,
    suit = 0x202e48;
  oval(man, 'jacket', suit, 0, 1, 0, 18, 23, 11);
  oval(man, 'white-shirt', 0xfffaf0, 0, 9, 10, 7, 15, 2);
  oval(man, 'tie-knot', 0xbd1c35, 0, 20, 12, 3, 3, 1);
  shaped(
    man,
    'long-red-tie',
    [
      [-2.5, 18],
      [2.5, 18],
      [4, -17],
      [0, -21],
      [-4, -17],
    ],
    0xd52339,
    12,
  );
  oval(man, 'jacket-button', 0x798396, 4, -8, 11, 0.9, 0.9, 0.5);
  oval(man, 'flag-pin-white', 0xffffff, 11, 15, 12, 2, 1.25, 0.4);
  oval(man, 'flag-pin-red', 0xc82a38, 11, 14.6, 12.5, 2, 0.35, 0.2);
  oval(man, 'flag-pin-blue', 0x234268, 10, 15.3, 12.5, 0.8, 0.5, 0.2);
  for (const side of [-1, 1]) {
    shaped(
      man,
      'lapel',
      [
        [side * 5, 23],
        [side * 16, 16],
        [side * 11, 11],
        [side * 6, -8],
        [side * 2, 8],
      ],
      0x31415a,
      10,
    );
    oval(man, 'collar', 0xffffff, side * 4, 23, 11, 3.2, 5, 1).rotation.z = -side * 0.35;
    const arm = new THREE.Group();
    arm.name = side < 0 ? 'left-arm' : 'right-arm';
    arm.position.set(side * 15, 13, 7);
    man.add(arm);
    bone(arm, 'upper-arm', 5, suit);
    bone(arm, 'forearm', 4.5, suit);
    oval(arm, 'elbow', suit, 0, 0, 0, 4.8, 4.8, 4.8);
    const hand = new THREE.Group();
    hand.name = 'open-hand';
    arm.add(hand);
    oval(hand, 'cuff', 0xffffff, 0, 4, 0, 4.3, 1.8, 3.5);
    oval(hand, 'palm', skin, 0, 0, 0, 4, 4.2, 2);
    for (let i = 0; i < 4; i++)
      oval(
        hand,
        'finger-' + i,
        skin,
        (i - 1.5) * 1.9,
        -5,
        0,
        0.9,
        3.1 - Math.abs(i - 1.5) * 0.4,
        1,
      );
    oval(hand, 'thumb', skin, -side * 4.3, 0, 0.5, 1.2, 2.8, 1.2).rotation.z = side * 0.5;
    const pinch = new THREE.Mesh(
      new THREE.TorusGeometry(2.1, 0.8, 8, 18),
      new THREE.MeshStandardMaterial({ color: skin, roughness: 0.65 }),
    );
    pinch.name = 'pinch-loop';
    pinch.position.set(-side * 1.5, -5.5, 0.3);
    pinch.visible = false;
    hand.add(pinch);
    const contact = new THREE.Object3D();
    contact.name = 'palm-contact';
    hand.add(contact);
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'left-leg' : 'right-leg';
    leg.position.set(side * 8, -18, 0);
    man.add(leg);
    bone(leg, 'thigh', 6, suit);
    bone(leg, 'shin', 5.4, suit);
    oval(leg, 'knee', suit, 0, 0, 0, 5.8, 5.8, 5.8);
    const shoe = new THREE.Group();
    shoe.name = 'dress-shoe';
    leg.add(shoe);
    oval(shoe, 'shoe-upper', 0x181d25, 2, -1, 3, 7.5, 3.8, 9, 0.25);
    oval(shoe, 'sole', 0x0c111a, 2, -3.5, 3, 8, 1, 9.4);
  }
  oval(man, 'neck', skin, 0, 25, 0, 7, 7, 7);
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 39;
  man.add(head);
  oval(head, 'face', skin, 0, 0, 0, 15, 18, 12);
  oval(head, 'chin', skin, 0, -11, 4, 11, 7, 9);
  oval(head, 'blond-hair', 0xe7d89b, 0, 7, -5, 16, 13, 10);
  for (let i = 0; i < 5; i++)
    oval(
      head,
      'swept-hair',
      i % 2 ? 0xf1e4b5 : 0xd9c78f,
      -8 + i * 3.5,
      12 - i * 0.6,
      7,
      9 - i * 0.7,
      3,
      3,
    ).rotation.z = -0.18;
  for (const side of [-1, 1]) {
    oval(head, 'ear', skin, side * 15, 0, 0, 3, 5, 3);
    oval(head, 'side-hair', 0xf1e4b5, side * 14, 5, 0, 3, 8, 7);
    const eye = new THREE.Group();
    eye.name = 'eye';
    eye.position.set(side * 6, 2, 11);
    head.add(eye);
    oval(eye, 'eye-white', 0xf7efdf, 0, 0, 0, 3.7, 1.7, 1);
    oval(eye, 'iris', 0x618699, 0, 0, 1, 1.2, 1.4, 0.5);
    oval(eye, 'eye-glint', 0xffffff, -0.3, 0.5, 1.6, 0.35, 0.4, 0.25, 0.15);
    oval(head, 'under-eye', 0xd19e7f, side * 6, -0.5, 11, 4, 0.7, 0.8);
    oval(head, 'brow', 0xc5af79, side * 6, 5, 11, 4.5, 1.3, 1);
    oval(head, 'cheek', 0xe7a386, side * 9, -4, 9, 5, 3, 3);
  }
  oval(head, 'nose', skin, 0, -2, 12, 3.6, 4.5, 4);
  oval(head, 'mouth', 0xa96d63, 0, -10, 12, 5, 0.8, 1);
  oval(head, 'mouth-opening', 0x714640, 0, -9, 12.3, 2.5, 0.5, 0.5);
  oval(head, 'red-maga-cap', 0xc91536, 0, 14, -1, 17, 10, 13);
  oval(head, 'cap-brim', 0xe01e3e, 0, 9, 10, 18, 2, 12);
  const label = textSprite(['MAKE AMERICA', 'GREAT AGAIN'], false);
  if (label) {
    label.position.set(0, 17, 13);
    head.add(label);
  }
  const phrase = trumpPhrase(id);
  man.userData['phrase'] = phrase;
  return man;
}

export function trumpArmTo(man: THREE.Group, side: number, point: THREE.Vector3, gesture = 0) {
  const arm = requireSceneObject(man, side > 0 ? 'right-arm' : 'left-arm');
  nillLimb(arm, arm.worldToLocal(point.clone()), true);
  const hand = requireSceneObject(arm, 'open-hand');
  hand.rotation.set(0, 0, side * gesture * 0.3);
  requireSceneObject(hand, 'pinch-loop').visible = false;
  requireSceneObject(hand, 'thumb').visible = true;
  for (let i = 0; i < 4; i++) {
    const finger = requireSceneObject(hand, 'finger-' + i);
    finger.visible = true;
    finger.rotation.x = gesture * (i === 0 ? 0.15 : 1.25);
    finger.position.y = -5 + gesture * (i === 0 ? 0 : 2.5);
  }
}
export function trumpLegs(
  man: THREE.Group,
  distance: number,
  stride: number,
  rate: number,
  planted?: Point,
) {
  man.updateMatrixWorld(true);
  for (const side of [-1, 1]) {
    const leg = requireSceneObject(man, side > 0 ? 'right-leg' : 'left-leg');
    const phase = distance * 0.15 * rate + (side < 0 ? Math.PI : 0);
    const target = planted
      ? leg.worldToLocal(new THREE.Vector3(planted.x + side * 8 * 0.8, -planted.y - 48 * 0.8, 160))
      : new THREE.Vector3(
          Math.sin(phase) * stride * 5,
          -30 + Math.max(0, Math.cos(phase)) * stride * 4,
          0,
        );
    nillLimb(leg, target, false);
  }
}
export function trumpWalk(
  man: THREE.Group,
  distance: number,
  facing: number,
  stride = 1,
  step = 1,
) {
  man.scale.setScalar(0.8);
  man.rotation.set(0, facing * 0.22, 0);
  man.updateMatrixWorld(true);
  for (const side of [-1, 1]) {
    const arm = requireSceneObject(man, side > 0 ? 'right-arm' : 'left-arm');
    const phase = distance * 0.15 * step + (side < 0 ? Math.PI : 0);
    const local = new THREE.Vector3(Math.sin(phase) * stride * 3.5, -27, 0);
    trumpArmTo(man, side, arm.localToWorld(local));
  }
  trumpLegs(man, distance, stride, step);
  requireSceneObject(man, 'head').rotation.set(0, facing * 0.1, 0);
}
