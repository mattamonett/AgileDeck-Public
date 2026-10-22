import * as THREE from 'three';
import { type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFit,
  clamp,
  ease,
  keepInView,
  localTarget,
  lowestWorldY,
  mix,
  mixPoint,
  onCard,
  pulse,
  reach,
  screenOf,
  sideOf,
  sideRoute,
  span,
  type CharacterRoutine,
  type Limb,
  type Side,
} from '../../kit';
import {
  DEPTH_SQUASH,
  KICK_REACH,
  PAT_INTERVAL,
  SNOWMAN_GRAVITY,
  snowmanBlastAt,
  SNOWMAN_DURATION,
  STEP_BACK,
  snowmanBallRadius,
  snowmanBeat,
  snowmanCardPose,
  snowmanCarrotOffset,
  snowmanFrames,
  snowmanFrost,
  snowmanLandingPoint,
  snowmanLead,
  snowmanPatContact,
  snowmanProgress,
  snowmanScale,
  type SnowmanPlan,
} from './snowman-choreography';
import {
  CARROT_LENGTH,
  MITTEN_GRIP,
  ROLL_CENTRE,
  SNOWMAN_ANKLE,
  SNOWMAN_STRIDE,
  buildCarrot,
  snowmanModel,
  snowmanPose,
  type SnowmanModel,
  type SnowmanPose,
} from './snowman-model';
import { SnowmanBurst } from './snowman-burst';
import { SnowmanFrost } from './snowman-frost';
import {
  buildSculpture,
  buildSnowball,
  type SculpturePiece,
  type SculptureVolume,
} from './snowman-sculpture';

const DEPTH = 176;
const ROUTE = 64;
const SPIN_STEPS = 48;

function mixAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Everything that depends on the live layout but not on the moment: recomputed every frame. */
interface Stage {
  readonly start: Point;
  readonly b: TargetBounds;
  readonly view: Point;
  readonly side: Side;
  readonly fit: number;
  readonly sc: number;
  readonly floor: number;
  /** Arrival stand, where the snowball rests against the card. */
  readonly stand: Point;
  /** Admiring stand, one step back. */
  readonly back: Point;
  readonly length: number;
  /** Floor point under the fallen carrot's centre. */
  readonly carrot: Point;
  readonly fetchDir: Side;
  /** Stand from which Flurry kicks the carrot up. */
  readonly kickStand: Point;
  readonly exitDir: Side;
  readonly exit: Point;
  /** Floor point under the finished snowball and the sculpture. */
  readonly base: Point;
}
interface BallState {
  readonly centre: Point;
  readonly rx: number;
  readonly ry: number;
}

