import { clamp, ease } from '../../kit';
import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-effects';

export const LAXATIVE_DURATION = 6000;

export interface LaxativePlan {
  readonly bursts: readonly number[];
  readonly pressure: number;
  readonly bend: number;
  readonly nozzle: number;
  readonly ooze: number;
}

export function laxativePlan(id: string): LaxativePlan {
  const random = seededRandom(id + ':bowel-pressure');
  const first = 650 + random() * 150;
  return {
    bursts: [
      first,
      first + 480 + random() * 140,
      first + 1080 + random() * 180,
      first + 1720 + random() * 220,
    ],
    pressure: 0.85 + random() * 0.3,
    bend: 20 + random() * 9,
    nozzle: 0.65 + random() * 0.13,
    ooze: 0.85 + random() * 0.3,
  };
}

export function makeLaxative(): THREE.Group {
  const pill = new THREE.Group();
  for (const side of [-1, 1]) {
    const half = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 8, 9, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: side < 0 ? 0xf54857 : 0xffefd2, roughness: 0.3 }),
    );
    half.position.y = side * 4.5;
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(8, 24, 12, 0, Math.PI * 2, side > 0 ? 0 : Math.PI / 2, Math.PI / 2),
      half.material,
    );
    cap.position.y = side * 9;
    pill.add(half, cap);
  }
  const seam = new THREE.Mesh(
    new THREE.TorusGeometry(8.05, 0.45, 6, 24),
    new THREE.MeshStandardMaterial({ color: 0xe8cbbb, roughness: 0.25 }),
  );
  seam.rotation.x = Math.PI / 2;
  pill.add(seam);
  pill.rotation.z = -0.55;
  return pill;
}

/** Segment collision prevents fast chunks from skipping narrow cards between frames. */
export function cardContact(a: Point, b: Point, rect: TargetBounds): number | null {
  let enter = 0;
  let leave = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, rect.left, rect.left + rect.width],
    [a.y, b.y - a.y, rect.top, rect.top + rect.height],
  ] as const) {
    if (Math.abs(delta) < 0.00001) {
      if (start < min || start > max) return null;
    } else {
      const t1 = (min - start) / delta;
      const t2 = (max - start) / delta;
      enter = Math.max(enter, Math.min(t1, t2));
      leave = Math.min(leave, Math.max(t1, t2));
      if (enter > leave) return null;
    }
  }
  return enter;
}

export function laxativePose(ms: number, side: number, plan = laxativePlan('pose')) {
  const active = ease(ms / 160) * ease((3400 - ms) / 650);
  const strain = clamp((ms - 280) / 350) * active;
  const contractions = plan.bursts.reduce(
    (sum, start) => sum + Math.sin(clamp((ms - start + 180) / 430) * Math.PI),
    0,
  );
  return {
    shake: Math.sin(ms * 0.065) * (1.2 + contractions * 2.5) * active * plan.pressure,
    bend: side * (plan.bend + contractions * 12) * strain,
    twist: Math.sin(ms * 0.018) * (8 + contractions * 14) * strain,
  };
}

/** Project the same waist-bend used by the temporary DOM halves. */
export function laxativeCardPoint(
  ms: number,
  side: number,
  plan: LaxativePlan,
  b: TargetBounds,
  u: number,
  v: number,
): Point {
  const pose = laxativePose(ms, side, plan);
  const rx = v < 0.5 ? (pose.bend * 2 * Math.PI) / 180 : 0;
  const ry = (pose.twist * Math.PI) / 180;
  const rz = (pose.bend * 0.35 * Math.PI) / 180;
  const px = (u - 0.5) * b.width;
  const py = (v - 0.5) * b.height;
  const y = py * Math.cos(rx);
  const z = py * Math.sin(rx);
  const x = px * Math.cos(ry) + z * Math.sin(ry);
  const depth = -px * Math.sin(ry) + z * Math.cos(ry);
  const perspective = 420 / (420 - depth);
  return {
    x: b.left + b.width / 2 + (x * Math.cos(rz) - y * Math.sin(rz) + pose.shake) * perspective,
    y: b.top + b.height / 2 + (x * Math.sin(rz) + y * Math.cos(rz)) * perspective,
  };
}

