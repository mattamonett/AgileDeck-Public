import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  blobShape,
  cardFit,
  cardTurn,
  clamp,
  ease,
  glow,
  keepInView,
  mix,
  onCard,
  part,
  pulse,
  screenOf,
  setStrip,
  sideOf,
  span,
  stripGeometry,
  NEUTRAL_CARD,
  type CardPose,
  type CharacterRoutine,
  type Side,
} from '../../kit';
import {
  WITCH_DROPS,
  WITCH_DROP_GAP,
  WITCH_DURATION,
  WITCH_FALL,
  WITCH_SCALE,
  witchCardPose,
  witchCroak,
  witchDropTarget,
  witchExit,
  witchFlight,
  witchFrames,
  witchFrog,
  witchHop,
  type WitchPlan,
} from './witch-choreography';
import { witchModel, witchPose, type WitchModel, type WitchPose, webbedFoot } from './witch-model';

const DEPTH = 182;
const FROG = 0x67a83b,
  FROG_DARK = 0x3f7524,
  MAGIC = 0x9d5cff;

interface FrogEye {
  readonly group: THREE.Group;
  readonly lid: THREE.Mesh;
  readonly pupil: THREE.Mesh;
}
interface Spark {
  readonly mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  readonly angle: number;
  readonly speed: number;
}

function frogEye(parent: THREE.Object3D, name: string): FrogEye {
  const group = new THREE.Group();
  group.name = name;
  parent.add(group);
  part(group, `${name}-dome`, new THREE.CircleGeometry(1, 20), glow(FROG));
  part(group, `${name}-rim`, new THREE.RingGeometry(0.92, 1.05, 20), glow(FROG_DARK), 0, 0, 0.05);
  part(group, `${name}-ball`, new THREE.CircleGeometry(0.72, 18), glow(0xf6f1d2), 0, 0.08, 0.1);
  part(group, `${name}-iris`, new THREE.CircleGeometry(0.55, 18), glow(0xd9a12a), 0, 0.08, 0.15);
  const pupil = part(
    group,
    `${name}-pupil`,
    new THREE.CircleGeometry(0.5, 14),
    glow(0x120c06),
    0,
    0.08,
    0.2,
  );
  pupil.scale.set(1, 0.32, 1);
  part(group, `${name}-shine`, new THREE.CircleGeometry(0.12, 8), glow(0xffffff), 0.2, 0.3, 0.25);
  const lid = part(
    group,
    `${name}-lid`,
    new THREE.CircleGeometry(0.78, 18),
    glow(FROG_DARK),
    0,
    0.08,
    0.3,
  );
  return { group, lid, pupil };
}

