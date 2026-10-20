import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFit,
  cardPoint,
  cardTurn,
  clamp,
  ease,
  glow,
  mix,
  part,
  pulse,
  reach,
  screenOf,
  setStrip,
  sideOf,
  span,
  stripGeometry,
  type CardPose,
  type CharacterRoutine,
  type Side,
} from '../../kit';
import {
  VAMPIRE_DURATION,
  VAMPIRE_SCALE,
  vampireBatForm,
  vampireCardPose,
  vampireExitPoint,
  vampireFlight,
  vampireFloor,
  vampireForm,
  vampireFrames,
  vampireGulp,
  vampireLunge,
  type VampirePlan,
} from './vampire-choreography';
import {
  BAT_ANCHOR,
  vampireModel,
  vampirePose,
  type VampireModel,
  type VampirePose,
  tinyBat,
} from './vampire-model';

const DEPTH = 174;
const BLOOD = 0x8c0d22,
  CLOT = 0x3a0510;

interface Puff {
  readonly mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  readonly angle: number;
  readonly speed: number;
  readonly delay: number;
  readonly size: number;
}
interface Flutter {
  readonly mesh: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  readonly angle: number;
  readonly delay: number;
}
export interface VampireContact {
  readonly stand: Point;
  readonly bite: Point;
  readonly side: Side;
}

