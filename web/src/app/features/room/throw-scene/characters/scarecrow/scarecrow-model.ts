import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import { scarecrowPlan, type ScarecrowPlan } from './scarecrow-choreography';
import {
  glossy,
  localTarget,
  makeLimb,
  matte,
  mix,
  outline,
  oval,
  part,
  reach,
  type Limb,
} from '../../kit';

const DENIM = 0x4b6a8c,
  DENIM_DARK = 0x334c68,
  FLANNEL = 0xb8402f,
  FLANNEL_DARK = 0x6a2019,
  BURLAP = 0xcfa66a,
  BURLAP_DARK = 0x9c7a46,
  STRAW = [0xf2cf5e, 0xd6a83a] as const,
  TWINE = 0xb39558,
  WOOD = 0x86633c,
  FELT = 0x6b4f33,
  BAND = 0x9a3a2e,
  PATCH = 0xd9b66e,
  THREAD = 0x2e2119;

/** Pole tip to hip; the whole straw body rides rigidly on the pole. */
export const SCARECROW_POLE = 30;
export const SCARECROW_SHOULDER = new THREE.Vector3(1.2, 49, 6.9);
/** The face turns three quarters toward the viewer while still facing ahead. */
const FACE = 0.6;
const HEAD = { x: 0.4, y: 9, rx: 7.4, ry: 8.3, rz: 7 } as const;

export interface ScarecrowModel {
  readonly plan: ScarecrowPlan;
  readonly figure: THREE.Group;
  readonly torso: THREE.Group;
  readonly head: THREE.Group;
  readonly hat: THREE.Group;
  /** Rest transform of the hat on the head, as an empty marker. */
  readonly hatSeat: THREE.Object3D;
  /** Crown top of the hat, where the crow's talons close. */
  readonly hatTop: THREE.Object3D;
  readonly topTuft: THREE.Group;
  readonly arms: readonly [Limb, Limb];
  readonly legs: readonly [Limb, Limb];
  /** Straw fingertips of the near hand: the knock contact. */
  readonly hand: THREE.Object3D;
  /** The near wrist cuff, where the crow perches on the outstretched arm. */
  readonly wrist: THREE.Object3D;
  readonly tip: THREE.Object3D;
  readonly mouth: THREE.Object3D;
  readonly gape: THREE.Mesh;
  readonly lids: readonly THREE.Mesh[];
  readonly lashes: readonly THREE.Mesh[];
}
const models = new WeakMap<THREE.Group, ScarecrowModel>();

/** Unit sphere with per-vertex colours from a pattern over its scaled surface. */
function patterned(
  rx: number,
  ry: number,
  rz: number,
  w: number,
  h: number,
  colour: (x: number, y: number, z: number) => THREE.Color,
) {
  const g = new THREE.SphereGeometry(1, w, h);
  const p = g.getAttribute('position');
  const colours: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const c = colour(p.getX(i) * rx, p.getY(i) * ry, p.getZ(i) * rz);
    colours.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  return g;
}
function vertexMaterial(roughness = 0.9) {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness, side: THREE.DoubleSide });
}
/** Buffalo-check flannel: dark where the bands cross, shaded where one band runs. */
function flannel(x: number, y: number): THREE.Color {
  const band = (v: number) => (((v / 4.4) % 1) + 1) % 1 < 0.45;
  const n = Number(band(x + 0.6)) + Number(band(y + 1.2));
  return new THREE.Color(FLANNEL).lerp(new THREE.Color(FLANNEL_DARK), n * 0.45);
}
/** Burlap: a coarse weave and a little blotching. */
function burlap(x: number, y: number, z: number): THREE.Color {
  const weave = Math.sin(x * 4.1) * Math.sin(y * 4.3) * 0.5 + Math.sin(z * 3.7 + y) * 0.5;
  return new THREE.Color(BURLAP).lerp(new THREE.Color(BURLAP_DARK), 0.18 + 0.16 * weave);
}

