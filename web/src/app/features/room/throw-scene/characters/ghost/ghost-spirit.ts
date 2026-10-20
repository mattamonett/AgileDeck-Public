import * as THREE from 'three';
import type { TargetBounds } from '../../landing/landing-geometry';
import { SPIRIT_LEG, type SpiritState } from './ghost-choreography';
import {
  cardPoint,
  cardTurn,
  clamp,
  glow,
  makeLimb,
  matte,
  oval,
  part,
  pulse,
  reach,
  type CardPose,
  type Limb,
  type Side,
} from '../../kit';

const THIGH = 5.6,
  SHIN = 5.4,
  /** Hip to sole, in leg units: both segments plus the sneaker. */
  LEG_UNITS = THIGH + SHIN + 1.4;
const SWEAT = 3,
  DUST = 5;

/** The scared card's googly eyes, sneaker legs, flying sweat and skid dust, drawn over its copy. */
export class SpiritRig {
  readonly object = new THREE.Group();
  private readonly eyes: THREE.Group[] = [];
  private readonly pupils: THREE.Mesh[] = [];
  private readonly brows: THREE.Mesh[] = [];
  private readonly hips: THREE.Group[] = [];
  private readonly legs: Limb[] = [];
  private readonly sweat: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly dust: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];

  constructor(private readonly depth: number) {
    this.object.name = 'ghost-spirit';
    for (let i = 0; i < 2; i++) {
      const eye = new THREE.Group();
      eye.name = 'spirit-eye';
      oval(eye, 'spirit-eye-rim', matte(0x1d1a26, 0.5), 0, 0, -0.05, 1.12, 1.22, 0.3);
      oval(eye, 'spirit-eye-white', matte(0xffffff, 0.35), 0, 0, 0, 1, 1.1, 0.4);
      const pupil = oval(eye, 'spirit-pupil', matte(0x111018, 0.3), 0, 0, 0.3, 0.42, 0.48, 0.2);
      oval(pupil, 'spirit-pupil-glint', glow(0xffffff, 0.95), -0.35, 0.4, 0.5, 0.32, 0.32, 0.2);
      // Worried brows: inner ends raised.
      const brow = part(
        eye,
        'spirit-brow',
        new THREE.BoxGeometry(1.5, 0.22, 0.2),
        matte(0x1d1a26, 0.5),
        0,
        1.55,
        0.2,
      );
      this.object.add(eye);
      this.eyes.push(eye);
      this.pupils.push(pupil);
      this.brows.push(brow);
      const hip = new THREE.Group();
      hip.name = 'spirit-hip';
      this.object.add(hip);
      const leg = makeLimb(
        hip,
        `spirit-leg-${i}`,
        0,
        0,
        0,
        THIGH,
        SHIN,
        0.95,
        matte(0x24212e, 0.6),
      );
      // A bright sneaker: red upper, white sole and toe cap.
      oval(leg.end, `spirit-shoe-${i}`, matte(0xe0413a, 0.45), 1, -0.45, 0, 2.2, 1.05, 1.15);
      part(
        leg.end,
        `spirit-sole-${i}`,
        new THREE.BoxGeometry(4.4, 0.5, 2),
        matte(0xfafafa, 0.6),
        1,
        -1.2,
        0,
      );
      oval(leg.end, `spirit-toe-${i}`, matte(0xfafafa, 0.5), 2.75, -0.7, 0, 0.65, 0.6, 1.05);
      this.hips.push(hip);
      this.legs.push(leg);
    }
    for (let i = 0; i < SWEAT; i++) {
      const drop = part(
        this.object,
        'spirit-sweat',
        new THREE.SphereGeometry(1, 8, 6),
        glow(0x9fd6ff, 0),
      );
      drop.visible = false;
      this.sweat.push(drop);
    }
    for (let i = 0; i < DUST; i++) {
      const puff = part(
        this.object,
        'spirit-dust',
        new THREE.CircleGeometry(1, 12),
        glow(0xc9c2b4, 0),
      );
      puff.visible = false;
      this.dust.push(puff);
    }
  }

  /** World position of each sneaker sole, for floor and contact checks. */
  soles(): THREE.Vector3[] {
    return this.legs.map((leg) => leg.end.localToWorld(new THREE.Vector3(0.9, -1.4, 0)));
  }
  /** The leg rigs, so callers can check segments never stretch. */
  get limbs(): readonly Limb[] {
    return this.legs;
  }

  update(state: SpiritState, b: TargetBounds, toGhost: Side, ms: number) {
    const visible = state.stage === 'leap' || state.stage === 'scramble' || state.stage === 'run';
    this.object.visible = visible;
    if (!visible) return;
    const q = state.pose,
      turn = cardTurn(q);
    const at = (u: number, v: number) =>
      cardPoint(q, { x: b.left + b.width * u, y: b.top + b.height * v }, b);
    // Eyes pop open with an overshoot as they sprout near the top of the card.
    const pop = state.sprout * (1 + 0.3 * pulse(state.sprout, 0.55, 0.45));
    const radius = 0.15 * b.width;
    // During the leap it stares back at the ghost; while running it glances back over its shoulder.
    const look = state.stage === 'run' ? -state.facing : toGhost;
    this.eyes.forEach((eye, i) => {
      const p = at(i ? 0.69 : 0.31, 0.21);
      eye.visible = pop > 0.01;
      eye.position.set(p.x, -p.y, this.depth + 4);
      eye.rotation.set(0, 0, turn);
      eye.scale.set(radius * pop, radius * pop * (1 + 0.15 * state.skid), radius);
      const wobble = 0.08 * Math.sin(ms / 31 + i * 2);
      this.pupils[i]?.position.set(0.42 * look + wobble, 0.1 + 0.12 * state.skid, 0.3);
      this.brows[i]?.rotation.set(0, 0, (i ? -1 : 1) * 0.35);
    });
    const k = (SPIRIT_LEG * b.height) / LEG_UNITS;
    const grow = clamp(state.sprout * 1.2);
    this.legs.forEach((leg, i) => {
      const hip = this.hips[i];
      if (!hip) return;
      const p = at(i ? 0.66 : 0.34, 0.97);
      hip.visible = grow > 0.01;
      // Behind the card copy's face, so the legs come out from underneath it.
      hip.position.set(p.x, -p.y, this.depth + (i ? -1 : -2));
      hip.rotation.set(0, 0, turn);
      hip.scale.set(state.facing * k, k * Math.max(0.01, grow), k);
      // A frantic run cycle: high knees, long reach, feet barely touching down.
      const c = (state.cycle + (i ? 0.5 : 0)) * Math.PI * 2;
      const stride = 4.2 * state.effort;
      const fx = Math.sin(c) * stride;
      const lift = Math.max(0, -Math.cos(c)) * 3.4 * state.effort;
      // During the leap the legs kick and dangle; then they plant and run.
      reach(leg, fx + 0.3, -(THIGH + SHIN) * 0.97 + lift, 1, -0.35 * Math.sin(c) * state.effort);
    });
    this.placeSweat(state, at, b, ms);
    this.placeDust(state, b, ms);
  }

  private placeSweat(
    state: SpiritState,
    at: (u: number, v: number) => { x: number; y: number },
    b: TargetBounds,
    ms: number,
  ) {
    const active = state.stage === 'run' || state.stage === 'scramble';
    this.sweat.forEach((drop, i) => {
      const t = ((ms + i * 140) % 420) / 420;
      drop.visible = active && state.sprout > 0.9;
      if (!drop.visible) return;
      // Flung from the trailing top corner, back and up, then falling.
      const from = at(state.facing > 0 ? 0.04 : 0.96, 0.06);
      const s = b.width * 0.045;
      drop.position.set(
        from.x - state.facing * (8 + 6 * i) * t * (b.width / 84),
        -(from.y - 14 * t * (b.width / 84) + 26 * t * t * (b.width / 84)),
        this.depth + 6,
      );
      drop.scale.set(s, s * 1.5, s);
      drop.rotation.z = state.facing * 0.6;
      drop.material.opacity = 0.9 * (1 - t);
    });
  }

  private placeDust(state: SpiritState, b: TargetBounds, ms: number) {
    const kicking = state.stage === 'scramble' ? 1 : state.stage === 'run' ? state.skid : 0;
    const feet = this.soles();
    this.dust.forEach((puff, i) => {
      const t = ((ms + i * 90) % 450) / 450;
      const foot = feet[i % 2];
      puff.visible = kicking > 0.05 && !!foot;
      if (!foot || !puff.visible) return;
      const s = b.width * (0.05 + 0.1 * t);
      puff.position.set(
        foot.x - state.facing * 22 * t * (b.width / 84),
        foot.y + 6 * t * (b.width / 84),
        this.depth - 3,
      );
      puff.scale.set(s, s * 0.7, 1);
      puff.material.opacity = 0.55 * kicking * (1 - t);
    });
  }
}

