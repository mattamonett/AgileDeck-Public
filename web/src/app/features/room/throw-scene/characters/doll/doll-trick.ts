import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFit,
  cardTurn,
  ease,
  glow,
  lowestWorldY,
  mix,
  onCard,
  part,
  pulse,
  screenOf,
  setStrip,
  sideOf,
  sideRoute,
  span,
  stripGeometry,
  type CardPose,
  type CharacterRoutine,
  type Side,
} from '../../kit';
import {
  DOLL_DURATION,
  DOLL_PRINTS,
  DOLL_SCALE,
  dollCardPose,
  dollExitPoint,
  dollFloor,
  dollFrames,
  dollFrozen,
  dollHeadSpin,
  dollLandingPoint,
  dollPrintAt,
  dollProgress,
  type DollPlan,
} from './doll-choreography';
import { dollModel, dollPose, type DollModel, type DollPose } from './doll-model';

const DEPTH = 170;
const BLOOD = 0x7e0b1b;

interface Print {
  readonly group: THREE.Group;
  readonly drip: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
}
function handprint(parent: THREE.Object3D, name: string): Print {
  const group = new THREE.Group();
  group.name = name;
  parent.add(group);
  part(group, `${name}-palm`, new THREE.CircleGeometry(1, 16), glow(BLOOD, 0.85)).scale.set(
    0.95,
    1.05,
    1,
  );
  // Four spread fingers and a thumb, each a long narrow print with a rounded pad.
  for (let f = 0; f < 4; f++) {
    const a = -0.42 + f * 0.27,
      long = 1.15 - Math.abs(f - 1.4) * 0.16;
    const finger = part(
      group,
      `${name}-finger-${f}`,
      new THREE.CircleGeometry(1, 10),
      glow(BLOOD, 0.85),
    );
    finger.position.set(Math.sin(a) * (1 + long), Math.cos(a) * (1 + long) - 0.1, 0.01);
    finger.scale.set(0.24, long, 1);
    finger.rotation.z = -a;
  }
  const thumb = part(
    group,
    `${name}-thumb`,
    new THREE.CircleGeometry(1, 10),
    glow(BLOOD, 0.85),
    -1.35,
    0.1,
    0.01,
  );
  thumb.scale.set(0.25, 0.75, 1);
  thumb.rotation.z = 0.95;
  part(
    group,
    `${name}-smear`,
    new THREE.CircleGeometry(1, 12),
    glow(0x4d0610, 0.6),
    0.1,
    -0.85,
    0.02,
  ).scale.set(0.7, 0.3, 1);
  const drip = part(parent, `${name}-drip`, stripGeometry(8), glow(BLOOD, 0.85));
  return { group, drip };
}