/** A fan of straw blades growing along `angle` (radians in the parent's xy plane). */
function tuft(
  parent: THREE.Object3D,
  name: string,
  x: number,
  y: number,
  z: number,
  count: number,
  angle: number,
  spread: number,
  length: number,
  radius = 0.5,
) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, y, z);
  parent.add(group);
  for (let i = 0; i < count; i++) {
    const g = new THREE.ConeGeometry(radius, length * (i % 2 ? 0.8 : 1), 5);
    g.translate(0, (length * (i % 2 ? 0.8 : 1)) / 2, 0);
    const blade = part(group, `${name}-${i}`, g, matte(STRAW[i % 2] ?? STRAW[0], 0.75));
    blade.position.z = (i - (count - 1) / 2) * 0.55;
    blade.rotation.z = angle + (count > 1 ? (i / (count - 1) - 0.5) * spread : 0) - Math.PI / 2;
  }
  return group;
}
function stitch(
  parent: THREE.Object3D,
  name: string,
  x: number,
  y: number,
  z: number,
  angle: number,
  length = 0.9,
) {
  const s = part(parent, name, new THREE.PlaneGeometry(length, 0.26), matte(THREAD, 0.9), x, y, z);
  s.rotation.z = angle;
  return s;
}

/** A point on the head's surface and its outward normal, `az` measured from +x toward the viewer. */
function onHead(az: number, el: number) {
  const n = new THREE.Vector3(
    Math.cos(el) * Math.cos(az),
    Math.sin(el),
    Math.cos(el) * Math.sin(az),
  );
  const at = new THREE.Vector3(HEAD.x + n.x * HEAD.rx, HEAD.y + n.y * HEAD.ry, n.z * HEAD.rz);
  const normal = new THREE.Vector3(n.x / HEAD.rx, n.y / HEAD.ry, n.z / HEAD.rz).normalize();
  return { at, normal };
}
function faceFeature(head: THREE.Object3D, name: string, az: number, el: number, lift = 0.1) {
  const group = new THREE.Group();
  group.name = name;
  const { at, normal } = onHead(az, el);
  group.position.copy(at).addScaledVector(normal, lift);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  head.add(group);
  return group;
}

function makeHat(): { hat: THREE.Group; top: THREE.Object3D } {
  const hat = new THREE.Group();
  hat.name = 'scarecrow-hat';
  // A dented, slouching crown; the shape is mirror-symmetric front to back so it reads the same on the crow.
  const crown = new THREE.LatheGeometry(
    [
      [5.6, -0.2],
      [5.5, 2.4],
      [5.1, 5],
      [4.5, 6.9],
      [3.4, 7.8],
      [1.8, 7.5],
      [0, 6.9],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    18,
  );
  const cp = crown.getAttribute('position');
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i),
      z = cp.getZ(i),
      y = cp.getY(i);
    const rr = Math.hypot(x, z) || 1;
    cp.setY(i, y - 0.55 * ((x * x) / (rr * rr)) * (y / 7.8));
  }
  crown.computeVertexNormals();
  part(hat, 'scarecrow-hat-crown', crown, matte(FELT, 0.95));
  // A wide floppy brim that droops in front and behind and curls at the sides.
  const brim = new THREE.LatheGeometry(
    [
      [5.3, 0.3],
      [7.5, 0],
      [10, -0.5],
      [12, -1.3],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    28,
  );
  const bp = brim.getAttribute('position');
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i),
      z = bp.getZ(i),
      y = bp.getY(i);
    const rr = Math.hypot(x, z) || 1,
      out = Math.max(0, (rr - 5.3) / 6.7);
    bp.setY(i, y - 1.7 * ((x * x) / (rr * rr)) * out + 0.4 * Math.cos(4 * Math.atan2(x, z)) * out);
  }
  brim.computeVertexNormals();
  part(hat, 'scarecrow-hat-brim', brim, matte(0x7a5a3b, 0.95));
  part(
    hat,
    'scarecrow-hat-band',
    new THREE.CylinderGeometry(5.62, 5.68, 1.5, 18, 1, true),
    matte(BAND, 0.8),
    0,
    1.1,
    0,
  );
  // A patched hole on the side facing the viewer.
  const patch = part(
    hat,
    'scarecrow-hat-patch',
    new THREE.PlaneGeometry(2.6, 2.2),
    matte(PATCH, 0.9),
    0.6,
    4.2,
    5.3,
  );
  patch.rotation.set(-0.15, 0.1, 0.2);
  stitch(patch, 'scarecrow-hat-stitch-a', -1.2, 0, 0.05, Math.PI / 2, 1.6);
  stitch(patch, 'scarecrow-hat-stitch-b', 1.2, 0, 0.05, Math.PI / 2, 1.6);
  const top = new THREE.Object3D();
  top.name = 'scarecrow-hat-top';
  top.position.set(0, 7.1, 0);
  hat.add(top);
  return { hat, top };
}

