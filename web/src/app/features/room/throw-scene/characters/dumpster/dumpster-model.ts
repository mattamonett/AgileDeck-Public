import * as THREE from 'three';
import {
  DUMPSTER_BODY,
  DUMPSTER_DEPTH,
  DUMPSTER_LID,
  DUMPSTER_PALETTES,
  DUMPSTER_TILT,
  DUMPSTER_WHEEL,
  dumpsterPlan,
  type DumpsterPlan,
  type DumpsterPose,
} from './dumpster-choreography';

export interface DumpsterModel {
  readonly plan: DumpsterPlan;
  readonly spinner: THREE.Group;
  readonly lids: readonly [THREE.Group, THREE.Group];
  readonly wheels: readonly THREE.Group[];
  readonly glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}
const models = new WeakMap<THREE.Group, DumpsterModel>();
const { width: W, half: H, back, front, foot } = DUMPSTER_BODY;
const rimTop = H + DUMPSTER_BODY.rim;
/** Local points that effects read: the lid seam, the mouth and a front wheel's floor contact. */
export const DUMPSTER_POINTS = {
  seam: new THREE.Vector3(0, rimTop + 0.5, front + 1.5),
  mouthLeft: new THREE.Vector3(-(W / 2 - 7), H + 0.5, 16),
  mouthRight: new THREE.Vector3(W / 2 - 7, H + 0.5, 16),
  mouth: new THREE.Vector3(0, H + 0.5, 4),
  contact: new THREE.Vector3(
    DUMPSTER_WHEEL.x,
    DUMPSTER_WHEEL.y - DUMPSTER_WHEEL.radius,
    DUMPSTER_WHEEL.front + DUMPSTER_WHEEL.thickness / 2,
  ),
} as const;
const slope = Math.atan((front - foot) / (H * 2));
function paint(color: number, roughness = 0.55, metalness = 0.2) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function flat(color: number, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    side: THREE.DoubleSide,
  });
}
function add<T extends THREE.Object3D>(
  parent: THREE.Object3D,
  name: string,
  object: T,
  x = 0,
  y = 0,
  z = 0,
): T {
  object.name = name;
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}
function marker(parent: THREE.Object3D, name: string, at: THREE.Vector3) {
  add(parent, name, new THREE.Object3D()).position.copy(at);
}
/** Front-load profile: vertical back, sloping front, extruded across the width. */
function bodyGeometry() {
  const bevel = 0.8,
    shape = new THREE.Shape();
  shape.moveTo(back + bevel, -H + bevel);
  shape.lineTo(foot - bevel, -H + bevel);
  shape.lineTo(front - bevel, H - bevel);
  shape.lineTo(back + bevel, H - bevel);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: W - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    steps: 1,
  });
  g.translate(0, 0, -(W - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
function wheel(parent: THREE.Object3D, index: number, x: number, z: number) {
  const group = add(parent, `wheel-${index}`, new THREE.Group(), x, DUMPSTER_WHEEL.y, z),
    r = DUMPSTER_WHEEL.radius;
  const tire = new THREE.CylinderGeometry(r, r, DUMPSTER_WHEEL.thickness, 16);
  tire.rotateX(Math.PI / 2);
  add(group, 'tire', new THREE.Mesh(tire, paint(0x141414, 0.8, 0)));
  const hub = new THREE.CylinderGeometry(1.7, 1.7, 0.6, 12);
  hub.rotateX(Math.PI / 2);
  add(
    group,
    'hub',
    new THREE.Mesh(hub, paint(0xa3aab0, 0.3, 0.8)),
    0,
    0,
    DUMPSTER_WHEEL.thickness / 2 + 0.2,
  );
  // An off-centre bolt makes the roll readable from the front.
  add(
    group,
    'hub-bolt',
    new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.4, 0.5), paint(0x3a3f44, 0.4, 0.6)),
    0,
    1.6,
    DUMPSTER_WHEEL.thickness / 2 + 0.5,
  );
  add(
    parent,
    'caster-fork',
    new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.6, 4), paint(0x6f767c, 0.35, 0.7)),
    x,
    -H - 2.2,
    z,
  );
  return group;
}
function lid(parent: THREE.Object3D, side: number) {
  const pivot = add(
    parent,
    side < 0 ? 'lid-left' : 'lid-right',
    new THREE.Group(),
    0,
    rimTop,
    DUMPSTER_LID.back,
  );
  const depth = DUMPSTER_LID.front - DUMPSTER_LID.back,
    cx = (side * W) / 4,
    plastic = 0x1b1d1f;
  add(
    pivot,
    'lid-panel',
    new THREE.Mesh(
      new THREE.BoxGeometry(W / 2 - 1, DUMPSTER_LID.thickness, depth),
      paint(plastic, 0.5, 0.05),
    ),
    cx,
    DUMPSTER_LID.thickness / 2,
    depth / 2,
  );
  for (const z of [depth * 0.3, depth * 0.7])
    add(
      pivot,
      'lid-ridge',
      new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 11, 1, 2.4), paint(0x2c2f33, 0.45, 0.05)),
      cx,
      DUMPSTER_LID.thickness + 0.5,
      z,
    );
  add(
    pivot,
    'lid-handle',
    new THREE.Mesh(new THREE.BoxGeometry(10, 1.8, 2), paint(0x34383c, 0.4, 0.1)),
    cx,
    1.4,
    depth + 0.6,
  );
  add(
    parent,
    'hinge-knuckle',
    new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 9, 10), paint(0x4b5157, 0.35, 0.7)),
    cx,
    rimTop + 0.4,
    DUMPSTER_LID.back - 0.6,
  ).rotation.z = Math.PI / 2;
  return pivot;
}
export function makeDumpster(id: string): THREE.Group {
  const plan = dumpsterPlan(id),
    palette = DUMPSTER_PALETTES[plan.palette];
  const root = new THREE.Group(),
    tilt = new THREE.Group(),
    spinner = new THREE.Group();
  root.name = 'dumpster-fire';
  tilt.name = 'dumpster-tilt';
  spinner.name = 'dumpster';
  tilt.rotation.x = DUMPSTER_TILT;
  root.add(tilt);
  tilt.add(spinner);
  const geometry = bodyGeometry();
  add(spinner, 'dumpster-body', new THREE.Mesh(geometry, paint(0x2f8a3f)));
  const outline = add(
    spinner,
    'dumpster-outline',
    new THREE.Mesh(
      geometry.clone(),
      new THREE.MeshBasicMaterial({ color: 0x0b1a10, side: THREE.BackSide }),
    ),
  );
  outline.scale.set(1.03, 1.05, 1.06);
  for (const z of [front, back])
    add(
      spinner,
      'rim-lip',
      new THREE.Mesh(new THREE.BoxGeometry(W + 2.4, 2.4, 2.4), paint(0x25713a, 0.5, 0.25)),
      0,
      rimTop - 1.2,
      z,
    );
  for (const x of [-W / 2, W / 2])
    add(
      spinner,
      'rim-lip',
      new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 2.4, front - back + 2.4),
        paint(0x25713a, 0.5, 0.25),
      ),
      x,
      rimTop - 1.2,
      0,
    );
  const interior = add(
    spinner,
    'interior',
    new THREE.Mesh(new THREE.PlaneGeometry(W - 4, front - back - 3), flat(0x15120f)),
    0,
    H + 0.25,
    0,
  );
  interior.rotation.x = -Math.PI / 2;
  const glow = add(
    spinner,
    'interior-glow',
    new THREE.Mesh(new THREE.PlaneGeometry(W - 6, front - back - 5), flat(palette.mid, 0.999)),
    0,
    H + 0.35,
    0,
  );
  glow.rotation.x = -Math.PI / 2;
  glow.material.opacity = 0;
  glow.visible = false;
  for (const x of [-33, -13, 13, 33])
    add(
      spinner,
      'front-rib',
      new THREE.Mesh(new THREE.BoxGeometry(3, H * 2 - 1, 1.6), paint(0x277a38, 0.5, 0.2)),
      x,
      0,
      (front + foot) / 2 + 0.8,
    ).rotation.x = slope;
  const onFace = (y: number) => (front + foot) / 2 + y * Math.tan(slope);
  add(
    spinner,
    'placard',
    new THREE.Mesh(new THREE.PlaneGeometry(17, 8.5), flat(0xe0dac8)),
    0,
    7,
    onFace(7) + 0.15,
  ).rotation.x = slope;
  add(
    spinner,
    'placard-stripe',
    new THREE.Mesh(new THREE.PlaneGeometry(13, 1.6), flat(0x2a5a34)),
    0,
    7.6,
    onFace(7.6) + 0.25,
  ).rotation.x = slope;
  add(
    spinner,
    'rust-streak',
    new THREE.Mesh(new THREE.PlaneGeometry(1.6, 11), flat(0x8a4a22, 0.8)),
    6,
    -4.5,
    onFace(-4.5) + 0.15,
  ).rotation.x = slope;
  const scuffs: readonly [number, number, number, number, number][] = [
    [-23, -11, 9, 5, 0.3],
    [22, -15, 7, 4, -0.2],
    [-5, 16, 6, 2.4, 0.1],
  ];
  for (const [x, y, w, h, a] of scuffs) {
    const scuff = add(
      spinner,
      'scuff',
      new THREE.Mesh(new THREE.PlaneGeometry(w, h), flat(0x1f5a2b, 0.85)),
      x,
      y,
      onFace(y) + 0.12,
    );
    scuff.rotation.set(slope, 0, a);
  }
  for (const x of [-1, 1]) {
    add(
      spinner,
      'fork-sleeve',
      new THREE.Mesh(new THREE.BoxGeometry(6, 7, 28), paint(0x235f30, 0.5, 0.3)),
      x * (W / 2 + 3),
      2,
      -3,
    );
    add(
      spinner,
      'sleeve-pocket',
      new THREE.Mesh(new THREE.PlaneGeometry(4, 5), flat(0x0c140e)),
      x * (W / 2 + 3),
      2,
      11.05,
    );
  }
  const wheels = [
    wheel(spinner, 0, -DUMPSTER_WHEEL.x, DUMPSTER_WHEEL.front),
    wheel(spinner, 1, DUMPSTER_WHEEL.x, DUMPSTER_WHEEL.front),
    wheel(spinner, 2, -DUMPSTER_WHEEL.x, DUMPSTER_WHEEL.back),
    wheel(spinner, 3, DUMPSTER_WHEEL.x, DUMPSTER_WHEEL.back),
  ];
  const lids: [THREE.Group, THREE.Group] = [lid(spinner, -1), lid(spinner, 1)];
  marker(spinner, 'lid-seam', DUMPSTER_POINTS.seam);
  marker(spinner, 'mouth-left', DUMPSTER_POINTS.mouthLeft);
  marker(spinner, 'mouth-right', DUMPSTER_POINTS.mouthRight);
  marker(spinner, 'mouth', DUMPSTER_POINTS.mouth);
  marker(spinner, 'floor-contact', DUMPSTER_POINTS.contact);
  models.set(root, { plan, spinner, lids, wheels, glow });
  return root;
}
export function dumpsterModel(root: THREE.Group): DumpsterModel {
  const model = models.get(root);
  if (!model) throw Error('Missing native dumpster model');
  return model;
}
const axisX = new THREE.Vector3(1, 0, 0),
  axisY = new THREE.Vector3(0, 1, 0),
  axisZ = new THREE.Vector3(0, 0, 1);