export class DollTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: DollPlan;
  readonly duration: number;
  private readonly model: DollModel;
  private readonly prints: Print[] = [];
  private readonly tendrils: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly routeLengths = new Float32Array(25);

  constructor(actor: THREE.Group) {
    this.model = dollModel(actor);
    this.plan = this.model.plan;
    this.duration = DOLL_DURATION * this.plan.pace;
    this.object.name = 'doll-haunting';
    for (let k = 0; k < 4; k++) this.prints.push(handprint(this.object, `doll-print-${k}`));
    for (let i = 0; i < 4; i++)
      this.tendrils.push(
        part(
          this.object,
          `doll-tendril-${i}`,
          stripGeometry(16),
          glow(i % 2 ? 0x3b1450 : 0x6a2a7c, 0),
        ),
      );
  }

  cardAnimation(facing: number) {
    return dollFrames(this.plan, facing);
  }

  private routeAt(u: number, start: Point, b: TargetBounds, view: Point, side: Side): Point {
    return sideRoute(
      start,
      dollLandingPoint(this.plan, b, view, side),
      b,
      view,
      side,
      this.plan.bend,
      u,
    );
  }
  private measure(start: Point, b: TargetBounds, view: Point, side: Side) {
    let previous = this.routeAt(0, start, b, view, side);
    this.routeLengths[0] = 0;
    for (let i = 1; i <= 24; i++) {
      const at = this.routeAt(i / 24, start, b, view, side);
      this.routeLengths[i] =
        (this.routeLengths[i - 1] ?? 0) + Math.hypot(at.x - previous.x, at.y - previous.y);
      previous = at;
    }
    return this.routeLengths[24] ?? 0;
  }
  private along(u: number) {
    const f = Math.max(0, Math.min(1, u)) * 24,
      i = Math.min(23, Math.floor(f));
    return mix(this.routeLengths[i] ?? 0, this.routeLengths[i + 1] ?? 0, f - i);
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
    this.object.visible = ms < DOLL_DURATION;
    this.object.position.set(0, 0, 0);
    const scale = DOLL_SCALE * cardFit(b);
    const stand = dollLandingPoint(p, b, view, side);
    const q = dollCardPose(p, ms, side);
    const contactYaw = side > 0 ? 0 : -Math.PI;
    const length = this.measure(start, b, view, side);
    let at: Point = stand,
      yaw = contactYaw,
      walked = length / scale;
    const t = ms / p.travel;
    if (ms < p.travel) {
      const u = dollProgress(p, t);
      at = this.routeAt(u, start, b, view, side);
      walked = this.along(u) / scale;
      const ahead = this.routeAt(Math.min(1, u + 0.02), start, b, view, side),
        behind = this.routeAt(Math.max(0, u - 0.02), start, b, view, side);
      const dx = ahead.x - behind.x,
        l = Math.hypot(dx, ahead.y - behind.y);
      if (l > 0.5) yaw = -Math.acos(Math.max(-1, Math.min(1, dx / l)));
      yaw = mix(yaw, contactYaw, ease((t - 0.9) / 0.1));
    } else if (ms >= p.exit) {
      const exit = dollExitPoint(p, b, view, side);
      const e = p.collapse
        ? ease((ms - p.exit - 850) / (p.exitEnd - p.exit - 850))
        : ease((ms - p.exit) / (p.exitEnd - p.exit));
      at = { x: mix(stand.x, exit.x, e), y: mix(stand.y, exit.y, e) };
      walked -= (Math.hypot(exit.x - stand.x, exit.y - stand.y) * e) / scale;
    }
    actor.visible = ms < DOLL_DURATION;
    actor.position.set(at.x, -at.y, DEPTH);
    actor.rotation.set(0, yaw, 0);
    actor.scale.setScalar(scale);
    const pose = this.pose(ms, walked, side, yaw);
    dollPose(actor, pose);
    if (pose.fallen > 0) {
      // Rest the limp body on its real lowest point rather than its nominal hip height.
      const lowest = lowestWorldY(actor);
      actor.position.y += (-dollFloor(b) - lowest) * pose.fallen;
    }
    actor.updateMatrixWorld(true);
    this.updatePrints(ms, b, q, scale);
    this.updateTendrils(ms, b, q, side, scale);
  }

  private pose(ms: number, walked: number, side: Side, yaw: number): DollPose {
    const p = this.plan,
      t = ms / p.travel;
    // Body and head move at a stop-motion rate; the legs keep their planted, continuous steps.
    const tick = Math.floor(ms / 83) * 83;
    const frozen = ms < p.travel ? dollFrozen(p, t) : 0;
    const crab = p.crab ? 1 - ease((ms - p.travel) / 380) : 0;
    const toward = (-Math.PI / 2 - yaw) * 0.95;
    let lean = 0.04,
      sway = ms < p.travel ? Math.sin(walked * 0.22) * 0.09 * (1 - frozen) : 0,
      headSpin = toward * frozen,
      headTilt = 0.25 * Math.sin(tick / 420 + p.phase) * (1 - frozen) + 0.35 * frozen;
    let front: { x: number; y: number } | null = { x: 7 + Math.sin(tick / 300) * 0.8, y: -7 };
    let back: { x: number; y: number } | null = { x: 6, y: -8 };
    let lids: [number, number] = [0, 0],
      glowing = 0,
      cracks = 0,
      tears = 0,
      fallen = 0,
      crawl = 0;
    if (ms >= p.travel) {
      headSpin = dollHeadSpin(p, ms);
      headTilt = 0.18 * pulse(ms, p.spin + 900, 400);
      const rise = Math.floor(span(ms, p.arms, 360) * 6) / 6;
      const hang = { x: 1, y: -12.5 };
      const up = { x: 10.5, y: 3 };
      const tremble = Math.sin(ms / 31) * 0.6 * span(ms, p.haunt, 300);
      const drop = ease((ms - p.drop) / 140);
      const raised = rise * (1 - drop);
      front = { x: mix(hang.x, up.x, raised) + tremble, y: mix(hang.y, up.y, raised) - tremble };
      back = {
        x: mix(hang.x, up.x - 1, raised) - tremble,
        y: mix(hang.y, up.y - 1, raised) + tremble,
      };
      lean = 0.04 + 0.1 * raised - 0.08 * pulse(ms, p.drop, 300);
      headTilt += 0.3 * span(ms, p.haunt, 400) * (1 - drop) - 0.45 * pulse(ms, p.drop, 380);
      cracks = span(ms, p.haunt + 100, p.drop - p.haunt);
      tears = span(ms, p.haunt + 400, 1500);
      // The deliberate final stare: face the viewer, glow, and a slow blink with one lagging lid.
      const look = ease((ms - p.stare) / 520);
      headSpin = mix(headSpin, toward, look);
      headTilt = mix(headTilt, 0.22, look);
      glowing = look * (1 - ease((ms - p.exitEnd + 300) / 300));
      lids = [pulse(ms, p.stare + 650, 420), pulse(ms, p.stare + 790, 420)];
    }
    if (ms >= p.exit) {
      if (p.collapse) {
        fallen = ease(((ms - p.exit) / 360) ** 1.6);
        crawl = Math.max(0, (ms - p.exit - 850) / 520);
        headTilt = mix(headTilt, -0.2, fallen);
      } else {
        // Backs away without taking its eyes off the viewer.
        sway = Math.sin(walked * 0.22) * 0.07;
      }
    }
    return {
      walked,
      planted: ms < p.travel ? ease((t - 0.93) / 0.07) : ms >= p.exit && !p.collapse ? 0 : 1,
      crab,
      fallen,
      crawl,
      lean,
      sway,
      headSpin,
      headTilt,
      front,
      back,
      lids,
      glow: glowing,
      cracks,
      tears,
    };
  }

  private updatePrints(ms: number, b: TargetBounds, q: CardPose, scale: number) {
    const p = this.plan;
    const fade = 1 - ease((ms - p.exitEnd) / 400);
    const turn = cardTurn(q);
    this.prints.forEach((print, k) => {
      const spot = DOLL_PRINTS[p.order[k] ?? 0],
        born = dollPrintAt(p, k);
      const shown = k < p.prints && spot !== undefined && ms >= born && fade > 0;
      print.group.visible = print.drip.visible = shown;
      if (!shown || !spot) return;
      const at = onCard(q, spot.u, spot.v, b);
      const slap = 1 + 0.35 * (1 - ease((ms - born) / 120));
      const size = 0.075 * b.width * slap;
      print.group.position.set(at.x, -at.y, DEPTH - 6 + k * 0.05);
      print.group.rotation.z = turn + spot.a;
      print.group.scale.set(size, size, 1);
      print.group.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial)
          o.material.opacity = 0.85 * fade;
      });
      const length = Math.min(0.16, 0.2 * ease((ms - born - 150) / 1400)) * b.height;
      setStrip(
        print.drip.geometry,
        8,
        (s, out) => {
          const point = onCard(
            q,
            spot.u + 0.01 + Math.sin(s * 5 + k) * 0.006,
            spot.v + 0.04 + (s * length) / b.height,
            b,
          );
          out.set(point.x, -point.y, DEPTH - 6.1);
        },
        (s) => (1.3 - 0.8 * s) * scale,
      );
      print.drip.material.opacity = 0.85 * fade;
      print.drip.visible = length > 0.5;
    });
  }

  /** Dark wisps flow from the doll's raised hands into the card while it is possessed. */
  private updateTendrils(ms: number, b: TargetBounds, q: CardPose, side: Side, scale: number) {
    const p = this.plan;
    const strength = ease((ms - p.haunt) / 300) * (1 - ease((ms - p.drop) / 160));
    this.tendrils.forEach((wisp, i) => {
      wisp.visible = strength > 0.01;
      if (!wisp.visible) return;
      const hand = screenOf(this.model.arms[i % 2 ? 1 : 0].end);
      const target = onCard(
        q,
        side > 0 ? 0.08 : 0.92,
        i < 2 ? 0.3 + i * 0.12 : 0.62 + (i - 2) * 0.12,
        b,
      );
      setStrip(
        wisp.geometry,
        16,
        (s, out) => {
          const wave = Math.sin(s * 9 - ms / 70 + i * 1.7) * 3 * scale * Math.sin(Math.PI * s);
          out.set(mix(hand.x, target.x, s), -(mix(hand.y, target.y, s) + wave), DEPTH + 4);
        },
        (s) => (2.2 - 1.4 * s) * scale,
      );
      wisp.material.opacity = 0.5 * strength * (0.7 + 0.3 * Math.sin(ms / 90 + i));
    });
  }
}
