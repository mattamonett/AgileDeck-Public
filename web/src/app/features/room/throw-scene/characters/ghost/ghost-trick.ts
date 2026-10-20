import * as THREE from 'three';
import type { Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import {
  clamp,
  ease,
  easeIn,
  mix,
  screenOf,
  sideOf,
  sideRoute,
  type CharacterRoutine,
  type Side,
} from '../../kit';
import {
  GHOST_DURATION,
  GHOST_HEIGHT,
  GHOST_SHOUT,
  ghostExitPoint,
  ghostFrames,
  ghostLandingPoint,
  ghostLaughing,
  ghostLoom,
  ghostProgress,
  ghostScale,
  ghostFloor,
  ghostShout,
  ghostVisibility,
  spiritState,
  type GhostPlan,
  type SpiritState,
} from './ghost-choreography';
import { GHOST_REST, ghostModel, ghostPose, type GhostModel, type GhostPose } from './ghost-model';
import { SpiritCard, SpiritRig } from './ghost-spirit';

export { makeGhost } from './ghost-model';
export { GHOST_DURATION, GHOST_SHOUT } from './ghost-choreography';

const DEPTH = 170;
const BUBBLE = 360;
/** Clipping constant that keeps the whole scene, used whenever the ghost is not sinking. */
const NO_CLIP = 1e6;

/** A spiky comic-book burst with the shout, drawn once and disposed through `material.map`. */
export function ghostShoutBubble(): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = BUBBLE;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const r = i % 2 ? 118 : 170;
        const x = 180 + Math.cos(a) * r,
          y = 180 + Math.sin(a) * r * 0.78;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#fffdf2';
      ctx.strokeStyle = '#3a2f63';
      ctx.lineWidth = 9;
      ctx.lineJoin = 'round';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#3a2f63';
      ctx.font = 'bold 80px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(GHOST_SHOUT, 180, 186);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture;
  }
  const bubble = new THREE.Sprite(material);
  bubble.name = 'ghost-shout';
  bubble.userData['text'] = GHOST_SHOUT;
  bubble.renderOrder = 10;
  bubble.visible = false;
  return bubble;
}

