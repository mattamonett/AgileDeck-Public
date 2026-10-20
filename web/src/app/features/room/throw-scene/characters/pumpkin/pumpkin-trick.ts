import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  blobShape,
  cardFit,
  cardPoint,
  cardTurn,
  clamp,
  ease,
  glow,
  localTarget,
  lowestWorldY,
  mix,
  part,
  pulse,
  reach,
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
  PUMPKIN_DURATION,
  PUMPKIN_SCALE,
  pumpkinCardPose,
  pumpkinExitPoint,
  pumpkinFloor,
  pumpkinFrames,
  pumpkinHop,
  pumpkinJaw,
  pumpkinPull,
  type PumpkinPlan,
} from './pumpkin-choreography';
import {
  PUMPKIN_CENTER,
  PUMPKIN_HINGE,
  pumpkinModel,
  pumpkinPose,
  type PumpkinModel,
  type PumpkinPose,
} from './pumpkin-model';

const DEPTH = 172;

interface Debris {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly vx: number;
  readonly vy: number;
  readonly size: number;
  readonly spin: number;
}
interface Flight {
  readonly spin: THREE.Vector3;
  readonly yaw: number;
}
export interface PumpkinContact {
  readonly stand: Point;
  readonly bite: Point;
}

export class PumpkinTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: PumpkinPlan;
  readonly duration: number;
  private readonly model: PumpkinModel;
  private readonly actor: THREE.Group;
  private readonly debris: Debris[] = [];
  private readonly flights: Flight[] = [];
  private readonly splats: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly wound = part(
    this.object,
    'pumpkin-card-wound',
    new THREE.ShapeGeometry(blobShape(1.3, 5, 0.3)),
    glow(0x6d0a14, 0),
  );
  private readonly flesh = part(
    this.object,
    'pumpkin-card-flesh',
    new THREE.ShapeGeometry(blobShape(2.1, 6, 0.25)),
    glow(0xc9334a, 0),
  );
  private readonly toothMarks: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly drips: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly spat = part(
    this.object,
    'pumpkin-spat-chunk',
    new THREE.SphereGeometry(1, 10, 8),
    glow(0x9b1222),
  );
  private readonly belch = part(
    this.object,
    'pumpkin-belch',
    new THREE.CircleGeometry(1, 18),
    glow(0xffa53a, 0),
  );
  private readonly smoke = part(
    this.object,
    'pumpkin-smoke',
    new THREE.CircleGeometry(1, 16),
    glow(0x4a4040, 0),
  );
  private readonly routeLengths = new Float32Array(25);

  constructor(actor: THREE.Group) {
    this.actor = actor;
    this.model = pumpkinModel(actor);
    this.plan = this.model.plan;
    this.duration = PUMPKIN_DURATION * this.plan.pace;
    this.object.name = 'pumpkin-feast';
    const r = seededRandom(`${this.plan.phase}:pumpkin-burst`);
    for (let i = 0; i < 30; i++) {
      const kind = i % 3;
      const geometry =
        kind === 1
          ? new THREE.CircleGeometry(1, 8)
          : new THREE.ShapeGeometry(blobShape(i * 0.7, 5, 0.3));
      const mesh = part(
        this.object,
        `pumpkin-debris-${i}`,
        geometry,
        glow(kind === 0 ? 0xf08a2a : kind === 1 ? 0xf3e2b5 : 0xa3142a),
      );
      this.debris.push({
        mesh,
        vx: (r() * 2 - 1) * 90,
        vy: -60 - r() * 110,
        size: kind === 1 ? 0.9 : 1.6 + r() * 1.4,
        spin: (r() * 2 - 1) * 9,
      });
    }
    this.flights.push(
      ...this.model.ribs.map(() => ({
        spin: new THREE.Vector3(r() * 8 - 4, r() * 4 - 2, r() * 8 - 4),
        yaw: r() * Math.PI * 2,
      })),
    );
    for (let i = 0; i < 5; i++)
      this.splats.push(
        part(
          this.object,
          `pumpkin-card-splat-${i}`,
          new THREE.ShapeGeometry(blobShape(i * 1.9, 7, 0.24)),
          glow(i % 2 ? 0xe8822a : 0xb41c2c, 0),
        ),
      );
    for (let i = 0; i < 5; i++)
      this.toothMarks.push(
        part(
          this.object,
          `pumpkin-tooth-mark-${i}`,
          new THREE.CircleGeometry(1, 3),
          glow(0x2a0306, 0),
        ),
      );
    for (let i = 0; i < 2; i++)
      this.drips.push(
        part(this.object, `pumpkin-card-drip-${i}`, stripGeometry(8), glow(0x8c0c1f)),
      );
  }

  /** The mouth marker, measured on the real model in the pose it bites with. */
  private mouthAt(ms: number, scale: number, side: Side): Point {
    this.actor.position.set(0, 0, DEPTH);
    this.actor.rotation.set(0, 0, 0);
    this.actor.scale.set(side * scale, scale, scale);
    pumpkinPose(this.actor, this.pose(ms, 0));
    return screenOf(this.model.bite);
  }
  contact(b: TargetBounds, facing: number): PumpkinContact {
    const p = this.plan,
      side = sideOf(facing);
    const mouth = this.mouthAt(p.bite, PUMPKIN_SCALE * cardFit(b), side);
    const biteX = side > 0 ? b.left + b.width * 0.05 : b.left + b.width * 0.95;
    const floor = pumpkinFloor(b);
    return { stand: { x: biteX - mouth.x, y: floor }, bite: { x: biteX, y: floor + mouth.y } };
  }

  cardAnimation(facing: number, b?: TargetBounds) {
    const bounds = b ?? { left: 0, top: 0, width: 84, height: 122 };
    return pumpkinFrames(this.plan, facing, bounds, this.contact(bounds, facing).bite);
  }

  private pose(ms: number, walked: number): PumpkinPose {
    const p = this.plan;
    const hop = pumpkinHop(p, ms);
    const swell = p.burst
      ? ease((ms - p.ending) / (p.pop - p.ending)) * (1 + 0.04 * Math.sin(ms / 35))
      : 0;
    const gag = !p.burst ? pulse(ms, p.ending, 420) : 0;
    // While the jaws hold the card the body only moves by the shared pull, so the teeth stay put.
    const lean =
      -0.2 * pulse(ms, p.open, 460) +
      0.12 * ease((ms - p.bite + 120) / 120) * (1 - ease((ms - p.tear - 250) / 250)) -
      0.15 * gag;
    // The chunk goes down as a travelling lump; on a recovery it comes back up before being spat out.
    const bulge = p.burst || ms < p.ending ? span(ms, p.swallow, 520) : 1 - span(ms, p.ending, 300);
    return {
      walked,
      planted: ms < p.travel ? 1 - hop.height : 1,
      squash: hop.squash,
      lift: 0,
      roll: 0,
      jaw: Math.max(
        pumpkinJaw(p, ms),
        0.8 * gag,
        p.burst ? 0 : 0.6 * pulse(ms, p.ending + 300, 240) + 0.5 * pulse(ms, p.ending + 660, 260),
      ),
      swell: ms < p.pop ? swell : 1,
      lean,
      flicker: ms / 1000 + p.phase,
      front: null,
      back: null,
      bulge,
      chunk:
        (ms >= p.tear && ms < p.swallow) ||
        (!p.burst && ms >= p.ending + 300 && ms < p.ending + 380),
      cracks: p.burst ? span(ms, p.ending + 150, p.pop - p.ending - 150) : 0,
    };
  }

  private measureRoute(start: Point, stand: Point, b: TargetBounds, view: Point, side: Side) {
    let previous = sideRoute(start, stand, b, view, side, this.plan.bend, 0);
    this.routeLengths[0] = 0;
    for (let i = 1; i <= 24; i++) {
      const at = sideRoute(start, stand, b, view, side, this.plan.bend, i / 24);
      this.routeLengths[i] =
        (this.routeLengths[i - 1] ?? 0) + Math.hypot(at.x - previous.x, at.y - previous.y);
      previous = at;
    }
    return this.routeLengths[24] ?? 0;
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
    this.object.visible = ms < PUMPKIN_DURATION;
    this.object.position.set(0, 0, 0);
    const scale = PUMPKIN_SCALE * cardFit(b);
    const { stand, bite } = this.contact(b, side);
    const q = pumpkinCardPose(p, ms, side, b, bite);
    const floor = pumpkinFloor(b);
    const length = this.measureRoute(start, stand, b, view, side);
    let at: Point = stand,
      dir: number = side,
      lift = 0,
      roll = 0,
      walked = length / scale;
    if (ms < p.travel) {
      const t = ms / p.travel,
        u = ease(t) * 0.3 + t * 0.7;
      at = sideRoute(start, stand, b, view, side, p.bend, u);
      const ahead = sideRoute(start, stand, b, view, side, p.bend, Math.min(1, u + 0.03));
      if (Math.abs(ahead.x - at.x) > 0.5 && t < 0.85) dir = Math.sign(ahead.x - at.x);
      walked = (length * u) / scale;
      if (p.roll) {
        const turns = Math.max(1, Math.round(length / (Math.PI * 2 * 14.5 * scale)));
        roll = -Math.PI * 2 * turns * u;
      } else lift = pumpkinHop(p, ms).height * 16 * scale;
    } else if (!p.burst && ms >= p.ending + 900) {
      // Recovered: hops away, turning in the air on the first hop.
      const exit = pumpkinExitPoint(p, b, view, side);
      const t = span(ms, p.ending + 900, p.exitEnd - p.ending - 900);
      const hops = 5,
        within = (t * hops) % 1;
      const air = t < 1 ? Math.sin(Math.PI * within) : 0;
      at = { x: mix(stand.x, exit.x, t), y: mix(stand.y, exit.y, t) };
      lift = air * 14 * scale;
      dir = t * hops > 0.5 ? -side : side;
      walked += (Math.hypot(exit.x - stand.x, exit.y - stand.y) * t) / scale;
    }
    at = { x: at.x + pumpkinPull(p, ms, side), y: at.y };
    actor.visible = ms < PUMPKIN_DURATION;
    actor.position.set(at.x, -at.y + lift, DEPTH);
    actor.rotation.set(0, 0, 0);
    actor.scale.set(dir * scale, scale, scale);
    const pose = {
      ...this.pose(ms, walked),
      roll:
        p.roll && ms < p.settle
          ? roll +
            Math.sin(span(ms, p.travel, p.settle - p.travel) * Math.PI * 2) *
              0.12 *
              (ms > p.travel ? 1 : 0)
          : 0,
    };
    pumpkinPose(actor, pose);
    actor.updateMatrixWorld(true);
    this.placeArms(ms, b, q, side, bite);
    if (p.burst && ms >= p.pop) this.burst(ms, floor, scale);
    actor.updateMatrixWorld(true);
    this.updateWound(ms, b, q, bite, scale, side);
    this.updateEnding(ms, b, q, bite, floor, scale, side);
  }

  /** Vine hands grip the card above and below the bite while the jaws hold it. */
  private placeArms(ms: number, b: TargetBounds, q: CardPose, side: Side, bite: Point) {
    const p = this.plan;
    const grip = ease((ms - p.bite + 160) / 160) * (1 - ease((ms - p.tear - 120) / 200));
    const flail = ms < p.travel ? Math.sin(ms / 90) : 0;
    this.model.arms.forEach((arm, i) => {
      const rest = {
        x: 2 + 2 * flail * (i ? -1 : 1),
        y: -9 + 4 * Math.abs(flail) + 6 * pulse(ms, p.ending + 600, 600) * (p.burst ? 0 : 1),
      };
      if (grip <= 0) {
        reach(arm, rest.x, rest.y, -1);
        return;
      }
      const v = (bite.y - b.top) / b.height + (i ? 0.13 : -0.13);
      const edge = cardPoint(
        q,
        {
          x: side > 0 ? b.left + b.width * 0.02 : b.left + b.width * 0.98,
          y: b.top + b.height * clamp(v),
        },
        b,
      );
      // The trick object sits at the world origin, so it serves as world space for the target.
      const target = localTarget(arm, this.object, edge.x, -edge.y);
      reach(arm, mix(rest.x, target.x, grip), mix(rest.y, target.y, grip), -1);
    });
  }

  /** The swollen pumpkin blows apart into its own rib pieces, which tumble and settle on the floor. */
  private burst(ms: number, floor: number, scale: number) {
    const p = this.plan,
      m = this.model;
    const t = (ms - p.pop) / 1000;
    const shell = m.shell;
    m.upper.rotation.z = 0;
    m.lower.rotation.z = 0;
    m.maw.visible = false;
    for (const s of m.strands) s.visible = false;
    for (const c of m.cracks) c.visible = false;
    const floorLocal = (-floor - this.actor.position.y) / scale;
    const gravity = 300;
    m.ribs.forEach((rib, i) => {
      const flight = this.flights[i];
      if (!flight) return;
      const group = rib.upper ? m.upper : m.lower;
      // Start from where the piece sat in the swollen shell, in actor space.
      const sx = rib.home.x + PUMPKIN_HINGE.x,
        sy = (rib.upper ? 4 : -4) + PUMPKIN_HINGE.y;
      const startX = shell.scale.x * sx,
        startY = shell.position.y + shell.scale.y * sy;
      const out = 26 + (i % 5) * 7;
      const vx = Math.cos(rib.angle) * out,
        vy = 40 + (i % 4) * 14 + (rib.upper ? 25 : 0);
      const land =
        (vy + Math.sqrt(vy * vy + 2 * gravity * Math.max(0, startY - floorLocal))) / gravity;
      const s = Math.min(t, land);
      const x = startX + vx * s,
        y = startY + vy * s - 0.5 * gravity * s * s;
      const settle = ease((t - land) / 0.25);
      rib.mesh.position.set(
        x / shell.scale.x - PUMPKIN_HINGE.x,
        (y - shell.position.y) / shell.scale.y - PUMPKIN_HINGE.y,
        rib.home.z,
      );
      rib.mesh.rotation.set(
        flight.spin.x * s * (1 - settle),
        -rib.angle + flight.spin.y * s + flight.yaw * settle,
        flight.spin.z * s * (1 - settle) + (Math.PI / 2) * settle,
      );
      if (t > land) {
        // Rest each piece on its real lowest vertex.
        group.updateMatrixWorld(true);
        const lowest = lowestWorldY(rib.mesh);
        rib.mesh.position.y += (-floor - lowest) / (scale * shell.scale.y);
      }
    });
    // The carved face panel, the toothed jaw and the stem blow out as pieces of their own.
    m.pieces.forEach((piece, i) => {
      const vx = [34, 22, -18][i] ?? 20,
        vy = [70, 30, 95][i] ?? 50;
      const startY = shell.position.y + shell.scale.y * (i === 1 ? -1 : i === 2 ? 12 : 5);
      const land =
        (vy + Math.sqrt(vy * vy + 2 * gravity * Math.max(0, startY - floorLocal))) / gravity;
      const s = Math.min(t, land);
      const settle = ease((t - land) / 0.25);
      piece.position.set(
        (vx * s) / shell.scale.x,
        (vy * s - 0.5 * gravity * s * s) / shell.scale.y,
        0,
      );
      piece.rotation.set(
        -(Math.PI / 2) * settle * (i === 2 ? 0 : 1),
        0,
        (i === 2 ? 1.4 : -1.1) * Math.min(1, s * 3),
      );
      if (t > land) {
        piece.updateMatrixWorld(true);
        const lowest = lowestWorldY(piece);
        piece.position.y += (-floor - lowest) / (scale * shell.scale.y);
      }
    });
    // The candle falls out and keeps burning on the floor, then gutters out.
    const fall = Math.min(1, t / 0.35);
    const candleFloor = (floorLocal - shell.position.y) / shell.scale.y + 3;
    m.candle.position.set(-1, mix(-3, candleFloor, fall * fall), 0);
    m.flame.visible = t < 1.25;
    m.flame.scale.multiplyScalar(Math.max(0.05, 1 - span(t, 0.9, 0.35)));
    // Limbs collapse onto the floor where the body stood.
    m.legs.forEach((leg, i) => {
      leg.root.position.y = mix(leg.root.position.y, 2.2, ease(t / 0.3));
      reach(leg, 9 + i * 2, -0.6, 1, 0);
    });
    m.arms.forEach((arm, i) => {
      const lie = localTarget(arm, this.actor, i ? -14 : 14, floorLocal + 1);
      reach(arm, lie.x, lie.y, -1);
    });
  }

  private updateWound(
    ms: number,
    b: TargetBounds,
    q: CardPose,
    bite: Point,
    scale: number,
    side: Side,
  ) {
    const p = this.plan;
    const fade = 1 - ease((ms - (PUMPKIN_DURATION - 500)) / 450);
    const turn = cardTurn(q);
    const bitten = ms >= p.bite && fade > 0;
    const torn = ease((ms - p.tear - 120) / 200);
    const centre = cardPoint(q, { x: bite.x + side * 3 * scale, y: bite.y }, b);
    this.wound.visible = this.flesh.visible = bitten && torn > 0;
    this.wound.position.set(centre.x, -centre.y, DEPTH - 14);
    this.wound.rotation.z = turn;
    this.wound.scale.set(7 * scale * torn, 8.5 * scale * torn, 1);
    this.wound.material.opacity = 0.92 * fade;
    this.flesh.position.set(centre.x, -centre.y, DEPTH - 13.9);
    this.flesh.rotation.z = turn + 0.5;
    this.flesh.scale.set(3.6 * scale * torn, 4.4 * scale * torn, 1);
    this.flesh.material.opacity = 0.9 * fade;
    this.toothMarks.forEach((mark, i) => {
      const a = ((i - 2) / 2) * 1.1;
      const at = cardPoint(
        q,
        { x: bite.x + side * (Math.cos(a) * 7.5 * scale - 1), y: bite.y + Math.sin(a) * 9 * scale },
        b,
      );
      mark.visible = bitten;
      mark.position.set(at.x, -at.y, DEPTH - 13.8);
      mark.rotation.z = turn + a + (side > 0 ? Math.PI : 0);
      mark.scale.setScalar(1.2 * scale);
      mark.material.opacity = 0.85 * fade;
    });
    this.drips.forEach((drip, i) => {
      const length = (3 + 18 * ease((ms - p.tear - 150) / 1300)) * (i ? 0.7 : 1) * scale;
      drip.visible = bitten && torn > 0;
      if (!drip.visible) return;
      setStrip(
        drip.geometry,
        8,
        (s, out) => {
          const at = cardPoint(
            q,
            {
              x: bite.x + side * (2 + i * 3) * scale + Math.sin(s * 5 + i) * 0.6,
              y: bite.y + 5 * scale + s * length,
            },
            b,
          );
          out.set(at.x, -at.y, DEPTH - 13.7);
        },
        (s) => (1.5 - 0.8 * s) * scale,
      );
      drip.material.opacity = fade;
    });
  }

  private updateEnding(
    ms: number,
    b: TargetBounds,
    q: CardPose,
    bite: Point,
    floor: number,
    scale: number,
    side: Side,
  ) {
    const p = this.plan;
    const fade = 1 - ease((ms - (PUMPKIN_DURATION - 500)) / 450);
    const centre = {
      x: this.actor.position.x,
      y: -this.actor.position.y - PUMPKIN_CENTER.y * scale,
    };
    const burstAge = (ms - p.pop) / 1000;
    this.debris.forEach((d) => {
      const live = p.burst && burstAge >= 0 && fade > 0;
      d.mesh.visible = live;
      if (!live) return;
      const g = 420;
      const drop = Math.max(0, floor - centre.y);
      const land = (-d.vy + Math.sqrt(d.vy * d.vy + 2 * g * drop)) / g;
      const s = Math.min(burstAge, land);
      const x = centre.x + d.vx * s;
      const y = Math.min(floor, centre.y + d.vy * s + 0.5 * g * s * s);
      const landed = burstAge >= land;
      d.mesh.position.set(x, -y, DEPTH + (landed ? -12 : 6));
      d.mesh.rotation.z = d.spin * s;
      d.mesh.scale.set(
        d.size * scale * (landed ? 1.5 : 1),
        d.size * scale * (landed ? 0.45 : 1),
        1,
      );
      d.mesh.material.opacity = fade;
    });
    // Pulp and gore splat onto the card and slide slowly down it.
    const splatAt = p.burst ? p.pop + 60 : p.ending + 420;
    this.splats.forEach((splat, i) => {
      const live = ms >= splatAt && fade > 0 && (p.burst || i < 2);
      splat.visible = live;
      if (!live) return;
      const u = p.burst
        ? 0.2 + (i % 3) * 0.3
        : (bite.x - b.left) / b.width + side * (0.18 + i * 0.12);
      const v = p.burst ? 0.2 + i * 0.16 : (bite.y - b.top) / b.height - 0.1 * i;
      const slide = 0.12 * ease((ms - splatAt) / 2400);
      const at = cardPoint(
        q,
        { x: b.left + b.width * clamp(u), y: b.top + b.height * clamp(v + slide) },
        b,
      );
      splat.position.set(at.x, -at.y, DEPTH - 13 + i * 0.05);
      splat.rotation.z = cardTurn(q) + i;
      splat.scale.setScalar((2.6 + (i % 2)) * scale * ease((ms - splatAt) / 90));
      splat.material.opacity = 0.85 * fade;
    });
    // Recovery: the chunk is spat back at the card, then a fiery belch.
    const mouth = screenOf(this.model.bite);
    const spitT = span(ms, p.ending + 380, 200);
    this.spat.visible = !p.burst && spitT > 0 && spitT < 1;
    const target = cardPoint(q, { x: bite.x + side * 0.18 * b.width, y: bite.y }, b);
    this.spat.position.set(
      mix(mouth.x, target.x, spitT),
      -(mix(mouth.y, target.y, spitT) - Math.sin(Math.PI * spitT) * 12 * scale),
      DEPTH + 8,
    );
    this.spat.scale.setScalar(2.4 * scale);
    const belchT = span(ms, p.ending + 700, 520);
    this.belch.visible = !p.burst && belchT > 0 && belchT < 1;
    this.belch.position.set(
      mouth.x + side * 10 * belchT * scale,
      -mouth.y + 4 * belchT * scale,
      DEPTH + 9,
    );
    this.belch.scale.setScalar((2 + 9 * belchT) * scale);
    this.belch.material.opacity = 0.85 * Math.sin(Math.PI * belchT);
    // A thin smoke wisp rises as the dropped candle gutters out.
    const out = p.burst ? span(ms, p.pop + 1150, 700) : 0;
    this.smoke.visible = out > 0 && out < 1;
    this.smoke.position.set(centre.x, -(floor - 6 - 20 * out), DEPTH + 4);
    this.smoke.scale.set(2 * scale, (3 + 6 * out) * scale, 1);
    this.smoke.material.opacity = 0.5 * Math.sin(Math.PI * out);
  }
}