export class WitchTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: WitchPlan;
  readonly duration: number;
  private readonly model: WitchModel;
  private readonly actor: THREE.Group;
  private readonly drops: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly splashes: Spark[] = [];
  private readonly stains: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly ring = part(
    this.object,
    'witch-magic-ring',
    new THREE.RingGeometry(0.8, 1, 32),
    glow(0x8dff6a, 0),
  );
  private readonly eyes: FrogEye[];
  private readonly feet: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly haunches: THREE.Group[] = [];
  private readonly spots: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly smile = part(this.object, 'frog-smile', stripGeometry(12), glow(0x2c4d1a));
  private readonly sac = part(
    this.object,
    'frog-throat',
    new THREE.CircleGeometry(1, 20),
    glow(0xd9e8a2),
  );
  private readonly tongue = part(this.object, 'frog-tongue', stripGeometry(10), glow(0xe46f8f));
  private readonly bolt = part(
    this.object,
    'witch-bolt',
    new THREE.CircleGeometry(1, 14),
    glow(0xe4c8ff),
  );
  private readonly trail: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly fizz: Spark[] = [];
  private readonly smoke: Spark[] = [];
  private readonly glitter: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly freeCork: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;

  constructor(actor: THREE.Group) {
    this.actor = actor;
    this.model = witchModel(actor);
    this.plan = this.model.plan;
    this.duration = WITCH_DURATION * this.plan.pace;
    this.object.name = 'witch-frog-spell';
    const r = seededRandom(`${this.plan.phase}:witch-spell`);
    for (let i = 0; i < WITCH_DROPS; i++) {
      this.drops.push(
        part(this.object, `witch-drop-${i}`, new THREE.SphereGeometry(1, 10, 8), glow(0x7dff5a)),
      );
      const stain = part(
        this.object,
        `witch-stain-${i}`,
        new THREE.ShapeGeometry(blobShape(i * 1.7 + this.plan.phase)),
        glow(0x5fd64a, 0),
      );
      this.stains.push(stain);
      for (let k = 0; k < 6; k++)
        this.splashes.push({
          mesh: part(
            this.object,
            `witch-splash-${i}-${k}`,
            new THREE.CircleGeometry(1, 8),
            glow(k % 2 ? 0x9cff74 : 0x52d63c),
          ),
          angle: (k / 6) * Math.PI * 2 + r() * 0.6,
          speed: 18 + r() * 22,
        });
    }
    this.eyes = [frogEye(this.object, 'frog-eye-0'), frogEye(this.object, 'frog-eye-1')];
    for (let i = 0; i < 2; i++) {
      this.feet.push(part(this.object, `frog-foot-${i}`, webbedFoot(), glow(FROG)));
      const haunch = new THREE.Group();
      haunch.name = `frog-haunch-${i}`;
      part(haunch, 'frog-thigh', new THREE.CircleGeometry(1, 18), glow(FROG), 0, 0, 0).scale.set(
        1,
        0.62,
        1,
      );
      part(
        haunch,
        'frog-thigh-shade',
        new THREE.CircleGeometry(1, 18),
        glow(FROG_DARK),
        0.15,
        -0.2,
        -0.05,
      ).scale.set(1.05, 0.66, 1);
      const shin = part(haunch, 'frog-shin', new THREE.PlaneGeometry(1.8, 0.42), glow(FROG));
      shin.position.set(-0.4, -0.55, 0.05);
      part(haunch, 'frog-hind-foot', webbedFoot(), glow(FROG), -1.3, -0.65, 0.06).scale.setScalar(
        0.42,
      );
      this.object.add(haunch);
      this.haunches.push(haunch);
    }
    for (let i = 0; i < 6; i++)
      this.spots.push(
        part(this.object, `frog-spot-${i}`, new THREE.CircleGeometry(1, 14), glow(FROG_DARK, 0)),
      );
    for (let i = 0; i < 8; i++)
      this.trail.push(
        part(this.object, `witch-bolt-trail-${i}`, new THREE.CircleGeometry(1, 8), glow(MAGIC)),
      );
    for (let i = 0; i < 8; i++)
      this.fizz.push({
        mesh: part(this.object, `witch-fizz-${i}`, new THREE.CircleGeometry(1, 8), glow(0xffd36a)),
        angle: r() * Math.PI * 2,
        speed: 15 + r() * 25,
      });
    for (let i = 0; i < 10; i++)
      this.smoke.push({
        mesh: part(
          this.object,
          `witch-poof-${i}`,
          new THREE.CircleGeometry(1, 14),
          glow(i % 2 ? 0x6b4a8f : 0xa58bc7, 0),
        ),
        angle: (i / 10) * Math.PI * 2 + r() * 0.4,
        speed: 14 + r() * 14,
      });
    for (let i = 0; i < 12; i++)
      this.glitter.push(
        part(
          this.object,
          `witch-glitter-${i}`,
          new THREE.CircleGeometry(1, 6),
          glow(i % 3 ? 0xc9a6ff : 0x8dff6a),
        ),
      );
    this.freeCork = part(
      this.object,
      'witch-flying-cork',
      new THREE.CylinderGeometry(0.75, 0.6, 1.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x9c6a3c, roughness: 0.9 }),
    );
  }

  cardAnimation(facing: number) {
    return witchFrames(this.plan, facing);
  }

  private stillness(ms: number): number {
    const p = this.plan;
    const pour = ms > p.pour - 160 && ms < p.pour + WITCH_DROPS * WITCH_DROP_GAP + 80;
    const cast = ms > p.cast - 120 && ms < p.hit + 80;
    return pour || cast ? 0 : 1;
  }

  private pose(ms: number): WitchPose {
    const p = this.plan;
    const flying = 1 - ease((ms - p.arrive + 150) / 300),
      leaving = ease((ms - p.departure) / 300);
    const cackle = span(ms, p.contact + 180, 60) * (1 - span(ms, p.cast - 160, 120));
    const jawFlap = cackle * (0.55 + 0.45 * Math.sin(ms / 42));
    let front = { x: 3, y: 11 },
      frontTurn: number | null = null,
      headTilt = 0;
    // Hold the hat on in flight, fetch the potion from the belt, pour, point, then toss or pocket it.
    const toBelt = ease((ms - p.arrive) / 220),
      lift = ease((ms - p.uncork - 120) / 200);
    front = { x: mix(mix(3, 1.5, toBelt), 8, lift), y: mix(mix(11, -12, toBelt), 1, lift) };
    if (ms >= p.uncork + 120) frontTurn = 0;
    const tip =
      ease((ms - p.pour + 160) / 160) *
      (1 - ease((ms - p.pour - WITCH_DROPS * WITCH_DROP_GAP) / 200));
    front = { x: mix(front.x, 16, tip), y: mix(front.y, -9, tip) };
    if (frontTurn !== null) frontTurn = -1.95 * tip;
    const point = ease((ms - p.cast + 120) / 120) * (1 - ease((ms - p.hit - 60) / 200));
    front = { x: mix(front.x, 13, point), y: mix(front.y, -4, point) };
    if (this.plan.toss) {
      const wind = pulse(ms, p.tossAt, 200),
        fling = ease((ms - p.tossAt - 120) / 120);
      front = {
        x: mix(front.x, 2, wind) + 12 * fling * (1 - leaving),
        y: mix(front.y, 10, wind) + 4 * fling * (1 - leaving),
      };
    } else {
      const stow = pulse(ms, p.tossAt, 380);
      front = { x: mix(front.x, 1.5, stow), y: mix(front.y, -12, stow) };
    }
    front = { x: mix(front.x, 18, leaving), y: mix(front.y, -14, leaving) };
    if (leaving > 0.5) frontTurn = null;
    headTilt =
      0.35 * cackle +
      0.12 * pulse(ms, p.pour - 200, 700) * -1 -
      0.25 * pulse(ms, p.tongueAt + 120, 360);
    return {
      lean: 0.12 + 0.18 * flying + 0.22 * leaving - 0.06 * cackle,
      headTilt,
      jaw: Math.max(
        jawFlap,
        0.6 * pulse(ms, p.tongueAt + 120, 300),
        0.5 * leaving * (0.5 + 0.5 * Math.sin(ms / 50)),
      ),
      shake: cackle * ms * 0.001,
      lag: 0.6 * flying + 0.8 * leaving + 0.9 * pulse(ms, p.tongueAt + 110, 420),
      front,
      frontTurn,
      liquid: 1 - 0.85 * ease((ms - p.pour) / (WITCH_DROPS * WITCH_DROP_GAP)),
      corked: ms < p.pop,
      bristle: ms / 60,
      kick: leaving,
    };
  }

  /** Hovering broom position and gentle pitch; both hold still while pouring and casting. */
  private hoverAt(ms: number, hover: Point) {
    const still = this.stillness(ms);
    return {
      point: { x: hover.x, y: hover.y + Math.sin(ms / 260 + this.plan.phase) * 2.5 * still },
      pitch: 0.04 * Math.sin(ms / 330) * still,
    };
  }

  /** Poses the actor at another moment of the hover and reads where a marker is in the world. */
  private markerAt(
    ms: number,
    marker: THREE.Object3D,
    scale: number,
    side: Side,
    at: Point,
    pitch: number,
  ): Point {
    this.actor.position.set(at.x, -at.y, DEPTH);
    this.actor.rotation.set(0, side > 0 ? 0 : -Math.PI, pitch);
    this.actor.scale.setScalar(scale);
    this.holdPotion(ms);
    witchPose(this.actor, this.pose(ms));
    return screenOf(marker);
  }

  /** The potion hangs at the belt, travels in the hand, and finally flies free if tossed. */
  private holdPotion(ms: number) {
    const p = this.plan,
      m = this.model;
    const inHand = ms >= p.uncork + 120 && (p.toss ? ms < p.tossAt + 240 : ms < p.tossAt + 190);
    const hand = m.arms[0].end;
    if (inHand && m.potion.parent !== hand) hand.add(m.potion);
    if (!inHand && !(p.toss && ms >= p.tossAt + 240) && m.potion.parent !== m.holster)
      m.holster.add(m.potion);
    if (m.potion.parent === hand) m.potion.position.set(0, 1.4, 0.4);
    else if (m.potion.parent === m.holster) m.potion.position.set(0, -2, 0);
    m.potion.rotation.set(0, 0, 0);
    m.potion.scale.setScalar(1);
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
    this.object.visible = ms < WITCH_DURATION;
    this.object.position.set(0, 0, 0);
    const fit = cardFit(b),
      scale = WITCH_SCALE * fit;
    const q = witchCardPose(p, ms, side);
    // Measured poses use the same actor, so they run before this frame's pose is applied.
    const offset = this.markerAt(p.pour, this.model.mouth, scale, side, { x: 0, y: 0 }, 0);
    const first = witchDropTarget(p, 0, side);
    const target = onCard(NEUTRAL_CARD, first.u, first.v, b);
    const hover = keepInView(
      { x: target.x - offset.x, y: target.y - 72 * fit - offset.y },
      view,
      30,
      60,
    );
    const measure = (t: number, marker: THREE.Object3D) => {
      const h = this.hoverAt(t, hover);
      return this.markerAt(t, marker, scale, side, h.point, h.pitch);
    };
    const mouth = measure(p.pour, this.model.mouth);
    const finger = measure(p.cast, this.model.finger);
    const corkFrom = measure(p.pop, this.model.mouth);
    const tossFrom = measure(p.tossAt + 239, this.model.mouth);
    const yaw = side > 0 ? 0 : -Math.PI;
    let at: Point = hover,
      pitch = 0,
      turn = yaw;
    if (ms < p.travel) {
      at = witchFlight(p, ms, start, hover, view, side);
      // Heading follows the underlying route; the loop itself is expressed only through pitch.
      const ahead = witchFlight(p, Math.min(p.travel, ms + 20), start, hover, view, side, false),
        behind = witchFlight(p, Math.max(0, ms - 20), start, hover, view, side, false);
      const dx = ahead.x - behind.x,
        dy = ahead.y - behind.y;
      if (Math.hypot(dx, dy) > 0.5)
        turn = -Math.acos(Math.max(-1, Math.min(1, dx / Math.hypot(dx, dy))));
      turn = mix(turn, yaw, ease((ms / p.travel - 0.85) / 0.15));
      pitch = Math.atan2(-dy, Math.max(Math.abs(dx), 12)) * 0.8;
      if (p.loop) pitch += Math.PI * 2 * span(ms / p.travel, 0.35, 0.35);
      pitch *= 1 - ease((ms / p.travel - 0.85) / 0.15);
    } else if (ms >= p.departure) {
      at = witchExit(p, ms, hover, view, side);
      const ahead = witchExit(p, ms + 20, hover, view, side),
        behind = witchExit(p, ms - 20, hover, view, side);
      const dx = ahead.x - behind.x,
        dy = ahead.y - behind.y;
      const away = p.climb ? side : -side;
      turn = mix(yaw, away > 0 ? 0 : -Math.PI, ease((ms - p.departure) / 260));
      pitch = Math.atan2(-dy, Math.max(Math.abs(dx), 12)) * 0.8 * ease((ms - p.departure) / 300);
    } else {
      const h = this.hoverAt(ms, hover);
      at = h.point;
      pitch = h.pitch;
    }
    actor.visible = ms < WITCH_DURATION;
    actor.position.set(at.x, -at.y, DEPTH);
    actor.rotation.set(0, turn, pitch);
    actor.scale.setScalar(scale);
    this.holdPotion(ms);
    witchPose(actor, this.pose(ms));
    actor.updateMatrixWorld(true);
    const floor = b.top + b.height + 6;
    this.updateDrops(ms, b, mouth, side, scale);
    this.updateFrog(ms, b, q, side, scale);
    this.updateSpell(ms, b, q, finger, scale);
    this.updateProps(ms, corkFrom, tossFrom, floor, side, scale);
    this.updateGlitter(ms, hover, view, side, scale);
  }

  private updateDrops(ms: number, b: TargetBounds, mouth: Point, side: Side, scale: number) {
    const p = this.plan;
    this.drops.forEach((drop, i) => {
      const release = p.pour + i * WITCH_DROP_GAP,
        land = release + WITCH_FALL;
      const t = (ms - release) / WITCH_FALL;
      const spot = witchDropTarget(p, i, side);
      const target = onCard(witchCardPose(p, land, side), spot.u, spot.v, b);
      drop.visible = t >= 0 && t < 1;
      if (drop.visible) {
        drop.position.set(mix(mouth.x, target.x, t), -mix(mouth.y, target.y, t * t), DEPTH + 14);
        drop.scale.set(1.1 * scale, (1.4 + 1.2 * t) * scale, 1.1 * scale);
      }
      const age = (ms - land) / 420;
      const now = onCard(witchCardPose(p, ms, side), spot.u, spot.v, b);
      for (let k = 0; k < 6; k++) {
        const s = this.splashes[i * 6 + k];
        if (!s) continue;
        s.mesh.visible = age > 0 && age < 1;
        if (!s.mesh.visible) continue;
        const d = s.speed * easeOutQuick(age) * scale;
        s.mesh.position.set(
          now.x + Math.cos(s.angle) * d,
          -(now.y + Math.sin(s.angle) * d * 0.8 - 30 * age * age * scale),
          DEPTH + 3,
        );
        s.mesh.scale.setScalar((1.2 - age) * scale);
      }
      const stain = this.stains[i];
      if (!stain) return;
      const frog = witchFrog(p, ms);
      stain.visible = ms >= land && frog > 0.01;
      stain.position.set(now.x, -now.y, DEPTH - 22);
      stain.rotation.z = cardTurn(witchCardPose(p, ms, side)) + i;
      stain.scale.setScalar((i ? 2.2 : 3.6) * scale * ease((ms - land) / 120));
      stain.material.opacity = 0.75 * Math.min(1, frog * 1.4);
    });
    const ringAge = (ms - p.contact) / 520;
    const first = witchDropTarget(p, 0, side);
    const at = onCard(witchCardPose(p, ms, side), first.u, first.v, b);
    this.ring.visible = ringAge > 0 && ringAge < 1;
    this.ring.position.set(at.x, -at.y, DEPTH - 2);
    this.ring.scale.setScalar((4 + 40 * ease(ringAge)) * scale);
    this.ring.material.opacity = 0.8 * (1 - ringAge);
  }

  private updateFrog(ms: number, b: TargetBounds, q: CardPose, side: Side, scale: number) {
    const p = this.plan,
      frog = witchFrog(p, ms),
      turn = cardTurn(q);
    const show = frog > 0.01;
    let blink = 0;
    for (const t of [p.hopStart - 160, p.hopStart + p.hops * 520 - 60])
      blink = Math.max(blink, pulse(ms, t, 140));
    const look = Math.sin(ms / 300 + p.phase) * 0.25;
    this.eyes.forEach((eye, i) => {
      const u = i ? 0.73 : 0.27,
        at = onCard(q, u, 0.02, b);
      eye.group.visible = show;
      eye.group.position.set(at.x, -at.y, DEPTH - 20);
      eye.group.rotation.z = turn;
      const size = 0.13 * b.width * q.sx * ease(frog * 1.2);
      // The domes rise up out of the card's top edge.
      eye.group.scale.setScalar(Math.max(0.001, size));
      eye.group.position.y += size * 0.45 * frog;
      eye.lid.scale.y = Math.max(0.02, blink);
      eye.pupil.position.x = look;
    });
    const hop = Array.from({ length: p.hops }, (_, k) => witchHop(p, ms, k)).reduce(
      (m, h) => Math.max(m, h.air),
      0,
    );
    this.feet.forEach((foot, i) => {
      const u = i ? 0.82 : 0.18,
        at = onCard(q, u, 1.0, b);
      foot.visible = show;
      foot.position.set(at.x, -at.y + 1.5 * scale, DEPTH - 19);
      foot.rotation.z = turn + (i ? Math.PI : 0);
      foot.scale.set((i ? -1 : 1) * 3.3 * scale * frog, (i ? -1 : 1) * 3.3 * scale * frog, 1);
    });
    this.haunches.forEach((haunch, i) => {
      const at = onCard(q, i ? 1.0 : 0, 0.8, b);
      haunch.visible = show;
      haunch.position.set(at.x, -at.y, DEPTH - 21);
      haunch.rotation.z = turn + (i ? 0.25 : -0.25) - (i ? 1 : -1) * hop * 0.6;
      haunch.scale.set((i ? -1 : 1) * 9 * scale * frog, 9 * scale * frog * (1 + 0.35 * hop), 1);
    });
    this.spots.forEach((spot, i) => {
      const u = i % 2 ? 0.08 + (i % 3) * 0.04 : 0.88 - (i % 3) * 0.04,
        v = 0.25 + i * 0.11;
      const at = onCard(q, u, v, b);
      spot.visible = show;
      spot.position.set(at.x, -at.y, DEPTH - 22);
      spot.scale.setScalar((1.5 + (i % 3) * 0.8) * scale * frog);
      spot.material.opacity = 0.55 * frog;
    });
    this.smile.visible = show;
    if (show)
      setStrip(
        this.smile.geometry,
        12,
        (t, out) => {
          const at = onCard(q, 0.2 + 0.6 * t, 0.115 + 0.035 * Math.sin(Math.PI * t), b);
          out.set(at.x, -at.y, DEPTH - 20.5);
        },
        () => 1.3 * scale * frog,
      );
    const croak = witchCroak(p, ms);
    const chin = onCard(q, 0.5, 1.0, b);
    this.sac.visible = show && croak > 0.02;
    this.sac.position.set(chin.x, -chin.y - 2 * scale * croak, DEPTH - 18);
    this.sac.scale.set(7 * scale * croak, 5.5 * scale * croak, 1);
    // The tongue flicks out from the frog's mouth to the witch's hat brim and snaps back.
    const reachOut = pulse(ms, p.tongueAt, 260);
    this.tongue.visible = p.tongue && reachOut > 0.02 && show;
    if (this.tongue.visible) {
      const from = onCard(q, 0.5, 0.13, b),
        to = screenOf(this.model.brim);
      setStrip(
        this.tongue.geometry,
        10,
        (t, out) => {
          const k = t * reachOut;
          out.set(
            mix(from.x, to.x, k),
            -(mix(from.y, to.y, k) - Math.sin(Math.PI * k) * 6 * scale),
            DEPTH + 6,
          );
        },
        (t) => (t > 0.9 ? 2.4 : 1.4) * scale,
      );
    }
  }

  private updateSpell(ms: number, b: TargetBounds, q: CardPose, finger: Point, scale: number) {
    const p = this.plan;
    const centre = onCard(q, 0.5, 0.45, b);
    const bolts = p.fizzle ? [p.cast, p.cast + 700] : [p.cast];
    let shown = false;
    bolts.forEach((startAt, n) => {
      const fails = p.fizzle && n === 0;
      const t = span(ms, startAt, 280);
      const travel = fails ? Math.min(t, 0.45) : t;
      const live = ms >= startAt && (fails ? ms < startAt + 160 : ms < startAt + 280);
      if (!live) return;
      shown = true;
      const head = {
        x: mix(finger.x, centre.x, travel),
        y: mix(finger.y, centre.y, travel) - Math.sin(Math.PI * travel) * 18 * scale,
      };
      this.bolt.position.set(head.x, -head.y, DEPTH + 8);
      this.bolt.scale.setScalar((2 + Math.sin(ms / 25)) * scale);
      this.trail.forEach((spark, i) => {
        const back = Math.max(0, travel - (i + 1) * 0.05);
        spark.visible = travel > (i + 1) * 0.05;
        spark.position.set(
          mix(finger.x, centre.x, back) + Math.sin(i * 2 + ms / 40) * 2 * scale,
          -(mix(finger.y, centre.y, back) - Math.sin(Math.PI * back) * 18 * scale),
          DEPTH + 7,
        );
        spark.scale.setScalar((1.4 - i * 0.12) * scale);
      });
    });
    this.bolt.visible = shown;
    if (!shown) for (const spark of this.trail) spark.visible = false;
    // A failed first attempt sputters: sparks spill from where the bolt died.
    const dieAt = p.cast + 160,
      age = (ms - dieAt) / 600;
    const dead = {
      x: mix(finger.x, centre.x, 0.45),
      y: mix(finger.y, centre.y, 0.45) - Math.sin(Math.PI * 0.45) * 18 * scale,
    };
    this.fizz.forEach((s) => {
      s.mesh.visible = p.fizzle && age > 0 && age < 1;
      if (!s.mesh.visible) return;
      const d = s.speed * ease(age) * scale;
      s.mesh.position.set(
        dead.x + Math.cos(s.angle) * d,
        -(dead.y + Math.sin(s.angle) * d * 0.4 + 60 * age * age * scale),
        DEPTH + 6,
      );
      s.mesh.scale.setScalar((1.1 - age) * scale);
    });
    const poof = (ms - p.hit) / 700;
    this.smoke.forEach((s) => {
      s.mesh.visible = poof > 0 && poof < 1;
      if (!s.mesh.visible) return;
      const d = s.speed * ease(poof) * scale;
      s.mesh.position.set(
        centre.x + Math.cos(s.angle) * d,
        -(centre.y + Math.sin(s.angle) * d - 10 * poof * scale),
        DEPTH + 5,
      );
      s.mesh.scale.setScalar((4 + 6 * poof) * scale);
      s.mesh.material.opacity = 0.75 * Math.sin(Math.PI * poof);
    });
  }

  private updateProps(
    ms: number,
    corkFrom: Point,
    tossFrom: Point,
    floor: number,
    side: Side,
    scale: number,
  ) {
    const p = this.plan,
      m = this.model;
    // The cork pops, tumbles and rests on its side on the floor.
    const t = Math.max(0, ms - p.pop) / 1000;
    const rest = floor - 0.75 * scale;
    const vy = -70,
      g = 420;
    const fallTime = (-vy + Math.sqrt(vy * vy + 2 * g * Math.max(0, rest - corkFrom.y))) / g;
    const ft = Math.min(t, fallTime);
    this.freeCork.visible = ms >= p.pop && ms < WITCH_DURATION;
    this.freeCork.position.set(
      corkFrom.x - side * 32 * ft,
      -(corkFrom.y + vy * ft + 0.5 * g * ft * ft),
      DEPTH + 3,
    );
    this.freeCork.rotation.z = t < fallTime ? ft * 14 : Math.PI / 2;
    this.freeCork.scale.setScalar(scale);
    // A tossed bottle arcs over her shoulder, bounces once and rolls to rest on its side.
    if (!p.toss || ms < p.tossAt + 240) return;
    if (m.potion.parent !== this.object) this.object.add(m.potion);
    const s = (ms - p.tossAt - 240) / 1000;
    const radius = 3.1 * scale,
      ground = floor - radius;
    const ux = -side * 70,
      uy = -90,
      gravity = 900;
    const hit =
      (-uy + Math.sqrt(uy * uy + 2 * gravity * Math.max(0, ground - tossFrom.y))) / gravity;
    let x: number, y: number, spin: number;
    if (s < hit) {
      x = tossFrom.x + ux * s;
      y = tossFrom.y + uy * s + 0.5 * gravity * s * s;
      spin = -side * s * 11;
    } else {
      const b2 = s - hit,
        bounce = Math.max(0, 60 * b2 - 0.5 * gravity * b2 * b2);
      const roll = Math.min(b2, 0.35);
      x = tossFrom.x + ux * hit + ux * 0.5 * roll * (1 - roll / 0.7);
      y = ground - bounce;
      // It tips over onto its side and stops rolling.
      const settle = ease(b2 / 0.35);
      spin = -side * (hit * 11 + roll * 6) * (1 - settle) + side * (Math.PI / 2) * settle;
    }
    m.potion.position.set(x, -y, DEPTH + 2);
    m.potion.rotation.set(0, 0, spin);
    m.potion.scale.setScalar(scale);
    m.potion.visible = ms < WITCH_DURATION;
  }

  private updateGlitter(ms: number, hover: Point, view: Point, side: Side, scale: number) {
    const p = this.plan;
    const away = p.climb ? side : -side;
    this.glitter.forEach((g, i) => {
      const born = p.departure + 120 + i * 85,
        age = (ms - born) / 700;
      g.visible = age > 0 && age < 1;
      if (!g.visible) return;
      const at = witchExit(p, born, hover, view, side);
      g.position.set(
        at.x - away * 34 * scale + Math.sin(i * 3) * 4,
        -(at.y + 2 + 18 * age * age),
        DEPTH - 1,
      );
      g.scale.setScalar((1.4 - age) * scale);
      g.material.opacity = 1 - age;
    });
  }
}

const easeOutQuick = (n: number) => 1 - (1 - clamp(n)) ** 2;
