import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import { CAR_SCALE, carClamp, carClimb, type CarPlan } from './car-choreography';
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
  roughness = 0.5,
) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshStandardMaterial({ color, roughness }),
  );
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
function box(
  parent: THREE.Object3D,
  name: string,
  color: number,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.45 }),
  );
  mesh.name = name;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
function rod(parent: THREE.Object3D, name: string, radius: number, color: number) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 1, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5 }),
  );
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}
function tyre(parent: THREE.Object3D, x: number, side: number) {
  const wheel = new THREE.Group();
  wheel.name = (x > 0 ? 'front-wheel-' : 'rear-wheel-') + (side > 0 ? 'near' : 'far');
  wheel.position.set(x, -10, side * 14);
  parent.add(wheel);
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(11, 11, 7, 24),
    new THREE.MeshStandardMaterial({ color: 0x171e26, roughness: 0.82 }),
  );
  tire.rotation.x = Math.PI / 2;
  wheel.add(tire);
  for (const face of [-1, 1]) {
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(7.5, 0.85, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xc7d2dc, metalness: 0.65, roughness: 0.3 }),
    );
    rim.position.z = face * 3.7;
    wheel.add(rim);
    oval(wheel, 'hub', 0xd8dce0, 0, 0, face * 4, 2.6, 2.6, 0.8, 0.25);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spoke = box(
        wheel,
        'spoke',
        0x8d9ba7,
        Math.cos(a) * 4,
        Math.sin(a) * 4,
        face * 4,
        6,
        1.3,
        0.8,
      );
      spoke.rotation.z = a;
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    box(
      wheel,
      'tread',
      0x30343a,
      Math.cos(a) * 10.8,
      Math.sin(a) * 10.8,
      0,
      1.5,
      1.5,
      7.3,
    ).rotation.z = a;
  }
}
function driverModel(parent: THREE.Object3D) {
  const driver = new THREE.Group();
  driver.name = 'driver';
  parent.add(driver);
  oval(driver, 'race-suit', 0x326dcc, 0, 0, 0, 6.5, 9, 5);
  for (const side of [-1, 1]) {
    box(driver, 'suit-stripe', 0xf9ecdd, side * 4.5, 0, side * 4.1, 1.2, 11, 1);
    const arm = new THREE.Group();
    arm.name = side < 0 ? 'left-arm' : 'right-arm';
    arm.position.set(side * 5, 5, 0);
    driver.add(arm);
    rod(arm, 'upper-arm', 2.2, 0x326dcc);
    rod(arm, 'forearm', 2, 0x326dcc);
    oval(arm, 'elbow', 0x2b60b7, 0, 0, 0, 2.2, 2.2, 2.2);
    const glove = new THREE.Group();
    glove.name = 'glove';
    arm.add(glove);
    oval(glove, 'palm', 0xfff5df, 0, 0, 0, 2.5, 2.7, 2);
    oval(glove, 'thumb', 0xfff5df, side * 2.2, 0.3, 0.7, 1, 1.6, 1);
    const grip = new THREE.Object3D();
    grip.name = 'palm-contact';
    glove.add(grip);
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'left-leg' : 'right-leg';
    leg.position.set(side * 3, -8, 0);
    driver.add(leg);
    rod(leg, 'thigh', 2.6, 0x326dcc);
    rod(leg, 'shin', 2.2, 0x326dcc);
    oval(leg, 'knee', 0x275ab4, 0, 0, 0, 2.6, 2.6, 2.6);
    const boot = new THREE.Group();
    boot.name = 'boot';
    leg.add(boot);
    oval(boot, 'boot-upper', 0x172a40, 1.8, -1, 2, 3.6, 2.2, 3.4);
  }
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.y = 8;
  driver.add(neck);
  oval(neck, 'helmet', 0xffc92e, 0, 6, 0, 9, 9.5, 9, 0.3);
  oval(neck, 'helmet-stripe', 0xfaf3de, -2, 7, 0, 2, 9.5, 9.2, 0.3);
  for (const side of [-1, 1]) {
    oval(neck, 'visor', 0x153947, 3, 7, side * 7, 6.5, 3.8, 2, 0.2);
    oval(neck, 'visor-glint', 0x71bed3, 1, 8.5, side * 8.8, 3.5, 0.65, 0.2, 0.15);
    for (const x of [2, 5.8]) {
      const eye = oval(neck, 'driver-eye', 0xfff8e5, x, 7, side * 8.9, 1.35, 1.8, 0.3);
      oval(eye, 'pupil', 0x1d2733, 0.3, 0, side * 0.4, 0.4, 0.7, 0.3);
    }
    oval(neck, 'helmet-bolt', 0x707e88, -4, 6, side * 8, 1, 1, 0.4);
  }
  const contact = new THREE.Object3D();
  contact.name = 'helmet-contact';
  contact.position.set(9, 6, 0);
  neck.add(contact);
  const wheel = new THREE.Group();
  wheel.name = 'steering-wheel';
  wheel.position.set(9, 5, 6);
  wheel.rotation.y = 0.65;
  driver.add(wheel);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(3.8, 0.7, 8, 20),
    new THREE.MeshStandardMaterial({ color: 0x152430 }),
  );
  wheel.add(rim);
  for (const x of [-3, 3]) {
    const grip = new THREE.Object3D();
    grip.name = x < 0 ? 'steering-left-grip' : 'steering-right-grip';
    grip.position.x = x;
    wheel.add(grip);
  }
  box(wheel, 'steering-spoke', 0x99a9b3, 0, 0, 0, 6, 0.7, 0.6);
}
export function makeRaceCar(): THREE.Group {
  const car = new THREE.Group();
  car.name = 'racing-car';
  oval(car, 'chassis', 0xc91c3c, -2, -3, 0, 39, 7, 12, 0.3);
  oval(car, 'rear', 0xe72b42, -27, 9, 0, 14, 9, 12, 0.3);
  const hood = new THREE.Group();
  hood.name = 'hood';
  hood.position.set(12, 5, 0);
  car.add(hood);
  oval(hood, 'bonnet', 0xf13b49, 17, 0, 0, 18.5, 8.5, 12, 0.3);
  box(hood, 'stripe', 0xfff2dc, 17, 7.5, 0, 35, 1.5, 5);
  for (const side of [-1, 1]) {
    box(car, 'seat-side', 0x192935, -7, 11, side * 10, 20, 9, 3);
    box(car, 'side-number', 0xfff2dc, -26, 10, side * 12, 11, 9, 0.8);
    for (const y of [7.5, 12.5])
      box(car, 'number-stroke', 0x213245, -26, y, side * 12.5, 5, 1.2, 0.5);
    for (const x of [-28, -24])
      box(car, 'number-stroke', 0x213245, x, 10, side * 12.5, 1.2, 5, 0.5);
    box(car, 'spoiler-post', 0x1c2934, -36, 21, side * 9, 3, 14, 3);
    tyre(car, -27, side);
    tyre(car, 29, side);
  }
  box(car, 'spoiler', 0x243446, -36, 29, 0, 16, 4, 33);
  box(car, 'seat', 0x162733, -9, 12, 0, 16, 7, 17);
  const bumper = new THREE.Group();
  bumper.name = 'bumper';
  bumper.position.set(50, 0, 0);
  car.add(bumper);
  box(bumper, 'bumper-bar', 0xc5d1dc, 0, 0, 0, 5, 7, 27);
  const bumperTip = new THREE.Object3D();
  bumperTip.name = 'bumper-contact';
  bumperTip.position.x = 3;
  bumper.add(bumperTip);
  for (const side of [-1, 1]) oval(hood, 'headlight', 0xffeda4, 31, 2, side * 9, 3, 2.5, 2);
  const glass = box(car, 'windshield', 0x7ec6d9, 10, 21, 0, 2, 15, 22);
  glass.rotation.z = 0.2;
  glass.material.transparent = true;
  glass.material.opacity = 0.62;
  box(car, 'engine', 0x4d6573, 27, 4, 0, 19, 9, 17);
  const coilPoints = Array.from(
    { length: 81 },
    (_, i) =>
      new THREE.Vector3(
        27 + Math.cos((i / 80) * Math.PI * 8) * 3,
        8 + (i / 80) * 14,
        4 + Math.sin((i / 80) * Math.PI * 8) * 3,
      ),
  );
  const spring = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPoints), 80, 0.6, 6, false),
    new THREE.MeshStandardMaterial({ color: 0xc8d9da, metalness: 0.6, roughness: 0.3 }),
  );
  spring.name = 'engine-spring';
  spring.visible = false;
  car.add(spring);
  box(car, 'steering-column', 0x7d929e, -1, 20, 7, 2, 10, 2).rotation.z = -0.5;
  oval(car, 'exhaust', 0x242c35, -43, -1, 0, 4, 2.5, 3.5);
  driverModel(car);
  raceCarDrive(car, 0, 0);
  return car;
}
export function carLimb(root: THREE.Object3D, target: THREE.Vector3, arm: boolean) {
  const length = arm ? 8 : 7;
  const distance = target.length();
  const bend = new THREE.Vector3(0, 0, 1).addScaledVector(
    target,
    -target.z / Math.max(0.000001, distance * distance),
  );
  if (bend.lengthSq() < 0.000001) bend.set(1, 0, 0);
  const joint = target
    .clone()
    .multiplyScalar(0.5)
    .add(
      bend
        .normalize()
        .multiplyScalar(Math.sqrt(Math.max(0, length * length - (distance * distance) / 4))),
    );
  stretchBetweenVectors(
    requireSceneObject(root, arm ? 'upper-arm' : 'thigh'),
    new THREE.Vector3(),
    joint,
  );
  stretchBetweenVectors(requireSceneObject(root, arm ? 'forearm' : 'shin'), joint, target);
  requireSceneObject(root, arm ? 'elbow' : 'knee').position.copy(joint);
  requireSceneObject(root, arm ? 'glove' : 'boot').position.copy(target);
}
export function carDriverRig(car: THREE.Group, ms: number, p?: CarPlan) {
  const driver = requireSceneObject(car, 'driver');
  driver.updateWorldMatrix(true, true);
  const flying = p && ms > 100 && ms < p.hit;
  const seated = !p || ms <= 100 || ms >= carClimb(p) + 500;
  const viewerSide = Math.cos(car.rotation.y) >= 0 ? 1 : -1;
  for (const side of [-1, 1]) {
    const arm = requireSceneObject(driver, side < 0 ? 'left-arm' : 'right-arm');
    const point = driver.worldToLocal(
      requireSceneObject(
        driver,
        side < 0 ? 'steering-left-grip' : 'steering-right-grip',
      ).getWorldPosition(new THREE.Vector3()),
    );
    if (p && side < 0 && !seated)
      point.set(
        -7 - (flying ? Math.sin(ms / 90) * 4 : 0),
        flying ? 5 + Math.sin(ms / 80) * 9 : -8,
        6,
      );
    if (p && side < 0 && seated && ms > carClimb(p) + 700 && ms < p.departure - 150) {
      const gesture = Math.sin(carClamp((ms - carClimb(p) - 700) / 650) * Math.PI);
      point.lerp(
        new THREE.Vector3(
          p.helmet ? -1 : -13,
          p.helmet ? 17 : 12,
          viewerSide * (p.helmet ? 8.4 : 7),
        ),
        gesture,
      );
    }
    const worldPoint = driver.localToWorld(point);
    carLimb(arm, arm.worldToLocal(worldPoint), true);
    const leg = requireSceneObject(driver, side < 0 ? 'left-leg' : 'right-leg');
    carLimb(
      leg,
      seated
        ? new THREE.Vector3(5, -9, 4)
        : new THREE.Vector3(
            side * (3 + (flying ? Math.sin(ms / 70 + side) * 2 : 0)),
            -11 + (flying ? Math.sin(ms / 80 + side) : 0),
            3,
          ),
      false,
    );
  }
}
export function raceCarDrive(car: THREE.Group, distance: number, heading: number) {
  car.rotation.set(0, Math.acos(Math.cos(heading)), Math.sin(heading) * 0.16);
  car.scale.setScalar(CAR_SCALE);
  car.visible = true;
  car.traverse((part) => {
    if (part.name.includes('-wheel-')) part.rotation.z = -distance / (11 * CAR_SCALE);
  });
  const driver = requireSceneObject(car, 'driver');
  driver.position.set(-8, 21, 4);
  driver.rotation.set(0, 0, -0.2);
  requireSceneObject(driver, 'neck').rotation.z = 0;
  carDriverRig(car, 0);
}

export function flat(geometry: THREE.BufferGeometry, color: number) {
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
}
