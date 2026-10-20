import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFit,
  cardTurn,
  clamp,
  ease,
  easeIn,
  easeOut,
  glow,
  lowestWorldY,
  mix,
  onCard,
  part,
  pulse,
  sideOf,
  sideRoute,
  span,
  type CardPose,
  type CharacterRoutine,
  type Side,
} from '../../kit';
import {
  PECK_HOLD,
  PECK_RECOIL,
  PECK_STRIKE,
  PECK_WIND,
  TURKEY_BODY_CENTRE,
  TURKEY_DURATION,
  TURKEY_SCALE,
  turkeyBeatAmount,
  turkeyCardPose,
  turkeyExitPoint,
  turkeyFrames,
  turkeyLandingPoint,
  turkeyStrut,
  type TurkeyPlan,
} from './turkey-choreography';
import {
  TURKEY_HIP,
  TURKEY_NECK,
  TURKEY_TIP,
  featherMaterial,
  looseFeatherGeometry,
  turkeyModel,
  turkeyPose,
  type TurkeyModel,
  type TurkeyPose,
} from './turkey-model';

const DEPTH = 172;
const ROUTE_SAMPLES = 48;

/** Head (neck end and beak angle) and body carriage, all in root space. */
export interface TurkeyCarriage {
  readonly x: number;
  readonly y: number;
  readonly beak: number;
  readonly pitch: number;
  readonly hip: number;
}
function blend(a: TurkeyCarriage, b: TurkeyCarriage, t: number): TurkeyCarriage {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    x: mix(a.x, b.x, t),
    y: mix(a.y, b.y, t),
    beak: mix(a.beak, b.beak, t),
    pitch: mix(a.pitch, b.pitch, t),
    hip: mix(a.hip, b.hip, t),
  };
}
const shift = (
  a: TurkeyCarriage,
  x: number,
  y: number,
  beak: number,
  pitch: number,
  hip: number,
): TurkeyCarriage => ({
  x: a.x + x,
  y: a.y + y,
  beak: a.beak + beak,
  pitch: a.pitch + pitch,
  hip: a.hip + hip,
});
const STAND: TurkeyCarriage = { x: 15, y: 55, beak: 0.05, pitch: 0.1, hip: TURKEY_HIP };
const DISPLAY: TurkeyCarriage = { x: 12, y: 52.5, beak: -0.3, pitch: 0.2, hip: 20.5 };
const SMUG: TurkeyCarriage = { x: 14, y: 58, beak: 0.35, pitch: 0.2, hip: TURKEY_HIP };
const ALARM: TurkeyCarriage = { x: 10.5, y: 58.5, beak: 0.25, pitch: 0.05, hip: 21.5 };
const CROUCH: TurkeyCarriage = { x: 12, y: 50, beak: 0.1, pitch: 0.12, hip: 17 };
const AIR: TurkeyCarriage = { x: 14, y: 58, beak: 0.4, pitch: 0.1, hip: TURKEY_HIP };
const FLIGHT: TurkeyCarriage = { x: 22, y: 50, beak: 0.05, pitch: -0.22, hip: TURKEY_HIP };
const NECK_REACH = Math.hypot(TURKEY_NECK.x, TURKEY_NECK.y),
  NECK_ANGLE = Math.atan2(TURKEY_NECK.y, TURKEY_NECK.x);

/**
 * Carriage that puts the beak tip exactly on a root-space point: the beak tips down for low pecks,
 * and the body pitches so the neck stays comfortably extended toward the spot.
 */
export function turkeyReach(x: number, y: number): TurkeyCarriage {
  const low = clamp((44 - y) / 26);
  const beak = -0.3 - 0.7 * low;
  const c = Math.cos(beak),
    s = Math.sin(beak);
  const ex = x - (c * TURKEY_TIP.x - s * TURKEY_TIP.y),
    ey = y - (s * TURKEY_TIP.x + c * TURKEY_TIP.y);
  const hip = TURKEY_HIP - 2.5 * low;
  const dx = ex,
    dy = ey - hip,
    reach = Math.hypot(dx, dy);
  const k = (NECK_REACH ** 2 + reach ** 2 - 15 ** 2) / (2 * NECK_REACH * Math.max(0.001, reach));
  const pitch = Math.max(
    -0.5,
    Math.min(0.15, Math.atan2(dy, dx) - NECK_ANGLE + Math.acos(Math.max(-1, Math.min(1, k)))),
  );
  return { x: ex, y: ey, beak, pitch, hip };
}