interface Piece {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  size: number;
  liquid: boolean;
  delay: number;
  vx: number;
  vy: number;
  previous: Point | null;
  previousMs: number;
  stuck: { card: HTMLElement; x: number; y: number; at: number } | null;
}

function muck(color: number) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1, 10, 8),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.19,
      metalness: 0.04,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
}

interface Ooze {
  readonly mesh: ReturnType<typeof muck>;
  readonly cap: ReturnType<typeof muck>;
  readonly u: number;
  readonly speed: number;
  readonly delay: number;
  readonly width: number;
}

/** Temporary card copies bend at the waist; the real card and game state are untouched. */
export class LaxativeTrick {
  readonly object = new THREE.Group();
  readonly plan: LaxativePlan;
  private readonly pieces: Piece[] = [];
  private readonly ooze: Ooze[] = [];
  private readonly stains: ReturnType<typeof muck>[] = [];
  private readonly puddles: ReturnType<typeof muck>[] = [];
  private readonly jets: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>[] = [];
  private readonly jetA = new THREE.Vector3();
  private readonly jetB = new THREE.Vector3();
  private readonly jetDirection = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private halves: HTMLElement[] = [];
  private conceal: Animation | null = null;

  constructor(
    id: string,
    private readonly target: HTMLElement,
    private readonly side: number,
  ) {
    this.plan = laxativePlan(id);
    const random = seededRandom(id + ':laxative');
    for (let i = 0; i < 56; i++) {
      const liquid = i % 4 !== 0;
      const mesh = muck(i % 3 === 0 ? 0x493018 : i % 3 === 1 ? 0x75632c : 0x86613a);
      const size = liquid ? 2 + random() * 2.5 : 4 + random() * 3;
      mesh.scale.set(size, size * (liquid ? 1.8 : 0.85), size * 0.7);
      mesh.visible = false;
      this.object.add(mesh);
      this.pieces.push({
        mesh,
        size,
        liquid,
        delay: (this.plan.bursts[Math.floor(i / 14)] ?? 700) + random() * 130,
        vx: side * (180 + random() * 420) * this.plan.pressure,
        vy: -200 + random() * 330,
        previous: null,
        previousMs: 0,
        stuck: null,
      });
    }
    for (let i = 0; i < 12; i++) {
      const mesh = muck(i % 2 ? 0x675023 : 0x4b3119);
      const cap = muck(0x826437);
      this.ooze.push({
        mesh,
        cap,
        u: i < 4 ? (i % 2 ? 0.98 : 0.02) : 0.08 + random() * 0.84,
        speed: 22 + random() * 30,
        delay: 800 + random() * 850,
        width: 1.8 + random() * 2.6,
      });
      mesh.visible = cap.visible = false;
      this.object.add(mesh, cap);
    }
    for (let i = 0; i < 10; i++) {
      const stain = muck(i % 2 ? 0x79602b : 0x4e331b);
      stain.visible = false;
      this.stains.push(stain);
      this.object.add(stain);
    }
    for (let i = 0; i < 6; i++) {
      const puddle = muck(i % 2 ? 0x6b5428 : 0x38250f);
      puddle.visible = false;
      this.puddles.push(puddle);
      this.object.add(puddle);
    }
    for (let i = 0; i < 24; i++) {
      const jet = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 1, 8),
        new THREE.MeshStandardMaterial({
          color: i < 8 ? 0x4b341b : 0x776130,
          roughness: 0.17,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        }),
      );
      jet.visible = false;
      this.jets.push(jet);
      this.object.add(jet);
    }
  }

  private copyCard() {
    for (let half = 0; half < 2; half++) {
      const copy = this.target.cloneNode(true);
      if (!(copy instanceof HTMLElement)) continue;
      const originals = [this.target, ...this.target.querySelectorAll<HTMLElement>('*')];
      const copies = [copy, ...copy.querySelectorAll<HTMLElement>('*')];
      originals.forEach((original, i) => {
        const node = copies[i];
        if (!node) return;
        const style = getComputedStyle(original);
        for (const property of Array.from(style))
          node.style.setProperty(property, style.getPropertyValue(property));
        for (const attr of Array.from(node.attributes)) {
          if (attr.name === 'id' || attr.name.startsWith('data-')) node.removeAttribute(attr.name);
        }
        node.style.animation = 'none';
        node.style.transition = 'none';
      });
      const wrapper = document.createElement('div');
      wrapper.setAttribute('aria-hidden', 'true');
      wrapper.inert = true;
      Object.assign(wrapper.style, {
        position: 'fixed',
        boxSizing: 'border-box',
        margin: '0',
        pointerEvents: 'none',
        zIndex: '149',
        opacity: '1',
        transformOrigin: '50% 50%',
        clipPath: half === 0 ? 'inset(0 0 50% 0)' : 'inset(50% 0 0 0)',
      });
      Object.assign(copy.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        margin: '0',
        width: '100%',
        height: '100%',
        opacity: '1',
      });
      wrapper.appendChild(copy);
      document.body.appendChild(wrapper);
      this.halves.push(wrapper);
    }
    this.conceal = this.target.animate([{ opacity: 0 }, { opacity: 0 }], {
      duration: LAXATIVE_DURATION,
      fill: 'both',
    });
  }

  update(
    ms: number,
    bounds: TargetBounds,
    cards: readonly HTMLElement[],
    rect: (card: HTMLElement) => TargetBounds,
  ) {
    if (!this.halves.length && ms < 3400) this.copyCard();
    const pose = laxativePose(ms, this.side, this.plan);
    this.halves.forEach((half, i) => {
      Object.assign(half.style, {
        left: `${bounds.left}px`,
        top: `${bounds.top}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
        transform: `perspective(420px) translateX(${pose.shake}px) rotateZ(${pose.bend * 0.35}deg) rotateY(${pose.twist}deg) rotateX(${i ? 0 : pose.bend * 2}deg)`,
      });
    });
    if (ms >= 3400) this.restoreCard();
    this.surface(ms, bounds);
    const origin = laxativeCardPoint(
      ms,
      this.side,
      this.plan,
      bounds,
      this.side > 0 ? 0.9 : 0.1,
      this.plan.nozzle,
    );
    this.spray(ms, origin);
    for (const piece of this.pieces) {
      const age = (ms - piece.delay) / 1000;
      const travel = clamp(age);
      const point = {
        x: origin.x + piece.vx * travel,
        y: origin.y + piece.vy * travel + 170 * travel * travel,
      };
      if (age >= 0 && age <= 1.12 && piece.previousMs < piece.delay + 1000 && !piece.stuck) {
        const previous = piece.previous ?? origin;
        let nearest = 2;
        let hit: HTMLElement | null = null;
        for (const card of cards) {
          if (card === this.target || !card.isConnected) continue;
          const contact = cardContact(previous, point, rect(card));
          if (contact !== null && contact < nearest) {
            nearest = contact;
            hit = card;
          }
        }
        if (hit) {
          const b = rect(hit);
          const x = previous.x + (point.x - previous.x) * nearest;
          const y = previous.y + (point.y - previous.y) * nearest;
          piece.stuck = {
            card: hit,
            x: clamp((x - b.left) / b.width),
            y: clamp((y - b.top) / b.height),
            at:
              (piece.previous ? piece.previousMs : piece.delay) +
              (ms - (piece.previous ? piece.previousMs : piece.delay)) * nearest,
          };
        }
      }
      const stuck = piece.stuck;
      piece.mesh.visible =
        age >= 0 && (stuck ? stuck.card.isConnected && ms - stuck.at < 1500 : age < 1);
      if (stuck) {
        const b = rect(stuck.card);
        const drip = Math.max(0, ms - stuck.at) / 1000;
        const y = Math.min(b.top + b.height + 7, b.top + b.height * stuck.y + drip * 20);
        piece.mesh.position.set(b.left + b.width * stuck.x, -y, 170);
        piece.mesh.rotation.set(0, 0, 0);
        piece.mesh.scale.set(piece.size * 1.6, piece.size * (0.8 + drip * 1.5), 0.6);
        piece.mesh.material.opacity = clamp((1500 - (ms - stuck.at)) / 350);
      } else {
        piece.mesh.position.set(point.x, -point.y, 170);
        piece.mesh.material.opacity = clamp((1 - age) / 0.2);
        piece.mesh.rotation.set(age * 8, age * 5, age * this.side * 7);
      }
      if (age >= 0) {
        piece.previous = point;
        piece.previousMs = ms;
      }
    }
  }

  private spray(ms: number, origin: Point) {
    const burst = this.plan.bursts.find((start) => ms >= start && ms < start + 440);
    const age = burst === undefined ? -1 : ms - burst;
    const grow = ease(age / 100) * ease((440 - age) / 160);
    this.jets.forEach((jet, i) => {
      jet.visible = age >= 0 && grow > 0;
      const stream = Math.floor(i / 8);
      const point = (t: number, into: THREE.Vector3) =>
        into.set(
          origin.x + this.side * (42 + stream * 10) * t * grow * this.plan.pressure,
          -origin.y - ((stream - 1) * 22 * t + t * t * 19) * grow,
          172,
        );
      point((i % 8) / 8, this.jetA);
      point(((i % 8) + 1) / 8, this.jetB);
      this.jetDirection.subVectors(this.jetB, this.jetA);
      const length = this.jetDirection.length();
      jet.position.copy(this.jetA).addScaledVector(this.jetDirection, 0.5);
      const radius = (2.8 - (i % 8) * 0.18) * grow;
      jet.scale.set(radius, Math.max(0.001, length), radius);
      if (length > 0.001) jet.quaternion.setFromUnitVectors(this.up, this.jetDirection.normalize());
      jet.material.opacity = grow;
    });
  }

  private surface(ms: number, b: TargetBounds) {
    const fade = ease((LAXATIVE_DURATION - ms) / 850);
    this.stains.forEach((stain, i) => {
      const age = (ms - 760 - i * 70) / 1000;
      const spread = ease(age * 3);
      stain.visible = age >= 0 && fade > 0;
      const u = this.side > 0 ? 0.6 + Math.sin(i * 2.3) * 0.28 : 0.4 - Math.sin(i * 2.3) * 0.28;
      const point = laxativeCardPoint(
        ms,
        this.side,
        this.plan,
        b,
        u,
        0.67 + Math.cos(i * 1.7) * 0.13,
      );
      stain.position.set(point.x, -point.y, 166);
      stain.rotation.z = (-laxativePose(ms, this.side, this.plan).bend * 0.35 * Math.PI) / 180;
      stain.scale.set((5 + (i % 4) * 2) * spread, (4 + (i % 3) * 2) * spread, 0.7);
      stain.material.opacity = 0.92 * fade;
    });
    for (const ooze of this.ooze) {
      const age = Math.max(0, (ms - ooze.delay) / 1000);
      const point = laxativeCardPoint(
        ms,
        this.side,
        this.plan,
        b,
        ooze.u,
        ooze.u < 0.05 || ooze.u > 0.95 ? 0.65 : 0.73,
      );
      const start = point.y;
      const length = Math.min(b.top + b.height + 12 - start, age * ooze.speed * this.plan.ooze);
      const x = point.x;
      ooze.mesh.visible = ooze.cap.visible = age > 0 && fade > 0;
      ooze.mesh.position.set(x, -start - length / 2, 167);
      ooze.mesh.scale.set(ooze.width * ease(age * 4), Math.max(0.01, length / 2), 0.8);
      ooze.cap.position.set(x, -start - length, 168);
      ooze.cap.scale.set(ooze.width * 1.15, ooze.width * (1.2 + Math.sin(age * 6) * 0.2), 1);
      ooze.mesh.material.opacity = ooze.cap.material.opacity = fade;
    }
    this.puddles.forEach((puddle, i) => {
      const grow = ease((ms - 1600 - i * 100) / 2300);
      puddle.visible = grow > 0 && fade > 0;
      puddle.position.set(
        b.left + b.width * (0.12 + i * 0.15),
        -(b.top + b.height + 13 + (i % 2) * 3),
        164,
      );
      puddle.scale.set((10 + (i % 3) * 4) * grow, (3 + (i % 2) * 2) * grow, 1);
      puddle.material.opacity = fade * 0.95;
    });
  }

  private restoreCard() {
    this.halves.forEach((half) => half.remove());
    this.halves = [];
    this.conceal?.cancel();
    this.conceal = null;
  }

  dispose() {
    this.restoreCard();
  }
}
