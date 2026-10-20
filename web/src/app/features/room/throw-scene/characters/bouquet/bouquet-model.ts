import * as THREE from 'three';
import {
  bouquetBranch,
  bouquetEase,
  bouquetFold,
  bouquetOpen,
  bouquetPlan,
  BOUQUET_SCALE,
  type BouquetPlan,
} from './bouquet-choreography';

export interface BouquetPetal {
  readonly mesh: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshStandardMaterial>;
  readonly hinge: THREE.Group;
  readonly flower: number;
  readonly layer: number;
  readonly angle: number;
  readonly daisy: boolean;
  readonly length: number;
}
export interface BouquetFlower {
  readonly branch: THREE.Group;
  readonly head: THREE.Group;
  readonly length: number;
  readonly petals: readonly BouquetPetal[];
}
export interface BouquetModel {
  readonly plan: BouquetPlan;
  readonly flowers: readonly BouquetFlower[];
  readonly sources: readonly BouquetPetal[];
  readonly loops: readonly THREE.Group[];
  readonly tails: readonly THREE.Mesh[];
}
const models = new WeakMap<THREE.Group, BouquetModel>();
function satin(color: number) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.38,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
}
function add(
  parent: THREE.Object3D,
  name: string,
  g: THREE.BufferGeometry,
  m: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const mesh = new THREE.Mesh(g, m);
  mesh.name = name;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
export function bouquetPetalShape(length: number) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(-length * 0.38, length * 0.3, -length * 0.42, length * 0.75, 0, length);
  s.bezierCurveTo(length * 0.42, length * 0.75, length * 0.38, length * 0.3, 0, 0);
  return s;
}
function petalGeometry(length: number) {
  const g = new THREE.ShapeGeometry(bouquetPetalShape(length), 10),
    v = g.getAttribute('position');
  for (let i = 0; i < v.count; i++) v.setZ(i, Math.sin((v.getY(i) / length) * Math.PI) * 0.8);
  g.computeVertexNormals();
  return g;
}
export function makeBouquet(id: string): THREE.Group {
  const root = new THREE.Group(),
    p = bouquetPlan(id),
    flowers: BouquetFlower[] = [],
    sources: BouquetPetal[] = [],
    loops: THREE.Group[] = [],
    tails: THREE.Mesh[] = [];
  root.name = 'a-little-bouquet';
  root.scale.setScalar(BOUQUET_SCALE);
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.quadraticCurveTo(-3, 5, 0, 10);
  leafShape.quadraticCurveTo(3, 5, 0, 0);
  for (let i = 0; i < 5; i++) {
    const branch = new THREE.Group();
    branch.name = `flower-branch-${i}`;
    branch.position.set((i - 2) * 0.45, -21, (i % 2) * 0.7);
    root.add(branch);
    const length = 29 + (i % 2) * 4,
      head = new THREE.Group();
    head.name = `flower-head-${i}`;
    head.position.set(0, length, 0);
    branch.add(head);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(),
      new THREE.Vector3((i - 2) * 0.8, length * 0.5, -0.8),
      new THREE.Vector3(0, length, 0),
    );
    add(branch, 'joined-stem', new THREE.TubeGeometry(curve, 16, 0.65, 6, false), satin(0x4d813f));
    add(
      root,
      `cut-stem-${i}`,
      new THREE.CylinderGeometry(0.65, 0.65, 3, 8),
      satin(0x527c3e),
      (i - 2) * 0.45,
      -21.5 + (i % 2) * 0.6,
      (i % 2) * 0.7,
    );
    for (const [j, side] of [-1, 1].entries()) {
      const at = curve.getPoint(0.35 + j * 0.14),
        leaf = new THREE.Group();
      leaf.name = `stem-leaf-${i}-${j}`;
      leaf.position.copy(at);
      leaf.rotation.z = side * 0.75;
      branch.add(leaf);
      const blade = add(
        leaf,
        'leaf-blade',
        new THREE.ShapeGeometry(leafShape),
        satin(j ? 0x6a9c50 : 0x3e7739),
      );
      blade.rotation.y = side * 0.25;
      const vein = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0.1),
          new THREE.Vector3(0, 8, 0.1),
        ]),
        new THREE.LineBasicMaterial({ color: 0x9bb968 }),
      );
      leaf.add(vein);
    }
    const daisy = i % 2 === 1,
      petals: BouquetPetal[] = [],
      color = daisy ? 0xffedd0 : p.lilac ? 0xc59dc9 : 0xefb0ae;
    const counts = daisy ? [8] : [7, 5];
    for (const [layer, count] of counts.entries())
      for (let k = 0; k < count; k++) {
        const angle = (k / count) * Math.PI * 2 + layer * 0.4 + i * 0.13,
          length = daisy ? 7.2 : layer ? 4.8 : 6.8,
          hinge = new THREE.Group();
        hinge.name = `petal-hinge-${i}-${layer}-${k}`;
        hinge.position.set(Math.sin(angle) * 1.2, Math.cos(angle) * 1.2, 0.6 + layer * 0.9);
        head.add(hinge);
        const mesh = new THREE.Mesh(
          petalGeometry(length),
          satin(layer ? (p.lilac ? 0xdcc2df : 0xf8c5ba) : color),
        );
        mesh.name = `native-petal-${i}-${layer}-${k}`;
        hinge.add(mesh);
        petals.push({ mesh, hinge, flower: i, layer, angle, daisy, length });
      }
    const center = add(
      head,
      'flower-center',
      new THREE.SphereGeometry(daisy ? 2.1 : 2.2, 16, 10),
      satin(daisy ? 0xd4a54a : p.lilac ? 0xb77fb4 : 0xe99592),
      0,
      0,
      daisy ? 1.3 : 2.8,
    );
    center.scale.z = daisy ? 0.4 : 0.7;
    if (daisy)
      for (let n = 0; n < 7; n++) {
        const a = (n / 7) * Math.PI * 2;
        add(
          head,
          'golden-stamen',
          new THREE.SphereGeometry(0.4, 6, 4),
          satin(0xffd478),
          Math.cos(a) * 1.4,
          Math.sin(a) * 1.4,
          2.2,
        );
      }
    flowers.push({ branch, head, length, petals });
  }
  for (let n = 0; n < 8; n++) {
    const flower = flowers[n % 5],
      petal = flower?.petals[(n * 3 + (n >= 5 ? 2 : 0)) % 7];
    if (petal) sources.push(petal);
  }
  const contact = new THREE.Object3D();
  contact.name = 'stem-contact';
  contact.position.set(0, -23, 0);
  root.add(contact);
  add(
    root,
    'ribbon-wrap',
    new THREE.CylinderGeometry(2.8, 2.6, 3.2, 16),
    satin(p.lilac ? 0xd6c4e5 : 0xe3b994),
    0,
    -13,
    0,
  );
  add(
    root,
    'satin-knot',
    new THREE.SphereGeometry(1.7, 12, 8),
    satin(p.lilac ? 0xcbb1dc : 0xd7a880),
    0,
    -13,
    3,
  ).scale.set(1.3, 0.8, 0.6);
  const loopShape = new THREE.Shape();
  loopShape.moveTo(0, 0);
  loopShape.bezierCurveTo(3, 5, 8, 6, 8, 2);
  loopShape.bezierCurveTo(8, -2, 3, -2, 0, 0);
  for (const [i, side] of [-1, 1].entries()) {
    const loop = new THREE.Group();
    loop.name = `satin-loop-${i}`;
    loop.position.set(side, -13, 3);
    loop.scale.x = side;
    root.add(loop);
    loops.push(loop);
    add(
      loop,
      'ribbon-loop',
      new THREE.ExtrudeGeometry(loopShape, {
        depth: 0.25,
        bevelEnabled: true,
        bevelSize: 0.15,
        bevelThickness: 0.15,
        bevelSegments: 2,
        steps: 1,
      }),
      satin(p.lilac ? 0xd7c5e6 : 0xebc7a8),
    );
    const tailShape = new THREE.Shape();
    tailShape.moveTo(0, 0);
    tailShape.quadraticCurveTo(2, -5, 1, -9);
    tailShape.lineTo(-0.5, -7);
    tailShape.lineTo(-2, -9);
    tailShape.quadraticCurveTo(-1, -3, 0, 0);
    const tail = add(
      root,
      `ribbon-tail-${i}`,
      new THREE.ShapeGeometry(tailShape),
      satin(p.lilac ? 0xd7c5e6 : 0xebc7a8),
      side * 1.5,
      -14,
      3.3,
    );
    tail.rotation.z = side * 0.25;
    tails.push(tail);
  }
  models.set(root, { plan: p, flowers, sources, loops, tails });
  bouquetDetails(root, 0);
  return root;
}
export function bouquetModel(root: THREE.Group): BouquetModel {
  const m = models.get(root);
  if (!m) throw Error('Missing native bouquet');
  return m;
}
export function bouquetDetails(root: THREE.Group, ms: number) {
  const m = bouquetModel(root),
    p = m.plan;
  m.flowers.forEach((flower, i) => {
    flower.branch.rotation.z = bouquetBranch(p, ms, i);
    const open = bouquetOpen(p, ms, i);
    for (const petal of flower.petals) {
      petal.hinge.rotation.set(bouquetFold(open, petal.layer, petal.daisy), 0, -petal.angle);
      petal.mesh.visible = true;
    }
  });
  const flutter =
    bouquetEase((ms - p.land) / 500) * (1 - bouquetEase((ms - p.departure + 300) / 300));
  m.loops.forEach((loop, i) => {
    loop.rotation.y = Math.sin(ms / 320 + p.phase + i) * 0.1 * flutter;
  });
  m.tails.forEach((tail, i) => {
    tail.rotation.x = Math.sin(ms / 240 + p.phase + i) * 0.16 * flutter;
  });
}

export function ink(color: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
