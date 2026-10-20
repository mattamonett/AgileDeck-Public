import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  clamp,
  ease,
  easeOut,
  lowestWorldY,
  mix,
  pulse,
  sideOf,
  sideRoute,
  span,
  type CharacterRoutine,
  type Side,
} from '../../kit';
import {
  ACORN_R,
  KNOCK,
  PAW_SHOVE_X,
  PICK,
  PICK_X,
  SLIP_FLIGHT,
  SMALL_ACORN,
  SQUIRREL_DURATION,
  STASH_OUT,
  STASH_OUT_END,
  STASH_PLACE,
  STASH_PUSH_END,
  STUFF,
  squirrelEdge,
  squirrelExitPoint,
  squirrelFloor,
  squirrelFrames,
  squirrelGeometry,
  squirrelGiantA,
  squirrelLandingPoint,
  squirrelLaunch,
  squirrelPlaced,
  squirrelProgress,
  squirrelRowA,
  squirrelStash,
  type SquirrelPlan,
  type StashGeometry,
} from './squirrel-choreography';
import {
  SQ_STRIDE,
  SQ_TAIL_SEGMENTS,
  SQUIRREL_REST,
  makeAcorn,
  squirrelModel,
  squirrelPoint,
  squirrelPose,
  type SquirrelModel,
  type SquirrelPose,
} from './squirrel-model';

const DEPTH = 172;
/** Acorns on the floor sit just behind the squirrel's path so it can scurry past them cleanly. */
const SMALL_Z = -13;
const GIANT_Z = -19;
/** Head-down pose used to set the giant acorn down and to pick it up again in the teeth. */
const SET_PITCH = -0.08;
const SET_TILT = -0.06;
const SIT_PITCH = 1.05;
const CROUCH_PITCH = -0.12;
const ROUTE_SAMPLES = 48;
const CAP_BACK = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

interface Move {
  readonly t0: number;
  readonly t1: number;
  /** Root position along the floor (`a`, pixels from the card's near edge) at canonical ms. */
  readonly at: (ms: number) => number;
  readonly face: Side;
  readonly walk: boolean;
}
interface Turn {
  readonly t0: number;
  readonly t1: number;
  readonly to: Side;
}
interface Layout {
  readonly side: Side;
  readonly s: number;
  readonly edge: number;
  readonly floor: number;
  readonly g: StashGeometry;
  readonly aA: number;
  readonly aG: number;
  readonly aG2: number;
  readonly aR: number;
  readonly rests: readonly number[];
  /** Which way the squirrel faces (along `a`) as it picks up each acorn, in collection order. */
  readonly faces: readonly Side[];
  readonly moves: readonly Move[];
  readonly turns: readonly Turn[];
  readonly exitFace: Side;
  readonly exitFrom: Point;
  readonly exitTo: Point;
  readonly route: Float64Array;
  readonly lengths: Float64Array;
  readonly length: number;
  readonly bounds: number;
}
interface Root {
  readonly x: number;
  readonly y: number;
  readonly a: number;
  readonly walked: number;
}

const dash = (u: number) => ease(u);
/** Ramps up to a steady pace over the first 30 % so a loaded start never jolts. */
const exitProfile = (u: number) => (u < 0.3 ? (u * u) / 0.6 : 0.15 + (u - 0.3)) / 0.85;