/**
 * A look-alike copy of the target card that leaps out and runs off. The real card never moves
 * off the table, so votes stay where they are; the copy shows exactly what the card shows.
 */
export class SpiritCard {
  private wrapper: HTMLElement | null = null;

  get element(): HTMLElement | null {
    return this.wrapper;
  }

  attach(target: HTMLElement) {
    if (this.wrapper || typeof document === 'undefined') return;
    const copy = target.cloneNode(true);
    if (!(copy instanceof HTMLElement)) return;
    const originals = [target, ...target.querySelectorAll<HTMLElement>('*')];
    const copies = [copy, ...copy.querySelectorAll<HTMLElement>('*')];
    originals.forEach((original, i) => {
      const node = copies[i];
      if (!node) return;
      const style = getComputedStyle(original);
      for (const property of Array.from(style))
        node.style.setProperty(property, style.getPropertyValue(property));
      for (const attr of Array.from(node.attributes)) {
        if (
          attr.name === 'id' ||
          attr.name === 'tabindex' ||
          attr.name === 'role' ||
          attr.name.startsWith('data-') ||
          attr.name.startsWith('aria-')
        )
          node.removeAttribute(attr.name);
      }
      node.style.animation = 'none';
      node.style.transition = 'none';
    });
    // The computed style includes this throw's own card animation; the copy starts neutral.
    Object.assign(copy.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      margin: '0',
      width: '100%',
      height: '100%',
      translate: 'none',
      rotate: 'none',
      scale: 'none',
      filter: 'none',
      opacity: '1',
    });
    const wrapper = document.createElement('div');
    wrapper.className = 'ghost-spirit-card';
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.inert = true;
    Object.assign(wrapper.style, {
      position: 'fixed',
      boxSizing: 'border-box',
      margin: '0',
      pointerEvents: 'none',
      zIndex: '149',
      transformOrigin: '50% 50%',
      display: 'none',
    });
    wrapper.appendChild(copy);
    document.body.appendChild(wrapper);
    this.wrapper = wrapper;
  }

  place(pose: CardPose | null, b: TargetBounds) {
    const wrapper = this.wrapper;
    if (!wrapper) return;
    if (!pose) {
      wrapper.style.display = 'none';
      return;
    }
    Object.assign(wrapper.style, {
      display: 'block',
      left: `${b.left}px`,
      top: `${b.top}px`,
      width: `${b.width}px`,
      height: `${b.height}px`,
      transform: `translate(${pose.x}px, ${pose.y}px) rotate(${pose.angle}deg) scale(${pose.sx}, ${pose.sy})`,
    });
  }

  dispose() {
    this.wrapper?.remove();
    this.wrapper = null;
  }
}