export function makeScarecrow(id: string): THREE.Group {
  const plan = scarecrowPlan(id);
  const root = new THREE.Group();
  root.name = 'thanksgiving-scarecrow';
  const figure = new THREE.Group();
  figure.name = 'scarecrow-figure';
  root.add(figure);
  // The sharpened stake: its apex is the figure origin and the only point that meets the floor.
  const stake = new THREE.ConeGeometry(1.25, 4, 8);
  stake.rotateX(Math.PI);
  stake.translate(0, 2, 0);
  part(figure, 'scarecrow-stake', stake, matte(0x6e4f2c, 0.9));
  part(
    figure,
    'scarecrow-pole',
    new THREE.CylinderGeometry(1.1, 1.25, 42, 8),
    matte(WOOD, 0.85),
    0,
    25,
    0,
  );
  const tip = new THREE.Object3D();
  tip.name = 'scarecrow-tip';
  figure.add(tip);

  const torso = new THREE.Group();
  torso.name = 'scarecrow-torso';
  figure.add(torso);
  oval(torso, 'scarecrow-seat', matte(DENIM, 0.9), 0, 31, 0, 7.4, 5.2, 6.4);
  const belt = part(
    torso,
    'scarecrow-rope-belt',
    new THREE.TorusGeometry(1, 0.09, 6, 22),
    matte(TWINE, 0.9),
    0,
    33.6,
    0,
  );
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(7.5, 6.5, 6);
  part(
    torso,
    'scarecrow-shirt',
    patterned(7.6, 11, 6.5, 40, 28, flannel),
    vertexMaterial(),
    0.3,
    41.5,
    0,
  ).scale.set(7.6, 11, 6.5);
  const chest = part(
    torso,
    'scarecrow-chest-patch',
    new THREE.PlaneGeometry(3.8, 3.3),
    matte(PATCH, 0.9),
    2.4,
    43.5,
    6.05,
  );
  chest.rotation.set(0, 0.32, 0.14);
  [
    [-1.9, 0, Math.PI / 2],
    [1.9, 0, Math.PI / 2],
    [0, 1.65, 0],
    [0, -1.65, 0],
  ].forEach(([x = 0, y = 0, a = 0], i) =>
    stitch(chest, `scarecrow-chest-stitch-${i}`, x, y, 0.05, a, 1.2),
  );
  // Straw bursting out of the collar, and the twine that ties the sack head on.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    tuft(
      torso,
      `scarecrow-collar-${i}`,
      Math.cos(a) * 4.2,
      51.2,
      Math.sin(a) * 3.8,
      2,
      Math.PI / 2 + Math.cos(a) * 0.9,
      0.5,
      3.8,
      0.55,
    );
  }
  const twine = part(
    torso,
    'scarecrow-neck-twine',
    new THREE.TorusGeometry(2.9, 0.42, 6, 16),
    matte(TWINE, 0.9),
    1.2,
    52.8,
    0,
  );
  twine.rotation.x = Math.PI / 2;

  const head = new THREE.Group();
  head.name = 'scarecrow-head';
  head.position.set(1.2, 52.6, 0);
  torso.add(head);
  part(
    head,
    'scarecrow-sack-neck',
    new THREE.CylinderGeometry(4.4, 2.8, 2.8, 12, 1, true),
    matte(BURLAP_DARK, 0.95),
    0.2,
    1.6,
    0,
  );
  part(
    head,
    'scarecrow-sack',
    patterned(HEAD.rx, HEAD.ry, HEAD.rz, 22, 16, burlap),
    vertexMaterial(0.95),
    HEAD.x,
    HEAD.y,
    0,
  ).scale.set(HEAD.rx, HEAD.ry, HEAD.rz);
  const topTuft = tuft(head, 'scarecrow-top-tuft', 0.2, 15.6, 0, 6, Math.PI / 2, 1.5, 4.6, 0.55);
  topTuft.visible = false;
  // Straw sprigs poking out under the brim at the sides and back.
  tuft(head, 'scarecrow-sprig-back', -6.4, 11.2, 0, 4, Math.PI * 0.9, 0.9, 4.2);
  tuft(head, 'scarecrow-sprig-near', -1.5, 11.6, 6.2, 3, Math.PI * 0.75, 0.8, 3.6);
  tuft(head, 'scarecrow-sprig-front', 6.3, 11.5, -1.5, 3, Math.PI * 0.2, 0.7, 3.2);
  // Button eyes with burlap lids that slide down, leaving a stitched line when shut.
  const lids: THREE.Mesh[] = [],
    lashes: THREE.Mesh[] = [];
  [FACE - 0.36, FACE + 0.32].forEach((az, i) => {
    const eye = faceFeature(head, `scarecrow-eye-${i}`, az, 0.14, 0.15);
    const button = part(
      eye,
      `scarecrow-button-${i}`,
      new THREE.CylinderGeometry(1.4, 1.4, 0.6, 14),
      glossy(0x231a14, 0.35),
    );
    button.rotation.x = Math.PI / 2;
    for (const hx of [-0.4, 0.4])
      part(
        eye,
        `scarecrow-button-hole-${i}`,
        new THREE.CircleGeometry(0.24, 8),
        matte(0xb9a07a, 0.6),
        hx,
        0.1,
        0.33,
      );
    const lidShape = new THREE.CircleGeometry(1.75, 16);
    lidShape.translate(0, -1.75, 0);
    const lid = part(eye, `scarecrow-lid-${i}`, lidShape, matte(BURLAP, 0.95), 0, 1.75, 0.42);
    lids.push(lid);
    lashes.push(
      part(
        eye,
        `scarecrow-lash-${i}`,
        new THREE.PlaneGeometry(3.4, 0.34),
        matte(THREAD, 0.9),
        0,
        0,
        0.46,
      ),
    );
  });
  const nose = faceFeature(head, 'scarecrow-nose', FACE, -0.1, 0.1);
  const noseCone = part(
    nose,
    'scarecrow-nose-cloth',
    new THREE.ConeGeometry(1, 2.2, 3),
    matte(0xd27a2e, 0.8),
    0,
    0,
    0.9,
  );
  noseCone.rotation.x = Math.PI / 2;
  const mouthGroup = faceFeature(head, 'scarecrow-mouth', FACE + 0.05, -0.44, 0.05);
  const gape = oval(mouthGroup, 'scarecrow-gape', matte(0x1f140e, 0.7), 0, 0, 0.1, 2.7, 0.4, 0.3);
  for (let k = 0; k < 5; k++)
    stitch(
      mouthGroup,
      `scarecrow-mouth-stitch-${k}`,
      (k - 2) * 1.15,
      0.05 * (k - 2) ** 2,
      0.45,
      Math.PI / 2 + (k - 2) * 0.12,
      1.5,
    );
  const mouth = new THREE.Object3D();
  mouth.name = 'scarecrow-mouth-marker';
  mouth.position.set(0, 0, 0.8);
  mouthGroup.add(mouth);
  const hatSeat = new THREE.Object3D();
  hatSeat.name = 'scarecrow-hat-seat';
  hatSeat.position.set(-0.5, 12.9, 0);
  hatSeat.rotation.z = 0.16;
  head.add(hatSeat);
  const { hat, top: hatTop } = makeHat();
  head.add(hat);
  hat.position.copy(hatSeat.position);
  hat.rotation.copy(hatSeat.rotation);

  const arm = (name: string, z: number) => {
    const limb = makeLimb(
      torso,
      name,
      SCARECROW_SHOULDER.x,
      SCARECROW_SHOULDER.y,
      z,
      11,
      10,
      2.1,
      matte(FLANNEL, 0.9),
      matte(FLANNEL_DARK, 0.9),
    );
    const cuff = part(
      limb.end,
      `${name}-cuff`,
      new THREE.TorusGeometry(1.9, 0.55, 6, 14),
      matte(FLANNEL_DARK, 0.9),
      0,
      -0.2,
      0,
    );
    cuff.rotation.x = Math.PI / 2;
    tuft(limb.end, `${name}-straw-hand`, 0, -0.4, 0, 5, -Math.PI / 2, 1.1, 4.4, 0.55);
    return limb;
  };
  const near = arm('scarecrow-arm-near', SCARECROW_SHOULDER.z),
    far = arm('scarecrow-arm-far', -SCARECROW_SHOULDER.z);
  part(
    near.joint,
    'scarecrow-elbow-patch',
    new THREE.PlaneGeometry(2.4, 2.2),
    matte(PATCH, 0.9),
    0,
    0,
    2.15,
  ).rotation.z = 0.3;
  const hand = new THREE.Object3D();
  hand.name = 'scarecrow-hand';
  hand.position.set(0, -4.6, 0);
  near.end.add(hand);
  const wrist = new THREE.Object3D();
  wrist.name = 'scarecrow-wrist';
  near.end.add(wrist);

  const leg = (name: string, z: number) => {
    const limb = makeLimb(
      torso,
      name,
      0,
      30,
      z,
      9.5,
      9,
      2.45,
      matte(DENIM, 0.9),
      matte(DENIM_DARK, 0.9),
    );
    const cuff = part(
      limb.end,
      `${name}-cuff`,
      new THREE.TorusGeometry(2.2, 0.6, 6, 14),
      matte(DENIM_DARK, 0.9),
      0,
      -0.2,
      0,
    );
    cuff.rotation.x = Math.PI / 2;
    tuft(limb.end, `${name}-straw-foot`, 0, -0.4, 0, 5, -Math.PI / 2, 1, 4, 0.55);
    return limb;
  };
  const legs: [Limb, Limb] = [leg('scarecrow-leg-near', 3.3), leg('scarecrow-leg-far', -3.3)];
  const knee = part(
    legs[0].joint,
    'scarecrow-knee-patch',
    new THREE.PlaneGeometry(2.8, 2.6, 6, 6),
    vertexMaterial(),
    0,
    0,
    2.5,
  );
  const kc: number[] = [];
  const kp = knee.geometry.getAttribute('position');
  for (let i = 0; i < kp.count; i++) {
    const c = flannel(kp.getX(i) * 3, kp.getY(i) * 3);
    kc.push(c.r, c.g, c.b);
  }
  knee.geometry.setAttribute('color', new THREE.Float32BufferAttribute(kc, 3));
  models.set(root, {
    plan,
    figure,
    torso,
    head,
    hat,
    hatSeat,
    hatTop,
    topTuft,
    arms: [near, far],
    legs,
    hand,
    wrist,
    tip,
    mouth,
    gape,
    lids,
    lashes,
  });
  scarecrowPose(root, SCARECROW_REST);
  return root;
}

