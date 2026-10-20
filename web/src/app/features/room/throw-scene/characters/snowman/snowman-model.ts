import * as THREE from 'three';
import { snowmanPlan, type SnowmanPlan } from './snowman-choreography';
import {
  ease,
  gait,
  glossy,
  glow,
  makeLimb,
  matte,
  mix,
  oval,
  outline,
  part,
  reach,
  type Limb,
  type Side,
} from '../../kit';

const SNOW = 0xeef5fb,
  SNOW_SHADE = 0xd9e7f2,
  COAL = 0x1d1f27,
  KNIT = 0xd23a4f,
  CREAM = 0xfff0d2,
  TWIG = 0x6e4a2c,
  CARROT = 0xf07a22,
  CHEEK = 0xf49fb2;

export const SNOWMAN_HIP = 5.2;
/** The ankle sits this far above the bootie sole, so a planted foot rests exactly on the floor. */
export const SNOWMAN_ANKLE = 2.45;
/** Centre of the tucked-up ball above the floor; the roll pivots here. */
export const ROLL_CENTRE = 8.3;
export const TUCK_DROP = 3.7;
export const MITTEN_GRIP = 1.9;
export const CARROT_LENGTH = 5.6;
export const SNOWMAN_STRIDE = 5.5;
const BELLY_Y = 6.8,
  CHEST_Y = 18,
  HEAD_Y = 27.6,
  SCARF_Y = 23.4,
  HEAD_R = 5.3;

export interface Tail {
  readonly root: THREE.Group;
  readonly segments: readonly THREE.Group[];
  readonly stand: THREE.Vector3;
  readonly tucked: THREE.Vector3;
}
export interface SnowmanModel {
  readonly plan: SnowmanPlan;
  readonly roller: THREE.Group;
  readonly body: THREE.Group;
  readonly belly: THREE.Mesh;
  readonly chest: THREE.Mesh;
  readonly buttons: THREE.Group;
  readonly head: THREE.Group;
  readonly pompom: THREE.Group;
  readonly scarf: THREE.Mesh;
  readonly tails: readonly [Tail, Tail];
  readonly eyes: readonly THREE.Group[];
  readonly arcs: readonly THREE.Mesh[];
  readonly smile: readonly THREE.Mesh[];
  readonly mouth: THREE.Mesh;
  /** The carrot as worn: its origin is the base, seated in the nose socket. */
  readonly carrot: THREE.Group;
  readonly hole: THREE.Mesh;
  readonly arms: readonly [Limb, Limb];
  readonly legs: readonly [Limb, Limb];
  readonly shoulders: readonly [THREE.Object3D, THREE.Object3D];
  readonly grips: readonly [THREE.Object3D, THREE.Object3D];
}
const models = new WeakMap<THREE.Group, SnowmanModel>();

const zAxis = new THREE.Vector3(0, 0, 1),
  yAxis = new THREE.Vector3(0, 1, 0);
function onHead(r: number, az: number, el: number): THREE.Vector3 {
  return new THREE.Vector3(
    Math.sin(az) * Math.cos(el) * r,
    Math.sin(el) * r,
    Math.cos(az) * Math.cos(el) * r,
  );
}
/** A feature lying on the head surface, its local z along the surface normal. */
function feature<T extends THREE.Object3D>(
  parent: THREE.Object3D,
  mesh: T,
  az: number,
  el: number,
  r: number,
): T {
  const at = onHead(r, az, el);
  mesh.position.copy(at);
  mesh.quaternion.setFromUnitVectors(zAxis, at.clone().normalize());
  parent.add(mesh);
  return mesh;
}

/** A carrot whose origin is its base and whose tip points along local +y. */
export function buildCarrot(parent: THREE.Object3D, name: string): THREE.Group {
  const carrot = new THREE.Group();
  carrot.name = name;
  parent.add(carrot);
  const cone = new THREE.ConeGeometry(0.95, CARROT_LENGTH, 12, 1);
  cone.translate(0, CARROT_LENGTH / 2, 0);
  part(carrot, `${name}-root`, cone, matte(CARROT, 0.6));
  for (const [k, y] of [1.6, 3.3].entries()) {
    const ring = part(
      carrot,
      `${name}-ridge-${k}`,
      new THREE.TorusGeometry(0.95 * (1 - y / CARROT_LENGTH) + 0.02, 0.1, 5, 14),
      matte(0xc4580f, 0.7),
      0,
      y,
      0,
    );
    ring.rotation.x = Math.PI / 2;
  }
  return carrot;
}

