import * as THREE from 'three';
import { tomatoPlan, TOMATO_RADIUS, TOMATO_SCALE, type TomatoPlan } from './tomato-choreography';

export interface TomatoModel {
  readonly plan: TomatoPlan;
  readonly fruit: THREE.Group;
  readonly stem: THREE.Group;
  readonly peels: readonly THREE.Group[];
}
const models = new WeakMap<THREE.Group, TomatoModel>();
function skin() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xe94727,
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.16,
  });
}
function lobes(g: THREE.SphereGeometry) {
  const positions = g.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i),
      phi = Math.atan2(z, -x);
    const f = 1 + 0.018 * (1 + Math.cos(phi * 6)) * (1 - (y / TOMATO_RADIUS) ** 2);
    positions.setXYZ(i, x * f, y, z * f);
  }
  g.computeVertexNormals();
  return g;
}
export function makeTomato(id: string): THREE.Group {
  const root = new THREE.Group(),
    fruit = new THREE.Group(),
    stem = new THREE.Group(),
    peels: THREE.Group[] = [];
  root.name = 'heckling-tomato';
  fruit.name = 'intact-fruit';
  stem.name = 'calyx';
  root.scale.setScalar(TOMATO_SCALE);
  root.add(fruit, stem);
  fruit.add(new THREE.Mesh(lobes(new THREE.SphereGeometry(TOMATO_RADIUS, 36, 24)), skin()));
  const contact = new THREE.Object3D();
  contact.name = 'skin-contact';
  contact.position.z = -TOMATO_RADIUS;
  fruit.add(contact);
  stem.position.y = 12.5;
  const stalk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 1.2, 5, 10),
    new THREE.MeshStandardMaterial({ color: 0x527734, roughness: 0.7 }),
  );
  stalk.position.y = 2;
  stalk.rotation.z = -0.18;
  stem.add(stalk);
  const leaf = new THREE.Shape();
  leaf.moveTo(0, 0);
  leaf.quadraticCurveTo(2.4, 3, 1, 7.5);
  leaf.quadraticCurveTo(-0.6, 4, -1.5, 1);
  leaf.closePath();
  for (let i = 0; i < 6; i++) {
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(leaf),
      new THREE.MeshStandardMaterial({
        color: i % 2 ? 0x50833b : 0x38662e,
        side: THREE.DoubleSide,
        roughness: 0.75,
      }),
    );
    mesh.rotation.set(-Math.PI / 2 + 0.25, 0, (i * Math.PI) / 3);
    stem.add(mesh);
    const peel = new THREE.Group();
    peel.name = `peel-${i}`;
    const shell = lobes(
      new THREE.SphereGeometry(TOMATO_RADIUS, 8, 18, (i * Math.PI) / 3, Math.PI / 3),
    );
    const points = shell.getAttribute('position');
    // The skins retain the original silhouette; torn edges get a small irregular rim.
    for (let n = 0; n < points.count; n++) {
      if (n % 9 === 0 || n % 9 === 8) {
        const f = 1 - 0.035 * Math.abs(Math.sin(n * 2.7 + i));
        points.setXYZ(n, points.getX(n) * f, points.getY(n) * f, points.getZ(n) * f);
      }
    }
    shell.computeVertexNormals();
    const surface = new THREE.Mesh(shell, skin());
    peel.add(surface);
    const pulp = new THREE.Mesh(
      new THREE.SphereGeometry(TOMATO_RADIUS - 0.55, 8, 18, (i * Math.PI) / 3, Math.PI / 3),
      new THREE.MeshStandardMaterial({ color: 0xf47b43, side: THREE.DoubleSide, roughness: 0.4 }),
    );
    peel.add(pulp);
    peel.visible = false;
    peels.push(peel);
    root.add(peel);
  }
  models.set(root, { plan: tomatoPlan(id), fruit, stem, peels });
  return root;
}
export function tomatoModel(root: THREE.Group): TomatoModel {
  const model = models.get(root);
  if (!model) throw Error('Missing native tomato model');
  return model;
}

export function wet(color: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function ribbon() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(34 * 3), 3));
  const indices: number[] = [];
  for (let i = 0; i < 16; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  g.setIndex(indices);
  return g;
}

export function splatShape(phase: number) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2,
      r = 0.72 + 0.17 * Math.sin(a * 7 + phase) + 0.1 * Math.sin(a * 11 - phase);
    const x = Math.cos(a) * r,
      y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}
