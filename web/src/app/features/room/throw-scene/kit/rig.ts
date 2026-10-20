import * as THREE from 'three';
import type { Point } from '../flight/flight-math';
import { part } from './meshes';

const up = new THREE.Vector3(0, 1, 0);
const along = new THREE.Vector3();
/** Places a unit-height cylinder so it spans exactly from a to b. */
export function bone(
  object: THREE.Object3D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  z = 0,
) {
  along.set(bx - ax, by - ay, 0);
  object.position.set((ax + bx) / 2, (ay + by) / 2, z);
  object.scale.y = Math.max(0.0001, along.length());
  object.quaternion.setFromUnitVectors(up, along.normalize());
}

/** A two-segment limb whose segments keep fixed lengths; the end group carries hands, feet or props. */
export interface Limb {
  readonly root: THREE.Group;
  readonly upper: THREE.Mesh;
  readonly lower: THREE.Mesh;
  readonly joint: THREE.Mesh;
  readonly end: THREE.Group;
  readonly lengths: readonly [number, number];
  readonly elbow: THREE.Vector2;
}
export function makeLimb(
  parent: THREE.Object3D,
  name: string,
  x: number,
  y: number,
  z: number,
  upper: number,
  lower: number,
  radius: number,
  material: THREE.Material,
  jointMaterial: THREE.Material = material,
): Limb {
  const root = new THREE.Group();
  root.name = name;
  root.position.set(x, y, z);
  parent.add(root);
  // Every mesh owns its material so disposal releases each resource exactly once.
  const a = part(
    root,
    `${name}-upper`,
    new THREE.CylinderGeometry(radius * 0.9, radius, 1, 10),
    material,
  );
  const b = part(
    root,
    `${name}-lower`,
    new THREE.CylinderGeometry(radius * 0.72, radius * 0.88, 1, 10),
    material.clone(),
  );
  const knuckle = jointMaterial === material ? material.clone() : jointMaterial;
  const joint = part(
    root,
    `${name}-joint`,
    new THREE.SphereGeometry(radius * 0.98, 10, 8),
    knuckle,
  );
  part(root, `${name}-root-cap`, new THREE.SphereGeometry(radius, 10, 8), knuckle.clone());
  const end = new THREE.Group();
  end.name = `${name}-end`;
  root.add(end);
  const limb = {
    root,
    upper: a,
    lower: b,
    joint,
    end,
    lengths: [upper, lower] as const,
    elbow: new THREE.Vector2(),
  };
  reach(limb, 0, -(upper + lower) * 0.98, 1);
  return limb;
}

/**
 * Two-bone inverse kinematics in the limb's local plane. Unreachable targets leave the limb straight
 * toward them instead of stretching it, so both segment lengths never change.
 */
export function reach(limb: Limb, tx: number, ty: number, bend: number, endAngle?: number): Point {
  const [l1, l2] = limb.lengths;
  const wanted = Math.hypot(tx, ty);
  const d = Math.min(l1 + l2 - 0.0001, Math.max(Math.abs(l1 - l2) + 0.0001, wanted));
  const a = wanted > 0.0001 ? Math.atan2(ty, tx) : -Math.PI / 2;
  const inner = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const elbowAngle = a + (bend < 0 ? -inner : inner);
  const ex = Math.cos(elbowAngle) * l1,
    ey = Math.sin(elbowAngle) * l1;
  const hx = Math.cos(a) * d,
    hy = Math.sin(a) * d;
  bone(limb.upper, 0, 0, ex, ey);
  bone(limb.lower, ex, ey, hx, hy);
  limb.joint.position.set(ex, ey, 0);
  limb.elbow.set(ex, ey);
  limb.end.position.set(hx, hy, 0);
  limb.end.rotation.z = endAngle ?? Math.atan2(hy - ey, hx - ex) + Math.PI / 2;
  return { x: hx, y: hy };
}

const reachPoint = new THREE.Vector3(),
  reachRoot = new THREE.Vector3();
/**
 * Converts a point in another object's space (for example the actor root) into the limb's local
 * reach target, so hands and feet can be planted however the limb's own parent is rotated.
 */
export function localTarget(limb: Limb, space: THREE.Object3D, x: number, y: number): Point {
  const parent = limb.root.parent;
  if (!parent) return { x: 0, y: 0 };
  space.updateWorldMatrix(true, true);
  limb.root.getWorldPosition(reachRoot);
  reachPoint.set(x, y, 0);
  space.localToWorld(reachPoint);
  reachPoint.z = reachRoot.z;
  parent.worldToLocal(reachPoint);
  return { x: reachPoint.x - limb.root.position.x, y: reachPoint.y - limb.root.position.y };
}
export function reachIn(
  limb: Limb,
  space: THREE.Object3D,
  x: number,
  y: number,
  bend: number,
  endAngle?: number,
): Point {
  const t = localTarget(limb, space, x, y);
  return reach(limb, t.x, t.y, bend, endAngle);
}