function tail(body: THREE.Group, name: string, stand: THREE.Vector3, tucked: THREE.Vector3): Tail {
  const root = new THREE.Group();
  root.name = name;
  root.position.copy(stand);
  body.add(root);
  const segments: THREE.Group[] = [];
  let parent: THREE.Object3D = root;
  for (let k = 0; k < 4; k++) {
    const seg = new THREE.Group();
    seg.name = `${name}-segment-${k}`;
    if (k) seg.position.y = -2;
    parent.add(seg);
    const g = new THREE.BoxGeometry(2.4 - k * 0.08, 2.05, 0.7);
    g.translate(0, -1, 0);
    part(seg, `${name}-knit-${k}`, g, matte(k % 2 ? CREAM : KNIT, 0.95));
    segments.push(seg);
    parent = seg;
  }
  for (let f = 0; f < 3; f++)
    part(
      parent,
      `${name}-fringe-${f}`,
      new THREE.CylinderGeometry(0.22, 0.16, 1.5, 5),
      matte(CREAM, 0.95),
      (f - 1) * 0.75,
      -2.7,
      0,
    );
  return { root, segments, stand, tucked };
}

export function makeSnowman(id: string): THREE.Group {
  const plan = snowmanPlan(id);
  const root = new THREE.Group();
  root.name = 'christmas-snowman';
  const roller = new THREE.Group();
  roller.name = 'snowman-roller';
  roller.position.set(0, ROLL_CENTRE, 0);
  root.add(roller);
  const body = new THREE.Group();
  body.name = 'snowman-body';
  body.rotation.order = 'ZYX';
  body.position.set(0, SNOWMAN_HIP - ROLL_CENTRE, 0);
  roller.add(body);
  const belly = oval(body, 'snowman-belly', matte(SNOW, 0.9), 0, BELLY_Y, 0, 8.8, 8.3, 8.2);
  const chest = oval(body, 'snowman-chest', matte(SNOW, 0.9), 0, CHEST_Y, 0, 6.4, 6.2, 6.1);
  // Coal buttons ride the chest; the lowest one sits on the belly.
  const buttons = new THREE.Group();
  buttons.name = 'snowman-buttons';
  body.add(buttons);
  for (const [k, [y, z]] of (
    [
      [CHEST_Y + 2, 5.75],
      [CHEST_Y - 0.6, 6.1],
    ] as const
  ).entries())
    oval(buttons, `snowman-button-${k}`, glossy(COAL, 0.35), 0, y, z, 0.62, 0.62, 0.4);
  oval(body, 'snowman-belly-button', glossy(COAL, 0.35), 0, BELLY_Y + 3.4, 7.55, 0.7, 0.7, 0.45);

  const head = new THREE.Group();
  head.name = 'snowman-head';
  head.rotation.order = 'YXZ';
  head.position.set(0, HEAD_Y, 0);
  body.add(head);
  oval(head, 'snowman-head-ball', matte(SNOW, 0.9), 0, 0, 0, HEAD_R, 5.2, 5.1);
  const eyes: THREE.Group[] = [];
  const arcs: THREE.Mesh[] = [];
  for (const az of [-0.37, 0.37]) {
    const eye = feature(head, new THREE.Group(), az, 0.2, 4.95);
    eye.name = 'snowman-eye';
    oval(eye, 'snowman-coal-eye', glossy(COAL, 0.2), 0, 0, 0, 0.78, 0.98, 0.5);
    oval(eye, 'snowman-eye-glint', glow(0xffffff), 0.24, 0.34, 0.42, 0.26, 0.3, 0.1);
    oval(eye, 'snowman-eye-glint-small', glow(0xffffff, 0.85), -0.22, -0.3, 0.42, 0.12, 0.12, 0.08);
    eyes.push(eye);
    const arc = feature(
      head,
      part(
        new THREE.Group(),
        'snowman-happy-eye',
        new THREE.TorusGeometry(0.72, 0.21, 6, 12, Math.PI),
        glossy(COAL, 0.3),
      ),
      az,
      0.17,
      5.12,
    );
    arc.visible = false;
    arcs.push(arc);
    const cheek = feature(
      head,
      part(
        new THREE.Group(),
        'snowman-cheek',
        new THREE.SphereGeometry(1, 12, 8),
        matte(CHEEK, 0.7),
      ),
      az * 1.75,
      -0.14,
      4.85,
    );
    cheek.scale.set(1.15, 0.78, 0.38);
  }
  const smile: THREE.Mesh[] = [];
  for (let k = 0; k < 5; k++) {
    const d = (k - 2) / 2;
    smile.push(
      feature(
        head,
        part(
          new THREE.Group(),
          `snowman-smile-${k}`,
          new THREE.SphereGeometry(0.33, 8, 6),
          glossy(COAL, 0.3),
        ),
        d * 0.36,
        -0.3 - 0.09 * (1 - d * d),
        5.15,
      ),
    );
  }
  const mouth = feature(
    head,
    part(
      new THREE.Group(),
      'snowman-mouth',
      new THREE.SphereGeometry(1, 12, 8),
      matte(0x2b1a20, 0.6),
    ),
    0,
    -0.36,
    4.95,
  );
  mouth.scale.set(0.9, 1.1, 0.35);
  mouth.visible = false;
  const socket = onHead(5, 0, -0.04);
  const carrot = buildCarrot(head, 'snowman-carrot');
  carrot.position.copy(socket);
  carrot.quaternion.setFromUnitVectors(yAxis, new THREE.Vector3(0, -0.12, 1).normalize());
  const hole = feature(
    head,
    part(
      new THREE.Group(),
      'snowman-nose-hole',
      new THREE.SphereGeometry(1, 10, 8),
      matte(0x8aa6ba, 0.8),
    ),
    0,
    -0.04,
    5.18,
  );
  hole.scale.set(0.62, 0.55, 0.2);
  hole.visible = false;

  // Knitted beanie with a bobbing pompom.
  const hat = new THREE.Group();
  hat.name = 'snowman-hat';
  hat.position.set(0, 3.3, -0.4);
  hat.rotation.set(-0.12, 0, 0.16);
  head.add(hat);
  part(
    hat,
    'snowman-beanie',
    new THREE.SphereGeometry(4.75, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2),
    matte(KNIT, 0.95),
  ).scale.y = 1.05;
  part(
    hat,
    'snowman-beanie-band',
    new THREE.TorusGeometry(4.7, 0.95, 8, 24),
    matte(CREAM, 0.95),
    0,
    0.2,
    0,
  ).rotation.x = Math.PI / 2;
  const pompom = new THREE.Group();
  pompom.name = 'snowman-pompom';
  pompom.position.set(0, 4.7, 0);
  hat.add(pompom);
  part(
    pompom,
    'snowman-pompom-ball',
    new THREE.IcosahedronGeometry(1.6, 1),
    matte(CREAM, 1),
    0,
    1.2,
    0,
  );

  const scarf = part(
    body,
    'snowman-scarf',
    new THREE.TorusGeometry(4.85, 1.35, 8, 26),
    matte(KNIT, 0.95),
    0,
    SCARF_Y,
    0,
  );
  scarf.rotation.x = Math.PI / 2;
  const tails: [Tail, Tail] = [
    tail(
      body,
      'snowman-scarf-front',
      new THREE.Vector3(-1.8, SCARF_Y - 0.8, 4.7),
      new THREE.Vector3(-5.6, BELLY_Y - 0.6, 5.6),
    ),
    tail(
      body,
      'snowman-scarf-back',
      new THREE.Vector3(2.7, SCARF_Y - 0.6, -3.8),
      new THREE.Vector3(5.6, BELLY_Y - 0.6, -5.6),
    ),
  ];

  const shoulder = (x: number) => {
    const anchor = new THREE.Object3D();
    anchor.name = 'snowman-shoulder';
    anchor.position.set(x, CHEST_Y + 0.6, 0);
    body.add(anchor);
    return anchor;
  };
  const shoulders: [THREE.Object3D, THREE.Object3D] = [shoulder(-5.9), shoulder(5.9)];
  const arm = (name: string, out: Side) => {
    const limb = makeLimb(
      root,
      name,
      out * 5.9,
      24,
      0,
      8.7,
      8.3,
      0.55,
      matte(TWIG, 0.9),
      matte(0x5b3b22, 0.9),
    );
    const sprig = part(
      limb.joint,
      `${name}-sprig`,
      new THREE.CylinderGeometry(0.16, 0.3, 2.6, 5),
      matte(TWIG, 0.9),
      out * 0.7,
      1.1,
      0,
    );
    sprig.rotation.z = -out * 0.6;
    oval(limb.end, `${name}-mitten`, matte(KNIT, 0.95), 0, -1.75, 0, 1.5, 1.85, 1.25);
    const thumb = oval(
      limb.end,
      `${name}-thumb`,
      matte(KNIT, 0.95),
      out * 1.05,
      -1.05,
      0.2,
      0.55,
      0.85,
      0.55,
    );
    thumb.rotation.z = out * 0.5;
    part(
      limb.end,
      `${name}-cuff`,
      new THREE.TorusGeometry(1.05, 0.42, 6, 14),
      matte(CREAM, 0.95),
      0,
      -0.15,
      0,
    ).rotation.x = Math.PI / 2;
    const grip = new THREE.Object3D();
    grip.name = `${name}-grip`;
    grip.position.set(0, -MITTEN_GRIP, 0);
    limb.end.add(grip);
    return { limb, grip };
  };
  const left = arm('snowman-arm-left', -1),
    right = arm('snowman-arm-right', 1);
  const leg = (name: string, x: number) => {
    const limb = makeLimb(
      root,
      name,
      x,
      SNOWMAN_HIP,
      2.2,
      2.75,
      2.6,
      1.2,
      matte(SNOW_SHADE, 0.9),
      matte(SNOW_SHADE, 0.9),
    );
    oval(limb.end, `${name}-bootie`, matte(KNIT, 0.95), 0, -1.2, 0, 2, SNOWMAN_ANKLE - 1.2, 1.9);
    part(
      limb.end,
      `${name}-bootie-cuff`,
      new THREE.TorusGeometry(1.35, 0.42, 6, 14),
      matte(CREAM, 0.95),
      0,
      0.05,
      0,
    ).rotation.x = Math.PI / 2;
    return limb;
  };
  const legs: [Limb, Limb] = [leg('snowman-leg-left', -2.6), leg('snowman-leg-right', 2.6)];
  models.set(root, {
    plan,
    roller,
    body,
    belly,
    chest,
    buttons,
    head,
    pompom,
    scarf,
    tails,
    eyes,
    arcs,
    smile,
    mouth,
    carrot,
    hole,
    arms: [left.limb, right.limb],
    legs,
    shoulders,
    grips: [left.grip, right.grip],
  });
  snowmanPose(root, SNOWMAN_REST);
  return root;
}