export class GhostTrick implements CharacterRoutine {
  readonly object = new THREE.Group();
  readonly plan: GhostPlan;
  readonly duration: number;
  readonly spirit: SpiritRig;
  readonly card = new SpiritCard();
  private readonly model: GhostModel;
  private readonly bubble: THREE.Sprite;
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), NO_CLIP);
  private state: SpiritState | null = null;

  constructor(actor: THREE.Group) {
    this.model = ghostModel(actor);
    this.plan = this.model.plan;
    this.duration = GHOST_DURATION * this.plan.pace;
    this.object.name = 'ghost-fright';
    for (const { material } of this.model.materials) material.clippingPlanes = [this.floorPlane];
    this.spirit = new SpiritRig(DEPTH + 6);
    this.object.add(this.spirit.object);
    this.bubble = ghostShoutBubble();
    this.object.add(this.bubble);
  }

  cardAnimation(facing: number, b?: TargetBounds) {
    return ghostFrames(this.plan, facing, b ?? { left: 0, top: 0, width: 84, height: 122 });
  }

  /** The runaway as last placed, for the preview and checks. */
  get spiritNow(): SpiritState | null {
    return this.state;
  }

  // ---------- Where the ghost is ----------

  private floatAt(
    ms: number,
    start: Point,
    stand: Point,
    b: TargetBounds,
    view: Point,
    side: Side,
    scale: number,
  ): Point {
    const p = this.plan;
    if (ms < p.travel) {
      const u = ghostProgress(p, ms);
      const at = sideRoute(start, stand, b, view, side, p.bend, u);
      const ahead = sideRoute(start, stand, b, view, side, p.bend, Math.min(1, u + 0.02));
      const behind = sideRoute(start, stand, b, view, side, p.bend, Math.max(0, u - 0.02));
      const dx = ahead.x - behind.x,
        dy = ahead.y - behind.y,
        d = Math.hypot(dx, dy) || 1;
      // A sideways weave across the route that dies away as it arrives.
      const weave = p.weave * Math.sin(p.waves * Math.PI * u) * Math.sin(Math.PI * u);
      return { x: at.x - (dy / d) * weave, y: at.y + (dx / d) * weave + this.bob(ms, scale) };
    }
    if (ms < p.laughEnd) {
      const lunge = side * 4 * p.lunge * scale * ghostShout(p, ms);
      return { x: stand.x + lunge, y: stand.y + this.bob(ms, scale) };
    }
    const exit = ghostExitPoint(p, b, view, stand);
    const e = easeIn((ms - p.laughEnd) / (p.exitEnd - p.laughEnd));
    // Sinking goes straight down; rising wafts up with a lazy S.
    const sway = p.exit === 'rise' ? Math.sin(Math.PI * 2 * e) * 10 * scale : 0;
    return { x: mix(stand.x, exit.x, e) + sway, y: mix(stand.y + this.bob(ms, scale), exit.y, e) };
  }
  private bob(ms: number, scale: number) {
    return Math.sin(ms / 260 + this.plan.phase) * 2.2 * scale;
  }

  // ---------- Pose ----------

  private pose(ms: number, side: Side, heading: number, spirit: SpiritState): GhostPose {
    const p = this.plan;
    const loom = ghostLoom(p, ms) * (ms < p.boo ? 1 : 1 - ease((ms - p.boo) / 600));
    const shout = ghostShout(p, ms);
    const laugh = ghostLaughing(p, ms);
    const leaving = ease((ms - p.laughEnd + 100) / 300);
    const hoot = ms < p.travel ? 0.18 * Math.max(0, Math.sin(ms / 210)) : 0;
    const shake = laugh * Math.sin((ms - p.laughStart) / 38);
    // Rest, loom (arms creeping up with fingers wavering), BOO (flung up and out), then the laugh.
    const wiggle = Math.sin(ms / 70);
    let hands: [Point, Point] = [{ ...GHOST_REST.hands[0] }, { ...GHOST_REST.hands[1] }];
    const lerp = (a: [Point, Point], c: [Point, Point], t: number): [Point, Point] => [
      { x: mix(a[0].x, c[0].x, t), y: mix(a[0].y, c[0].y, t) },
      { x: mix(a[1].x, c[1].x, t), y: mix(a[1].y, c[1].y, t) },
    ];
    if (ms < p.travel) {
      // Trailing arms while floating.
      const trail = -Math.sign(heading) * 2.5;
      hands = [
        { x: -2 + trail, y: -9 },
        { x: 2 + trail, y: -9 },
      ];
    }
    hands = lerp(
      hands,
      [
        { x: -6.5, y: 4 + wiggle },
        { x: 6.5, y: 4 - wiggle },
      ],
      loom,
    );
    hands = lerp(
      hands,
      [
        { x: -8.5 + side * 2, y: 7.5 },
        { x: 8.5 + side * 2, y: 7.5 },
      ],
      shout,
    );
    const runaway: Side =
      spirit.stage === 'run' || spirit.stage === 'scramble' ? spirit.facing : side;
    // Holding its sides, shaking with laughter.
    const belly: [Point, Point] = [
      { x: -1.2 + 0.8 * shake, y: -10 },
      { x: 1.2 - 0.8 * shake, y: -10 },
    ];
    if (p.laugh === 'point') {
      // The arm on the runaway's side points after it while the other holds its belly.
      const i = runaway > 0 ? 1 : 0;
      belly[i] = { x: runaway * 11, y: 1.5 + 0.8 * shake };
    }
    hands = lerp(hands, belly, laugh);
    const farewell: [Point, Point] =
      p.exit === 'sink'
        ? [
            { x: -4, y: 9 + 1.5 * wiggle },
            { x: 4, y: 9 - 1.5 * wiggle },
          ]
        : [
            { x: -5, y: -8 },
            { x: 5, y: -8 },
          ];
    hands = lerp(hands, farewell, leaving);
    const k = (ms + this.plan.phase * 400) % 2900;
    const blink =
      ms < p.travel || ms > p.laughEnd
        ? k > 2760
          ? Math.sin((Math.PI * (k - 2760)) / 140)
          : 0
        : 0;
    const glance = ms < p.travel ? Math.sign(heading) : ms < p.leap ? side : runaway;
    return {
      lean:
        (ms < p.travel ? 0.1 * heading : 0) -
        side * 0.12 * loom +
        side * 0.22 * shout +
        0.12 * laugh * Math.sin((ms - p.laughStart) / 160),
      lift: p.rise * ghostLoom(p, ms) * (1 - ease((ms - p.boo) / 900)) + 1.4 * Math.abs(shake),
      swell: p.swell * (loom + shout),
      squash: 0.12 * shout * Math.sin(Math.PI * clamp((ms - p.boo + 90) / 300)) + 0.06 * shake,
      hands,
      open: Math.max(hoot, 0.3 * loom, shout),
      laugh,
      glance,
      blink,
      brow: -1 * loom * (1 - shout) + shout + 0.6 * laugh,
      ripple: ms / 140,
      flutter: 0.45 + 0.4 * (ms < p.travel ? 1 : 0) + 0.3 * shout,
      opacity:
        ghostVisibility(p, ms) *
        (p.exit === 'rise'
          ? 1 -
            ease(
              (ms - p.laughEnd - (p.exitEnd - p.laughEnd) * 0.55) /
                ((p.exitEnd - p.laughEnd) * 0.45),
            )
          : 1),
    };
  }

  // ---------- Bubble ----------

  private placeBubble(ms: number, b: TargetBounds, view: Point, side: Side) {
    const p = this.plan;
    const shownAt = p.boo - 40,
      goneAt = p.boo + 760;
    const visible = ms >= shownAt && ms < goneAt;
    this.bubble.visible = visible;
    if (!visible) return;
    const head = screenOf(this.model.body);
    const pop =
      1 + 0.35 * Math.sin(Math.PI * clamp((ms - shownAt) / 220)) * (ms - shownAt < 220 ? 1 : 0);
    const size = Math.min(110, Math.max(72, b.height * 0.85)) * pop;
    const height = size * 0.85;
    // Above the ghost's head, leaning toward the card it is shouting at.
    const rawX = head.x + side * size * 0.25;
    const top = head.y - GHOST_HEIGHT * 1.2 * ghostScale(b);
    const x = Math.max(size / 2 + 8, Math.min(view.x - size / 2 - 8, rawX));
    const y = Math.max(height / 2 + 8, top - height / 2);
    this.bubble.position.set(x, -y, DEPTH + 60);
    this.bubble.scale.set(size, size, 1);
    this.bubble.material.opacity =
      ease((ms - shownAt) / 80) * (1 - ease((ms - goneAt + 220) / 220));
  }

  update(
    elapsed: number,
    actor: THREE.Group,
    start: Point,
    b: TargetBounds,
    view: Point,
    facing: number,
    target?: HTMLElement,
  ) {
    const p = this.plan,
      ms = elapsed / p.pace,
      side = sideOf(facing);
    this.object.visible = ms < GHOST_DURATION;
    this.object.position.set(0, 0, 0);
    const scale = ghostScale(b);
    const stand = ghostLandingPoint(p, b, view, side);
    const at = this.floatAt(ms, start, stand, b, view, side, scale);
    const before = this.floatAt(Math.max(0, ms - 30), start, stand, b, view, side, scale);
    const heading = clamp(Math.abs(at.x - before.x) / (2 * scale)) * Math.sign(at.x - before.x);
    const spirit = spiritState(p, ms, b, view, side);
    this.state = spirit;
    actor.visible = ms < p.exitEnd;
    actor.position.set(at.x, -at.y, DEPTH);
    // Faces where it floats, then the card, then turns toward wherever the runaway went.
    const runaway = spirit.stage === 'run' || spirit.stage === 'scramble' ? spirit.facing : side;
    const yaw = ms < p.travel ? 0.4 * heading : ms < p.laughStart ? side * 0.45 : runaway * 0.3;
    actor.rotation.set(0, yaw * (1 - 0.6 * ghostLaughing(p, ms)), 0);
    actor.scale.setScalar(scale);
    ghostPose(actor, this.pose(ms, side, heading, spirit));
    // Sinking passes through the floor line; nothing else is clipped.
    this.floorPlane.constant = p.exit === 'sink' && ms >= p.laughEnd ? ghostFloor(b) : NO_CLIP;
    actor.updateMatrixWorld(true);
    this.placeBubble(ms, b, view, side);
    this.spirit.update(spirit, b, sideOf(-side), ms);
    if (target && ms >= p.leap - 20 && ms < p.runEnd) this.card.attach(target);
    const shown = spirit.stage === 'leap' || spirit.stage === 'scramble' || spirit.stage === 'run';
    this.card.place(shown ? spirit.pose : null, b);
    this.object.updateMatrixWorld(true);
  }

  /** Removes the runaway copy from the page; geometry and materials go through `disposeObject`. */
  dispose() {
    this.card.dispose();
  }
}
