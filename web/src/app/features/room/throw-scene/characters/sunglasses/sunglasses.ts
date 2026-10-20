import * as THREE from 'three';
import { seededRandom } from '../../flight/flight-math';
import {
  SUNGLASSES_SCALE,
  shadesEase,
  sunglassesPlan,
  type SunglassesPlan,
} from './sunglasses-choreography';

type ShadeMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export interface GlassFragment {
  readonly mesh: ShadeMesh;
  readonly position: THREE.Vector3;
  readonly rotation: THREE.Euler;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
}
export interface SunglassesModel {
  readonly plan: SunglassesPlan;
  readonly intact: THREE.Group;
  readonly shards: THREE.Group;
  readonly fragments: readonly GlassFragment[];
  readonly gleams: readonly ShadeMesh[];
}
const models = new WeakMap<THREE.Group, SunglassesModel>();
function material(color: number, metalness = 0.3) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness: 0.22,
    transparent: true,
    side: THREE.DoubleSide,
  });
}
export function sunglassesModel(glasses: THREE.Group): SunglassesModel {
  const model = models.get(glasses);
  if (!model) throw new Error('Missing native sunglasses model');
  return model;
}
export function makeSunglasses(id: string): THREE.Group {
  const plan = sunglassesPlan(id),
    r = seededRandom(id + ':glass-fragments');
  const glasses = new THREE.Group(),
    intact = new THREE.Group(),
    shards = new THREE.Group();
  glasses.name = 'sunglasses';
  intact.name = 'intact';
  shards.name = 'shards';
  shards.visible = false;
  const fragments: GlassFragment[] = [],
    gleams: ShadeMesh[] = [];
  const frameColor = plan.bronze ? 0x96703b : 0x202b36,
    glassColor = plan.bronze ? 0x394944 : 0x173e53;
  function fragment(mesh: ShadeMesh) {
    shards.add(mesh);
    const direction = mesh.position.x < 0 ? -1 : mesh.position.x > 0 ? 1 : plan.side;
    fragments.push({
      mesh,
      position: mesh.position.clone(),
      rotation: mesh.rotation.clone(),
      vx: direction * (30 + r() * 75) * plan.force,
      vy: (75 + r() * 80) * plan.force,
      spin: (r() - 0.5) * 12,
    });
  }
  function part(
    geometry: THREE.BufferGeometry,
    color: number,
    x: number,
    y: number,
    z: number,
    metalness = 0.3,
  ) {
    const mesh = new THREE.Mesh(geometry, material(color, metalness));
    mesh.position.set(x, y, z);
    intact.add(mesh);
    return mesh;
  }
  function breakable(mesh: ShadeMesh) {
    const copy = new THREE.Mesh(mesh.geometry.clone(), mesh.material.clone());
    copy.position.copy(mesh.position);
    copy.rotation.copy(mesh.rotation);
    copy.scale.copy(mesh.scale);
    fragment(copy);
  }
  for (const side of [-1, 1]) {
    const lens = part(new THREE.CircleGeometry(12, 24), glassColor, side * 15, 0, 0.5, 0.6);
    lens.scale.y = 0.8;
    const rim = part(new THREE.TorusGeometry(12, 1.6, 8, 48), frameColor, side * 15, 0, 0.7, 0.7);
    rim.scale.y = 0.8;
    const shine = part(new THREE.PlaneGeometry(9, 1.5), 0xb3e6e9, side * 15 - 2, 3, 1.1, 0.5);
    shine.rotation.z = 0.4;
    gleams.push(shine);
    part(new THREE.SphereGeometry(1.4, 10, 8), 0xe5cc8b, side * 27, 3, 1, 0.8);
    const hinge = part(new THREE.BoxGeometry(4, 3, 3), frameColor, side * 28, 3, -1, 0.7);
    breakable(hinge);
    const temple = part(new THREE.BoxGeometry(2.5, 3, 16), frameColor, side * 30, 3, -9, 0.7);
    temple.name = `temple-${side}`;
    temple.rotation.y = side * 0.15;
    breakable(temple);
    const hook = new THREE.CubicBezierCurve3(
      new THREE.Vector3(),
      new THREE.Vector3(0, -1, -4),
      new THREE.Vector3(0, -6, -5),
      new THREE.Vector3(0, -6, -1),
    );
    const ear = part(
      new THREE.TubeGeometry(hook, 12, 1.4, 8, false),
      frameColor,
      side * (30 - 8 * Math.sin(0.15)),
      3,
      -9 - 8 * Math.cos(0.15),
      0.7,
    );
    ear.name = `ear-${side}`;
    breakable(ear);
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4,
        shape = new THREE.Shape();
      shape.moveTo(0, 0);
      for (let step = 0; step <= 3; step++) {
        const a = angle + (step * Math.PI) / 12;
        shape.lineTo(Math.cos(a) * 12, Math.sin(a) * 9.6);
      }
      shape.closePath();
      const piece = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        material(i % 3 ? glassColor : 0x719ca8, 0.6),
      );
      piece.position.set(side * 15, 0, 0.5);
      fragment(piece);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(12, 1.6, 8, 6, Math.PI / 4),
        material(frameColor, 0.7),
      );
      ring.geometry.rotateZ(angle);
      ring.position.set(side * 15, 0, 0.7);
      ring.scale.y = 0.8;
      fragment(ring);
    }
  }
  const bridge = part(new THREE.BoxGeometry(8, 2.5, 3), frameColor, 0, 3, 0.5, 0.7);
  breakable(bridge);
  const contact = new THREE.Object3D();
  contact.name = 'bridge-contact';
  contact.position.set(0, 3, 2);
  intact.add(contact);
  glasses.add(intact, shards);
  glasses.scale.setScalar(SUNGLASSES_SCALE);
  models.set(glasses, { plan, intact, shards, fragments, gleams });
  return glasses;
}
export function sunglassesTravel(glasses: THREE.Group, t: number) {
  const model = sunglassesModel(glasses),
    p = model.plan;
  model.intact.visible = true;
  model.shards.visible = false;
  glasses.visible = true;
  glasses.scale.setScalar(SUNGLASSES_SCALE);
  const bank = t > 0 && t < 1 ? Math.sin(t * Math.PI) : 0;
  glasses.rotation.set(0, bank * p.side * 0.22, bank * p.side * 0.2);
  for (const gleam of model.gleams)
    gleam.material.opacity = 0.45 + 0.55 * shadesEase((t - 0.72) / 0.15);
}