export function scarecrowModel(root: THREE.Group): ScarecrowModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native scarecrow');
  return model;
}

export interface ScarecrowPose {
  /** Pole tip relative to the actor root, in model units. */
  readonly tip: Point;
  /** Extra rotation of the whole figure about the planted tip (negative leans toward the facing). */
  readonly lean: number;
  /** Head pitch: positive drops the chin, negative throws the head back. */
  readonly nod: number;
  readonly roll: number;
  readonly turn: number;
  readonly lids: number;
  readonly mouth: number;
  /** Hand targets relative to each shoulder, in upright root space so drooping arms hang with gravity. */
  readonly near: Point;
  readonly far: Point;
  readonly legSwing: number;
  readonly shrug: number;
  readonly hatPop: number;
}
export const SCARECROW_REST: ScarecrowPose = {
  tip: { x: 0, y: 0 },
  lean: 0,
  nod: 0.25,
  roll: 0,
  turn: 0,
  lids: 0.5,
  mouth: 0.1,
  near: { x: 2, y: -19.5 },
  far: { x: 1, y: -19.5 },
  legSwing: 0,
  shrug: 0,
  hatPop: 0,
};

const rotate = (v: Point, a: number): Point => ({
  x: v.x * Math.cos(a) - v.y * Math.sin(a),
  y: v.x * Math.sin(a) + v.y * Math.cos(a),
});

