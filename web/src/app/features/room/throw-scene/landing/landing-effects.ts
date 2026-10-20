import { characterFor } from '../characters';
import { clamp } from '../kit';
import type { CharacterAct, CharacterDefinition, PerformScene } from '../character';
import { MoneySpill } from './money-spill';
import * as THREE from 'three';
import type { Point } from '../flight/flight-math';
import type { LandingKind, TargetBounds } from './landing-geometry';
export { landingKind, landingPoint, landingVariation } from './landing-geometry';
export type { LandingKind, TargetBounds } from './landing-geometry';
import { landingCardAnimation } from './landing-card-animation';

function mesh(geometry: THREE.BufferGeometry, color: number, opacity = 1) {
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
}
function disc(radius: number, color: number) {
  return mesh(new THREE.CircleGeometry(radius, 20), color);
}

export function makeSlotMachine(): THREE.Group {
  const machine = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(51, 43, 9), 0xa14767);
  const frame = mesh(new THREE.PlaneGeometry(45, 27), 0xe5b75b);
  frame.position.z = 5;
  machine.add(body, frame);
  for (let i = 0; i < 3; i++) {
    const reel = new THREE.Group();
    reel.name = 'reel';
    reel.position.set((i - 1) * 14, 1, 6);
    const paper = mesh(new THREE.PlaneGeometry(12, 21), 0xfff7dd);
    const top = mesh(new THREE.PlaneGeometry(7, 2), 0xc23542);
    top.position.set(0, 5, 0.2);
    const slash = mesh(new THREE.PlaneGeometry(2, 12), 0xc23542);
    slash.position.set(1, -1, 0.2);
    slash.rotation.z = -0.35;
    reel.add(paper, top, slash);
    machine.add(reel);
  }
  const tray = mesh(new THREE.PlaneGeometry(22, 4), 0x352c3f);
  tray.position.set(0, -17, 6);
  const lever = mesh(new THREE.PlaneGeometry(3, 22), 0xe5b75b);
  lever.position.set(29, 4, 0);
  const knob = disc(4, 0xe45c64);
  knob.position.set(29, 15, 1);
  machine.add(tray, lever, knob);
  return machine;
}

/** Effects own a fixed number of meshes; no per-frame allocations or extra timers. */
export class LandingEffect {
  readonly object = new THREE.Group();
  /** The character performance for this throw, when the emoji is a character with one. */
  readonly act: CharacterAct | undefined;
  private readonly character: CharacterDefinition | undefined;
  private readonly money: MoneySpill | null;
  private readonly pieces: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  get duration() {
    if (this.act) return this.act.duration;
    if (this.character?.landingDuration !== undefined) return this.character.landingDuration;
    if (this.kind === '💰') return 2200;
    return 1800;
  }
  constructor(
    readonly kind: LandingKind,
    private readonly projectile: THREE.Group,
    id = 'landing',
  ) {
    this.object.visible = false;
    this.character = characterFor(kind);
    this.act = this.character?.createAct?.({ object: this.object, projectile }, id);
    if (this.act) this.object.add(this.act.object);
    this.money = kind === '💰' ? new MoneySpill(id) : null;
    if (this.money) this.object.add(this.money.object);
    if (kind === '💣') {
      this.add(mesh(new THREE.PlaneGeometry(2, 12), 0xffd77d));
      this.add(disc(3, 0xffbd55));
      for (let i = 0; i < 8; i++) this.add(disc(10 + (i % 3) * 3, i % 2 ? 0x707580 : 0x969aa4));
    } else if (kind === '🥧') {
      this.add(disc(20, 0xfff7e4));
      for (let i = 0; i < 8; i++) this.add(disc(6 + (i % 3), 0xfff7e4));
    } else if (kind === '🎈') {
      this.add(mesh(new THREE.PlaneGeometry(1, 1), 0xf6e2b3));
      this.add(mesh(new THREE.RingGeometry(2, 3, 12), 0xf6e2b3));
    } else if (kind === '🎰') {
      for (let i = 0; i < 6; i++) this.add(disc(4, 0xffd66c));
    }
  }
  private add(piece: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>) {
    this.pieces.push(piece);
    this.object.add(piece);
  }

  /** The plan of this throw's performance when it belongs to the given character. */
  planOf<P>(character: CharacterDefinition<P>): P | undefined {
    return this.act ? character.planOf?.(this.act) : undefined;
  }
  /** Plays a whole-routine performance, which runs from the throw rather than from contact. */
  perform(ms: number, at: PerformScene) {
    this.act?.perform?.(ms, at);
  }
  /** Releases page elements an effect added outside the WebGL scene. */
  release() {
    this.act?.release?.();
  }

