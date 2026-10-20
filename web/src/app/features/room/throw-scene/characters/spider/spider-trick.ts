import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  blobShape,
  cardFit,
  cardPoint,
  cardTurn,
  clamp,
  ease,
  glow,
  lineGeometry,
  mix,
  onCard,
  part,
  pulse,
  screenOf,
  setLine,
  setStrip,
  sideOf,
  span,
  stripGeometry,
  type CardPose,
  type CharacterRoutine,
  type Side,
} from '../../kit';
import {
  SPIDER_DURATION,
  SPIDER_HUB,
  SPIDER_SCALE,
  spiderAnchor,
  spiderBiteSpot,
  spiderCardPose,
  spiderDrop,
  spiderFold,
  spiderFrames,
  spiderProgress,
  spiderRoute,
  type SpiderPlan,
} from './spider-choreography';
import { spiderModel, spiderPose, type SpiderModel } from './spider-model';

const DEPTH = 176;
const SILK = 0xeef3f7;
/** Fang tip distance ahead of the body origin, in model units. */
const FANG_REACH = 14.1;

interface Bite {
  readonly holes: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[];
  readonly bruise: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  readonly venom: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly blood: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
}

export class SpiderTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: SpiderPlan;
  readonly duration: number;
  private readonly model: SpiderModel;
  private readonly spokes: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[] = [];
  private readonly spiral: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly bites: Bite[] = [];
  private readonly routeLengths = new Float32Array(25);

  constructor(actor: THREE.Group) {
    this.model = spiderModel(actor);
    this.plan = this.model.plan;
    this.duration = SPIDER_DURATION * this.plan.pace;
    this.object.name = 'spider-web';
    this.object.add(this.silkLine('spider-dragline-silk'), this.silkLine('spider-dropline-silk'));
    for (let i = 0; i < 8; i++) this.spokes.push(this.silkLine(`spider-spoke-${i}`, 12));
    this.spiral = this.silkLine('spider-spiral', 8 * 3 + 1);
    for (const s of this.spokes) this.object.add(s);
    this.object.add(this.spiral);
    for (let i = 0; i < 2; i++) {
      const holes = [0, 1].map((k) =>
        part(
          this.object,
          `spider-puncture-${i}-${k}`,
          new THREE.CircleGeometry(1, 10),
          glow(0x2a0308),
        ),
      );
      this.bites.push({
        holes,
        bruise: part(
          this.object,
          `spider-bruise-${i}`,
          new THREE.ShapeGeometry(blobShape(i * 2.1 + this.plan.phase, 6, 0.22)),
          glow(0x4a1a4f, 0),
        ),
        venom: part(this.object, `spider-venom-${i}`, stripGeometry(8), glow(0x7fdc3a)),
        blood: part(this.object, `spider-blood-${i}`, stripGeometry(8), glow(0x8c0c1f)),
      });
    }
  }

  private silkLine(
    name: string,
    points = 2,
  ): THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> {
    const line = new THREE.Line(
      lineGeometry(points),
      new THREE.LineBasicMaterial({ color: SILK, transparent: true, opacity: 0.85 }),
    );
    line.name = name;
    return line;
  }
  private named(name: string): THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> {
    const line = this.object.getObjectByName(name);
    if (!(line instanceof THREE.Line) || !(line.material instanceof THREE.LineBasicMaterial))
      throw new Error(`Missing ${name}`);
    return line;
  }

  cardAnimation(facing: number) {
    return spiderFrames(this.plan, facing);
  }

  private measure(start: Point, b: TargetBounds, view: Point, side: Side) {
    let previous = spiderRoute(this.plan, 0, start, b, view, side);
    this.routeLengths[0] = 0;
    for (let i = 1; i <= 24; i++) {
      const at = spiderRoute(this.plan, i / 24, start, b, view, side);
      this.routeLengths[i] =
        (this.routeLengths[i - 1] ?? 0) + Math.hypot(at.x - previous.x, at.y - previous.y);
      previous = at;
    }
  }
  private along(u: number) {
    const f = clamp(u) * 24,
      i = Math.min(23, Math.floor(f));
    return mix(this.routeLengths[i] ?? 0, this.routeLengths[i + 1] ?? 0, f - i);
  }

  /** Body placement that puts the real fang tip on the bite spot for the given heading. */
  private strikeBody(spot: Point, heading: number, scale: number): Point {
    return {
      x: spot.x - Math.cos(heading) * FANG_REACH * scale,
      y: spot.y + Math.sin(heading) * FANG_REACH * scale,
    };
  }

  /** Card-space choreography after landing: orbiting the hub, aiming, striking and the exits. */
  private onCard(ms: number, b: TargetBounds, q: CardPose, scale: number, view: Point, side: Side) {
    const p = this.plan;
    const hub = onCard(q, SPIDER_HUB.u, SPIDER_HUB.v, b);
    // Spinning on the hub to pay out each spoke in turn; legs step as it turns.
    const weaveEnd = p.tighten - 80;
    const turned = Math.PI * 2 * 1.15 * ease(span(ms, p.weave, weaveEnd - p.weave));
    let at = hub,
      heading = -Math.PI / 2 + p.turn * turned,
      walked = turned * 15,
      rear = 0,
      pitch = 0,
      fangs = 0;
    if (ms >= p.tighten - 80) {
      // Each bite: turn to face the spot, rear up, lunge so the real fangs meet the live card,
      // hold while pumping venom, pull back, then turn toward the next spot.
      let ready: Point = hub,
        facingAngle = -Math.PI / 2 + p.turn * Math.PI * 2 * 1.15;
      for (let i = 0; i < p.strikes.length; i++) {
        const strike = p.strikes[i] ?? p.rear;
        const begin = i === 0 ? p.tighten - 80 : (p.strikes[i - 1] ?? strike) + 600;
        if (ms < begin) break;
        const spot = spiderBiteSpot(p, i);
        const target = onCard(q, spot.u, spot.v, b);
        const aim = Math.atan2(-(target.y - hub.y), target.x - hub.x);
        const wrapped = aim + Math.round((facingAngle - aim) / (Math.PI * 2)) * Math.PI * 2;
        const face = ease((ms - begin) / 300);
        heading = mix(facingAngle, wrapped, face);
        const body = this.strikeBody(target, heading, scale);
        const back = {
          x: body.x - Math.cos(heading) * 6 * scale,
          y: body.y + Math.sin(heading) * 6 * scale,
        };
        const lunge = ease((ms - strike + 110) / 110),
          release = ease((ms - strike - 380) / 220);
        const stance = { x: mix(ready.x, back.x, face), y: mix(ready.y, back.y, face) };
        at = {
          x: mix(stance.x, body.x, lunge * (1 - release)),
          y: mix(stance.y, body.y, lunge * (1 - release)),
        };
        // It stays reared between bites, dropping only for each lunge.
        rear = (i === 0 ? ease((ms - p.rear) / 260) : 1) * (1 - lunge * (1 - release));
        fangs = Math.max(rear, pulse(ms, strike - 110, 140));
        ready = back;
        facingAngle = wrapped;
      }
      pitch = 0.55 * rear;
      walked += (Math.hypot(at.x - hub.x, at.y - hub.y) * 0.8) / scale;
    }
    if (ms >= p.departure) {
      const last = { ...at };
      const t = span(ms, p.departure, p.exitEnd - p.departure);
      if (p.climb) {
        const anchor = spiderAnchor(b, side);
        const turn = ease((ms - p.departure) / 220);
        heading = mix(
          heading,
          Math.PI / 2 + Math.round((heading - Math.PI / 2) / (Math.PI * 2)) * Math.PI * 2,
          turn,
        );
        const climb = ease(span(ms, p.departure + 200, p.exitEnd - p.departure - 200));
        at = { x: mix(last.x, anchor.x, climb), y: mix(last.y, anchor.y - 60, climb) };
        walked += (Math.hypot(at.x - last.x, at.y - last.y) / scale) * 1.4;
      } else {
        const floor = b.top + b.height + 18;
        const edge = { x: last.x, y: b.top + b.height - 4 };
        const exit = { x: side > 0 ? view.x + 90 : -90, y: floor };
        const turn = ease((ms - p.departure) / 220);
        const down =
          -Math.PI / 2 + Math.round((heading + Math.PI / 2) / (Math.PI * 2)) * Math.PI * 2;
        const leave = side > 0 ? 0 : Math.PI;
        const toEdge = ease(span(t, 0.08, 0.2)),
          dropT = ease(span(t, 0.28, 0.14)),
          run = span(t, 0.42, 0.58);
        heading = mix(
          mix(heading, down, turn),
          leave + Math.round((down - leave) / (Math.PI * 2)) * Math.PI * 2,
          ease(run / 0.15),
        );
        at = {
          x: mix(mix(last.x, edge.x, toEdge), exit.x, run * run),
          y: mix(mix(last.y, edge.y, toEdge), floor, dropT),
        };
        walked += (Math.hypot(at.x - last.x, at.y - last.y) / scale) * 1.2;
      }
    }
    return { at, heading, walked, rear, pitch, fangs };
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
    this.object.visible = ms < SPIDER_DURATION;
    this.object.position.set(0, 0, 0);
    const scale = SPIDER_SCALE * cardFit(b);
    const q = spiderCardPose(p, ms, side);
    const anchor = spiderAnchor(b, side);
    this.measure(start, b, view, side);
    const hub = onCard(q, SPIDER_HUB.u, SPIDER_HUB.v, b);
    let at: Point,
      heading: number,
      walked = this.along(1) / scale,
      planted = 1,
      rear = 0,
      pitch = 0,
      fangs = 0,
      fold = 0;
    if (ms < p.travel) {
      const t = ms / p.travel,
        u = spiderProgress(p, t);
      at = spiderRoute(p, u, start, b, view, side);
      const ahead = spiderRoute(p, Math.min(1, u + 0.02), start, b, view, side),
        behind = spiderRoute(p, Math.max(0, u - 0.02), start, b, view, side);
      heading = Math.atan2(-(ahead.y - behind.y), ahead.x - behind.x);
      walked = this.along(u) / scale;
      planted = 0;
      fold = spiderFold(p, ms);
      // Turn head-down as it reaches the top, ready to drop.
      heading = mix(
        heading,
        -Math.PI / 2 + Math.round((heading + Math.PI / 2) / (Math.PI * 2)) * Math.PI * 2,
        fold,
      );
    } else if (ms < p.landed) {
      const d = spiderDrop(p, ms);
      at = { x: mix(anchor.x, hub.x, Math.min(1, d)), y: mix(anchor.y, hub.y, d) };
      heading = -Math.PI / 2;
      fold = 1 - ease((ms - p.landed + 200) / 200);
    } else {
      const placed = this.onCard(ms, b, q, scale, view, side);
      at = placed.at;
      heading = placed.heading;
      walked += placed.walked;
      rear = placed.rear;
      pitch = placed.pitch;
      fangs = placed.fangs;
      fold = 1 - ease((ms - p.landed) / 240);
      planted = ms >= p.weave && ms < p.tighten - 80 ? 0 : ms >= p.departure ? 0 : 1;
    }
    actor.visible = ms < SPIDER_DURATION;
    actor.position.set(at.x, -at.y, DEPTH);
    actor.rotation.set(0, 0, heading);
    actor.scale.setScalar(scale);
    let pump = 0;
    for (const s of p.strikes)
      pump = Math.max(pump, pulse(ms, s + 60, 140), pulse(ms, s + 220, 140));
    spiderPose(actor, {
      walked,
      planted,
      fold,
      pitch,
      rear,
      fangs,
      pump,
      twitch: ms < p.descend ? 0 : (ms - p.descend) / 1000,
    });
    actor.updateMatrixWorld(true);
    this.updateSilk(ms, b, q, anchor, hub, scale);
    this.updateBites(ms, b, q, scale);
  }

  private updateSilk(
    ms: number,
    b: TargetBounds,
    q: CardPose,
    anchor: Point,
    hub: Point,
    scale: number,
  ) {
    const p = this.plan;
    const fade = 1 - ease((ms - p.exitEnd) / 300);
    const spinneret = screenOf(this.model.spinneret);
    const drag = this.named('spider-dragline-silk');
    // The dragline holds from the top until the spider climbs it or cuts it to drop away.
    const cut = !p.climb && ms >= p.departure;
    drag.visible = ms >= p.travel - 60 && !cut && ms < p.exitEnd;
    if (drag.visible)
      setLine(drag.geometry, (t, out) =>
        out.set(mix(anchor.x, spinneret.x, t), -mix(anchor.y, spinneret.y, t), DEPTH - 1),
      );
    const drop = this.named('spider-dropline-silk');
    const t = span(ms, p.departure, p.exitEnd - p.departure);
    drop.visible = cut && t > 0.2 && t < 0.62;
    if (drop.visible) {
      const edge = onCard(q, 0.5, 1, b);
      const from = { x: spinneret.x, y: edge.y };
      setLine(drop.geometry, (s, out) =>
        out.set(mix(from.x, spinneret.x, s), -mix(from.y, spinneret.y, s), DEPTH - 1),
      );
    }
    const sag = 1 - ease((ms - p.tighten) / 380);
    const anchors = Array.from({ length: p.spokes }, (_, k) => {
      const a = (k / p.spokes) * Math.PI * 2 + 0.3;
      const u = 0.5 + Math.cos(a) * 0.62,
        v = SPIDER_HUB.v + Math.sin(a) * 0.5;
      return { u: Math.max(-0.03, Math.min(1.03, u)), v: Math.max(-0.02, Math.min(1.02, v)) };
    });
    this.spokes.forEach((spoke, k) => {
      const laidAt = p.weave + k * 120;
      const grow = ease((ms - laidAt) / 120);
      const spot = anchors[k];
      spoke.visible = k < p.spokes && grow > 0 && fade > 0 && spot !== undefined;
      if (!spoke.visible || !spot) return;
      const end = onCard(q, spot.u, spot.v, b);
      // Silk pays out from the spinneret to the edge, then is fixed at the hub.
      const from = grow < 1 ? spinneret : hub;
      const dx = end.x - from.x,
        dy = end.y - from.y,
        l = Math.hypot(dx, dy) || 1;
      setLine(spoke.geometry, (s, out) => {
        const r = s * grow,
          bow = Math.sin(Math.PI * r) * 3 * scale * sag;
        out.set(from.x + dx * r - (dy / l) * bow, -(from.y + dy * r + (dx / l) * bow), DEPTH - 8);
      });
      spoke.material.opacity = 0.8 * fade;
    });
    const spiralStart = p.weave + p.spokes * 120,
      reveal = span(ms, spiralStart, 560);
    this.spiral.visible = reveal > 0 && fade > 0;
    if (this.spiral.visible) {
      const count = this.spiral.geometry.getAttribute('position').count;
      setLine(this.spiral.geometry, (s, out) => {
        const ring = s * 3,
          a = s * Math.PI * 2 * 3 + 0.3;
        const r = 0.22 + (ring / 3) * 0.6;
        const point = onCard(
          q,
          0.5 + Math.cos(a) * 0.62 * r,
          SPIDER_HUB.v + Math.sin(a) * 0.5 * r,
          b,
        );
        out.set(point.x, -point.y, DEPTH - 7.9);
      });
      this.spiral.geometry.setDrawRange(0, Math.max(2, Math.floor(count * reveal)));
      this.spiral.material.opacity = 0.75 * fade;
    }
  }

  private updateBites(ms: number, b: TargetBounds, q: CardPose, scale: number) {
    const p = this.plan;
    const fade = 1 - ease((ms - p.exitEnd) / 300);
    const turn = cardTurn(q);
    this.bites.forEach((bite, i) => {
      const strike = p.strikes[i];
      const shown = strike !== undefined && ms >= strike && fade > 0;
      for (const m of [...bite.holes, bite.bruise, bite.venom, bite.blood]) m.visible = shown;
      if (!shown || strike === undefined) return;
      const spot = spiderBiteSpot(p, i);
      const raw = { x: b.left + spot.u * b.width, y: b.top + spot.v * b.height };
      const at = cardPoint(q, raw, b);
      bite.holes.forEach((hole, k) => {
        const point = cardPoint(q, { x: raw.x + (k ? 1.3 : -1.3) * scale, y: raw.y }, b);
        hole.position.set(point.x, -point.y, DEPTH - 9);
        hole.scale.setScalar(0.85 * scale);
        hole.material.opacity = fade;
      });
      const spread = ease((ms - strike) / 900);
      bite.bruise.position.set(at.x, -at.y, DEPTH - 10);
      bite.bruise.rotation.z = turn + i;
      bite.bruise.scale.setScalar((2 + 8 * spread) * scale);
      bite.bruise.material.opacity = 0.5 * fade * Math.min(1, spread * 3);
      const runs: [THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>, number, number][] = [
        [bite.venom, -1.3, 0.75],
        [bite.blood, 1.3, 1],
      ];
      for (const [mesh, offset, k] of runs) {
        const length = (4 + 14 * ease((ms - strike - 120) / 1100)) * k * scale;
        setStrip(
          mesh.geometry,
          8,
          (s, out) => {
            const point = cardPoint(
              q,
              { x: raw.x + offset * scale + Math.sin(s * 6 + i) * 0.5, y: raw.y + s * length },
              b,
            );
            out.set(point.x, -point.y, DEPTH - 8.8);
          },
          (s) => (1.4 - 0.7 * s) * scale,
        );
        mesh.material.opacity = fade;
      }
    });
  }
}
