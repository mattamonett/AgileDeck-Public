import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  cardFit,
  cardTurn,
  clamp,
  ease,
  mix,
  onCard,
  part,
  pulse,
  screenOf,
  setStrip,
  sideOf,
  sideRoute,
  stripGeometry,
  type CardPose,
  type CharacterRoutine,
  type Side,
} from '../../kit';
import {
  MUMMY_BAND_WIDTH,
  MUMMY_DURATION,
  MUMMY_EYE_V,
  MUMMY_SCALE,
  mummyBandGrowth,
  mummyBands,
  mummyCardPose,
  mummyExitPoint,
  mummyExitProgress,
  mummyFeed,
  mummyFrames,
  mummyLandingPoint,
  mummyPeelStart,
  mummyRoutePoint,
  mummyTravel,
  type MummyPlan,
} from './mummy-choreography';
import {
  MUMMY_REST,
  MUMMY_TORSO_BANDS,
  mummyModel,
  mummyPose,
  type MummyModel,
  clothStrip,
  cardEye,
  type CardEye,
} from './mummy-model';

const DEPTH = 172;
const RIBBON_SEGMENTS = 48;
const TRAIL = 150;

export class MummyTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: MummyPlan;
  readonly duration: number;
  private readonly model: MummyModel;
  private readonly ribbon = part(
    this.object,
    'mummy-ribbon',
    stripGeometry(RIBBON_SEGMENTS),
    new THREE.MeshBasicMaterial({
      color: 0xd8cca8,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  private readonly bands: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly eyes: CardEye[];
  private readonly curve = new THREE.CatmullRomCurve3(
    [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    false,
    'centripetal',
  );
  private readonly routeLengths = new Float32Array(25);

  constructor(actor: THREE.Group) {
    this.model = mummyModel(actor);
    this.plan = this.model.plan;
    this.duration = MUMMY_DURATION * this.plan.pace;
    this.object.name = 'mummy-wrap';
    mummyBands(this.plan).forEach((_, k) => {
      const band = part(
        this.object,
        `card-band-${k}`,
        clothStrip(k * 1.9 + this.plan.phase),
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      this.bands.push(band);
    });
    this.eyes = [cardEye(this.object, 'card-eye-0'), cardEye(this.object, 'card-eye-1')];
  }

  cardAnimation(facing: number) {
    return mummyFrames(this.plan, facing);
  }

  /** Measures the approach so planted feet advance exactly as far as the body travels. */
  private measureRoute(start: Point, b: TargetBounds, view: Point, side: Side): number {
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
  private walkedAlong(u: number): number {
    const f = clamp(u) * 24,
      i = Math.min(23, Math.floor(f));
    return mix(this.routeLengths[i] ?? 0, this.routeLengths[i + 1] ?? 0, f - i);
  }
  /** The approach curve at parameter u; the shamble timing is applied separately. */
  private routeAt(u: number, start: Point, b: TargetBounds, view: Point, side: Side): Point {
    const end = mummyLandingPoint(this.plan, b, view, side);
    return sideRoute(start, end, b, view, side, this.plan.bend, u);
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
    this.object.visible = ms < MUMMY_DURATION;
    this.object.position.set(0, 0, 0);
    const fit = cardFit(b),
      scale = MUMMY_SCALE * fit;
    const stand = mummyLandingPoint(p, b, view, side);
    const q = mummyCardPose(p, ms, side);
    const contactYaw = side > 0 ? 0 : -Math.PI;
    const routeLength = this.measureRoute(start, b, view, side);
    let point: Point,
      yaw = contactYaw,
      walked = routeLength / scale;
    if (ms < p.travel) {
      const u = mummyTravel(p, ms / p.travel);
      point = mummyRoutePoint(p, ms, start, b, view, side);
      walked = this.walkedAlong(u) / scale;
      const ahead = this.routeAt(Math.min(1, u + 0.02), start, b, view, side),
        behind = this.routeAt(Math.max(0, u - 0.02), start, b, view, side);
      const dx = ahead.x - behind.x,
        length = Math.hypot(dx, ahead.y - behind.y);
      if (length > 0.5) yaw = -Math.acos(Math.max(-1, Math.min(1, dx / length)));
      // Square up to the card over the last few steps.
      yaw = mix(yaw, contactYaw, ease((ms / p.travel - 0.9) / 0.1));
    } else if (ms < p.departure) {
      point = stand;
    } else {
      const exit = mummyExitPoint(p, b, view, side),
        e = mummyExitProgress(p, ms);
      point = { x: mix(stand.x, exit.x, e), y: mix(stand.y, exit.y, e) };
      walked += (Math.hypot(exit.x - stand.x, exit.y - stand.y) * e) / scale;
      yaw = mix(contactYaw, side > 0 ? -Math.PI : 0, ease((ms - p.departure) / 380));
    }
    actor.visible = ms < MUMMY_DURATION;
    actor.position.set(point.x, -point.y, DEPTH);
    actor.rotation.set(0, yaw, 0);
    actor.scale.setScalar(scale);
    mummyPose(actor, this.pose(ms, walked, side, yaw));
    actor.updateMatrixWorld(true);
    this.updateRibbon(ms, b, q, side, stand, view, fit, scale);
    this.updateBands(ms, b, q, side);
    this.updateEyes(ms, b, q, side);
  }

  private pose(ms: number, walked: number, side: Side, yaw: number) {
    const p = this.plan;
    const t = ms / p.travel;
    const pause = ms < p.travel ? pulse(t, p.pauseAt, p.stumble ? 0.1 : 0.16) : 0;
    let lean = 0.12 + (p.stumble ? 0.42 : 0) * pause,
      crouch = (p.stumble ? 4 : 0) * pause,
      headTilt = p.stumble ? 0 : 0.35 * pause,
      headTurn = p.stumble ? 0 : -side * 0.6 * pause,
      twist = 0,
      eye = 0.6,
      nearHand = { x: 21, y: 4 - (p.stumble ? 10 : 0) * pause },
      farHand = { x: 19, y: 1 - (p.stumble ? 12 : 0) * pause };
    let bandsLeft = MUMMY_TORSO_BANDS;
    // Feet keep stepping through the slow beat; they come down on arrival and lift for the exit.
    const planted =
      ms < p.travel ? ease((t - 0.93) / 0.07) : 1 - ease((ms - p.departure - 300) / 260);
    if (ms >= p.arrive) {
      // Departure blends from the final action pose, so action timing is held at its start.
      const at = Math.min(ms, p.departure);
      const settle = ease((at - p.arrive) / 250);
      lean = mix(0.12, 0.06, settle);
      nearHand = { x: mix(21, 14, settle), y: mix(4, -6, settle) };
      farHand = { x: mix(19, 12, settle), y: mix(1, -8, settle) };
      // Reach to the chest band, grip, and draw the loose end out toward the card.
      const toChest = ease((at - p.grab) / 170),
        draw = ease((at - p.grab - 190) / 190);
      nearHand = {
        x: mix(mix(nearHand.x, 8.5, toChest), 18, draw),
        y: mix(mix(nearHand.y, -0.5, toChest), -5, draw),
      };
      headTilt = 0.12 * toChest * (1 - draw);
      const laid = mummyBands(p).reduce(
        (sum, _, k) => sum + mummyBandGrowth(p, Math.min(at, p.yankAt), k),
        0,
      );
      bandsLeft = MUMMY_TORSO_BANDS * (1 - laid / p.bands);
      if (at >= p.wrapStart && at < p.yankAt) {
        const feed = ((at - p.wrapStart) / p.wrap) * Math.PI * 2,
          working = 1 - ease((at - p.wrapEnd) / 200);
        nearHand = { x: 18 + 4 * Math.sin(feed) * working, y: -5 + 3 * Math.cos(feed) * working };
        farHand = {
          x: 12 + 3 * Math.sin(feed + Math.PI) * working,
          y: -3 + 2 * Math.cos(feed + Math.PI) * working,
        };
        twist = 0.22 * Math.sin(feed) * working;
        lean = 0.1 + 0.06 * (1 - working);
        headTilt = -0.12 * (1 - working);
        eye = 0.6 + 0.4 * (1 - working);
      }
      if (at >= p.yankAt) {
        let tug = 0;
        for (let k = 0; k < p.bands; k++)
          tug = Math.max(tug, pulse(at, mummyPeelStart(p, k) - 40, 150));
        const brace = ease((at - p.yankAt) / 220) * (1 - ease((at - p.peelEnd) / 300));
        const grip = ease((at - p.yankAt) / 220);
        lean = mix(0.16, -0.14 - 0.1 * tug * p.yank, brace);
        nearHand = { x: mix(18, 17 - 8 * tug, grip), y: -5 - 2 * tug };
        farHand = { x: mix(12, 15 - 7 * tug, grip), y: mix(-3, -4 - 2 * tug, grip) };
        headTilt = mix(-0.12, 0.05, grip);
        crouch = 2.5 * brace;
        eye = 1;
      }
      if (at >= p.peelEnd) {
        const r = ease((at - p.peelEnd) / (p.rewindEnd - p.peelEnd));
        if (p.rewind) {
          twist = -side * p.turns * Math.PI * 2 * r;
          bandsLeft = MUMMY_TORSO_BANDS * r;
          nearHand = { x: mix(17, 6, r), y: mix(-5, 13, pulse(r, 0, 1)) };
          farHand = { x: mix(15, 5, r), y: mix(-4, 12, pulse(r, 0, 1)) };
        } else {
          bandsLeft = 0;
          headTilt = 0.05 + 0.3 * pulse(r, 0, 1);
          nearHand = { x: mix(17, 10, r), y: mix(-5, -12, r) };
          farHand = { x: mix(15, 9, r), y: mix(-4, -11, r) };
        }
      }
    }
    if (p.lookBack) {
      // One last look at the viewer, held in world space while the body turns to leave.
      const look = ease((ms - p.rewindEnd) / 260) * (1 - ease((ms - p.departure - 700) / 400));
      headTurn = mix(headTurn, (-Math.PI / 2 - yaw) * 0.62, look);
      if (look > 0) eye = 1;
    }
    if (ms >= p.departure) {
      const go = ease((ms - p.departure) / 380);
      bandsLeft = p.rewind ? MUMMY_TORSO_BANDS : 0;
      lean = mix(lean, 0.14, go);
      nearHand = { x: mix(nearHand.x, 21, go), y: mix(nearHand.y, 3, go) };
      farHand = { x: mix(farHand.x, 19, go), y: mix(farHand.y, 0, go) };
    }
    return {
      ...MUMMY_REST,
      walked,
      drag: p.drag,
      lean,
      twist,
      headTurn,
      headTilt,
      front: side > 0 ? nearHand : farHand,
      back: side > 0 ? farHand : nearHand,
      bandsLeft,
      eye,
      flutter: walked * 0.35 + ms * 0.004,
      crouch,
      planted,
    };
  }

  private updateRibbon(
    ms: number,
    b: TargetBounds,
    q: CardPose,
    side: Side,
    stand: Point,
    view: Point,
    fit: number,
    scale: number,
  ) {
    const p = this.plan,
      bands = mummyBands(p);
    const grip = side > 0 ? this.model.grip : this.model.backGrip;
    this.model.unravel.position.z = side > 0 ? 3.2 : -3.2;
    const torso = screenOf(this.model.unravel),
      hand = screenOf(grip);
    const nearU = side > 0 ? 0 : 1;
    let visible = ms >= p.grab + 150 && ms < MUMMY_DURATION;
    let end: Point = hand,
      bend: Point;
    if (ms < p.wrapStart) {
      end = hand;
    } else if (ms < p.yankAt) {
      end = onCard(q, nearU, mummyFeed(p, ms).v, b);
    } else if (ms < p.peelEnd) {
      const f = clamp((ms - mummyPeelStart(p, p.bands - 1)) / 115);
      const at = Math.max(0, bands.length - 1 - f),
        i = Math.floor(at);
      end = onCard(q, nearU, mix(bands[i] ?? 0, bands[i + 1] ?? bands[i] ?? 0, at - i), b);
    }
    const sag = (a: Point, c: Point, amount: number): Point => ({
      x: (a.x + c.x) / 2,
      y: (a.y + c.y) / 2 + amount,
    });
    bend = sag(hand, end, ms < p.yankAt ? 8 * fit : 2 * fit);
    if (ms >= p.peelEnd) {
      const top = onCard(q, nearU, bands[0] ?? 0.1, b);
      const r = ease((ms - p.peelEnd) / (p.rewindEnd - p.peelEnd));
      if (p.rewind) {
        // The torn bandage is reeled back and wound around the spinning torso.
        const fall = ease((ms - p.peelEnd) / 260);
        const loose = { x: mix(top.x, hand.x, 0.45), y: mix(top.y, stand.y - 4, fall) };
        end = { x: mix(loose.x, torso.x, r), y: mix(loose.y, torso.y, r) };
        bend = sag(hand, end, 10 * fit * (1 - r));
        visible = visible && r < 0.98;
      } else {
        // The torn bandage drops to the floor and is dragged along behind the mummy.
        const exit = mummyExitPoint(p, b, view, side);
        const dx = exit.x - stand.x,
          dy = exit.y - stand.y,
          length = Math.hypot(dx, dy) || 1;
        const floor = { x: hand.x, y: stand.y };
        const fall = ease((ms - p.peelEnd) / 320);
        bend = {
          x: mix(sag(hand, top, 4).x, floor.x, fall),
          y: mix(sag(hand, top, 4).y, floor.y, fall),
        };
        const tail = {
          x: floor.x - (dx / length) * TRAIL * fit,
          y: floor.y - (dy / length) * TRAIL * fit,
        };
        end = { x: mix(top.x, tail.x, fall), y: mix(top.y, tail.y, fall) };
      }
    }
    const points = this.curve.points;
    points[0]?.set(torso.x, -torso.y, DEPTH + 6 * scale);
    points[1]?.set(hand.x, -hand.y, DEPTH + 7 * scale);
    points[2]?.set(bend.x, -bend.y, DEPTH - 4);
    points[3]?.set(end.x, -end.y, DEPTH - 12);
    this.ribbon.visible = visible;
    if (!visible) return;
    const width = 3.3 * fit;
    setStrip(
      this.ribbon.geometry,
      RIBBON_SEGMENTS,
      (t, out) => this.curve.getPoint(t, out),
      (t) => width * (0.85 + 0.15 * Math.sin(t * 19 + p.phase)) * (t < 0.04 ? 0.6 + t * 10 : 1),
    );
  }

  private updateBands(ms: number, b: TargetBounds, q: CardPose, side: Side) {
    const p = this.plan,
      bands = mummyBands(p);
    const nearU = side > 0 ? -0.03 : 1.03,
      farU = side > 0 ? 1.03 : -0.03;
    this.bands.forEach((band, k) => {
      const v = bands[k] ?? 0.5,
        grow = mummyBandGrowth(p, ms, k);
      band.visible = grow > 0.001 && ms < MUMMY_DURATION;
      if (!band.visible) return;
      const a = onCard(q, nearU, v - 0.035, b),
        full = onCard(q, farU, v + 0.035, b);
      const dx = (full.x - a.x) * grow,
        dy = (full.y - a.y) * grow;
      band.position.set(a.x, -a.y, DEPTH - 14 + k * 0.1);
      band.rotation.z = Math.atan2(-dy, dx);
      band.scale.set(Math.hypot(dx, dy), MUMMY_BAND_WIDTH * b.height * q.sy, 1);
    });
  }

  private updateEyes(ms: number, b: TargetBounds, q: CardPose, side: Side) {
    const p = this.plan;
    const open = ease((ms - p.stare) / 220) * (1 - ease((ms - p.yankAt - 60) / 140));
    let lid = 1;
    for (let i = 0; i < p.blinks; i++)
      lid = Math.min(lid, 1 - pulse(ms, p.stare + 760 + i * 220, 160));
    // After the blinks the eyes narrow into a hard, level stare.
    lid *= 1 - 0.45 * ease((ms - p.stare - 760 - p.blinks * 220) / 260);
    const look =
      p.glance * -side * pulse(ms, p.stare + 180, 620) +
      0.25 * Math.sin(ms / 140 + p.phase) * pulse(ms, p.stare + 760, p.yankAt - p.stare - 760);
    this.eyes.forEach((eye, i) => {
      eye.group.visible = open > 0.01;
      if (!eye.group.visible) return;
      const at = onCard(q, i ? 0.66 : 0.34, MUMMY_EYE_V, b);
      eye.group.position.set(at.x, -at.y, DEPTH - 13.5);
      eye.group.rotation.z = cardTurn(q);
      const rx = 0.075 * b.width * q.sx,
        ry = 0.036 * b.height * q.sy;
      eye.socket.scale.set(rx * 1.3, ry * 1.25 * Math.max(0.35, open), 1);
      eye.ball.scale.set(rx, ry * open * Math.max(0.06, lid), 1);
      eye.iris.position.x = look * 0.4;
      eye.pupil.position.x = look * 0.42;
    });
  }
}
