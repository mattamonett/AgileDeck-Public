import * as THREE from 'three';

/** Materials, meshes and flat shapes for building character models. */
export function matte(color: number, roughness = 0.8): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, side: THREE.DoubleSide });
}
export function glossy(color: number, roughness = 0.25): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
}
export function glow(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function part<G extends THREE.BufferGeometry, M extends THREE.Material>(
  parent: THREE.Object3D,
  name: string,
  geometry: G,
  material: M,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh<G, M> {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

export function oval(
  parent: THREE.Object3D,
  name: string,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
): THREE.Mesh<THREE.SphereGeometry, THREE.Material> {
  const mesh = part(parent, name, new THREE.SphereGeometry(1, 16, 12), material, x, y, z);
  mesh.scale.set(sx, sy, sz);
  return mesh;
}

export function outline(points: readonly (readonly [number, number])[]): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  return shape;
}

export function flat(
  parent: THREE.Object3D,
  name: string,
  material: THREE.Material,
  points: readonly (readonly [number, number])[],
  z = 0,
): THREE.Mesh<THREE.ShapeGeometry, THREE.Material> {
  return part(parent, name, new THREE.ShapeGeometry(outline(points)), material, 0, 0, z);
}

/** An irregular blob used for stains, bruises and splats; radius is about one unit. */
export function blobShape(phase: number, lobes = 7, roughness = 0.18): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const r = 0.78 + roughness * Math.sin(a * lobes + phase) + 0.08 * Math.sin(a * 11 - phase * 2);
    const x = Math.cos(a) * r,
      y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}
