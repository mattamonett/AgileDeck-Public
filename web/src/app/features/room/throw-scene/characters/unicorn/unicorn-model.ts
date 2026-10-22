import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import {
  UNICORN_COLORS,
  UNICORN_SCALE,
  unicornPlan,
  type UnicornPlan,
} from './unicorn-choreography';
import { stretchBetweenVectors } from '../../kit';
const plans = new WeakMap<THREE.Group, UnicornPlan>();
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
    new THREE.SphereGeometry(1, 20, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.48 }),
  );
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
function tube(
  parent: THREE.Object3D,
  name: string,
  color: number,
  points: THREE.Vector3[],
  radius: number,
) {
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, radius, 8, false),
    new THREE.MeshStandardMaterial({ color, roughness: 0.4 }),
  );
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}
export function nativeUnicornPlan(model: THREE.Group): UnicornPlan {
  const p = plans.get(model);
  if (!p) throw Error('Missing native unicorn plan');
  return p;
}
export function makeUnicorn(id = 'unicorn'): THREE.Group {
  const root = new THREE.Group();
  root.name = 'unicorn';
  const p = unicornPlan(id);
  plans.set(root, p);
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);
  oval(body, 'torso', 0xfff5ff, 0, 24, 0, 20, 11, 9);
  oval(body, 'soft-belly', 0xf3dced, 0, 20, 3, 15, 7, 7);
  oval(body, 'haunch', 0xfff5ff, -12, 24, 0, 10, 11, 8);
  oval(body, 'neck', 0xfff5ff, 13, 33, 0, 8, 15, 7).rotation.z = -0.25;
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(15, 39, 0);
  body.add(head);
  oval(head, 'skull', 0xfff5ff, 1, 3, 0, 9, 11, 7);
  oval(head, 'muzzle', 0xf8d5e7, 10, -1, 0, 10, 6, 6.5);
  for (const side of [-1, 1]) {
    oval(head, 'nostril', 0xa17c96, 16, 0, side * 5.5, 0.8, 0.6, 0.5);
    oval(head, 'blush', 0xf3a7c9, 5, -1, side * 6.5, 3.2, 1.8, 0.5);
    const eye = new THREE.Group();
    eye.name = side > 0 ? 'eye-front' : 'eye-back';
    eye.position.set(5, 5, side * 6.8);
    head.add(eye);
    oval(eye, 'white', 0xfffcfb, 0, 0, 0, 3.8, 4.8, 0.6);
    oval(eye, 'iris', 0x526597, 0.5, 0, side * 0.5, 2.9, 3.8, 0.5);
    oval(eye, 'pupil', 0x232439, 0.8, 0, side * 0.9, 2, 3, 0.3);
    oval(eye, 'glint', 0xffffff, 0.1, 1.5, side * 1.2, 0.9, 1, 0.2);
    oval(head, 'brow', 0xc7a3ce, 5, 11, side * 6, 3.6, 0.6, 0.6).rotation.z = 0.13;
    const ear = new THREE.Group();
    ear.name = side > 0 ? 'ear-front' : 'ear-back';
    ear.position.set(-2, 14, side * 4);
    head.add(ear);
    oval(ear, 'ear-fur', 0xfff5ff, 0, 2, 0, 3, 7, 2);
    oval(ear, 'inner-ear', 0xf0a9cd, 0, 2, side * 1.5, 1.5, 4, 0.4);
  }
  tube(
    head,
    'smile',
    0xac7e9c,
    [new THREE.Vector3(10, -4, 6), new THREE.Vector3(13, -5, 6), new THREE.Vector3(16, -4, 5)],
    0.45,
  );
  const horn = new THREE.Group();
  horn.name = 'horn';
  horn.position.set(7, 14, 0);
  horn.rotation.z = -0.15;
  head.add(horn);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(2.8, 16, 24),
    new THREE.MeshStandardMaterial({ color: 0xffdf87, metalness: 0.5, roughness: 0.25 }),
  );
  cone.position.y = 8;
  horn.add(cone);
  const spiral: THREE.Vector3[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60,
      a = t * Math.PI * 8,
      r = 2.7 * (1 - t);
    spiral.push(new THREE.Vector3(Math.cos(a) * r, t * 16, Math.sin(a) * r));
  }
  tube(horn, 'golden-spiral', 0xc49245, spiral, 0.35);
  const tip = new THREE.Object3D();
  tip.name = 'horn-tip';
  tip.position.y = 16;
  horn.add(tip);
  const mane = new THREE.Group();
  mane.name = 'mane';
  head.add(mane);
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(-18, 27, 0);
  body.add(tail);
  for (let i = 0; i < 6; i++) {
    const color = UNICORN_COLORS[i] ?? 0xb69aff;
    tube(
      mane,
      'mane-lock',
      color,
      [
        new THREE.Vector3(-4 + i * 0.25, 13 - i * 0.75, i - 2),
        new THREE.Vector3(-10 - i * 0.7, 7 - i * 0.6, i - 2),
        new THREE.Vector3(-9 - i * 0.7, -4 - i * 0.6, i - 2),
        new THREE.Vector3(-13 - i * 0.7, -17 + i * 0.45, i - 2),
      ],
      1.2,
    );
    tube(
      tail,
      'tail-lock',
      color,
      [
        new THREE.Vector3(0, i * 0.3, i - 2),
        new THREE.Vector3(-9, 2 - i * 0.9, i - 2),
        new THREE.Vector3(-16, -6 - i * 0.9, i - 2),
        new THREE.Vector3(-17, -12 - i * 0.6, i - 2),
      ],
      1.2,
    );
  }
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Group();
    leg.name = `leg-${i}`;
    leg.position.set(i < 2 ? -13 : 13, 18, i % 2 ? 4 : -4);
    body.add(leg);
    for (const name of ['upper-leg', 'lower-leg']) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(
          name === 'upper-leg' ? 2.6 : 1.9,
          name === 'upper-leg' ? 2.2 : 1.7,
          1,
          12,
        ),
        new THREE.MeshStandardMaterial({ color: i % 2 ? 0xfff5ff : 0xdccfe8, roughness: 0.6 }),
      );
      mesh.name = name;
      leg.add(mesh);
    }
    oval(leg, 'knee', 0xfff5ff, 0, -10, 0, 2.6, 2.6, 2.6);
    const hoof = new THREE.Group();
    hoof.name = 'hoof';
    leg.add(hoof);
    oval(hoof, 'hoof-shell', 0xb894d5, 0.7, 1.7, 0, 3.5, 1.7, 3);
    oval(hoof, 'hoof-highlight', 0xe7c6ee, 1.8, 2.3, 2.5, 1.2, 0.45, 0.25);
    const sole = new THREE.Object3D();
    sole.name = 'sole';
    hoof.add(sole);
  }
  root.scale.set(UNICORN_SCALE * p.side, UNICORN_SCALE, UNICORN_SCALE);
  return root;
}
export function unicornFoot(root: THREE.Group, index: number, target: THREE.Vector3, angle = 0) {
  const leg = requireSceneObject(root, `leg-${index}`),
    local = leg.worldToLocal(target.clone()),
    distance = local.length();
  const perpendicular = new THREE.Vector3(-local.y, local.x, 0);
  if (perpendicular.lengthSq() < 1e-8) perpendicular.set(1, 0, 0);
  const knee = local
    .clone()
    .multiplyScalar(0.5)
    .add(
      perpendicular
        .normalize()
        .multiplyScalar(
          (index < 2 ? -1 : 1) * Math.sqrt(Math.max(0, 144 - (distance * distance) / 4)),
        ),
    );
  stretchBetweenVectors(requireSceneObject(leg, 'upper-leg'), new THREE.Vector3(), knee);
  stretchBetweenVectors(requireSceneObject(leg, 'lower-leg'), knee, local);
  requireSceneObject(leg, 'knee').position.copy(knee);
  const hoof = requireSceneObject(leg, 'hoof');
  hoof.position.copy(local);
  hoof.quaternion
    .copy(leg.getWorldQuaternion(new THREE.Quaternion()).invert())
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle));
}
export function unicornDetails(
  root: THREE.Group,
  ms: number,
  bow: number,
  moving: number,
  wink = 0,
) {
  const p = nativeUnicornPlan(root),
    head = requireSceneObject(root, 'head');
  head.rotation.z = -bow * 0.35;
  requireSceneObject(head, 'mane').rotation.z = Math.sin(ms / 130 + p.phase) * 0.06 * moving;
  requireSceneObject(root, 'tail').rotation.z = Math.sin(ms / 120 + p.phase) * 0.14 * moving;
  for (const name of ['ear-front', 'ear-back'])
    requireSceneObject(head, name).rotation.z = bow * 0.08 + Math.sin(ms / 300 + p.phase) * 0.05;
  const blink = (ms + 400 + p.phase * 200) % 2800,
    open = blink > 2630 ? Math.max(0.07, Math.abs(blink - 2715) / 85) : 1;
  requireSceneObject(head, 'eye-front').scale.y = Math.max(0.07, open * (1 - wink));
  requireSceneObject(head, 'eye-back').scale.y = open;
}