/** World position of a model-local point for a pose, matching the scene graph's transform order. */
export function dumpsterWorldPoint(
  pose: DumpsterPose,
  local: THREE.Vector3,
  out = new THREE.Vector3(),
) {
  out.copy(local).applyAxisAngle(axisY, pose.spin).applyAxisAngle(axisX, DUMPSTER_TILT);
  out
    .set(out.x * pose.s * pose.sx, out.y * pose.s * pose.sy, out.z * pose.s)
    .applyAxisAngle(axisZ, pose.roll);
  out.x += pose.x;
  out.y -= pose.y;
  out.z += DUMPSTER_DEPTH;
  return out;
}
export function poseDumpster(root: THREE.Group, pose: DumpsterPose) {
  const model = dumpsterModel(root);
  root.visible = pose.visible;
  root.position.set(pose.x, -pose.y, DUMPSTER_DEPTH);
  root.rotation.set(0, 0, pose.roll);
  root.scale.set(pose.s * pose.sx, pose.s * pose.sy, pose.s);
  model.spinner.rotation.set(0, pose.spin, 0);
  model.lids.forEach((lid, i) => lid.rotation.set(-(pose.lids[i] ?? 0), 0, 0));
  for (const wheel of model.wheels) wheel.rotation.z = pose.wheel;
}

export function ink(color: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** A disc that is dense in the middle and fades to nothing at its rim. */
export function softDisc() {
  const segments = 18,
    g = new THREE.BufferGeometry(),
    positions = [0, 0, 0],
    colors = [1, 1, 1, 1],
    index: number[] = [];
  for (const [radius, alpha] of [
    [0.55, 0.8],
    [1, 0],
  ] as const)
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
      colors.push(1, 1, 1, alpha);
    }
  for (let i = 0; i < segments; i++) {
    const inner = 1 + i,
      next = 1 + ((i + 1) % segments);
    index.push(
      0,
      inner,
      next,
      inner,
      inner + segments,
      next,
      next,
      inner + segments,
      next + segments,
    );
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  g.setIndex(index);
  return g;
}

export function tinted(color: number) {
  return new THREE.MeshBasicMaterial({
    color,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