export function snowmanModel(root: THREE.Group): SnowmanModel {
  const model = models.get(root);
  if (!model) throw new Error('Missing native snowman');
  return model;
}

export interface SnowmanPose {
  /** Distance walked in model units; planted feet stay put while it is unchanged. */
  readonly walked: number;
  /** Screen direction of travel, used to keep stance feet fixed on the floor. */
  readonly heading: { readonly x: number; readonly y: number };
  readonly planted: number;
  readonly yaw: number;
  /** Lean toward +x in the screen plane, about the hips. */
  readonly lean: number;
  readonly crouch: number;
  readonly squash: number;
  readonly nod: number;
  readonly headYaw: number;
  readonly headRoll: number;
  readonly blink: number;
  readonly squint: number;
  readonly mouth: number;
  readonly noseOn: boolean;
  readonly twitch: number;
  readonly tuck: number;
  readonly exitDir: Side;
  readonly roll: number;
  readonly tails: readonly [number, number];
  readonly curl: number;
  readonly pompom: number;
  /** Ankle target for a kicking foot, in actor-root space, blended in by weight. */
  readonly kick: {
    readonly leg: 0 | 1;
    readonly x: number;
    readonly y: number;
    readonly weight: number;
  } | null;
}
export const SNOWMAN_REST: SnowmanPose = {
  walked: 0,
  heading: { x: 1, y: 0 },
  planted: 1,
  yaw: 0.6,
  lean: 0,
  crouch: 0,
  squash: 0,
  nod: 0,
  headYaw: 0,
  headRoll: 0,
  blink: 0,
  squint: 0,
  mouth: 0,
  noseOn: true,
  twitch: 0,
  tuck: 0,
  exitDir: 1,
  roll: 0,
  tails: [0.1, -0.1],
  curl: 0,
  pompom: 0,
  kick: null,
};