export class SnowmanTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: SnowmanPlan;
  readonly duration: number;
  private readonly model: SnowmanModel;
  private readonly actor: THREE.Group;
  private readonly ball = new THREE.Group();
  private readonly spin = new THREE.Group();
  private readonly sculpture = new THREE.Group();
  private readonly pieces: readonly SculpturePiece[];
  /** Sculpture volumes as [x, y, radius] in sculpture units: where the chunks come from. */
  private readonly volumes: readonly SculptureVolume[];
  private readonly flat: number;
  private readonly burst: SnowmanBurst;
  private readonly frost: SnowmanFrost;
  /** The carrot once it has left the face: flies, rests on the floor, is kicked up, caught and refitted. */
  readonly carrot: THREE.Group;
  private readonly routeX = new Float64Array(ROUTE + 1);
  private readonly routeY = new Float64Array(ROUTE + 1);
  private readonly routeS = new Float64Array(ROUTE + 1);
  private readonly launchPos = new THREE.Vector3();
  private readonly launchQuat = new THREE.Quaternion();
  private readonly homePos = new THREE.Vector3();
  private readonly homeQuat = new THREE.Quaternion();
  private readonly restQuat = new THREE.Quaternion();
  private readonly carryQuat = new THREE.Quaternion();
  private readonly scratch = new THREE.Vector3();
  private readonly scratchQuat = new THREE.Quaternion();
  private readonly turnQuat = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3();
  private readonly launchAxis = new THREE.Vector3();
  private readonly homeAxis = new THREE.Vector3();
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly blastAt: number;

  constructor(actor: THREE.Group) {
    this.actor = actor;
    this.model = snowmanModel(actor);
    this.plan = this.model.plan;
    this.duration = SNOWMAN_DURATION * this.plan.pace;
    this.object.name = 'snowman-sculpting';
    this.blastAt = snowmanBlastAt(this.plan);
    const p = this.plan;

    // The pushed snowball: lumps, a twig and a holly leaf make its rolling visible.
    this.ball.name = 'snowman-snowball';
    this.spin.name = 'snowman-snowball-spin';
    this.object.add(this.ball);
    this.ball.add(this.spin);
    buildSnowball(this.spin);

    this.sculpture.name = 'snowman-sculpture';
    this.object.add(this.sculpture);
    const sculpted = buildSculpture(this.sculpture, this.plan);
    this.flat = sculpted.flat;
    this.pieces = sculpted.pieces;
    this.volumes = sculpted.volumes;
    this.burst = new SnowmanBurst(this.object, p, this.sculpture, this.volumes, DEPTH);

    this.frost = new SnowmanFrost(this.object, p.phase, DEPTH);

    this.carrot = buildCarrot(this.object, 'snowman-loose-carrot');
    this.carrot.visible = false;
  }

  cardAnimation(facing: number) {
    return snowmanFrames(this.plan, facing);
  }

  // ---------------------------------------------------------------- layout and route

  private stage(start: Point, b: TargetBounds, view: Point, side: Side): Stage {
    const p = this.plan,
      sc = snowmanScale(b),
      fit = cardFit(b);
    const stand = keepInView(snowmanLandingPoint(p, b, view, side), view, 16, 40);
    const floor = stand.y;
    const back = { x: stand.x - side * STEP_BACK * sc, y: floor };
    const fetchDir: Side = p.noseBounce ? (side > 0 ? -1 : 1) : side;
    const inView = (x: number) => Math.max(24, Math.min(view.x - 24, x));
    const carrot = { x: inView(back.x + side * snowmanCarrotOffset(p) * sc), y: floor };
    const kickStand = { x: inView(carrot.x - fetchDir * KICK_REACH * sc), y: floor };
    const exitDir: Side = p.exitAway ? (side > 0 ? -1 : 1) : side;
    // Rolling past the card keeps low, in front of its bottom edge.
    const rise = p.exitAway ? p.exitRise * 28 : 44 + 12 * Math.abs(p.exitRise);
    const exit = {
      x: exitDir > 0 ? view.x + 95 : -95,
      y: Math.max(60, Math.min(view.y - 20, floor + rise)),
    };
    const base = { x: stand.x + side * snowmanLead(p.ballEnd) * sc, y: floor };
    const length = this.measure(start, stand, b, view, side);
    return {
      start,
      b,
      view,
      side,
      fit,
      sc,
      floor,
      stand,
      back,
      length,
      carrot,
      fetchDir,
      kickStand,
      exitDir,
      exit,
      base,
    };
  }

  private routeRaw(
    u: number,
    start: Point,
    stand: Point,
    b: TargetBounds,
    view: Point,
    side: Side,
  ): Point {
    const p = this.plan;
    const at = sideRoute(start, stand, b, view, side, p.bend, u);
    const a = sideRoute(start, stand, b, view, side, p.bend, Math.max(0, u - 0.01)),
      c = sideRoute(start, stand, b, view, side, p.bend, Math.min(1, u + 0.01));
    const dx = c.x - a.x,
      dy = c.y - a.y,
      l = Math.hypot(dx, dy) || 1;
    const w = p.wander * Math.sin(Math.PI * u) ** 2 * Math.sin(Math.PI * p.waves * u + p.wavePhase);
    return keepInView({ x: at.x - (dy / l) * w, y: at.y + (dx / l) * w }, view, 16, 40);
  }
  private measure(start: Point, stand: Point, b: TargetBounds, view: Point, side: Side): number {
    let length = 0;
    for (let i = 0; i <= ROUTE; i++) {
      const at = this.routeRaw(i / ROUTE, start, stand, b, view, side);
      if (i)
        length += Math.hypot(
          at.x - (this.routeX[i - 1] ?? at.x),
          at.y - (this.routeY[i - 1] ?? at.y),
        );
      this.routeX[i] = at.x;
      this.routeY[i] = at.y;
      this.routeS[i] = length;
    }
    return length;
  }
  /** Point at a fraction of the route's length, so the pushing speed is exactly the planned one. */
  private pointAt(s: number): Point {
    const total = this.routeS[ROUTE] ?? 0,
      target = clamp(s) * total;
    let i = 0;
    while (i < ROUTE - 1 && (this.routeS[i + 1] ?? 0) < target) i++;
    const s0 = this.routeS[i] ?? 0,
      s1 = this.routeS[i + 1] ?? s0;
    const f = s1 > s0 ? (target - s0) / (s1 - s0) : 0;
    return {
      x: mix(this.routeX[i] ?? 0, this.routeX[i + 1] ?? 0, f),
      y: mix(this.routeY[i] ?? 0, this.routeY[i + 1] ?? 0, f),
    };
  }
  /** Pushing direction, squared up to the card over the last stretch. */
  private headingAt(s: number, side: Side): Point {
    const a = this.pointAt(Math.max(0, s - 0.03)),
      c = this.pointAt(Math.min(1, s + 0.03));
    let x = c.x - a.x,
      y = c.y - a.y;
    const l = Math.hypot(x, y);
    if (l < 1e-6) return { x: side, y: 0 };
    const square = ease((s - 0.72) / 0.28);
    x = mix(x / l, side, square);
    y = mix(y / l, 0, square);
    const m = Math.hypot(x, y);
    return m < 1e-6 ? { x: side, y: 0 } : { x: x / m, y: y / m };
  }
  /** Floor point under the pushed snowball for route fraction s. */
  private ballFloor(s: number, g: Stage): Point {
    if (s >= 1) return g.base;
    const at = this.pointAt(s),
      h = this.headingAt(s, g.side),
      lead = snowmanLead(snowmanBallRadius(this.plan, s)) * g.sc;
    return { x: at.x + h.x * lead, y: at.y + h.y * lead * DEPTH_SQUASH };
  }

  // ---------------------------------------------------------------- timing helpers

  rootAt(ms: number, g: Stage): Point {
    const p = this.plan;
    if (ms < p.travel) return this.pointAt(snowmanProgress(p, ms / p.travel));
    if (ms < p.fetch)
      return { x: mix(g.stand.x, g.back.x, ease((ms - p.admire) / 300)), y: g.floor };
    if (ms < p.roll) {
      const walk = ease((ms - p.fetch) / (p.kick - 220 - p.fetch));
      // Rocks back once before setting off.
      const rock = -g.exitDir * 1.6 * g.sc * pulse(ms, p.roll - 280, 280);
      return { x: mix(g.back.x, g.kickStand.x, walk) + rock, y: g.floor };
    }
    const t = span(ms, p.roll, p.exitEnd - p.roll),
      e = t * t * (1.6 - 0.6 * t);
    return mixPoint(g.kickStand, g.exit, e);
  }
  private inhale(ms: number): number {
    const p = this.plan;
    let breath: number;
    if (p.fakeOut) {
      // Ah... ah... it fades, relief... then AH-CHOO.
      breath =
        0.85 * ease((ms - p.inhale) / 500) -
        0.75 * ease((ms - p.inhale - 500) / 300) +
        0.9 * ease((ms - p.inhale - 950) / 300);
    } else {
      const u = span(ms, p.inhale, p.sneeze - p.inhale);
      breath = ease(u) * (1 - 0.15 * Math.sin(Math.PI * 3 * u) ** 2);
    }
    return breath * (1 - ease((ms - p.sneeze) / 70));
  }
  private snap(ms: number): number {
    const p = this.plan;
    return ms < p.sneeze ? 0 : ease((ms - p.sneeze) / 70) * (1 - ease((ms - p.sneeze - 120) / 450));
  }
  private flatten(ms: number): number {
    return this.flat * ease((ms - snowmanPatContact(this.plan, 0) + 40) / 140);
  }
  private patOf(step: number): number {
    return Math.min(step, this.plan.pats - 1);
  }

  // ---------------------------------------------------------------- the actor

  private pose(ms: number, g: Stage): SnowmanPose {
    const p = this.plan,
      side = g.side;
    const t = ms / p.travel,
      approaching = ms < p.travel;
    const s = approaching ? snowmanProgress(p, t) : 1;
    const h = approaching ? this.headingAt(s, side) : { x: side, y: 0 };
    const at = this.rootAt(ms, g);
    const walked = approaching
      ? (s * g.length) / g.sc
      : g.length / g.sc + ((at.x - g.stand.x) * side) / g.sc;
    const beat = approaching ? snowmanBeat(p, t) : 0;
    const wobble = p.beat === 'wobble' ? beat : 0,
      sniffle = p.beat === 'sniffle' ? beat : 0;
    const cycle = Math.sin((walked / SNOWMAN_STRIDE) * Math.PI * 2);
    const inh = this.inhale(ms),
      snap = this.snap(ms);
    const walkEnd = p.kick - 220;
    let planted = approaching ? ease((t - 0.9) / 0.1) : 1;
    planted = Math.min(
      planted,
      1 - pulse(ms, p.admire, 300),
      1 - pulse(ms, p.fetch, walkEnd - p.fetch),
    );

    let yaw = 0.95 * h.x;
    yaw = mix(yaw, side * 0.8, ease((ms - p.travel) / 250));
    yaw = mix(yaw, side * 0.5, ease((ms - p.admire - 250) / 300));
    yaw = mix(yaw, side * 0.85, ease((ms - p.inhale) / 300));
    yaw = mix(yaw, side * 0.45, ease((ms - p.sneeze - 350) / 300));
    yaw = mix(yaw, g.fetchDir * 0.85, ease((ms - p.fetch + 100) / 300));
    yaw = mix(yaw, g.fetchDir * 0.35, ease((ms - p.refitEnd) / 260));
    yaw = mix(yaw, 0, ease((ms - p.tuck) / 320));

    const kickLeg: 0 | 1 = g.fetchDir > 0 ? 1 : 0;
    const kickWeight = ease((ms - (p.kick - 300)) / 80) * (1 - ease((ms - (p.kick + 200)) / 160));
    let lean = 0.36 * h.x + 0.05 * cycle * (1 - planted) + 0.2 * wobble * Math.sin(ms / 55);
    lean = mix(lean, side * 0.16, ease((ms - p.travel) / 280));
    for (let i = 0; i < p.pats; i++)
      lean += side * 0.07 * pulse(ms, snowmanPatContact(p, i) - 150, 260);
    lean = mix(lean, -side * 0.05 + 0.04 * Math.sin(ms / 170), ease((ms - p.buildEnd) / 300));
    lean = mix(lean, -side * 0.12 * inh + side * 0.32 * snap, ease((ms - p.inhale) / 200));
    lean = mix(lean, 0.05 * Math.sin((ms - p.sneeze) / 150), ease((ms - p.sneeze - 600) / 300));
    lean = mix(lean, g.fetchDir * 0.08 + 0.05 * cycle * (1 - planted), ease((ms - p.fetch) / 200));
    lean -= g.fetchDir * 0.12 * kickWeight;
    lean = mix(lean, 0, ease((ms - p.tuck) / 300));

    let crouch = approaching ? 0.5 + 2.2 * (1 - Math.abs(h.x)) : 0.5;
    crouch = mix(crouch, 0, ease((ms - p.buildEnd) / 300));

    let squash = approaching ? 0.12 * Math.abs(cycle) * (1 - planted) : 0;
    squash += 0.35 * pulse(ms, p.travel - 60, 260);
    for (let i = 0; i < p.pats; i++) squash += 0.12 * pulse(ms, snowmanPatContact(p, i) - 30, 160);
    squash +=
      0.3 *
      Math.max(0, Math.sin((ms - p.admire - 300) / 95)) *
      pulse(ms, p.admire + 300, p.inhale - p.admire - 300);
    squash += -0.45 * inh + 0.9 * snap;
    squash +=
      0.35 *
      Math.max(0, Math.sin((ms - p.refitEnd) / 90)) *
      pulse(ms, p.refitEnd, p.tuck - p.refitEnd);

    let nod = -0.28 * sniffle * (0.6 + 0.4 * Math.sin(ms / 60));
    nod = mix(nod, 0.2, ease((ms - p.travel) / 250));
    for (let i = 0; i < p.pats; i++) nod += 0.08 * pulse(ms, snowmanPatContact(p, i) - 60, 220);
    nod = mix(nod, -0.1, ease((ms - p.buildEnd) / 300));
    nod = mix(nod, -0.5 * inh + 0.55 * snap, ease((ms - p.inhale) / 200));
    nod = mix(nod, 0.05, ease((ms - p.sneeze - 500) / 300));
    nod = mix(nod, 0.28, ease((ms - p.fetch + 200) / 250));
    nod = mix(
      nod,
      0.3 - 0.55 * span(ms, p.kick, p.catchAt - p.kick),
      ease((ms - p.kick + 80) / 120),
    );
    nod = mix(nod, 0.02, ease((ms - p.catchAt) / 200));
    nod = mix(nod, -0.08, ease((ms - p.refitEnd) / 200));
    nod = mix(nod, 0.35, ease((ms - p.tuck) / 320));

    // Looking round for the missing nose.
    let headYaw =
      0.75 *
      Math.sin((ms - p.sneeze - 350) / 210) *
      pulse(ms, p.sneeze + 350, p.fetch - p.sneeze - 350);
    headYaw = mix(headYaw, g.exitDir * 0.9, ease((ms - p.tuck) / 320));
    let headRoll = 0.18 * wobble * Math.sin(ms / 70);
    headRoll += side * 0.22 * pulse(ms, p.buildEnd + 100, p.inhale - p.buildEnd - 100);
    headRoll +=
      0.16 * Math.sin((ms - p.refitEnd) / 75) * pulse(ms, p.refitEnd, p.tuck - p.refitEnd);

    let blink = 0;
    for (let k = 0; k < 6; k++)
      blink = Math.max(blink, pulse(ms, 900 + k * 2100 + p.phase * 60, 150));
    blink = Math.max(
      blink,
      0.55 * inh,
      snap,
      0.6 * sniffle,
      pulse(ms, p.sneeze + 420, 140),
      pulse(ms, p.sneeze + 600, 140),
    );
    const squint = Math.max(
      ease((ms - p.admire - 250) / 150) * (1 - ease((ms - p.inhale + 100) / 150)),
      ease((ms - p.refitEnd - 60) / 120) * (1 - ease((ms - p.tuck - 200) / 150)),
      p.fakeOut ? 0.7 * pulse(ms, p.inhale + 520, 420) : 0,
    );
    const mouth = Math.max(
      0.9 * inh,
      snap > 0.05 ? snap : 0,
      0.5 * pulse(ms, p.sneeze + 400, 400),
      0.3 * sniffle,
    );
    const twitch =
      0.3 * sniffle * Math.sin(ms / 32) +
      0.22 * inh * Math.sin(ms / 28) +
      0.35 * pulse(ms, p.refitEnd, 320) * Math.sin(ms / 38);

    const tuck = ease((ms - p.tuck) / (p.roll - p.tuck - 60));
    const roll = ms >= p.tuck ? -(at.x - g.kickStand.x) / (ROLL_CENTRE * g.sc) : 0;
    // Scarf tails and pompom lag behind the body's real motion; while rolling the tails stream behind.
    const before = this.rootAt(ms - 60, g);
    const speed = (at.x - before.x) / 60 / g.sc;
    const swing = Math.max(-1.3, Math.min(1.3, -speed * 5)) + side * 0.6 * snap;
    const flutter = Math.sin(ms / 85 + p.phase) * Math.min(0.25, Math.abs(speed) * 3 + 0.05);
    let kick: SnowmanPose['kick'] = null;
    if (kickWeight > 0) {
      const hipX = kickLeg ? 2.6 : -2.6;
      const touch = (g.carrot.x - g.kickStand.x) / g.sc - g.fetchDir * 2.4;
      const wind = { x: hipX * 0.9 - g.fetchDir * 1.3, y: SNOWMAN_ANKLE + 1.5 };
      let foot = mixPoint(
        wind,
        { x: touch, y: SNOWMAN_ANKLE + 0.25 },
        ease((ms - (p.kick - 90)) / 90),
      );
      foot = mixPoint(
        foot,
        { x: touch + g.fetchDir * 1.2, y: SNOWMAN_ANKLE + 3 },
        ease((ms - p.kick) / 140),
      );
      kick = { leg: kickLeg, x: foot.x, y: foot.y, weight: kickWeight };
    }
    return {
      walked,
      heading: h,
      planted,
      yaw,
      lean,
      crouch,
      squash,
      nod,
      headYaw,
      headRoll,
      blink,
      squint,
      mouth,
      noseOn: ms < p.sneeze || ms >= p.refitEnd,
      twitch,
      tuck,
      exitDir: g.exitDir,
      roll,
      tails: [swing + 0.14 + flutter - roll, swing - 0.12 - flutter * 0.8 - roll],
      curl: -swing * 0.35 + flutter,
      pompom: Math.max(-0.8, Math.min(0.8, -speed * 4 - side * 0.5 * snap + 0.25 * inh)),
      kick,
    };
  }

  private placeActor(ms: number, g: Stage) {
    const at = this.rootAt(ms, g);
    this.actor.position.set(at.x, -at.y, DEPTH);
    this.actor.rotation.set(0, 0, 0);
    this.actor.scale.setScalar(g.sc);
    snowmanPose(this.actor, this.pose(ms, g));
  }

  /** The worn carrot's world transform at another moment, measured on the real posed model. */
  private measureCarrot(
    ms: number,
    g: Stage,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
  ) {
    this.placeActor(ms, g);
    this.model.carrot.updateWorldMatrix(true, false);
    this.model.carrot.matrixWorld.decompose(position, quaternion, this.scratch);
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
    const live = ms < SNOWMAN_DURATION;
    this.object.visible = live;
    this.object.position.set(0, 0, 0);
    const g = this.stage(start, b, view, side);
    // Measuring poses the shared actor, so it happens before this frame's pose.
    this.measureCarrot(p.sneeze, g, this.launchPos, this.launchQuat);
    this.measureCarrot(p.refitEnd, g, this.homePos, this.homeQuat);
    const q = snowmanCardPose(p, ms, side);
    this.placeActor(ms, g);
    actor.visible = live;
    actor.updateMatrixWorld(true);
    const ball = this.updateBall(ms, g);
    this.updateSculpture(ms, g);
    this.updateCarrot(ms, g);
    this.placeArms(ms, g, ball);
    if (ms >= p.tuck) {
      // Tucked up, Flurry rests on whatever part of him is lowest: the ball, the nose or the pompom.
      actor.updateMatrixWorld(true);
      actor.position.y += -this.rootAt(ms, g).y - lowestWorldY(actor);
    }
    actor.updateMatrixWorld(true);
    const fade = 1 - ease((ms - (SNOWMAN_DURATION - 650)) / 550);
    this.burst.update(ms, g, fade, this.noseTip(g.sc), (k) => this.patPuffPoint(k, g));
    this.frost.update(snowmanFrost(this.plan, ms), g, q, fade);
  }

  // ---------------------------------------------------------------- snowball and sculpture

  private updateBall(ms: number, g: Stage): BallState {
    const p = this.plan;
    const t = ms / p.travel,
      approaching = ms < p.travel;
    const s = approaching ? snowmanProgress(p, t) : 1;
    const floor = this.ballFloor(s, g);
    const radius = snowmanBallRadius(p, s);
    const squish = 0.07 * pulse(ms, snowmanPatContact(p, 0) - 30, 170);
    const flat = this.flatten(ms) + squish;
    const rx = radius * (1 + 0.5 * flat) * g.sc,
      ry = radius * (1 - flat) * g.sc;
    const hop =
      approaching && p.beat === 'wobble' ? 3.2 * g.sc * pulse(t, p.beatAt - 0.05, 0.1) : 0;
    const centre = { x: floor.x, y: floor.y - ry - hop };
    const h = approaching ? this.headingAt(s, g.side) : { x: g.side, y: 0 };
    this.ball.visible = ms < this.blastAt;
    this.ball.position.set(centre.x, -centre.y, DEPTH + 3 + h.y * 12);
    this.ball.scale.set(rx, ry, radius * g.sc);
    this.rollSpin(s, g, this.spin.quaternion);
    return { centre, rx, ry };
  }
  /** Integrates the rolling along the ball's real path, so its turn matches the distance and growing radius. */
  private rollSpin(s: number, g: Stage, out: THREE.Quaternion) {
    out.identity();
    let previous = this.ballFloor(0, g);
    for (let k = 1; k <= SPIN_STEPS; k++) {
      const u = (s * k) / SPIN_STEPS;
      const at = this.ballFloor(Math.min(u, 0.9999), g);
      const dx = at.x - previous.x,
        dy = at.y - previous.y,
        d = Math.hypot(dx, dy);
      previous = at;
      if (d < 1e-6) continue;
      // Screen down is toward the viewer on the floor, so the roll axis lies in the floor plane.
      this.axis.set(dy / d, 0, -dx / d);
      const radius = snowmanBallRadius(this.plan, u - s / SPIN_STEPS / 2) * g.sc;
      out.premultiply(this.turnQuat.setFromAxisAngle(this.axis, d / radius));
    }
  }

  private pieceScale(piece: SculpturePiece, ms: number): number {
    let target = 0,
      previous = 0,
      from = -Infinity;
    for (const [step, scale] of piece.keys) {
      const at = snowmanPatContact(this.plan, this.patOf(step)) - 40;
      if (ms >= at) {
        previous = target;
        target = scale;
        from = at;
      }
    }
    if (target === 0) return 0;
    const k = ms - from,
      grow = ease(k / 110);
    return (
      (previous + (target - previous) * grow) *
      (1 + 0.16 * Math.sin(k / 38) * Math.exp(-k / 120) * grow)
    );
  }
  private updateSculpture(ms: number, g: Stage) {
    this.sculpture.position.set(g.base.x, -g.base.y, DEPTH + 3.5);
    this.sculpture.scale.set(g.side * g.sc, g.sc, g.sc);
    this.sculpture.visible = ms < this.blastAt;
    for (const piece of this.pieces) {
      const scale = this.pieceScale(piece, ms);
      piece.group.visible = scale > 0.001;
      piece.group.scale.setScalar(Math.max(0.001, scale));
    }
    this.sculpture.updateMatrixWorld(true);
  }
  /** The surface Flurry pats on pat i: the top of whatever he built last, or the snowball itself. */
  private patTarget(i: number, ball: BallState, g: Stage): { contact: Point; aim: Point } {
    let marker: THREE.Object3D | null = null;
    for (const piece of this.pieces)
      if (piece.marker && this.patOf(piece.keys[0]?.[0] ?? 0) <= i - 1) marker = piece.marker;
    if (!marker || !marker.parent)
      return {
        contact: { x: ball.centre.x - g.side * 0.34 * ball.rx, y: ball.centre.y - 0.94 * ball.ry },
        aim: ball.centre,
      };
    return { contact: screenOf(marker), aim: screenOf(marker.parent) };
  }

  // ---------------------------------------------------------------- arms

  private grip(arm: Limb, contact: Point, aim: Point) {
    const c = localTarget(arm, this.object, contact.x, -contact.y),
      a = localTarget(arm, this.object, aim.x, -aim.y);
    let dx = a.x - c.x,
      dy = a.y - c.y;
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) {
      dx = 0;
      dy = -1;
    } else {
      dx /= l;
      dy /= l;
    }
    // The mitten points at the aim, so its palm lands exactly on the contact point.
    return {
      x: c.x - dx * MITTEN_GRIP,
      y: c.y - dy * MITTEN_GRIP,
      angle: Math.atan2(dy, dx) + Math.PI / 2,
    };
  }
  private placeArms(ms: number, g: Stage, ball: BallState) {
    const p = this.plan,
      m = this.model,
      side = g.side;
    const inh = this.inhale(ms),
      snap = this.snap(ms);
    const t = ms / p.travel;
    const wobble = ms < p.travel && p.beat === 'wobble' ? snowmanBeat(p, t) : 0;
    const patArm = side > 0 ? 1 : 0,
      catchArm = g.fetchDir > 0 ? 1 : 0;
    m.arms.forEach((arm, i) => {
      const out = i ? 1 : -1;
      let rest = { x: out * 9.5, y: -7 + 1.5 * Math.sin(ms / 140 + i) * wobble };
      // Ta-da: the near mitten presents the finished sculpture, the other waves up high.
      const near = out === side;
      const tada = near
        ? { x: out * 12.5, y: 1 + Math.sin(ms / 160) }
        : { x: out * 6, y: 11 + 1.5 * Math.sin(ms / 90) };
      rest = mixPoint(rest, tada, ease((ms - (p.buildEnd + 80)) / 220));
      rest = mixPoint(
        rest,
        { x: out * 8.5, y: -7 + 9 * inh - 5 * snap },
        ease((ms - p.inhale) / 200),
      );
      rest = mixPoint(rest, { x: out * 7, y: -10 }, ease((ms - p.sneeze - 500) / 300));
      rest = mixPoint(
        rest,
        { x: out * 7.5, y: 7 + 2 * Math.sin(ms / 80 + i * 2) },
        ease((ms - p.refitEnd - 80) / 200),
      );
      rest = mixPoint(rest, { x: -out * 1.5, y: -3 }, ease((ms - p.tuck) / 260));
      let wrist = { x: rest.x, y: rest.y, angle: Math.atan2(rest.y, rest.x) + Math.PI / 2 };
      const blend = (goal: { x: number; y: number; angle: number }, w: number) => {
        if (w <= 0) return;
        wrist = {
          x: mix(wrist.x, goal.x, w),
          y: mix(wrist.y, goal.y, w),
          angle: mixAngle(wrist.angle, goal.angle, w),
        };
      };
      const shoulder = screenOf(arm.root);
      // Pushing: both mittens on the snowball, on the side nearest each shoulder.
      const toBuild = ease((ms - (p.build - 200)) / 200);
      const pushing = (1 - (i === patArm ? 0 : toBuild)) * (1 - 0.6 * wobble);
      if (pushing > 0 && ms < this.blastAt) {
        const nx = shoulder.x - ball.centre.x,
          ny = shoulder.y - ball.centre.y,
          nl = Math.hypot(nx, ny) || 1;
        const a = Math.atan2(ny / nl, nx / nl) + out * 0.3;
        const contact = {
          x: ball.centre.x + Math.cos(a) * ball.rx,
          y: ball.centre.y + Math.sin(a) * ball.ry,
        };
        blend(this.grip(arm, contact, ball.centre), pushing);
      }
      // Patting the sculpture into shape, one pat per added piece.
      if (i === patArm) {
        const w = toBuild * (1 - ease((ms - (p.buildEnd + 40)) / 200));
        if (w > 0) {
          const k = Math.max(0, Math.min(p.pats - 1, Math.floor((ms - p.build) / PAT_INTERVAL)));
          const u = (ms - p.build - k * PAT_INTERVAL) / PAT_INTERVAL;
          let hover = u < 0.577 ? 1 - ease(u / 0.577) : u < 0.75 ? 0 : ease((u - 0.75) / 0.25);
          if (ms < p.build) hover = 1;
          const now = this.patTarget(k, ball, g),
            next = this.patTarget(Math.min(p.pats - 1, k + 1), ball, g);
          const move = k < p.pats - 1 ? ease((u - 0.6) / 0.4) : 0;
          const surface = mixPoint(now.contact, next.contact, move),
            aim = mixPoint(now.aim, next.aim, move);
          const contact = {
            x: surface.x - side * 0.8 * g.sc * hover,
            y: surface.y - 3.5 * g.sc * hover,
          };
          blend(this.grip(arm, contact, aim), w);
        }
      }
      // Feeling for the missing nose.
      if (i === patArm) {
        const feel =
          ease((ms - (p.sneeze + 430)) / 180) * (1 - ease((ms - (p.sneeze + 1000)) / 200));
        if (feel > 0) {
          const socket = screenOf(m.carrot),
            head = screenOf(m.head);
          const tap = 1 - Math.abs(Math.sin((ms - p.sneeze - 430) / 90));
          const dx = socket.x - head.x,
            dy = socket.y - head.y,
            dl = Math.hypot(dx, dy) || 1;
          const contact = {
            x: socket.x + (dx / dl) * 1.4 * g.sc * tap,
            y: socket.y + (dy / dl) * 1.4 * g.sc * tap,
          };
          blend(this.grip(arm, contact, head), feel);
        }
      }
      // Catching the kicked carrot and pushing it back onto the face.
      if (i === catchArm) {
        const hold =
          ease((ms - (p.catchAt - 260)) / 240) * (1 - ease((ms - (p.refitEnd + 40)) / 200));
        if (hold > 0) {
          const carrot = ms < p.refitEnd ? this.gripOf(this.carrot) : this.gripOf(m.carrot);
          const aim = {
            x: carrot.x + (carrot.x - shoulder.x),
            y: carrot.y + (carrot.y - shoulder.y),
          };
          blend(this.grip(arm, carrot, aim), hold);
        }
      }
      reach(arm, wrist.x, wrist.y, i ? -1 : 1, wrist.angle);
    });
  }

  // ---------------------------------------------------------------- the carrot

  /** Where the mitten holds a carrot (worn or loose): near the tip, so it can push the base home. */
  gripOf(carrot: THREE.Object3D): Point {
    carrot.updateWorldMatrix(true, false);
    this.scratch.set(0, CARROT_LENGTH * 0.72, 0).applyMatrix4(carrot.matrixWorld);
    return { x: this.scratch.x, y: -this.scratch.y };
  }
  /** Places the loose carrot by its centre (screen) and orientation. */
  private setCarrot(centre: Point, z: number, quaternion: THREE.Quaternion, sc: number) {
    this.carrot.quaternion.copy(quaternion);
    this.carrot.scale.setScalar(sc);
    this.axis.set(0, 1, 0).applyQuaternion(quaternion);
    const half = (CARROT_LENGTH / 2) * sc;
    this.carrot.position.set(
      centre.x - this.axis.x * half,
      -centre.y - this.axis.y * half,
      z - this.axis.z * half,
    );
  }
  /** Centre of the carrot when it lies on the floor, resting on its own lowest point. */
  private carrotRest(g: Stage): Point {
    const away = this.plan.noseBounce ? -g.side : g.side;
    this.restQuat.setFromUnitVectors(
      this.yAxis,
      this.scratch.set(away * 0.88, 0, 0.47).normalize(),
    );
    this.setCarrot({ x: g.carrot.x, y: 0 }, DEPTH + 6, this.restQuat, g.sc);
    const low = lowestWorldY(this.carrot);
    return { x: g.carrot.x, y: g.floor + low };
  }
  private updateCarrot(ms: number, g: Stage) {
    const p = this.plan,
      sc = g.sc,
      half = (CARROT_LENGTH / 2) * sc;
    const visible = ms >= p.sneeze && ms < p.refitEnd && ms < SNOWMAN_DURATION;
    this.carrot.visible = visible;
    const rest = this.carrotRest(g);
    if (!visible) return;
    const launchAxis = this.launchAxis.set(0, 1, 0).applyQuaternion(this.launchQuat);
    const launch = {
      x: this.launchPos.x + launchAxis.x * half,
      y: -(this.launchPos.y + launchAxis.y * half),
    };
    const homeAxis = this.homeAxis.set(0, 1, 0).applyQuaternion(this.homeQuat);
    const home = {
      x: this.homePos.x + homeAxis.x * half,
      y: -(this.homePos.y + homeAxis.y * half),
    };
    const catchPoint = { x: g.kickStand.x + g.fetchDir * 11 * sc, y: g.floor - 19 * sc };
    this.carryQuat.setFromUnitVectors(
      this.yAxis,
      this.scratch.set(g.fetchDir * 0.45, 0.88, 0.12).normalize(),
    );
    const ballistic = (from: Point, to: Point, t0: number, t1: number) => {
      const dt = Math.max(1, t1 - t0),
        k = Math.max(0, Math.min(dt, ms - t0));
      const vx = (to.x - from.x) / dt,
        vy = (to.y - from.y - 0.5 * SNOWMAN_GRAVITY * dt * dt) / dt;
      return { x: from.x + vx * k, y: from.y + vy * k + 0.5 * SNOWMAN_GRAVITY * k * k };
    };
    let centre: Point,
      z = DEPTH + 6;
    if (ms < p.noseLanded) {
      // Blown off by the sneeze: straight into the card and back over his head, or popped up and dropped.
      if (p.noseBounce && ms < p.noseHit) {
        const card = onCard(
          snowmanCardPose(p, p.noseHit, g.side),
          g.side > 0 ? 0.03 : 0.97,
          0.62 + 0.08 * p.noseLand,
          g.b,
        );
        const hit = { x: card.x - g.side * half * 0.8, y: card.y };
        centre = ballistic(launch, hit, p.sneeze, p.noseHit);
      } else if (p.noseBounce) {
        const card = onCard(
          snowmanCardPose(p, p.noseHit, g.side),
          g.side > 0 ? 0.03 : 0.97,
          0.62 + 0.08 * p.noseLand,
          g.b,
        );
        centre = ballistic(
          { x: card.x - g.side * half * 0.8, y: card.y },
          rest,
          p.noseHit,
          p.noseLanded,
        );
      } else centre = ballistic(launch, rest, p.sneeze, p.noseLanded);
      const f = span(ms, p.sneeze, p.noseLanded - p.sneeze);
      this.scratchQuat.slerpQuaternions(this.launchQuat, this.restQuat, ease(f));
      this.scratchQuat.premultiply(
        this.turnQuat.setFromAxisAngle(this.zAxis, -g.side * Math.PI * 2 * f * f),
      );
      z = mix(this.launchPos.z + launchAxis.z * half, DEPTH + 6, f);
    } else if (ms < p.kick) {
      // Lands with a little bounce and lies on the floor.
      centre = { x: rest.x, y: rest.y - 2.5 * sc * pulse(ms, p.noseLanded, 170) };
      this.scratchQuat.copy(this.restQuat);
    } else if (ms < p.catchAt) {
      // Kicked up into the waiting mitten with one flip.
      centre = ballistic(rest, catchPoint, p.kick, p.catchAt);
      const f = span(ms, p.kick, p.catchAt - p.kick);
      this.scratchQuat.slerpQuaternions(this.restQuat, this.carryQuat, ease(f));
      this.scratchQuat.premultiply(
        this.turnQuat.setFromAxisAngle(this.zAxis, g.fetchDir * Math.PI * 2 * f * f),
      );
      z = mix(DEPTH + 6, DEPTH + 9, f);
    } else {
      // Lined up with the socket, then pushed home along its own axis.
      const f = span(ms, p.catchAt, p.refitEnd - p.catchAt);
      const pre = { x: home.x + homeAxis.x * 2.6 * sc, y: home.y - homeAxis.y * 2.6 * sc };
      centre =
        f < 0.7
          ? mixPoint(catchPoint, pre, ease(f / 0.7))
          : mixPoint(pre, home, ease((f - 0.7) / 0.3));
      this.scratchQuat.slerpQuaternions(this.carryQuat, this.homeQuat, ease(f / 0.7));
      z = mix(DEPTH + 9, this.homePos.z + homeAxis.z * half, ease(f));
    }
    this.setCarrot(centre, z, this.scratchQuat, sc);
  }

  // ---------------------------------------------------------------- fallout and effects

  /** Where the carrot tip, still on the face, points the sneeze from. */
  private noseTip(sc: number): Point {
    const axis = this.scratch.set(0, 1, 0).applyQuaternion(this.launchQuat);
    return {
      x: this.launchPos.x + axis.x * CARROT_LENGTH * sc,
      y: -(this.launchPos.y + axis.y * CARROT_LENGTH * sc),
    };
  }

  private patPuffPoint(k: number, g: Stage): Point {
    let marker: THREE.Object3D | null = null;
    for (const piece of this.pieces)
      if (piece.marker && this.patOf(piece.keys[0]?.[0] ?? 0) <= k - 1) marker = piece.marker;
    if (marker) return screenOf(marker);
    const R = this.plan.ballEnd;
    return {
      x: g.base.x - g.side * 0.34 * R * g.sc,
      y: g.floor - 1.9 * R * (1 - this.flat) * g.sc,
    };
  }
}
