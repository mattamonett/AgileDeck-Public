import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import { GOAT_SCALE } from './goat-choreography';
import { stretchBetweenVectors } from '../../kit';
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
  const part = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.78 }),
  );
  part.name = name;
  part.position.set(x, y, z);
  part.scale.set(sx, sy, sz);
  parent.add(part);
  return part;
}
function marker(parent: THREE.Object3D, name: string, x: number, y: number, z: number) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
}
function makeGoat(index: number, color: number) {
  const goat = new THREE.Group();
  goat.name = `goat-${index}`;
  const body = new THREE.Group();
  body.name = 'body';
  goat.add(body);
  oval(body, 'torso', color, 0, 24, 0, 19, 10, 8);
  oval(body, 'belly', 0xf0e4d0, 0, 20, 3, 14, 6, 6);
  oval(body, 'haunch', color, -12, 24, 0, 9, 9, 7);
  oval(body, 'neck', color, 12, 29, 0, 7, 12, 6).rotation.z = -0.28;
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(-18, 28, 0);
  body.add(tail);
  oval(tail, 'tail-fur', color, -2, 2, 0, 5, 3, 3).rotation.z = -0.6;
  oval(tail, 'tail-tip', 0xf8efde, -5, 4, 0, 3, 2, 2);
  for (let i = 0; i < 5; i++)
    oval(body, 'fur-tuft', color, -13 + i * 6, 32, 0, 2, 3, 3).rotation.z = -0.4;
  marker(body, 'rump-contact', -15, 27, 4.3);
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Group();
    leg.name = `leg-${i}`;
    leg.position.set(i < 2 ? -10 : 10, 16, i % 2 ? 5 : -5);
    body.add(leg);
    for (const name of ['upper-leg', 'lower-leg']) {
      const part = new THREE.Mesh(
        new THREE.CylinderGeometry(
          name === 'upper-leg' ? 2.6 : 1.9,
          name === 'upper-leg' ? 2.1 : 1.7,
          1,
          10,
        ),
        new THREE.MeshStandardMaterial({
          color: name === 'upper-leg' ? color : 0xe8dfcc,
          roughness: 0.85,
        }),
      );
      part.name = name;
      leg.add(part);
    }
    oval(leg, 'knee', color, 0, -8, 0, 2.6, 2.6, 2.6);
    const foot = new THREE.Group();
    foot.name = 'hoof';
    leg.add(foot);
    for (const z of [-1.25, 1.25]) oval(foot, 'cloven-toe', 0x383638, 0.8, 1.5, z, 3, 1.5, 1.1);
    oval(foot, 'hoof-cleft', 0xbfb5a0, 2, 2, 0, 0.7, 1.2, 0.35);
    marker(foot, 'sole', 0, 0, 0);
  }
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(14, 32, 0);
  body.add(head);
  oval(head, 'skull', color, 0, 3, 0, 6.5, 10, 5.7);
  oval(head, 'long-muzzle', color, 6, -3, 0, 9, 5, 5);
  oval(head, 'nose', 0x5e5147, 13, -3, 0, 2.6, 2.7, 4.2);
  for (const z of [-3.8, 3.8]) {
    oval(head, 'nostril', 0x292323, 14, -2, z, 0.7, 0.7, 0.4);
    const eye = new THREE.Group();
    eye.name = z > 0 ? 'eye-front' : 'eye-back';
    eye.position.set(2, 6, z > 0 ? 5.1 : -5.1);
    head.add(eye);
    oval(eye, 'white', 0xfff6df, 0, 0, 0, 2.6, 2.8, 0.7);
    oval(eye, 'amber-iris', 0xcd9d42, 0.5, 0, z > 0 ? 0.65 : -0.65, 1.9, 2, 0.5);
    oval(eye, 'horizontal-pupil', 0x242329, 0.6, 0, z > 0 ? 1 : -1, 1.65, 0.55, 0.3);
    oval(eye, 'eye-glint', 0xffffff, 0.3, 0.8, z > 0 ? 1.3 : -1.3, 0.45, 0.45, 0.2);
    oval(head, 'eyebrow', color, 2, 9, z > 0 ? 5.4 : -5.4, 3.1, 1, 0.8).rotation.z = -0.08;
    const ear = new THREE.Group();
    ear.name = z > 0 ? 'ear-front' : 'ear-back';
    ear.position.set(-4, 7, z > 0 ? 4 : -4);
    head.add(ear);
    oval(ear, 'ear-fur', color, -4, -0.5, 0, 6.5, 2.7, 2).rotation.z = 0.22;
    oval(ear, 'pink-inner', 0xc99a94, -4, -0.5, z > 0 ? 1.5 : -1.5, 4.7, 1.3, 0.45).rotation.z =
      0.22;
  }
  const mouth = new THREE.Group();
  mouth.name = 'mouth';
  mouth.position.set(9, -6, 4.5);
  head.add(mouth);
  oval(mouth, 'lip', 0x65554b, 0, 0, 0, 4, 0.65, 0.6);
  oval(mouth, 'mouth-dark', 0x463234, 0, -0.6, 0.2, 2.8, 0.8, 0.4);
  for (let i = 0; i < 4; i++)
    oval(
      head,
      'beard-strand',
      index === 1 ? 0x765239 : 0xece6d7,
      4 + i * 0.8,
      -10 - (i % 2),
      1 + (i % 2) * 2,
      1.3,
      5,
      1.1,
    ).rotation.z = -0.1 + i * 0.08;
  for (const z of [-4.3, 4.3]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1, 11, z),
      new THREE.Vector3(-2, 18, z),
      new THREE.Vector3(-6, 22, z),
      new THREE.Vector3(-9, 20, z),
    ]);
    const horn = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 14, 1.7, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x6e6050, roughness: 0.55 }),
    );
    horn.name = 'curved-horn';
    head.add(horn);
    oval(head, 'horn-tip', 0x403b34, -9, 20, z, 1.2, 1.4, 1.2);
    for (let i = 0; i < 5; i++) {
      const point = curve.getPoint(i * 0.13 + 0.06),
        ring = new THREE.Mesh(
          new THREE.TorusGeometry(1.8, 0.22, 5, 10),
          new THREE.MeshStandardMaterial({ color: 0x9b8c72 }),
        );
      ring.position.copy(point);
      ring.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        curve.getTangent(i * 0.13 + 0.06),
      );
      head.add(ring);
    }
  }
  marker(head, 'horn-contact', -9, 20, 4.3);
  if (index === 1) {
    oval(body, 'brown-saddle', 0x744b36, -3, 28, 5.5, 10, 5, 3);
    oval(head, 'white-blaze', 0xf0e6d0, 4, 3, 4.8, 2, 7, 1);
  }
  if (index === 2) {
    oval(head, 'white-cheek', 0xf5ede0, 4, -2, 4.5, 5, 4, 1.7);
    oval(body, 'gray-saddle', 0x78878f, -5, 28, 5, 10, 5, 3);
  }
  return goat;
}
export function makeGoats(): THREE.Group {
  const herd = new THREE.Group();
  [0xf3ead5, 0xa9774d, 0xa9b3ba].forEach((color, i) => herd.add(makeGoat(i, color)));
  goatWalk(herd, 0, 1, 0);
  return herd;
}
export function goatFoot(goat: THREE.Object3D, i: number, target: THREE.Vector3, angle = 0) {
  const leg = requireSceneObject(goat, `leg-${i}`),
    local = leg.worldToLocal(target.clone()),
    d = local.length(),
    perpendicular = new THREE.Vector3(-local.y, local.x, 0);
  if (perpendicular.lengthSq() < 1e-8) perpendicular.set(1, 0, 0);
  const joint = local
    .clone()
    .multiplyScalar(0.5)
    .add(
      perpendicular
        .normalize()
        .multiplyScalar((i < 2 ? -1 : 1) * Math.sqrt(Math.max(0, 81 - (d * d) / 4))),
    );
  stretchBetweenVectors(requireSceneObject(leg, 'upper-leg'), new THREE.Vector3(), joint);
  stretchBetweenVectors(requireSceneObject(leg, 'lower-leg'), joint, local);
  requireSceneObject(leg, 'knee').position.copy(joint);
  const hoof = requireSceneObject(leg, 'hoof');
  hoof.position.copy(local);
  const world = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
  hoof.quaternion.copy(leg.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(world);
}
export function goatDetails(
  goat: THREE.Object3D,
  ms: number,
  headTilt: number,
  moving: number,
  bleat = 0,
) {
  const head = requireSceneObject(goat, 'head');
  head.rotation.z = headTilt;
  requireSceneObject(goat, 'tail').rotation.z = Math.sin(ms / 115) * 0.16 * moving;
  for (const name of ['ear-front', 'ear-back'])
    requireSceneObject(head, name).rotation.z =
      Math.sin(ms / 160 + (name === 'ear-front' ? 0 : 1)) * 0.1 * moving + bleat * 0.15;
  const blink = ms % 2900 > 2710 ? Math.max(0.05, Math.abs((ms % 2900) - 2800) / 90) : 1;
  for (const name of ['eye-front', 'eye-back']) requireSceneObject(head, name).scale.y = blink;
  requireSceneObject(head, 'mouth').scale.y = 1 + bleat * 3;
}
export function goatLegs(
  goat: THREE.Object3D,
  distance: number,
  stride: number,
  step = 1,
  tuck = 0,
) {
  goat.updateMatrixWorld(true);
  for (let i = 0; i < 4; i++) {
    const phase = distance * 0.23 * step + (i === 0 || i === 3 ? 0 : Math.PI),
      x = (i < 2 ? -10 : 10) + Math.sin(phase) * 6 * stride,
      y = Math.max(0, Math.cos(phase)) * 4 * stride + tuck * 9;
    goatFoot(goat, i, goat.localToWorld(new THREE.Vector3(x, y, i % 2 ? 5 : -5)));
  }
}
export function goatWalk(
  herd: THREE.Group,
  distance: number,
  facing: number,
  stride = 1,
  step = 1,
  contactFacing = Math.sign(facing) || 1,
  order: readonly [number, number, number] = [0, 1, 2],
) {
  herd.scale.setScalar(GOAT_SCALE);
  herd.visible = true;
  herd.children.forEach((goat, i) => {
    goat.position.set(-facing * order.indexOf(i) * 52, 0, 0);
    goat.scale.set(contactFacing, 1, 1);
    goat.rotation.set(0, Math.acos(Math.max(-1, Math.min(1, facing * contactFacing))), 0);
    const body = requireSceneObject(goat, 'body');
    body.rotation.set(0, 0, 0);
    body.position.y = -Math.abs(Math.sin(distance * 0.23 + i)) * 1.5 * stride;
    goatDetails(goat, distance * 8 + i * 470, Math.sin(distance * 0.1 + i) * 0.03 * stride, stride);
    goatLegs(goat, distance - i * 12, stride, step);
  });
}