export class SquirrelTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: SquirrelPlan;
  readonly duration: number;
  private readonly model: SquirrelModel;
  private readonly giant: THREE.Group;
  private readonly small: readonly THREE.Group[];
  /** Giant-acorn centre in root space with its cap in the teeth, measured on the real model in the set-down pose. */
  private readonly grip: Point;
  private readonly gripTurn = new THREE.Quaternion();
  private readonly setCrouch: number;
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly qa = new THREE.Quaternion();
  private readonly qb = new THREE.Quaternion();

  constructor(actor: THREE.Group) {
    this.model = squirrelModel(actor);
    this.plan = this.model.plan;
    this.duration = SQUIRREL_DURATION * this.plan.pace;
    this.object.name = 'squirrel-stash';
    this.giant = makeAcorn('squirrel-giant-acorn', true);
    this.object.add(this.giant);
    this.small = Array.from({ length: this.plan.count }, (_, i) => {
      const acorn = makeAcorn(`squirrel-acorn-${i}`, false);
      this.object.add(acorn);
      return acorn;
    });
    actor.position.set(0, 0, 0);
    actor.rotation.set(0, 0, 0);
    actor.scale.setScalar(1);
    const setDown = { ...SQUIRREL_REST, pitch: SET_PITCH, headTilt: SET_TILT };
    squirrelPose(actor, setDown);
    // Crouch just enough that the held acorn's lowest point meets the floor as it is let go.
    this.setCrouch = Math.max(
      -1.5,
      Math.min(5, squirrelPoint(actor, this.model.hold).y - ACORN_R * this.plan.giant),
    );
    squirrelPose(actor, { ...setDown, crouch: this.setCrouch });
    const grip = squirrelPoint(actor, this.model.hold);
    this.grip = { x: grip.x, y: grip.y };
    this.gripTurn
      .copy(actor.getWorldQuaternion(this.qa).invert())
      .multiply(this.model.hold.getWorldQuaternion(this.qb))
      .multiply(CAP_BACK);
  }

  cardAnimation(facing: number, b?: TargetBounds) {
    return squirrelFrames(this.plan, facing, b ?? { left: 0, top: 0, width: 84, height: 122 });
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
    const visible = ms < SQUIRREL_DURATION;
    this.object.visible = visible;
    actor.visible = visible;
    this.object.position.set(0, 0, 0);
    this.object.rotation.set(0, 0, 0);
    this.object.scale.setScalar(1);
    const L = this.layout(start, b, view, side);
    const now = this.rootAt(Math.max(0, ms), L),
      before = this.rootAt(Math.max(0, ms - 20), L),
      after = this.rootAt(Math.max(0, ms + 20), L);
    const run = ease(Math.hypot(after.x - before.x, after.y - before.y) / (40 * L.s) / 0.06);
    const yaw = this.yawAt(ms, L);
    actor.position.set(now.x, -now.y, DEPTH);
    actor.rotation.set(0, yaw, 0);
    actor.scale.setScalar(L.s);
    squirrelPose(actor, this.pose(ms, L, now, run, yaw));
    actor.updateMatrixWorld(true);
    this.object.updateMatrixWorld(true);
    this.placeGiant(ms, L);
    this.placeSmall(ms, L);
  }

  /** Every stand point and move for this layout; the plan's choices are kept, only geometry adapts. */
  private layout(start: Point, b: TargetBounds, view: Point, side: Side): Layout {
    const p = this.plan,
      g = squirrelGeometry(p, b),
      s = g.s;
    const edge = squirrelEdge(b, side),
      floor = squirrelFloor(b);
    const toA = (x: number) => (x - edge) * side;
    const arrive = squirrelLandingPoint(p, b, view, side);
    const aA = toA(arrive.x);
    const aG = aA + this.grip.x * s;
    const reach = PAW_SHOVE_X + 2.5 * p.giant;
    const aA2 = aG - reach * s;
    const aPeak = g.peak - reach * s;
    const aT = aPeak - KNOCK * s;
    const aG2 = g.peak - (KNOCK + 4) * s;
    const rests = p.rests.map((r) =>
      toA(Math.max(36, Math.min(view.x - 36, edge - side * r * g.w))),
    );
    const moves: Move[] = [
      {
        t0: p.around,
        t1: p.aroundEnd,
        at: (ms) => mix(aA, g.stand, dash(span(ms, p.around, p.aroundEnd - p.around))),
        face: 1,
        walk: true,
      },
      {
        t0: p.back + 70,
        t1: p.back + 430,
        at: (ms) => mix(g.stand, aA2, dash(span(ms, p.back + 70, 360))),
        face: -1,
        walk: true,
      },
      {
        t0: p.shove,
        t1: p.contact,
        at: (ms) => mix(aA2, g.x0 - reach * s, ease(span(ms, p.shove, p.contact - p.shove))),
        face: 1,
        walk: true,
      },
      {
        t0: p.contact,
        t1: p.slip,
        at: (ms) => squirrelGiantA(p, g, ms) - reach * s,
        face: 1,
        walk: true,
      },
      {
        t0: p.slip,
        t1: p.slip + 300,
        at: (ms) => mix(aPeak, aT, easeOut(span(ms, p.slip, 300))),
        face: 1,
        walk: false,
      },
    ];
    const turns: Turn[] = [
      { t0: p.back, t1: p.back + 180, to: -1 },
      { t0: p.back + 380, t1: p.back + 560, to: 1 },
    ];
    const faces: Side[] = [];
    let at = aT,
      face: Side = 1;
    p.order.forEach((i, j) => {
      const rest = rests[i] ?? 0,
        t0 = p.dashes[j] ?? 0,
        t1 = p.picks[j] ?? 0;
      const fwd = rest - PICK_X * s,
        bwd = rest + PICK_X * s;
      const dir: Side =
        fwd > at + 0.5
          ? 1
          : bwd < at - 0.5
            ? -1
            : Math.abs(fwd - at) <= Math.abs(bwd - at)
              ? 1
              : -1;
      const from = at,
        to = dir > 0 ? fwd : bwd;
      if (dir !== face) turns.push({ t0, t1: t0 + 130, to: dir });
      moves.push({
        t0,
        t1,
        at: (ms) => mix(from, to, dash(span(ms, t0, t1 - t0))),
        face: dir,
        walk: true,
      });
      faces.push(dir);
      at = to;
      face = dir;
    });
    const exitFace = p.exit;
    const aR = aG2 - exitFace * this.grip.x * s;
    const dashFace: Side = aR > at + 0.5 ? 1 : aR < at - 0.5 ? -1 : face;
    const grabEnd = p.bite - 160,
      from = at;
    if (dashFace !== face) turns.push({ t0: p.regrab, t1: p.regrab + 130, to: dashFace });
    moves.push({
      t0: p.regrab,
      t1: grabEnd,
      at: (ms) => mix(from, aR, dash(span(ms, p.regrab, grabEnd - p.regrab))),
      face: dashFace,
      walk: true,
    });
    if (exitFace !== dashFace) turns.push({ t0: grabEnd, t1: p.bite - 20, to: exitFace });
    // Arc-length table of the approach so the speed profile, not the curve's parameterisation, sets the pace.
    const route = new Float64Array((ROUTE_SAMPLES + 1) * 2),
      lengths = new Float64Array(ROUTE_SAMPLES + 1);
    const last = sideRoute(start, arrive, b, view, side, p.bend, 1);
    for (let i = 0; i <= ROUTE_SAMPLES; i++) {
      const u = i / ROUTE_SAMPLES,
        pt = sideRoute(start, arrive, b, view, side, p.bend, u);
      route[i * 2] = pt.x + (arrive.x - last.x) * u;
      route[i * 2 + 1] = pt.y + (arrive.y - last.y) * u;
      if (i)
        lengths[i] =
          (lengths[i - 1] ?? 0) +
          Math.hypot(
            (route[i * 2] ?? 0) - (route[i * 2 - 2] ?? 0),
            (route[i * 2 + 1] ?? 0) - (route[i * 2 - 1] ?? 0),
          );
    }
    const length = lengths[ROUTE_SAMPLES] ?? 0;
    return {
      side,
      s,
      edge,
      floor,
      g,
      aA,
      aG,
      aG2,
      aR,
      rests,
      faces,
      moves,
      turns,
      exitFace,
      exitFrom: { x: edge + side * aR, y: floor },
      exitTo: squirrelExitPoint(p, b, view, side),
      route,
      lengths,
      length,
      bounds: Math.max(2, Math.round(length / (SQ_STRIDE * s))),
    };
  }

  private routeAt(L: Layout, f: number): Point {
    const target = clamp(f) * L.length;
    let i = 0;
    while (i < ROUTE_SAMPLES - 1 && (L.lengths[i + 1] ?? 0) < target) i++;
    const l0 = L.lengths[i] ?? 0,
      l1 = L.lengths[i + 1] ?? l0;
    const t = l1 > l0 ? (target - l0) / (l1 - l0) : 0;
    return {
      x: mix(L.route[i * 2] ?? 0, L.route[i * 2 + 2] ?? 0, t),
      y: mix(L.route[i * 2 + 1] ?? 0, L.route[i * 2 + 3] ?? 0, t),
    };
  }

  /** Fraction of the approach covered: the speed profile plus a surge on every bound. */
  private approachFraction(ms: number, L: Layout): number {
    const p = this.plan;
    const f = squirrelProgress(p, ms / p.travel),
      n = L.bounds;
    return (
      f +
      (p.bound / (2 * Math.PI * n)) *
        (Math.sin(2 * Math.PI * n * f + p.boundPhase) - Math.sin(p.boundPhase))
    );
  }

  private rootAt(ms: number, L: Layout): Root {
    const p = this.plan;
    if (ms < p.travel) {
      const f = this.approachFraction(ms, L);
      const at = this.routeAt(L, f);
      return { x: at.x, y: at.y, a: (at.x - L.edge) * L.side, walked: (L.length * f) / L.s };
    }
    let walked = L.length / L.s,
      a = L.aA;
    for (const m of L.moves) {
      if (ms <= m.t0) break;
      const from = m.at(m.t0),
        to = m.at(Math.min(ms, m.t1));
      if (m.walk) walked += ((to - from) * m.face) / L.s;
      a = to;
    }
    if (ms <= p.departure) return { x: L.edge + L.side * a, y: L.floor, a, walked };
    const e = exitProfile(span(ms, p.departure, p.exitEnd - p.departure)),
      dx = L.exitTo.x - L.exitFrom.x,
      dy = L.exitTo.y - L.exitFrom.y;
    return {
      x: L.exitFrom.x + dx * e,
      y: L.exitFrom.y + dy * e,
      a: L.aR + L.exitFace * Math.abs(dx) * e,
      walked: walked + (Math.hypot(dx, dy) * e) / L.s,
    };
  }

  private yawOf(L: Layout, face: Side): number {
    return L.side * face > 0 ? 0 : -Math.PI;
  }

  private yawAt(ms: number, L: Layout): number {
    const p = this.plan;
    const contact = this.yawOf(L, 1);
    if (ms < p.travel) {
      const f = this.approachFraction(Math.max(0, ms), L);
      const ahead = this.routeAt(L, f + 0.03),
        behind = this.routeAt(L, f - 0.03);
      const dx = ahead.x - behind.x,
        length = Math.hypot(dx, ahead.y - behind.y);
      const along = length > 0.5 ? -Math.acos(Math.max(-1, Math.min(1, dx / length))) : contact;
      return mix(along, contact, ease((ms / p.travel - 0.88) / 0.12));
    }
    let yaw = contact,
      face: Side = 1;
    for (const turn of L.turns) {
      if (ms <= turn.t0) break;
      yaw = mix(
        this.yawOf(L, face),
        this.yawOf(L, turn.to),
        ease(span(ms, turn.t0, turn.t1 - turn.t0)),
      );
      face = turn.to;
    }
    return yaw;
  }

  private cheeks(ms: number): number {
    const p = this.plan;
    let full = 1;
    for (let k = 0; k < p.count; k++)
      full -=
        ease(
          span(
            ms,
            squirrelStash(p, k) + STASH_OUT * p.stashBeat,
            (STASH_OUT_END - STASH_OUT) * p.stashBeat,
          ),
        ) / p.count;
    for (const pick of p.picks)
      full += ease(span(ms, pick + PICK + 0.5 * STUFF, 0.4 * STUFF)) / p.count;
    return clamp(full);
  }

  private pose(ms: number, L: Layout, root: Root, run: number, yaw: number): SquirrelPose {
    const p = this.plan,
      s = L.s;
    const q: Mutable<SquirrelPose> = { ...SQUIRREL_REST, walked: root.walked, planted: 1 - run };
    const cycle = (root.walked / SQ_STRIDE) * Math.PI * 2;
    const toViewer = -Math.cos(yaw);
    const carry = 1 - ease((ms - p.release) / 100) + ease((ms - p.bite) / 120);
    const shoving = ms >= p.shove && ms < p.slip;
    const tumbling = ms >= p.slip && ms < p.recover;
    let act = { pitch: 0, crouch: 0, tilt: 0.14 * carry };
    let flick = 0;

    if (ms < p.travel) {
      // Acted look-arounds: a quick glance toward the viewer while still bounding along.
      for (const at of p.looks) {
        const w = Math.sin(Math.PI * span(ms / p.travel, at, p.lookLength));
        q.headTurn += toViewer * 0.95 * w;
        q.ears += w;
        act.tilt += 0.12 * w;
      }
    }
    const setDown = ease((ms - p.travel) / 200) * (1 - ease((ms - p.release - 20) / 110));
    act = {
      pitch: mix(act.pitch, SET_PITCH, setDown),
      crouch: mix(act.crouch, this.setCrouch, setDown),
      tilt: mix(act.tilt, SET_TILT, setDown),
    };
    if (p.glance) q.headTurn += toViewer * 0.9 * pulse(ms, p.around + 40, 300);

    // Busy at the card: crouched between beats, rearing up to empty a cheek, then pushing the acorn under.
    const busy = ease((ms - p.aroundEnd) / 60) * (1 - ease((ms - p.back) / 100));
    act = {
      pitch: mix(act.pitch, CROUCH_PITCH, busy),
      crouch: mix(act.crouch, 1, busy),
      tilt: mix(act.tilt, -0.1, busy),
    };
    for (let k = 0; k < p.count; k++) {
      const u = (ms - squirrelStash(p, k)) / p.stashBeat;
      if (u < 0 || u >= 1) continue;
      const sit = ease(u / 0.22) * (1 - ease((u - STASH_OUT_END) / 0.2));
      act = {
        pitch: mix(CROUCH_PITCH, SIT_PITCH, sit),
        crouch: mix(1, 2.8, sit),
        tilt: mix(-0.1, -0.05, sit),
      };
      q.toMouth = ease((u - 0.02) / 0.18) * (1 - ease((u - STASH_OUT_END) / 0.2));
      q.frontWeight = ease(u / 0.1) * (1 - ease((u - STASH_PUSH_END) / (1 - STASH_PUSH_END)));
      q.pinch = q.frontWeight;
      const a = u < STASH_PLACE ? L.g.d0 - L.g.slot : squirrelRowA(p, L.g, k, ms);
      q.front = { x: (a - root.a) / s, y: ACORN_R * SMALL_ACORN };
      q.ears = 0.6 * pulse(u, STASH_PLACE, STASH_PUSH_END - STASH_PLACE);
      q.headTurn += toViewer * 0.5 * pulse(u, STASH_PUSH_END - 0.02, 0.1);
    }

    // Behind the giant acorn: paws on its cap, head down, shoving it under the card.
    const shove = ease((ms - p.back - 560) / 120) * (1 - ease((ms - p.slip) / 120));
    if (shove > 0) {
      const strain = Math.sin(ms / 45) * (0.6 + 0.4 * p.strain);
      act = {
        pitch: mix(act.pitch, -0.24 + 0.03 * strain, shove),
        crouch: mix(act.crouch, 0.9, shove),
        tilt: mix(act.tilt, -0.22, shove),
      };
      q.front = { x: PAW_SHOVE_X, y: ACORN_R * p.giant + 1 };
      q.frontWeight = shove;
      q.pinch = 0.35 * shove;
      q.ears = -0.6 * shove;
      flick = 0.14 * shove;
    }

    // Knocked back onto its rump when the acorn springs out, then a dazed head shake.
    const tumble = ease((ms - p.slip) / 150) * (1 - ease((ms - p.slip - 420) / 240));
    if (tumble > 0) {
      act = {
        pitch: mix(act.pitch, p.flop ? 1.25 : 0.95, tumble),
        crouch: mix(act.crouch, p.flop ? 2.6 : 2.8, tumble),
        tilt: mix(act.tilt, p.flop ? 0.25 : -0.1, tumble),
      };
      q.hind = p.flop ? { x: 3, y: 12 + 2 * Math.sin(ms / 40) } : { x: 6, y: SQUIRREL_REST.hind.y };
      q.hindWeight = tumble;
      q.front = p.flop
        ? { x: 6 + 3 * Math.sin(ms / 37), y: 22 + 2 * Math.cos(ms / 43) }
        : { x: 9, y: 22 };
      q.toMouth = p.flop ? 0 : 0.8 * tumble;
      q.frontWeight = Math.max(q.frontWeight * (1 - tumble), tumble);
      q.ears = -0.8 * tumble;
    }
    q.headTurn += 0.55 * Math.sin((ms - p.slip - 420) / 30) * pulse(ms, p.slip + 400, 300);

    // Frantic collection: reach down, pinch the acorn, rear up and stuff it into a cheek.
    p.order.forEach((i, j) => {
      const pick = p.picks[j] ?? 0,
        dashAt = p.dashes[j] ?? 0;
      if (ms < dashAt || ms >= pick + PICK + STUFF) return;
      const reach = ease((ms - pick + 45) / 120);
      const v = (ms - pick - PICK) / STUFF;
      const sit = ease(v / 0.35) * (1 - ease((v - 0.65) / 0.3));
      act = {
        pitch: mix(-0.22 * reach, SIT_PITCH, sit),
        crouch: mix(1.3 * reach, 2.8, sit),
        tilt: mix(-0.25 * reach, -0.05, sit),
      };
      const face = L.faces[j] ?? 1;
      q.front = { x: (((L.rests[i] ?? 0) - root.a) * face) / s, y: ACORN_R * SMALL_ACORN };
      q.toMouth = ease((v - 0.05) / 0.45);
      q.frontWeight = reach * (1 - ease((v - 0.82) / 0.18));
      q.pinch = q.frontWeight;
      if (ms < pick - 60) q.headTurn += toViewer * 0.45 * Math.sin((ms - dashAt) / 55);
      flick = 0.08;
    });

    // Back to the giant acorn: head down to take its cap in the teeth, then a strained lift.
    const bite = ease((ms - p.bite + 150) / 150) * (1 - ease((ms - p.bite - 30) / 170));
    act = {
      pitch: mix(act.pitch, SET_PITCH, bite),
      crouch: mix(act.crouch, this.setCrouch, bite),
      tilt: mix(act.tilt, SET_TILT, bite),
    };
    if (ms >= p.departure - 100) {
      act.tilt += 0.06 * Math.sin(ms / 70);
      act.pitch -= 0.05;
      flick = 0.22;
    }

    const locomotes = shoving || tumbling ? 0 : run;
    q.pitch = mix(act.pitch, 0.12 * Math.sin(cycle) - 0.04 * carry, locomotes);
    q.crouch = mix(act.crouch, 0, locomotes);
    q.lift = locomotes * 1.1 * Math.max(0, Math.sin(cycle + 0.6));
    q.headTilt = act.tilt + run * 0.07 * Math.sin(cycle + 1.2);
    q.cheeks = this.cheeks(ms);
    const blink = (ms + p.phase * 400) % 2600;
    q.blink = Math.max(blink > 2480 ? pulse(blink, 2480, 120) : 0, pulse(ms, p.slam - 30, 200));
    const whip = 0.2 * pulse(ms, p.slip, 450);
    q.tail = Array.from(
      { length: SQ_TAIL_SEGMENTS },
      (_, i) =>
        locomotes * 0.2 * Math.sin(cycle - 0.7 * i) +
        flick * Math.sin(ms / 85 - 0.55 * i) +
        whip * Math.sin(ms / 45 - 0.6 * i),
    );
    return q;
  }

  /** Places an acorn so its lowest real vertex sits `clearance` pixels above the floor. */
  private rest(
    acorn: THREE.Group,
    x: number,
    floor: number,
    clearance: number,
    z: number,
    yaw: number,
    turn: number,
  ) {
    acorn.rotation.set(0, yaw, turn);
    acorn.position.set(x, 0, z);
    acorn.updateMatrixWorld(true);
    acorn.position.y = -floor + clearance - lowestWorldY(acorn);
  }

  private pawMid(out: THREE.Vector3): THREE.Vector3 {
    const [near, far] = this.model.paws;
    near.getWorldPosition(out);
    return out.add(far.getWorldPosition(this.w)).multiplyScalar(0.5);
  }

  private placeGiant(ms: number, L: Layout) {
    const p = this.plan,
      acorn = this.giant,
      s = L.s;
    acorn.visible = ms < SQUIRREL_DURATION;
    acorn.scale.setScalar(s * p.giant);
    const yaw = this.yawOf(L, 1);
    const held = ms < p.release || ms >= p.bite;
    if (held && (ms < p.release || ms >= p.bite + 120)) {
      this.model.hold.getWorldPosition(acorn.position);
      this.model.hold.getWorldQuaternion(acorn.quaternion).multiply(CAP_BACK);
      return;
    }
    // Flipped end over end so its cap ends up facing the side the squirrel will bite it from.
    const flipped = Math.PI / 2 + (p.exit < 0 ? Math.PI : Math.PI * 2);
    let a = L.aG2,
      clearance = 0,
      turn = flipped;
    if (ms < p.shove) {
      a = L.aG;
      turn = Math.PI / 2;
    } else if (ms < p.slip) {
      a = (L.moves[ms < p.contact ? 2 : 3]?.at(ms) ?? 0) + (PAW_SHOVE_X + 2.5 * p.giant) * s;
      turn = Math.PI / 2;
    } else if (ms < p.slip + SLIP_FLIGHT) {
      const u = span(ms, p.slip, SLIP_FLIGHT);
      a = mix(L.g.peak, L.aG2, easeOut(u));
      clearance = 14 * s * Math.sin(Math.PI * Math.min(1, u / 0.8));
      turn = mix(Math.PI / 2, flipped, ease(u));
    }
    const z = DEPTH + GIANT_Z * s;
    this.rest(acorn, L.edge + L.side * a, L.floor, clearance, z, yaw, turn);
    // Let go of (or take up) the acorn smoothly between the teeth and its rest on the floor.
    const blend = ms < p.bite ? 1 - ease((ms - p.release) / 100) : 1 - ease((ms - p.bite) / 120);
    if (blend <= 0) return;
    if (ms < p.bite) {
      const face = this.yawOf(L, 1);
      this.v.set(L.edge + L.side * (L.aA + this.grip.x * s), -(L.floor - this.grip.y * s), DEPTH);
      this.qa.setFromAxisAngle(this.w.set(0, 1, 0), face).multiply(this.gripTurn);
    } else {
      this.model.hold.getWorldPosition(this.v);
      this.model.hold.getWorldQuaternion(this.qa).multiply(CAP_BACK);
    }
    acorn.position.lerp(this.v, blend);
    acorn.quaternion.slerp(this.qa, blend);
  }

  private placeSmall(ms: number, L: Layout) {
    const p = this.plan,
      m = this.model,
      s = L.s;
    const yaw = this.yawOf(L, 1);
    this.small.forEach((acorn, i) => {
      acorn.scale.setScalar(s * SMALL_ACORN);
      const stash = squirrelStash(p, i),
        out = stash + STASH_OUT * p.stashBeat,
        outEnd = stash + STASH_OUT_END * p.stashBeat,
        placed = squirrelPlaced(p, i);
      const j = p.order.indexOf(i),
        pick = p.picks[j] ?? SQUIRREL_DURATION;
      const attach = pick + PICK - 10,
        swallow = pick + PICK + 0.5 * STUFF,
        gone = pick + PICK + 0.85 * STUFF;
      acorn.visible = ms >= out && ms < gone && ms < SQUIRREL_DURATION;
      if (!acorn.visible) return;
      const landed = Math.PI / 2 + Math.PI * (p.spins[i] ?? 1);
      if (ms < outEnd || ms >= swallow) {
        // Passing between the cheek pouch and the lips.
        const t =
          ms < outEnd
            ? ease(span(ms, out, outEnd - out))
            : 1 - ease(span(ms, swallow, gone - swallow));
        m.inside.getWorldPosition(this.v).lerp(m.mouth.getWorldPosition(this.w), t);
        acorn.position.copy(this.v);
        acorn.rotation.set(0, yaw, ms < outEnd ? Math.PI / 2 : landed);
        return;
      }
      if (ms < placed || ms >= attach) {
        this.pawMid(acorn.position);
        acorn.rotation.set(0, yaw, ms < placed ? Math.PI / 2 : landed);
        return;
      }
      const launch = squirrelLaunch(p, L.g, i);
      const lying = DEPTH + SMALL_Z * s;
      if (ms < launch) {
        const z = mix(DEPTH, lying, ease((ms - placed) / 80));
        this.rest(
          acorn,
          L.edge + L.side * squirrelRowA(p, L.g, i, ms),
          L.floor,
          0,
          z,
          yaw,
          Math.PI / 2,
        );
        return;
      }
      // Squeezed out by the falling card: a pop, a smaller bounce, then it rolls over onto its side.
      const from = squirrelRowA(p, L.g, i, p.slip),
        to = L.rests[i] ?? 0;
      const u = span(ms, launch, 430 + 90 * Math.abs(p.rests[i] ?? 0));
      const hop = (p.hops[i] ?? 12) * s;
      const clearance =
        u < 0.55
          ? hop * Math.sin((Math.PI * u) / 0.55)
          : u < 0.8
            ? 0.3 * hop * Math.sin((Math.PI * (u - 0.55)) / 0.25)
            : 0;
      const turn = mix(Math.PI / 2, landed, easeOut(u));
      this.rest(
        acorn,
        L.edge + L.side * mix(from, to, 1 - (1 - u) ** 2.2),
        L.floor,
        clearance,
        lying,
        yaw,
        turn,
      );
    });
  }
}