export class VampireTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: VampirePlan;
  readonly duration: number;
  private readonly model: VampireModel;
  private readonly puffs: Puff[] = [];
  private readonly flutters: Flutter[] = [];
  private readonly wounds: THREE.Group[] = [];
  private readonly drips: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly beads: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly veins: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly strand = part(this.object, 'vampire-strand', stripGeometry(12), glow(BLOOD));
  private readonly drop = part(
    this.object,
    'vampire-chin-drop',
    new THREE.CircleGeometry(1, 12),
    glow(BLOOD),
  );
  private readonly splat = part(
    this.object,
    'vampire-floor-splat',
    new THREE.CircleGeometry(1, 18),
    glow(0x6e0a1b, 0.85),
  );
  private readonly scratch = new THREE.Vector3();

  constructor(actor: THREE.Group) {
    this.model = vampireModel(actor);
    this.plan = this.model.plan;
    this.duration = VAMPIRE_DURATION * this.plan.pace;
    this.object.name = 'vampire-bite';
    const r = seededRandom(`${this.plan.phase}:vampire-mist`);
    for (let i = 0; i < 18; i++) {
      const mesh = part(
        this.object,
        `vampire-mist-${i}`,
        new THREE.CircleGeometry(1, 16),
        glow(i % 2 ? 0x2c2036 : 0x5c4568, 0),
      );
      this.puffs.push({
        mesh,
        angle: (i % 9) * 0.7 + r() * 0.5,
        speed: 10 + r() * 16,
        delay: r() * 120,
        size: 3 + r() * 4,
      });
    }
    for (let i = 0; i < 6; i++) {
      const mesh = part(this.object, `vampire-mist-bat-${i}`, tinyBat(), glow(0x1d1524, 0));
      this.flutters.push({ mesh, angle: -0.4 - (i % 3) * 0.9 + r() * 0.3, delay: 60 + r() * 140 });
    }
    for (let i = 0; i < 2; i++) {
      const wound = new THREE.Group();
      wound.name = `vampire-puncture-${i}`;
      part(wound, 'puncture-rim', new THREE.CircleGeometry(1, 14), glow(0xa3172f), 0, 0, 0);
      part(wound, 'puncture-hole', new THREE.CircleGeometry(0.62, 12), glow(CLOT), 0, 0, 0.1);
      part(
        wound,
        'puncture-glint',
        new THREE.CircleGeometry(0.18, 8),
        glow(0xff8a8a, 0.8),
        0.25,
        0.25,
        0.2,
      );
      this.object.add(wound);
      this.wounds.push(wound);
      this.drips.push(part(this.object, `vampire-drip-${i}`, stripGeometry(10), glow(BLOOD)));
      this.beads.push(
        part(this.object, `vampire-bead-${i}`, new THREE.CircleGeometry(1, 12), glow(0x9e1028)),
      );
    }
    for (let i = 0; i < 5; i++)
      this.veins.push(part(this.object, `vampire-vein-${i}`, stripGeometry(8), glow(0x5a0c22, 0)));
  }

  /** Fang tip relative to the feet for the pose at a given moment, measured on the real model. */
  private fangAt(ms: number, scale: number, side: Side): Point {
    const root = this.model.bat.parent;
    if (!(root instanceof THREE.Group)) throw new Error('Detached vampire');
    root.position.set(0, 0, DEPTH);
    root.rotation.set(0, side > 0 ? 0 : -Math.PI, 0);
    root.scale.setScalar(scale);
    vampirePose(root, this.bodyPose(ms, 0, side, scale));
    return screenOf(this.model.fang);
  }

  /** The bite point and stand point are measured from the real fang at the moment of contact. */
  contact(b: TargetBounds, facing: number): VampireContact {
    const p = this.plan,
      side = sideOf(facing);
    const fang = this.fangAt(p.bite, VAMPIRE_SCALE * cardFit(b), side);
    const biteX = side > 0 ? b.left + p.biteU * b.width : b.left + b.width - p.biteU * b.width;
    const floor = vampireFloor(b);
    return { stand: { x: biteX - fang.x, y: floor }, bite: { x: biteX, y: floor + fang.y }, side };
  }

  cardAnimation(facing: number, b?: TargetBounds) {
    const bounds = b ?? { left: 0, top: 0, width: 84, height: 122 };
    return vampireFrames(this.plan, facing, bounds, this.contact(bounds, facing).bite);
  }

  private bodyPose(ms: number, walked: number, side: Side, scale: number): VampirePose {
    const p = this.plan;
    const lunge = vampireLunge(p, ms);
    const loom = ease((ms - p.formed) / 380);
    const away = ease((ms - p.release) / 260);
    const gulp = vampireGulp(p, ms);
    const neck = 2.5 * lunge.reach,
      mouth =
        Math.max(ease((ms - p.formed - 120) / 300) * 0.7, lunge.recoil, lunge.reach) *
        (1 - ease((ms - p.release - 300) / 300));
    let lean = mix(0.04, 0.1, loom) - 0.12 * lunge.recoil + (0.42 - 0.1) * lunge.reach,
      headTilt = -0.25 * lunge.recoil + 0.15 * lunge.reach + 0.2 * pulse(ms, p.release, 700),
      cape = mix(-0.3, 1, loom) * (1 - 0.2 * lunge.reach),
      crouch = p.crouch * lunge.reach;
    let back = { x: mix(6, 3, loom), y: mix(-9, 15, loom) };
    lean += -0.04 * away;
    if (ms >= p.release + 260 && ms < p.remist) {
      const g = pulse(ms, p.release + 260, p.backstep - p.release - 260);
      if (!p.wipe) {
        cape = 1 + 0.35 * g;
        back = { x: mix(3, 14, g), y: mix(15, 6, g) };
      }
      headTilt += p.wipe ? -0.1 * g : 0.15 * g;
    }
    if (ms >= p.backstep) {
      const s = ease((ms - p.backstep) / (p.remist - p.backstep));
      cape = mix(cape, 0.6, s);
    }
    if (ms >= p.remist) {
      const w = ease((ms - p.remist) / 280);
      cape = mix(cape, -0.45, w);
      crouch = 3 * w;
      back = { x: mix(back.x, 6, w), y: mix(back.y, -9, w) };
      lean = mix(lean, 0.02, w);
    }
    const form = vampireForm(p, ms),
      batForm = vampireBatForm(p, ms);
    const beat = (ms / 95) * p.flap * (ms > p.perch && ms < p.remist ? 1.6 : 1) + p.phase;
    const wrapping = Math.max(1 - batForm, 0) * (ms < p.flight ? 1 : 0);
    return {
      walked,
      planted: 1 - pulse(ms, p.backstep, p.remist - p.backstep),
      lean,
      crouch,
      // Each gulp pulls the head up exactly as far as the card is tugged.
      rise: (1.6 * gulp * p.strength) / scale,
      neck,
      headTilt,
      mouth,
      cape,
      // The camera-side arm grips the card; the other one works the cape.
      front: side > 0 ? null : back,
      back: side > 0 ? back : null,
      form,
      batForm,
      flap: mix(0.62 * Math.sin(beat), -0.9, wrapping),
      fold: mix(Math.max(0, Math.cos(beat)), 1, wrapping),
      bank: 0,
      batYaw: side > 0 ? 0 : Math.PI,
    };
  }

  update(
    elapsed: number,
    actor: THREE.Group,
    start: Point,
    b: TargetBounds,
    view: Point,
    facing: number,
  ) {
    const p = this.plan,
      ms = elapsed / p.pace,
      side = sideOf(facing);
    this.object.visible = ms < VAMPIRE_DURATION;
    this.object.position.set(0, 0, 0);
    const scale = VAMPIRE_SCALE * cardFit(b);
    const { stand, bite } = this.contact(b, side);
    // Measuring poses the shared actor, so it happens before this frame's pose is applied.
    const dropFrom = this.fangAt(p.release + 160, scale, side);
    const q = vampireCardPose(p, ms, side, b, bite);
    const yaw = side > 0 ? 0 : -Math.PI;
    const anchor = { x: (side > 0 ? 1 : -1) * BAT_ANCHOR.x * scale, y: -BAT_ANCHOR.y * scale };
    const perch = { x: stand.x + anchor.x, y: stand.y + anchor.y };
    const stepBack = (34 * ease((ms - p.backstep) / (p.remist - p.backstep))) / scale;
    const backAt = { x: stand.x - side * stepBack * scale, y: stand.y };
    let root: Point = stand,
      bank = 0;
    if (ms < p.travel) {
      const at = vampireFlight(p, ms, start, perch, b, view, side),
        ahead = vampireFlight(p, ms + 16, start, perch, b, view, side);
      root = { x: at.x - anchor.x, y: at.y - anchor.y };
      bank = Math.max(-0.4, Math.min(0.4, -(ahead.x - at.x) * 0.05));
    } else if (ms < p.flight) {
      root = ms >= p.backstep ? backAt : stand;
    } else {
      const from = { x: backAt.x + anchor.x, y: backAt.y + anchor.y };
      const at = vampireExitPoint(p, ms, from, view, side),
        ahead = vampireExitPoint(p, ms + 16, from, view, side);
      root = { x: at.x - anchor.x, y: at.y - anchor.y };
      bank = Math.max(-0.45, Math.min(0.45, -(ahead.x - at.x) * 0.04));
    }
    actor.visible = ms < VAMPIRE_DURATION;
    actor.position.set(root.x, -root.y, DEPTH);
    actor.rotation.set(0, yaw, 0);
    actor.scale.setScalar(scale);
    const pose = { ...this.bodyPose(ms, ms >= p.backstep ? -stepBack : 0, side, scale), bank };
    vampirePose(actor, pose);
    actor.updateMatrixWorld(true);
    this.placeHands(ms, b, q, side, bite);
    actor.updateMatrixWorld(true);
    this.updateMist(ms, actor, scale);
    this.updateBlood(ms, b, q, bite, scale, side, {
      x: stand.x + dropFrom.x,
      y: stand.y + dropFrom.y,
    });
  }

  /** Where the clawed hand presses on the card face, just inside its near edge below the bite. */
  static gripPoint(b: TargetBounds, bite: Point, side: Side): Point {
    const v = clamp((bite.y - b.top) / b.height + 0.1);
    return {
      x: side > 0 ? b.left + b.width * 0.05 : b.left + b.width * 0.95,
      y: b.top + b.height * v,
    };
  }

  /** The camera-side hand presses on the card from the loom until just after the release. */
  private placeHands(ms: number, b: TargetBounds, q: CardPose, side: Side, bite: Point) {
    const p = this.plan,
      arm = this.model.arms[side > 0 ? 0 : 1];
    const hold = ease((ms - p.formed - 120) / 260) * (1 - ease((ms - p.release - 60) / 240));
    const edge = cardPoint(q, VampireTrick.gripPoint(b, bite, side), b);
    const parent = arm.root.parent;
    if (!parent) return;
    this.scratch.set(edge.x, -edge.y, 0);
    parent.updateWorldMatrix(true, false);
    parent.worldToLocal(this.scratch);
    const rest =
      this.plan.wipe && ms > p.release + 260 && ms < p.remist
        ? {
            x: mix(8, 12, pulse(ms, p.release + 260, p.backstep - p.release - 260)),
            y: mix(-8, 13, pulse(ms, p.release + 260, p.backstep - p.release - 260)),
          }
        : { x: 6, y: -10 };
    reach(
      arm,
      mix(rest.x, this.scratch.x - arm.root.position.x, hold),
      mix(rest.y, this.scratch.y - arm.root.position.y, hold),
      -1,
    );
  }

  private updateMist(ms: number, actor: THREE.Group, scale: number) {
    const p = this.plan;
    const centre = screenOf(this.model.bat);
    this.puffs.forEach((puff, i) => {
      const startAt = (i < 9 ? p.perch : p.remist) + puff.delay;
      const t = (ms - startAt) / 620;
      puff.mesh.visible = t > 0 && t < 1 && actor.visible;
      if (!puff.mesh.visible) return;
      // Mist rises from the whole body, not only from where the bat hovers.
      const d = puff.speed * ease(t) * scale,
        low = (i % 3) * 18 * scale;
      puff.mesh.position.set(
        centre.x + Math.cos(puff.angle) * d,
        -centre.y - low + Math.sin(puff.angle) * d * 0.7 + 8 * t * scale,
        DEPTH + 12,
      );
      puff.mesh.scale.setScalar(puff.size * (0.8 + 1.2 * t) * scale);
      puff.mesh.material.opacity = 0.85 * Math.sin(Math.PI * t);
    });
    this.flutters.forEach((bat, i) => {
      const startAt = (i < 3 ? p.perch : p.remist) + bat.delay;
      const t = (ms - startAt) / 650;
      bat.mesh.visible = t > 0 && t < 1;
      if (!bat.mesh.visible) return;
      const d = 40 * ease(t) * scale;
      bat.mesh.position.set(
        centre.x + Math.cos(bat.angle) * d * 1.4,
        -centre.y - Math.sin(bat.angle) * d,
        DEPTH + 13,
      );
      bat.mesh.scale.set(
        scale * 0.9,
        scale * 0.9 * (0.4 + 0.6 * Math.abs(Math.sin(ms / 40 + i))),
        1,
      );
      bat.mesh.material.opacity = Math.sin(Math.PI * t);
    });
  }

  private updateBlood(
    ms: number,
    b: TargetBounds,
    q: CardPose,
    bite: Point,
    scale: number,
    side: Side,
    from: Point,
  ) {
    const p = this.plan;
    const fade = 1 - ease((ms - (VAMPIRE_DURATION - 600)) / 500);
    const bitten = ms >= p.bite && fade > 0;
    const turn = cardTurn(q);
    const down = { x: Math.sin(-turn), y: Math.cos(-turn) };
    const gap = 1.2 * scale;
    let flowed = 0;
    for (let i = 0; i < p.gulps; i++) flowed += ease((ms - p.bite - 120 - i * 360) / 360);
    flowed = flowed / p.gulps + 0.25 * ease((ms - p.release) / 900);
    this.wounds.forEach((wound, i) => {
      const raw = { x: bite.x + (i ? gap : -gap), y: bite.y };
      const at = cardPoint(q, raw, b);
      wound.visible = bitten;
      wound.position.set(at.x, -at.y, DEPTH - 12);
      wound.rotation.z = turn;
      wound.scale.setScalar(scale * (0.9 + 0.25 * ease((ms - p.bite) / 200)));
      setAlpha(wound, fade);
      const drip = this.drips[i],
        bead = this.beads[i];
      if (!drip || !bead) return;
      const length =
        Math.min(b.height * 0.42, (6 + 34 * flowed * p.strength) * (i ? 0.72 : 1)) * scale;
      drip.visible = bead.visible = bitten && length > 0.5;
      const wobble = (t: number) => Math.sin(t * 7 + i * 2 + p.phase) * 0.7 * scale * t;
      setStrip(
        drip.geometry,
        10,
        (t, out) =>
          out.set(
            at.x + down.x * length * t + wobble(t),
            -(at.y + down.y * length * t),
            DEPTH - 11.8,
          ),
        (t) => (1.5 - 0.6 * t) * scale,
      );
      drip.material.opacity = fade;
      bead.position.set(
        at.x + down.x * length + wobble(1),
        -(at.y + down.y * length),
        DEPTH - 11.7,
      );
      bead.scale.setScalar((1.1 + 0.3 * vampireGulp(p, ms)) * scale);
      bead.material.opacity = fade;
    });
    // Dark veins creep out from the bite while the card is drained.
    const veinGrow = ease((ms - p.bite - 100) / (p.release - p.bite));
    this.veins.forEach((vein, i) => {
      const a =
        -side * (0.2 + i * 0.55) + Math.PI * (side > 0 ? 0 : 1) + Math.sin(i * 3 + p.phase) * 0.2;
      const length = (10 + (i % 3) * 5) * scale * veinGrow;
      vein.visible = bitten && length > 0.5;
      if (!vein.visible) return;
      setStrip(
        vein.geometry,
        8,
        (t, out) => {
          const ax = Math.cos(a) * length * t + Math.sin(t * 9 + i) * 1.2 * scale * t,
            ay = Math.sin(a) * length * t;
          const raw = cardPoint(q, { x: bite.x + ax, y: bite.y + ay }, b);
          out.set(raw.x, -raw.y, DEPTH - 12.4);
        },
        (t) => 0.7 * scale * (1 - t * 0.7),
      );
      vein.material.opacity = 0.55 * fade * veinGrow;
    });
    // A strand of blood stretches from the fangs to the wound, then snaps.
    const fang = screenOf(this.model.fang);
    const stretch = span(ms, p.release, p.snap - p.release);
    this.strand.visible = ms >= p.release && ms < p.snap + 140 && fade > 0;
    if (this.strand.visible) {
      const wound = cardPoint(q, bite, b);
      const snapped = ease((ms - p.snap) / 140);
      setStrip(
        this.strand.geometry,
        12,
        (t, out) => {
          const toFang = t < 0.5,
            local = toFang ? 1 - t * 2 : (t - 0.5) * 2;
          const keep = 1 - snapped * local;
          const from = toFang ? fang : wound,
            to = { x: (fang.x + wound.x) / 2, y: (fang.y + wound.y) / 2 + 3 * scale * stretch };
          out.set(mix(from.x, to.x, keep * local), -mix(from.y, to.y, keep * local), DEPTH + 2);
        },
        () => Math.max(0.3, 1.4 * (1 - 0.7 * stretch)) * scale,
      );
    }
    // A drop falls from the chin after the release and splashes on the floor.
    const dropStart = p.release + 160,
      floor = vampireFloor(b) + 1;
    const fall = Math.max(0, ms - dropStart) / 1000;
    const y = from.y + 260 * fall * fall;
    this.drop.visible = ms >= dropStart && y < floor && fade > 0;
    this.drop.position.set(from.x, -Math.min(y, floor), DEPTH + 1);
    this.drop.scale.set(1.1 * scale, 1.5 * scale, 1);
    this.splat.visible = y >= floor && fade > 0;
    this.splat.position.set(from.x, -floor, DEPTH - 13);
    this.splat.scale.set(3.4 * scale * ease((y - floor) / 30 + 0.4), 1.1 * scale, 1);
    this.splat.material.opacity = 0.85 * fade;
  }
}

function setAlpha(root: THREE.Object3D, opacity: number) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial)
      o.material.opacity = opacity;
  });
}