/** Figure tilt for a pole tip offset: the hip stays above the root while the body pivots on the tip. */
export function scarecrowTilt(tip: Point): number {
  return Math.asin(Math.max(-0.6, Math.min(0.6, tip.x / SCARECROW_POLE)));
}

export function scarecrowPose(root: THREE.Group, q: ScarecrowPose) {
  const m = scarecrowModel(root);
  const tilt = scarecrowTilt(q.tip) + q.lean;
  m.figure.position.set(q.tip.x, q.tip.y, 0);
  m.figure.rotation.set(0, 0, tilt);
  // The head lags behind the body's tilt and lolls on its own.
  m.head.rotation.set(q.roll, q.turn, -q.nod - tilt * 0.45);
  const shrug = q.shrug * 1.6;
  m.arms.forEach((arm, i) => {
    arm.root.position.y = SCARECROW_SHOULDER.y + shrug;
    const t = rotate(i ? q.far : q.near, -tilt);
    reach(arm, t.x, t.y, -1);
  });
  m.legs.forEach((leg, i) => {
    const t = rotate({ x: 0.8 + q.legSwing * (i ? 0.8 : 1), y: -18.2 }, -tilt);
    reach(leg, t.x, t.y, 1, 0);
  });
  m.lids.forEach((lid, i) => {
    const shut = Math.max(0.001, Math.min(1, q.lids));
    lid.scale.y = shut;
    lid.visible = q.lids > 0.04;
    const lash = m.lashes[i];
    if (lash) {
      lash.position.y = 1.75 - 3.5 * shut;
      lash.visible = q.lids > 0.04;
    }
  });
  m.gape.scale.set(2.5 - 0.6 * q.mouth, 0.4 + 2 * q.mouth, 0.3);
  // Once the crow has taken the hat, the trick owns its transform.
  if (m.hat.parent !== m.head) return;
  m.hat.position.copy(m.hatSeat.position);
  m.hat.position.y += q.hatPop;
  m.hat.rotation.copy(m.hatSeat.rotation);
  m.hat.rotation.z += q.hatPop * 0.05;
  m.hat.scale.setScalar(1);
}