const shoulderAt = new THREE.Vector3();
export function snowmanPose(root: THREE.Group, q: SnowmanPose) {
  const m = snowmanModel(root);
  const t = q.tuck,
    s = q.squash;
  const hip = SNOWMAN_HIP - q.crouch - TUCK_DROP * t;
  m.roller.rotation.set(0, 0, q.roll);
  m.body.position.set(0, hip - ROLL_CENTRE, 0);
  m.body.rotation.set(0, q.yaw, -q.lean);
  // Squash keeps the bottom of each ball where it was.
  m.belly.scale.set(8.8 * (1 + 0.05 * s), 8.3 * (1 - 0.08 * s), 8.2 * (1 + 0.05 * s));
  m.belly.position.y = BELLY_Y - 8.3 * 0.08 * s;
  const lift = -1.3 * s;
  m.chest.position.set(0, mix(CHEST_Y + lift, BELLY_Y, t), 0);
  m.chest.scale.set(6.4 * (1 + 0.04 * s), 6.2 * (1 - 0.06 * s), 6.1 * (1 + 0.04 * s));
  m.buttons.position.y = m.chest.position.y - CHEST_Y;
  m.head.position.set(
    mix(0, q.exitDir * 3.2, t),
    mix(HEAD_Y + 1.6 * lift, BELLY_Y + 0.8, t),
    mix(0, 5.2, t),
  );
  m.head.rotation.set(q.nod, q.headYaw, q.headRoll);
  m.pompom.rotation.z = q.pompom;
  m.scarf.position.set(0, mix(SCARF_Y + 1.4 * lift, BELLY_Y, t), 0);
  // Tucking pulls the scarf down into a band round the ball's middle, which then turns with the roll.
  m.scarf.scale.setScalar(mix(1, 1.6, t));
  m.tails.forEach((tail, i) => {
    tail.root.position.lerpVectors(tail.stand, tail.tucked, t);
    tail.root.position.y += (1 - t) * 1.4 * lift;
    tail.root.rotation.z = q.tails[i] ?? 0;
    tail.segments.forEach((seg, k) => {
      if (k) seg.rotation.z = q.curl * (0.35 + 0.2 * k);
    });
  });
  const open = Math.max(0.08, 1 - q.blink) * (1 - 0.9 * q.squint);
  m.eyes.forEach((eye) => eye.scale.set(1, open, 1));
  m.arcs.forEach((arc) => {
    arc.visible = q.squint > 0.45;
    arc.scale.setScalar(Math.max(0.01, q.squint));
  });
  m.smile.forEach((dot) => (dot.visible = q.mouth < 0.3));
  m.mouth.visible = q.mouth >= 0.3;
  m.mouth.scale.set(0.55 + 0.5 * q.mouth, 0.35 + 0.9 * q.mouth, 0.35);
  m.carrot.visible = q.noseOn;
  m.carrot.rotation.z = q.twitch;
  m.hole.visible = !q.noseOn;

  const tucked = ease((t - 0.5) * 2);
  m.legs.forEach((leg, i) => {
    const hipX = i ? 2.6 : -2.6;
    leg.root.position.set(hipX, hip, mix(2.2, 0.5, t));
    const g = gait(q.walked, SNOWMAN_STRIDE, i * 0.5, 1.6);
    let fx = hipX * 0.9 + g.x * q.heading.x,
      fy = SNOWMAN_ANKLE - g.x * q.heading.y + g.y * (1 - q.planted);
    // Tucking: the feet draw up inside the ball once it has sunk onto them.
    fx = mix(fx, hipX * 0.55, tucked);
    fy += tucked * (TUCK_DROP + 0.6);
    if (q.kick && q.kick.leg === i) {
      fx = mix(fx, q.kick.x, q.kick.weight);
      fy = mix(fy, q.kick.y, q.kick.weight);
    }
    reach(leg, fx - hipX, fy - hip, i ? 1 : -1, 0);
    leg.root.visible = t < 0.97;
  });
  root.updateMatrixWorld(true);
  m.arms.forEach((arm, i) => {
    const anchor = m.shoulders[i];
    if (!anchor) return;
    anchor.getWorldPosition(shoulderAt);
    root.worldToLocal(shoulderAt);
    // Arms work in the screen plane, in front of the body on the near side and behind it on the far side.
    arm.root.position.set(shoulderAt.x, shoulderAt.y, shoulderAt.z * 2);
    arm.root.visible = t < 0.85;
    const out = i ? 1 : -1;
    reach(arm, out * 9.5, -7, i ? -1 : 1);
  });
}

export function quadGeometry(count: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 12), 3));
  const index: number[] = [];
  for (let i = 0; i < count; i++)
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2);
  g.setIndex(index);
  return g;
}

export function flakeGeometry(): THREE.ShapeGeometry {
  const points: [number, number][] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2,
      radius = i % 2 ? 0.28 : 1;
    points.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return new THREE.ShapeGeometry(outline(points));
}

export function starGeometry(outer: number, depth: number): THREE.ExtrudeGeometry {
  const points: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2,
      radius = i % 2 ? outer * 0.46 : outer;
    points.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  const g = new THREE.ExtrudeGeometry(outline(points), {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.2,
    bevelSize: outer * 0.06,
    bevelSegments: 2,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}