  cardAnimation(
    facing = 1,
    bounds?: TargetBounds,
  ): { frames: Keyframe[]; options: KeyframeAnimationOptions } | null {
    return this.act?.cardAnimation(facing, bounds) ?? landingCardAnimation(this.kind, facing);
  }

  update(ms: number, b: TargetBounds, end: Point, viewport?: Point): void {
    const t = ms / 1000;
    const fade = clamp((this.duration - ms) / 350);
    this.object.visible = ms < this.duration;
    this.object.position.set(end.x, -end.y, 150);
    this.projectile.position.set(end.x, -end.y, 140);
    this.projectile.rotation.set(0, 0, 0);
    this.projectile.scale.setScalar(0.8 * fade);
    this.projectile.traverse((child) => {
      if (child instanceof THREE.Sprite) child.material.rotation = 0;
    });
    for (const piece of this.pieces) {
      piece.visible = true;
      piece.material.opacity = fade;
    }
    if (this.act?.perform) {
      this.act.perform(ms, {
        start: { x: end.x - 100, y: end.y },
        end,
        b,
        view: viewport ?? { x: window.innerWidth, y: window.innerHeight },
      });
      return;
    }
    if (this.act?.land) {
      this.act.land(ms, b, end, viewport);
      return;
    }
    switch (this.kind) {
      case '💰': {
        this.money?.update(ms, this.projectile, Math.min(-5, end.y - b.top - b.height + 5), fade);
        break;
      }
      case '💣': {
        this.projectile.visible = ms < 550;
        this.pieces.forEach((piece, i) => {
          if (i < 2) {
            piece.visible = ms < 550;
            piece.position.set(6, 12 + (1 - clamp(ms / 550)) * 10, 0);
            if (i === 0) piece.scale.y = 1 - clamp(ms / 550);
          } else {
            piece.visible = ms >= 550;
            const age = clamp((ms - 550) / 850);
            const angle = ((i - 2) * Math.PI) / 4;
            piece.position.set(
              Math.cos(angle) * age * 33,
              Math.sin(angle) * age * 22 + age * 22,
              0,
            );
            piece.scale.setScalar(0.3 + age * 1.9);
            piece.material.opacity = (1 - age) * 0.7;
          }
        });
        break;
      }
      case '🥧': {
        this.projectile.visible = false;
        const slide = Math.max(0, t - 0.3) ** 2 * (b.height * 0.38);
        this.object.position.y -= slide;
        this.object.scale.setScalar(Math.min(1, 0.3 + ms / 100));
        this.pieces.forEach((piece, i) => {
          if (i > 0) {
            const angle = (i * Math.PI) / 4;
            piece.position.set(
              Math.cos(angle) * 19,
              Math.sin(angle) * 15 - Math.max(0, t - 0.35) * (i % 3) * 7,
              1,
            );
            piece.scale.y = 1 + Math.max(0, t - 0.35) * 0.8;
          }
        });
        break;
      }
      case '🎈': {
        const release = Math.max(0, t - 1.05);
        this.projectile.position.y += release * 140;
        this.projectile.position.x += Math.sin(t * 3) * 3 + release * 25;
        const string = this.pieces[0];
        const knot = this.pieces[1];
        const length = Math.max(8, b.top + 4 - end.y - 15);
        if (string) {
          string.visible = release === 0;
          string.scale.y = length;
          string.position.set(0, -15 - length / 2, 0);
        }
        if (knot) {
          knot.visible = release === 0;
          knot.position.set(0, -15 - length, 0);
        }
        break;
      }
      case '🎰': {
        this.projectile.children
          .filter((child) => child.name === 'reel')
          .forEach((reel, i) => {
            const stop = 600 + i * 150;
            reel.rotation.x = ms >= stop ? 0 : (1 - clamp(ms / stop)) ** 2 * Math.PI * 12;
          });
        this.pieces.forEach((coin, i) => {
          const age = (ms - 950 - i * 65) / 1000;
          coin.visible = age >= 0;
          coin.position.set((i - 2.5) * age * 17, -15 + age * 45 - age * age * 160, 0);
          coin.scale.x = Math.max(0.15, Math.abs(Math.cos(age * 12)));
        });
        break;
      }
    }
  }
}