/* ------------------------------------------------------------------------------------------------ */
/* The crow: a second actor with folding wings, a hinged beak and feet that plant on what it lands on. */

export interface CrowModel {
  readonly root: THREE.Group;
  readonly body: THREE.Group;
  readonly plumage: THREE.Mesh;
  readonly head: THREE.Group;
  readonly upperBeak: THREE.Group;
  readonly lowerBeak: THREE.Group;
  readonly wings: readonly [THREE.Group, THREE.Group];
  readonly tail: THREE.Group;
  readonly legs: readonly [Limb, Limb];
  /** Talon socket below the body for carrying the hat by its crown. */
  readonly grip: THREE.Object3D;
  /** Top of the head, where the stolen hat is worn. */
  readonly crown: THREE.Object3D;
  readonly beakTip: THREE.Object3D;
}
export const CROW_BODY_Y = 8.2;
export const CROW_GRIP = new THREE.Vector3(0.6, -0.5, 0);

function wingShape(): THREE.Shape {
  return outline([
    [0, 0.9],
    [-3, 1.7],
    [-7, 1.6],
    [-11, 0.7],
    [-14.6, -0.4],
    [-13, -0.9],
    [-14.1, -1.5],
    [-12, -1.8],
    [-12.6, -2.6],
    [-10.2, -2.4],
    [-10.4, -3.2],
    [-8, -2.8],
    [-5, -2.5],
    [-2, -1.7],
    [0, -0.8],
  ]);
}

