import * as THREE from 'three';
import { requireSceneObject } from '../../engine/scene-object';
import { HAT_SCALE, hatEase, type HatPlan } from './hat-choreography';
import { stretchBetween } from '../../kit';

function material(color: number, roughness = 0.8) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}
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
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), material(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
export function makeTopHat(): THREE.Group {
  const hat = new THREE.Group();
  hat.name = 'felt-top-hat';
  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(16, 14, 26, 36, 1, true),
    material(0x302c46),
  );
  crown.name = 'crown';
  crown.position.y = -13;
  const lining = new THREE.Mesh(
    new THREE.CylinderGeometry(15.1, 13.1, 26, 36, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x151327, roughness: 0.95, side: THREE.BackSide }),
  );
  lining.name = 'opening';
  lining.position.y = -13;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 2, 36), material(0x262337));
  cap.name = 'closed-cap';
  cap.position.y = -27;
  const brimShape = new THREE.Shape();
  brimShape.absellipse(0, 0, 24, 18, 0, Math.PI * 2, false, 0);
  const hole = new THREE.Path();
  hole.absellipse(0, 0, 15.5, 15.5, 0, Math.PI * 2, true, 0);
  brimShape.holes.push(hole);
  const brim = new THREE.Mesh(
    new THREE.ExtrudeGeometry(brimShape, {
      depth: 1.2,
      bevelEnabled: true,
      bevelSize: 0.6,
      bevelThickness: 0.4,
      bevelSegments: 2,
      curveSegments: 36,
    }),
    material(0x514965),
  );
  brim.name = 'brim';
  brim.rotation.x = -Math.PI / 2;
  brim.position.y = -0.6;
  const edge = new THREE.Mesh(new THREE.TorusGeometry(16, 0.9, 8, 36), material(0x9b759e));
  edge.rotation.x = Math.PI / 2;
  edge.position.y = 0.5;
  const ribbon = new THREE.Mesh(
    new THREE.CylinderGeometry(15.55, 15.1, 6, 36, 1, true),
    material(0xa85c8f, 0.5),
  );
  ribbon.position.y = -17;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(5.5, 5, 1.5), material(0xe8c989, 0.3));
  buckle.position.set(0, -17, 15.5);
  const inset = new THREE.Mesh(new THREE.BoxGeometry(3.5, 3, 0.7), material(0x653a63));
  inset.position.set(0, -17, 16.4);
  hat.add(crown, lining, cap, brim, edge, ribbon, buckle, inset);
  return hat;
}
export function makeRabbit(): THREE.Group {
  const rabbit = new THREE.Group();
  rabbit.name = 'rabbit';
  oval(rabbit, 0xf7eddc, 0, 9, 0, 10, 13, 8);
  oval(rabbit, 0xfffbec, 0, 8, 6, 7, 9, 3);
  oval(rabbit, 0xffffff, 0, 2, -8, 5, 5, 5);
  const head = new THREE.Group();
  head.name = 'rabbit-head';
  head.position.y = 23;
  oval(head, 0xfff8e9, 0, 0, 0, 13, 12, 10);
  for (const side of [-1, 1]) {
    oval(head, 0xefbdbe, side * 8.5, -3, 8.3, 3.2, 2.3, 1.5);
    const eye = oval(head, 0x30354c, side * 4.5, 1.6, 9.3, 2.4, 3.6, 1.2);
    eye.name = 'rabbit-eye';
    oval(eye, 0xffffff, -0.3, 0.38, 0.87, 0.32, 0.24, 0.3);
    oval(eye, 0xffffff, 0.25, -0.3, 0.93, 0.12, 0.12, 0.18);
    oval(head, 0xffffff, side * 3, -4.8, 9, 4, 3.3, 2);
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 1.4), material(0xfffdf4));
    tooth.position.set(side, -7, 10);
    head.add(tooth);
    const ear = new THREE.Group();
    ear.name = side < 0 ? 'rabbit-ear-left' : 'rabbit-ear-right';
    ear.position.set(side * 6.5, 9, -1);
    oval(ear, 0xfff8e9, 0, 6, 0, 3.8, 8, 3);
    oval(ear, 0xf1b5c1, 0, 7, 2.5, 2, 6, 0.8);
    const tip = new THREE.Group();
    tip.name = 'ear-tip';
    tip.position.y = 12;
    oval(tip, 0xfff8e9, 0, 5, 0, 3.5, 7, 2.8);
    oval(tip, 0xf1b5c1, 0, 5, 2.3, 1.8, 5.5, 0.8);
    ear.add(tip);
    head.add(ear);
    const arm = new THREE.Group();
    arm.name = 'rabbit-arm-' + side;
    arm.position.set(side * 8, 14, 4);
    for (const name of ['upper-arm', 'forearm']) {
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.4, 1, 12), material(0xf7eddc));
      bone.name = name;
      arm.add(bone);
    }
    oval(arm, 0xfff8e9, 0, 0, 0, 2.5, 2.5, 2.5).name = 'elbow';
    const paw = oval(arm, 0xfffbef, 0, 0, 0, 3.5, 2.8, 3.2);
    paw.name = 'rabbit-paw';
    rabbit.add(arm);
  }
  const nose = oval(head, 0xda8b9c, 0, -3.1, 11, 2, 1.4, 1);
  nose.name = 'rabbit-nose';
  rabbit.add(head);
  return rabbit;
}
export function rabbitPose(rabbit: THREE.Group, ms: number, plan: HatPlan, rise: number) {
  const pop = 950 + plan.peekPause;
  const side = plan.spot.x < 0.5 ? -1 : 1;
  const attention = hatEase((ms - pop - 350) / 250) * (1 - hatEase((ms - pop - 1050) / 250));
  const grip = hatEase((rise + 15) / 15) * (1 - hatEase((ms - pop - 1200) / 150));
  const wave = plan.wave
    ? attention * Math.max(0, Math.sin(((ms - pop - 400) / 380) * Math.PI))
    : 0;
  for (const armSide of [-1, 1]) {
    const arm = requireSceneObject(rabbit, 'rabbit-arm-' + armSide);
    const px = armSide * (4 + wave * (armSide === side ? 3 : 0));
    const py = 2 - rise * grip - 2 * grip + wave * (armSide === side ? 25 : 0) - 14;
    const distance = Math.hypot(px, py);
    const bend = Math.sqrt(Math.max(0, 100 - (distance * distance) / 4));
    const ex = px / 2 - ((armSide * py) / Math.max(0.001, distance)) * bend;
    const ey = py / 2 + ((armSide * px) / Math.max(0.001, distance)) * bend;
    stretchBetween(requireSceneObject(arm, 'upper-arm'), 0, 0, ex, ey);
    stretchBetween(requireSceneObject(arm, 'forearm'), ex, ey, px, py);
    requireSceneObject(arm, 'elbow').position.set(ex, ey, 0);
    requireSceneObject(arm, 'rabbit-paw').position.set(px, py, 0);
  }
  const head = requireSceneObject(rabbit, 'rabbit-head');
  head.rotation.z = side * (plan.wave ? 0.08 : 0.22) * attention;
  head.rotation.y = side * 0.12 * attention;
  head.traverse((part) => {
    if (part.name === 'rabbit-eye') {
      const blink = Math.abs(Math.sin(ms / 410 + plan.spot.y * 3));
      part.scale.y = 3.6 * (blink < 0.08 ? 0.15 + blink * 10 : 1);
    }
  });
  for (const earSide of [-1, 1]) {
    const ear = requireSceneObject(rabbit, earSide < 0 ? 'rabbit-ear-left' : 'rabbit-ear-right');
    ear.rotation.z =
      earSide * (0.12 + attention * 0.05) + Math.sin(ms / 170 + earSide) * 0.04 * attention;
    requireSceneObject(ear, 'ear-tip').rotation.z =
      plan.flop && earSide === side
        ? earSide * attention * 0.7
        : Math.sin(ms / 200 + earSide) * attention * 0.12;
  }
  requireSceneObject(rabbit, 'rabbit-nose').scale.y =
    1.4 * (1 + Math.sin(ms / 90) * attention * 0.07);
}
export function hatTravel(hat: THREE.Group, plan: HatPlan, progress: number) {
  hat.scale.setScalar(HAT_SCALE);
  hat.visible = true;
  hat.rotation.set(
    0.13 * Math.sin(progress * Math.PI),
    Math.sin(progress * Math.PI) * 0.25,
    (plan.detour > 0 ? 1 : -1) * Math.PI * (1 - hatEase(progress)),
  );
}