interface Birth {
  readonly at: THREE.Vector3;
  readonly turn: THREE.Quaternion;
  readonly size: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  /** World y of the floor under the feather. */
  readonly floor: number;
  /** Seconds after release at which it settles. */
  readonly land: number;
  readonly rest: THREE.Quaternion;
  readonly fall: number;
  readonly sway: number;
  readonly rate: number;
}
interface Layout {
  readonly key: string;
  readonly b: TargetBounds;
  readonly view: Point;
  readonly side: Side;
  readonly scale: number;
  readonly from: Point;
  readonly stand: Point;
  readonly exit: Point;
  readonly lengths: Float32Array;
  readonly length: number;
  births: readonly Birth[];
}
interface Mark {
  readonly dent: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  readonly chip: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
}

const TAU = 0.22,
  FALL_TAU = 0.35;
function drift(v: number, tau: number, t: number) {
  return v * tau * (1 - Math.exp(-t / tau));
}

export class TurkeyTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: TurkeyPlan;
  readonly duration: number;
  private readonly model: TurkeyModel;
  private readonly feathers: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  private readonly marks: Mark[] = [];
  private readonly probe = new THREE.Vector3();
  private readonly spin = new THREE.Quaternion();
  private readonly flutter = new THREE.Quaternion();
  private layoutCache: Layout | null = null;

  constructor(actor: THREE.Group) {
    this.model = turkeyModel(actor);
    this.plan = this.model.plan;
    this.duration = TURKEY_DURATION * this.plan.pace;
    this.object.name = 'turkey-panic';
    this.plan.loose.forEach((j, k) => {
      const mesh = part(
        this.object,
        `turkey-shed-${k}`,
        looseFeatherGeometry(j),
        featherMaterial(),
      );
      mesh.material.transparent = true;
      mesh.visible = false;
      this.feathers.push(mesh);
    });
    this.plan.pecks.forEach((_, k) => {
      const dent = part(
        this.object,
        `turkey-peck-${k}`,
        new THREE.CircleGeometry(1, 12),
        glow(0x3a2414, 0),
      );
      const chip = part(
        this.object,
        `turkey-peck-chip-${k}`,
        new THREE.CircleGeometry(1, 3),
        glow(0xf6eedc, 0),
      );
      dent.visible = chip.visible = false;
      this.marks.push({ dent, chip });
    });
  }

  cardAnimation(facing: number) {
    return turkeyFrames(this.plan, sideOf(facing));
  }

  update(
    elapsed: number,
    actor: THREE.Group,
    start: Point,
    b: TargetBounds,
    view: Point,
    facing: number,
  ) {
    const ms = elapsed / this.plan.pace,
      side = sideOf(facing);
    this.object.visible = ms < TURKEY_DURATION;
    this.object.position.set(0, 0, 0);
    // Release poses are measured on the model before this frame is posed.
    const layout = this.layout(actor, start, b, view, side);
    this.place(actor, ms, layout);
    actor.visible = ms < TURKEY_DURATION;
    const fade = 1 - ease((ms - (TURKEY_DURATION - 500)) / 450);
    this.object.updateMatrixWorld(true);
    this.updateFeathers(ms, layout, fade);
    this.updateMarks(ms, b, side, layout.scale, fade);
  }

  /** The beak tip's target: the seeded spot on the live card for peck k, in the actor's root space. */
  private hit(k: number, ms: number, actor: THREE.Group, L: Layout): TurkeyCarriage {
    const peck = this.plan.pecks[k];
    if (!peck) return STAND;
    const q = turkeyCardPose(this.plan, ms, L.side);
    const spot = onCard(q, L.side > 0 ? peck.u : 1 - peck.u, peck.v, L.b);
    const local = actor.worldToLocal(this.probe.set(spot.x, -spot.y, DEPTH));
    return turkeyReach(local.x, local.y);
  }

  private routeAt(u: number, L: Layout): Point {
    return sideRoute(L.from, L.stand, L.b, L.view, L.side, this.plan.bend, u);
  }
  /** Route parameter at a walked distance, so the strut's speed is the planned speed. */
  private paramAt(s: number, L: Layout): number {
    let lo = 0,
      hi = ROUTE_SAMPLES;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((L.lengths[mid] ?? 0) <= s) lo = mid;
      else hi = mid;
    }
    const a = L.lengths[lo] ?? 0,
      b = L.lengths[hi] ?? a;
    return (lo + (b > a ? clamp((s - a) / (b - a)) : 0)) / ROUTE_SAMPLES;
  }

  private layout(
    actor: THREE.Group,
    start: Point,
    b: TargetBounds,
    view: Point,
    side: Side,
  ): Layout {
    const key = [start.x, start.y, b.left, b.top, b.width, b.height, view.x, view.y, side].join();
    if (this.layoutCache?.key === key) return this.layoutCache;
    const p = this.plan,
      scale = TURKEY_SCALE * cardFit(b);
    const lengths = new Float32Array(ROUTE_SAMPLES + 1);
    const partial: Layout = {
      key,
      // Copy fields explicitly: the renderer passes DOMRects, whose fields don't spread.
      b: { left: b.left, top: b.top, width: b.width, height: b.height },
      view: { ...view },
      side,
      scale,
      from: { x: start.x, y: start.y + TURKEY_BODY_CENTRE * scale },
      stand: turkeyLandingPoint(p, b, view, side),
      exit: turkeyExitPoint(p, b, view, side),
      lengths,
      length: 0,
      births: [],
    };
    let previous = this.routeAt(0, partial);
    for (let i = 1; i <= ROUTE_SAMPLES; i++) {
      const at = this.routeAt(i / ROUTE_SAMPLES, partial);
      lengths[i] = (lengths[i - 1] ?? 0) + Math.hypot(at.x - previous.x, at.y - previous.y);
      previous = at;
    }
    const layout: Layout = { ...partial, length: lengths[ROUTE_SAMPLES] ?? 0 };
    layout.births = this.measureBirths(actor, layout);
    this.layoutCache = layout;
    return layout;
  }

  /** Pose the turkey at each release moment and record the attached feather's exact world pose. */
  private measureBirths(actor: THREE.Group, L: Layout): Birth[] {
    const p = this.plan,
      plumage = new THREE.Vector3(),
      next = new THREE.Vector3(),
      local = new THREE.Vector3();
    return p.loose.map((j, k) => {
      const source = this.model.loose[j],
        born = p.births[k] ?? p.startle;
      const at = new THREE.Vector3(),
        turn = new THREE.Quaternion(),
        size = new THREE.Vector3();
      const ground = this.place(actor, born, L);
      if (source) source.matrixWorld.decompose(at, turn, size);
      this.model.plumage.getWorldPosition(plumage);
      this.place(actor, born + 16, L);
      if (source) source.getWorldPosition(next);
      const velocity = next.clone().sub(at).divideScalar(0.016);
      // The shake flings each feather away from the body and a little upward.
      const away = at.clone().sub(plumage).setZ(0);
      if (away.lengthSq() > 0) velocity.add(away.normalize().multiplyScalar(45 * L.scale));
      velocity.y += 25 * L.scale;
      const fall = (60 + 45 * (p.falls[k] ?? 0.5)) * L.scale;
      const sway = (6 + 8 * (p.sways[k] ?? 0.5)) * L.scale;
      const rate = 5 + 3 * (p.sways[k] ?? 0.5);
      const rest = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          -0.75,
          ((p.sways[k] ?? 0.5) - 0.5) * 1.2,
          (k % 2 ? Math.PI : 0) + ((p.falls[k] ?? 0.5) - 0.5) * 0.6,
        ),
      );
      // Lowest point of the feather when lying at rest, relative to its origin.
      let lowest = 0;
      const points = looseFeatherGeometry(j);
      const position = points.getAttribute('position');
      for (let i = 0; i < position.count; i++)
        lowest = Math.min(
          lowest,
          local.fromBufferAttribute(position, i).multiply(size).applyQuaternion(rest).y,
        );
      points.dispose();
      const floor = -ground,
        target = floor - lowest;
      const height = (t: number) =>
        at.y + drift(velocity.y, TAU, t) - fall * (t - FALL_TAU * (1 - Math.exp(-t / FALL_TAU)));
      let land = 0;
      if (height(0) > target) {
        let lo = 0,
          hi = 0.02;
        while (hi < 8 && height(hi) > target) {
          lo = hi;
          hi += 0.02;
        }
        for (let i = 0; i < 24; i++) {
          const mid = (lo + hi) / 2;
          if (height(mid) > target) lo = mid;
          else hi = mid;
        }
        land = hi;
      }
      return { at, turn, size, velocity, floor, land, rest, fall, sway, rate };
    });
  }

  /** Places and poses the whole turkey at canonical time ms; returns the screen y of the floor beneath it. */
  private place(actor: THREE.Group, ms: number, L: Layout): number {
    const p = this.plan,
      side = L.side,
      scale = L.scale;
    const contactYaw = side > 0 ? 0 : -Math.PI,
      exitYaw = side > 0 ? -Math.PI : 0;
    let at = L.stand,
      yaw = contactYaw,
      lift = 0,
      walked = L.length / scale,
      ground = L.stand.y,
      run = 0;
    if (ms < p.travel) {
      const t = ms / p.travel,
        d = turkeyStrut(p, t),
        s = d * L.length,
        u = this.paramAt(s, L);
      const base = this.routeAt(u, L),
        ahead = this.routeAt(Math.min(1, u + 0.02), L),
        behind = this.routeAt(Math.max(0, u - 0.02), L);
      const dx = ahead.x - behind.x,
        dy = ahead.y - behind.y,
        length = Math.hypot(dx, dy);
      // A pompous side-to-side swagger across the route, vanishing at both ends.
      const swagger =
        (3 + 7 * p.weave) *
        scale *
        Math.sin(Math.PI * d) *
        Math.sin(Math.PI * 2 * (2 + p.weave) * d + p.phase);
      at =
        length > 0.5
          ? { x: base.x - (dy / length) * swagger, y: base.y + (dx / length) * swagger }
          : base;
      walked = s / scale;
      ground = at.y;
      if (length > 0.5) yaw = -Math.acos(Math.max(-1, Math.min(1, dx / length)));
      yaw = mix(yaw, contactYaw, ease((t - 0.9) / 0.1));
    } else if (ms < p.departure) {
      // Show the fan to the room, then turn tail mid-leap.
      yaw =
        contactYaw -
        side *
          p.swivel *
          0.8 *
          ease((ms - p.displayStart - 200) / 350) *
          (1 - ease((ms - p.displayEnd + 250) / 300));
      yaw = mix(yaw, exitYaw, ease((ms - p.startle - 40) / 300));
      lift = p.jump * scale * Math.sin(Math.PI * span(ms, p.startle, p.land - p.startle));
    } else {
      const t = span(ms, p.departure, p.exitEnd - p.departure);
      yaw = exitYaw;
      const distance = Math.hypot(L.exit.x - L.stand.x, L.exit.y - L.stand.y);
      if (p.escape === 'run') {
        const e = t * (0.6 + 0.4 * t);
        const zig = 7 * scale * ease(e * 4) * Math.sin(Math.PI * 5 * e + p.phase);
        at = { x: mix(L.stand.x, L.exit.x, e), y: mix(L.stand.y, L.exit.y, e) + zig };
        ground = at.y;
        run = (distance * e) / scale;
      } else {
        const e = t * (0.45 + 0.55 * t);
        at = { x: mix(L.stand.x, L.exit.x, e), y: mix(L.stand.y, L.exit.y, ease(e)) };
        lift = 16 * scale * Math.abs(Math.sin(Math.PI * 3 * e));
      }
    }
    actor.position.set(at.x, -at.y + lift, DEPTH);
    actor.rotation.set(0, yaw, 0);
    actor.scale.setScalar(scale);
    actor.updateWorldMatrix(true, false);
    turkeyPose(actor, this.pose(ms, actor, L, walked, run));
    this.model.loose.forEach((mesh, j) => {
      const k = p.loose.indexOf(j);
      mesh.visible = k < 0 || ms < (p.births[k] ?? Infinity);
    });
    actor.updateMatrixWorld(true);
    return ground;
  }

  private carriage(
    ms: number,
    actor: THREE.Group,
    L: Layout,
    walked: number,
    run: number,
  ): TurkeyCarriage {
    const p = this.plan;
    const step = (((walked / (p.stride / 2)) % 1) + 1) % 1;
    // Head bob: the head holds back while the foot is planted, then thrusts forward with the step.
    const bob = step < 0.72 ? 2.6 - 5.2 * (step / 0.72) : -2.6 + 5.2 * ease((step - 0.72) / 0.28);
    let pose: TurkeyCarriage = {
      x: 15.5 + bob,
      y: 55 + 1.2 * Math.sin(Math.PI * 2 * step),
      beak: 0.05,
      pitch: 0.1 + 0.03 * Math.sin(Math.PI * 2 * step),
      hip: TURKEY_HIP - 0.8 * Math.abs(Math.sin(Math.PI * step)),
    };
    const beat = ms < p.travel ? turkeyBeatAmount(p, ms / p.travel) : 0;
    if (p.beat === 'gobble')
      pose = blend(pose, { x: 17.5, y: 57.5, beak: 0.55, pitch: 0.16, hip: TURKEY_HIP }, beat);
    else if (p.beat === 'glance')
      pose = blend(pose, { x: 14, y: 57.5, beak: 0.12, pitch: 0.1, hip: TURKEY_HIP }, beat);
    else pose = blend(pose, { x: 12.5, y: 54, beak: -0.25, pitch: 0.2, hip: TURKEY_HIP }, beat);
    pose = blend(pose, STAND, ease((ms - p.travel + 150) / 250));
    pose = blend(pose, DISPLAY, ease((ms - p.displayStart) / 260));
    const pecks = p.pecks;
    const look = (hit: TurkeyCarriage) => shift(hit, -9, 8, 0.5, 0.1, 0.8);
    pecks.forEach((peck, k) => {
      const hit = this.hit(k, ms, actor, L);
      const previous =
        k > 0 ? (pecks[k - 1]?.at ?? peck.at) + PECK_HOLD + PECK_RECOIL : p.displayEnd;
      pose = blend(
        pose,
        look(hit),
        ease((ms - previous) / Math.max(60, peck.at - PECK_WIND - previous)),
      );
      // Cock the head back, strike, hold the beak on the card, recoil to eye the spot.
      const cock =
        ease((ms - peck.at + PECK_WIND) / (PECK_WIND - PECK_STRIKE)) *
        (1 - ease((ms - peck.at) / PECK_HOLD));
      pose = blend(pose, shift(hit, -12, 6, 0.25, 0.05, 0.6), cock);
      const strike =
        ms < peck.at
          ? easeIn((ms - peck.at + PECK_STRIKE) / PECK_STRIKE)
          : 1 - easeOut((ms - peck.at - PECK_HOLD) / PECK_RECOIL);
      pose = blend(pose, hit, strike);
    });
    pose = blend(pose, SMUG, ease((ms - this.smugAt()) / 260));
    pose = blend(pose, ALARM, ease((ms - p.triggerAt - 70) / 110));
    pose = blend(pose, CROUCH, ease((ms - p.startle + 140) / 140));
    pose = blend(pose, AIR, ease((ms - p.startle) / 160));
    if (p.escape === 'run') {
      const stride = (((run / 11) % 1) + 1) % 1;
      const dash = {
        x: 23 + 2 * Math.sin(Math.PI * 2 * stride),
        y: 45 + 1.5 * Math.cos(Math.PI * 2 * stride),
        beak: -0.05,
        pitch: -0.32,
        hip: 19.5 - Math.abs(Math.sin(Math.PI * stride)),
      };
      pose = blend(pose, dash, ease((ms - p.land) / 180));
    } else
      pose = blend(
        pose,
        { ...FLIGHT, y: FLIGHT.y + 2 * Math.sin(ms / 40) },
        ease((ms - p.land) / 180),
      );
    return pose;
  }

  private smugAt(): number {
    const last = this.plan.pecks.at(-1);
    return (last?.at ?? this.plan.displayEnd) + PECK_HOLD + PECK_RECOIL;
  }

  private pose(ms: number, actor: THREE.Group, L: Layout, walked: number, run: number): TurkeyPose {
    const p = this.plan,
      t = ms / p.travel,
      smug = this.smugAt();
    const c = this.carriage(ms, actor, L, walked, run);
    const beat = ms < p.travel ? turkeyBeatAmount(p, t) : 0;
    const gobble = p.beat === 'gobble' ? beat : 0,
      puffBeat = p.beat === 'puff' ? beat : 0,
      glance = p.beat === 'glance' ? beat : 0;
    const displayOn = ease((ms - p.displayStart) / 380),
      afterDisplay = ease((ms - p.displayEnd) / 300),
      smugOn = ease((ms - smug) / 300),
      alarmOn = ease((ms - p.triggerAt - 60) / 80),
      leap = ease((ms - p.startle) / 150),
      escaping = ease((ms - p.land) / 200);
    let fan = Math.max(p.earlyFan ? 0.55 * ease((t - 0.72) / 0.22) : 0, 0.5 * puffBeat);
    fan = mix(mix(mix(mix(fan, 1, displayOn), p.fanHold, afterDisplay), 1, smugOn), 0, leap);
    let rattle = 0.7 * puffBeat;
    for (let i = 0; i < p.shimmies; i++)
      rattle = Math.max(rattle, pulse(ms, p.displayStart + 420 + i * 240, 180));
    rattle = Math.max(
      rattle,
      0.6 * pulse(ms, p.triggerAt + 60, p.startle - p.triggerAt - 60),
      0.8 * pulse(ms, smug + 120, 260),
    );
    const puff =
      mix(mix(mix(mix(puffBeat, 1, displayOn), 0.45, afterDisplay), 0.8, smugOn), 1, alarmOn) *
      (1 - 0.4 * escaping);
    const droop = mix(
      mix(mix(ease((ms - p.displayStart) / 400), 0.5, afterDisplay), 1, smugOn),
      0,
      alarmOn,
    );
    const flight = p.escape === 'flight';
    const unfold = mix(ease((ms - p.startle) / 120), flight ? 1 : 0.75, escaping);
    const flap =
      ms < p.land
        ? 1.1 * Math.sin(ms / 28) + 0.3
        : flight
          ? 1.25 * Math.sin(ms / 40) + 0.3
          : Math.sin(ms / 32) + 0.35;
    const gape = Math.max(
      gobble * (0.5 + 0.5 * Math.sin(ms / 40)),
      0.8 * pulse(ms, smug + 60, 380) * Math.abs(Math.sin(ms / 38)),
      0.6 * leap,
    );
    // A tom's snood and skin swell while he shows off and shrink and pale when he is scared.
    const snood = mix(
      mix(mix(mix(0.25 + 0.25 * gobble, 1, displayOn), 0.75, afterDisplay), 1, smugOn),
      0.3,
      alarmOn,
    );
    const flush = mix(mix(mix(gobble * 0.5, 1, displayOn), 0.7, afterDisplay), 0.15, alarmOn);
    const blinkAt = (ms + p.phase * 300) % 1900;
    const blink = ms < p.triggerAt ? pulse(blinkAt, 0, 130) : 0;
    let swing =
      0.5 * Math.sin(walked * 0.45) * (ms < p.travel ? 1 : 0) +
      gobble * Math.sin(ms / 50) +
      leap * Math.sin(ms / 45);
    for (const peck of p.pecks) {
      const after = ms - peck.at;
      if (after > 0) swing += Math.exp(-after / 220) * Math.sin(after / 45) * peck.strength;
    }
    // Double take: a look at the viewer between the card coming alive and the leap.
    const turn =
      1.3 * glance +
      0.4 * displayOn * (1 - afterDisplay) +
      1.1 * pulse(ms, p.triggerAt + 160, Math.max(60, p.startle - p.triggerAt - 220));
    const airborne = ease((ms - p.startle) / 90) * (1 - ease((ms - p.land + 90) / 90));
    const running = p.escape === 'run' && ms >= p.departure;
    return {
      walked: walked + run,
      stride: running ? 22 : p.stride,
      lift: running ? 6.5 : 5.5,
      planted: ms < p.travel ? ease((t - 0.9) / 0.1) : 1 - ease((ms - p.departure) / 100),
      tuck: flight ? Math.max(airborne, ease((ms - p.departure) / 200)) : airborne,
      hip: c.hip,
      pitch: c.pitch,
      puff,
      fan,
      rattle,
      toward: L.side,
      unfold,
      flap,
      droop,
      neck: { x: c.x, y: c.y },
      beak: c.beak,
      turn,
      gape,
      snood,
      flush,
      blink,
      alarm: alarmOn,
      swing,
      time: ms,
    };
  }

  /** Shaken-off feathers inherit the body's motion, flutter down and settle on the floor on their real outline. */
  private updateFeathers(ms: number, L: Layout, fade: number) {
    const p = this.plan;
    this.feathers.forEach((mesh, k) => {
      const birth = L.births[k],
        age = (ms - (p.births[k] ?? Infinity)) / 1000;
      mesh.visible = !!birth && age >= 0 && fade > 0 && ms < TURKEY_DURATION;
      if (!birth || !mesh.visible) return;
      const t = Math.min(age, birth.land);
      const settle = birth.land > 0 ? ease(t / birth.land) : 1;
      const sway = birth.sway * ease(t / 0.4) * Math.sin(birth.rate * t + k);
      mesh.position.set(
        birth.at.x + drift(birth.velocity.x, TAU, t) + sway,
        birth.at.y +
          drift(birth.velocity.y, TAU, t) -
          birth.fall * (t - FALL_TAU * (1 - Math.exp(-t / FALL_TAU))),
        birth.at.z,
      );
      this.flutter.setFromAxisAngle(
        this.probe.set(1, 0, 0),
        0.6 * ease(t / 0.3) * Math.sin(birth.rate * 1.7 * t) * (1 - settle),
      );
      mesh.quaternion.slerpQuaternions(birth.turn, birth.rest, settle).multiply(this.flutter);
      mesh.scale.copy(birth.size);
      const lowest = lowestWorldY(mesh);
      // Never sink into the floor while turning to rest; once landed, lie exactly on it.
      if (age >= birth.land || lowest < birth.floor) mesh.position.y += birth.floor - lowest;
      mesh.updateMatrixWorld(true);
      mesh.material.opacity = fade;
    });
  }

  /** Small dents where the beak struck, riding the live card. */
  private updateMarks(ms: number, b: TargetBounds, side: Side, scale: number, fade: number) {
    const p = this.plan,
      q: CardPose = turkeyCardPose(p, ms, side);
    this.marks.forEach((mark, k) => {
      const peck = p.pecks[k];
      const live = !!peck && ms >= peck.at && fade > 0 && ms < TURKEY_DURATION;
      mark.dent.visible = mark.chip.visible = live;
      if (!peck || !live) return;
      const u = side > 0 ? peck.u : 1 - peck.u;
      const grow = ease((ms - peck.at) / 50) * Math.sqrt(peck.strength);
      const at = onCard(q, u, peck.v, b);
      mark.dent.position.set(at.x, -at.y, DEPTH - 13.5 + k * 0.02);
      mark.dent.rotation.z = cardTurn(q) + k * 0.9;
      mark.dent.scale.set(1.7 * scale * grow + 0.001, 1.1 * scale * grow + 0.001, 1);
      mark.dent.material.opacity = 0.8 * fade;
      const chip = onCard(q, u - side * 0.014, peck.v - 0.008, b);
      mark.chip.position.set(chip.x, -chip.y, DEPTH - 13.4 + k * 0.02);
      mark.chip.rotation.z = cardTurn(q) + side * 0.6;
      mark.chip.scale.setScalar(0.9 * scale * grow + 0.001);
      mark.chip.material.opacity = 0.9 * fade;
    });
  }
}