export function makeCrow(name = 'scarecrow-crow'): CrowModel {
  const root = new THREE.Group();
  root.name = name;
  const body = new THREE.Group();
  body.name = `${name}-body`;
  body.position.set(0, CROW_BODY_Y, 0);
  root.add(body);
  const plumage = oval(body, `${name}-plumage`, glossy(0x23273b, 0.4), -0.5, 0, 0, 7.4, 4.6, 4.2);
  oval(body, `${name}-breast`, glossy(0x1a1d2c, 0.5), 1.4, -1.2, 0, 5, 3.4, 3.8);
  const tail = new THREE.Group();
  tail.name = `${name}-tail`;
  tail.position.set(-6.6, 0.4, 0);
  body.add(tail);
  part(
    tail,
    `${name}-tail-fan`,
    new THREE.ShapeGeometry(
      outline([
        [0, 1],
        [-5.6, 1.9],
        [-8.2, 1.2],
        [-7.4, 0.3],
        [-8.4, -0.4],
        [-7.6, -1.2],
        [-5.6, -1.6],
        [0, -0.9],
      ]),
    ),
    glossy(0x181b29, 0.45),
  );
  const head = new THREE.Group();
  head.name = `${name}-head`;
  head.position.set(6, 3, 0);
  body.add(head);
  oval(head, `${name}-skull`, glossy(0x23273b, 0.35), 0, 0, 0, 3.5, 3.3, 3.1);
  const upperBeak = new THREE.Group();
  upperBeak.position.set(2.5, 0.1, 0);
  head.add(upperBeak);
  const beakGeometry = (r: number, length: number) => {
    const g = new THREE.ConeGeometry(r, length, 8);
    g.rotateZ(-Math.PI / 2);
    g.translate(length / 2, 0, 0);
    return g;
  };
  part(upperBeak, `${name}-beak-upper`, beakGeometry(1.15, 4.8), glossy(0x454a58, 0.3)).scale.set(
    1,
    0.75,
    0.9,
  );
  const lowerBeak = new THREE.Group();
  lowerBeak.position.set(2.5, -0.5, 0);
  head.add(lowerBeak);
  part(lowerBeak, `${name}-beak-lower`, beakGeometry(0.8, 3.9), glossy(0x3a3f4c, 0.35)).scale.set(
    1,
    0.7,
    0.85,
  );
  const beakTip = new THREE.Object3D();
  beakTip.position.set(7.3, 0, 0);
  head.add(beakTip);
  // A pale ring and glint keep the black eye readable on dark backgrounds.
  const eye = new THREE.Group();
  eye.position.set(1.7, 0.9, 2.75);
  eye.rotation.y = 0.55;
  head.add(eye);
  part(eye, `${name}-eye-ring`, new THREE.CircleGeometry(1, 14), matte(0xd9d2bf, 0.5));
  part(
    eye,
    `${name}-pupil`,
    new THREE.CircleGeometry(0.62, 12),
    glossy(0x050506, 0.2),
    0.08,
    0,
    0.03,
  );
  part(
    eye,
    `${name}-glint`,
    new THREE.CircleGeometry(0.22, 8),
    matte(0xffffff, 0.3),
    0.3,
    0.25,
    0.06,
  );
  const crown = new THREE.Object3D();
  crown.position.set(-0.4, 2.2, 0);
  head.add(crown);
  const wing = (side: number) => {
    const g = new THREE.Group();
    g.name = `${name}-wing-${side > 0 ? 'near' : 'far'}`;
    g.position.set(2.2, 1.7, side * 3.7);
    body.add(g);
    part(
      g,
      `${g.name}-primaries`,
      new THREE.ShapeGeometry(wingShape()),
      glossy(side > 0 ? 0x2b3048 : 0x141724, 0.45),
    );
    if (side > 0) {
      const covert = part(
        g,
        `${g.name}-coverts`,
        new THREE.ShapeGeometry(
          outline([
            [0, 0.8],
            [-3, 1.5],
            [-6.5, 1.2],
            [-7.6, 0],
            [-5, -0.9],
            [-1.5, -0.8],
          ]),
        ),
        glossy(0x3a4163, 0.4),
        0,
        0,
        0.12,
      );
      covert.renderOrder = 1;
    }
    return g;
  };
  const wings: [THREE.Group, THREE.Group] = [wing(1), wing(-1)];
  const leg = (z: number) => {
    const limb = makeLimb(
      body,
      `${name}-leg-${z > 0 ? 'near' : 'far'}`,
      0.6,
      -3.2,
      z,
      3,
      3.6,
      0.42,
      matte(0x2d2d34, 0.7),
    );
    const toe = (k: number, length: number, yaw: number) => {
      const g = new THREE.ConeGeometry(0.26, length, 5);
      g.rotateZ(-Math.PI / 2);
      g.translate(length / 2, 0, 0);
      const mesh = part(
        limb.end,
        `${limb.root.name}-toe-${k}`,
        g,
        matte(0x2d2d34, 0.7),
        0,
        0.26,
        0,
      );
      mesh.rotation.y = yaw;
    };
    toe(0, 2.4, -0.4);
    toe(1, 2.6, 0);
    toe(2, 2.4, 0.4);
    toe(3, 1.7, Math.PI);
    return limb;
  };
  const legs: [Limb, Limb] = [leg(1.1), leg(-1.1)];
  const grip = new THREE.Object3D();
  grip.name = `${name}-grip`;
  grip.position.copy(CROW_GRIP);
  root.add(grip);
  const model: CrowModel = {
    root,
    body,
    plumage,
    head,
    upperBeak,
    lowerBeak,
    wings,
    tail,
    legs,
    grip,
    crown,
    beakTip,
  };
  crowPose(model, CROW_REST);
  return model;
}

export interface CrowPose {
  readonly pitch: number;
  /** Wing angle about the shoulder: negative raises the tips. */
  readonly flap: number;
  readonly spread: number;
  /** 0 tucked under the tail in flight, 1 reaching down to stand or grip. */
  readonly feet: number;
  /** 0 standing on the root point, 1 closed on the talon socket. */
  readonly grip: number;
  readonly headTilt: number;
  readonly headTurn: number;
  readonly beak: number;
  readonly fluff: number;
  readonly tail: number;
}
export const CROW_REST: CrowPose = {
  pitch: 0,
  flap: 0.12,
  spread: 0,
  feet: 1,
  grip: 0,
  headTilt: 0,
  headTurn: 0,
  beak: 0,
  fluff: 0,
  tail: 0,
};

export function crowPose(c: CrowModel, q: CrowPose) {
  c.body.rotation.set(0, 0, q.pitch);
  c.plumage.scale.set(
    7.4 * (1 + 0.08 * q.fluff),
    4.6 * (1 + 0.16 * q.fluff),
    4.2 * (1 + 0.1 * q.fluff),
  );
  c.head.rotation.set(0, q.headTurn, q.headTilt);
  c.upperBeak.rotation.z = 0.12 * q.beak;
  c.lowerBeak.rotation.z = -0.55 * q.beak;
  c.tail.rotation.z = 0.12 + q.tail;
  c.wings.forEach((w, i) => {
    w.rotation.set(
      -0.3 * q.spread * (i ? -1 : 1),
      0,
      0.12 + (q.flap - 0.12) * q.spread + (i ? 0.08 * q.spread : 0),
    );
    w.scale.set(0.62 + 0.38 * q.spread, 1, 1);
  });
  c.root.updateWorldMatrix(true, true);
  c.legs.forEach((leg, i) => {
    const dz = i ? -0.7 : 0.7;
    // Stand targets are in root space so the soles meet whatever the root sits on, however the body pitches.
    const stand = localTarget(leg, c.root, dz * 0.9, 0);
    const held = localTarget(leg, c.root, CROW_GRIP.x + dz * 0.4, CROW_GRIP.y + 0.2);
    const tx = mix(mix(stand.x, held.x, q.grip), -3.2, 1 - q.feet),
      ty = mix(mix(stand.y, held.y, q.grip), -2.2, 1 - q.feet);
    reach(leg, tx, ty, -1, mix(0.6, -q.pitch, q.feet));
  });
}
