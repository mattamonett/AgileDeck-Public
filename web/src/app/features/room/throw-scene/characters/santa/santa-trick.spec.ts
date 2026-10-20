import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeSanta, santaModel } from './santa-model';
import { SANTA_GREETING, SantaTrick } from './santa-trick';
import {
  SANTA_DURATION,
  santaCardPose,
  santaContactX,
  santaExitPoint,
  santaFloor,
  santaLandingPoint,
  santaPlan,
  type SantaPlan,
} from './santa-choreography';
import { cardPoint, lowestWorldY, screenOf, sideOf, type CardPose } from '../../kit';
import { disposeObject } from '../../engine/throw-models';
import type { TargetBounds } from '../../landing/landing-geometry';

const view = { x: 1200, y: 850 },
  start = { x: 260, y: 480 },
  card = { left: 600, top: 420, width: 84, height: 122 };
const layouts: TargetBounds[] = [
  card,
  { left: 8, top: 500, width: 58, height: 84 },
  { left: 1120, top: 500, width: 58, height: 84 },
];
const NEUTRAL: CardPose = { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };

function fixture(id: string) {
  const actor = makeSanta(id),
    trick = new SantaTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, plan: trick.plan, model: santaModel(actor) };
}
type Fixture = ReturnType<typeof fixture>;
function facingFor(plan: SantaPlan, b: TargetBounds = card, chosen?: number) {
  return sideOf(b.left + b.width / 2 - santaLandingPoint(plan, b, view, chosen).x);
}
function at(f: Fixture, ms: number, b: TargetBounds = card, facing = facingFor(f.plan, b)) {
  f.trick.update(ms * f.plan.pace, f.actor, start, b, view, facing);
  f.actor.updateMatrixWorld(true);
  f.trick.object.updateMatrixWorld(true);
}
function clean(f: Fixture) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}
function named(f: Fixture, name: string): THREE.Object3D {
  const o = f.trick.object.getObjectByName(name);
  if (!o) throw new Error(`Missing ${name}`);
  return o;
}
function presence(root: THREE.Object3D) {
  const box = new THREE.Box3(),
    piece = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (let up: THREE.Object3D | null = o; up && up !== root.parent; up = up.parent)
      if (!up.visible) return;
    o.geometry.computeBoundingBox();
    if (o.geometry.boundingBox)
      box.union(piece.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
  });
  return box.getCenter(new THREE.Vector3());
}
const gap = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const ids = (n: number) => Array.from({ length: n }, (_, i) => `santa-${i}`);

describe('Special Delivery Santa', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it('samples one reproducible plan whose approach, delivery and departure all vary', () => {
    expect(santaPlan('again')).toEqual(santaPlan('again'));
    const plans = ids(30).map(santaPlan);
    for (const key of [
      'pace',
      'travel',
      'bend',
      'hitchAt',
      'inset',
      'lift',
      'spring',
      'exitRise',
      'sink',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size, key).toBe(30);
    for (const key of [
      'side',
      'scurry',
      'shake',
      'bounces',
      'pull',
      'laughs',
      'gesture',
      'kicks',
      'flies',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size, key).toBe(2);
    expect(new Set(plans.map((p) => p.wrap)).size).toBe(3);
    for (const p of plans) {
      expect(p.exitEnd + 500).toBeLessThan(SANTA_DURATION);
      expect(p.pop).toBeGreaterThan(p.wedge);
      expect(p.unfold).toBeGreaterThan(p.settled);
    }
  });

  it('keeps moving through the approach with no dead stop and arrives by plan.travel', () => {
    for (const id of ids(8)) {
      const f = fixture(id),
        p = f.plan;
      const steps: number[] = [];
      at(f, p.travel * 0.15);
      let previous = f.actor.position.clone();
      for (let ms = p.travel * 0.15 + 8; ms <= p.travel * 0.85; ms += 8) {
        at(f, ms);
        steps.push(f.actor.position.distanceTo(previous));
        previous = f.actor.position.clone();
      }
      const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
      expect(Math.min(...steps), id).toBeGreaterThan(0.3 * mean);
      at(f, p.travel);
      const stand = santaLandingPoint(p, card, view, facingFor(p));
      expect(f.actor.position.x).toBeCloseTo(stand.x, 6);
      expect(-f.actor.position.y).toBeCloseTo(stand.y, 6);
      clean(f);
    }
  });

  it('leaves from the sender and moves continuously at full size through every stage', () => {
    for (const id of ['santa-0', 'santa-1', 'santa-2']) {
      const f = fixture(id);
      at(f, 0);
      const body = presence(f.actor);
      expect(Math.hypot(body.x - start.x, body.y + start.y), id).toBeLessThan(45);
      const scale = f.actor.scale.y;
      let previous = f.actor.position.clone(),
        turn = f.actor.quaternion.clone();
      for (let ms = 8; ms < SANTA_DURATION; ms += 8) {
        at(f, ms);
        if (!f.actor.visible) continue;
        expect(f.actor.position.distanceTo(previous), `${id} at ${ms}`).toBeLessThan(14);
        expect(f.actor.quaternion.angleTo(turn), `${id} turn at ${ms}`).toBeLessThan(0.45);
        expect(Math.abs(f.actor.scale.y)).toBeCloseTo(Math.abs(scale), 6);
        previous = f.actor.position.clone();
        turn = f.actor.quaternion.clone();
      }
      clean(f);
    }
  });

  it('keeps its chosen side through reflow and avoids viewport edges on first placement', () => {
    for (const p of ids(8).map(santaPlan)) {
      const facing = facingFor(p);
      expect(facingFor(p, { ...card, left: card.left + 140, width: 58, height: 84 }, facing)).toBe(
        facing,
      );
      expect(facingFor(p, { ...card, left: 6 })).toBe(-1);
      expect(facingFor(p, { ...card, left: view.x - card.width - 6 })).toBe(1);
    }
  });

  it('seeks deterministically with finite transforms and restores the card', () => {
    const f = fixture('santa-0');
    frameEquals(f, SANTA_DURATION * 0.55, SANTA_DURATION * 0.9);
    frameEquals(f, f.plan.peak + 40, f.plan.travel * 0.4);
    for (let ms = 0; ms <= SANTA_DURATION; ms += 61) {
      at(f, ms);
      for (const root of [f.actor, f.trick.object])
        root.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    }
    for (const b of layouts) {
      const animation = f.trick.cardAnimation(facingFor(f.plan, b), b);
      expect(animation.frames.at(-1)).toMatchObject({
        translate: '0px 0px',
        rotate: '0deg',
        scale: '1 1',
      });
      for (const k of animation.frames) {
        const [x = 0, y = 0] = String(k['translate']).split(' ').map(parseFloat);
        const [sx = 1, sy = 1] = String(k['scale']).split(' ').map(Number);
        expect(Math.abs(x) + Math.abs(y)).toBeLessThan(60);
        expect(Math.abs(parseFloat(String(k['rotate'])))).toBeLessThan(30);
        expect(Math.min(sx, sy)).toBeGreaterThan(0.55);
      }
    }
    at(f, SANTA_DURATION + 1);
    expect(f.trick.object.visible).toBe(false);
    expect(f.actor.visible).toBe(false);
    clean(f);
  });

  it('disposes every geometry, material and the bubble texture exactly once', () => {
    vi.restoreAllMocks();
    const f = fixture('santa-0');
    at(f, f.plan.unfold + 200);
    const resources = new Set<{ dispose(): void }>();
    for (const root of [f.actor, f.trick.object])
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) resources.add(o.geometry);
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite)
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            resources.add(m);
            if (m instanceof THREE.SpriteMaterial && m.map) resources.add(m.map);
          }
      });
    const bubble = named(f, 'santa-greeting');
    expect(bubble instanceof THREE.Sprite && bubble.material.map).toBeTruthy();
    const spies = Array.from(resources, (r) => vi.spyOn(r, 'dispose'));
    clean(f);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });

  it('keeps every arm and leg segment at its fixed length', () => {
    for (const id of ['santa-0', 'santa-1', 'santa-3']) {
      const f = fixture(id);
      for (let ms = 0; ms < f.plan.exitEnd; ms += 89) {
        at(f, ms);
        for (const limb of [...f.model.arms, ...f.model.legs]) {
          expect(limb.joint.position.length()).toBeCloseTo(limb.lengths[0], 4);
          expect(limb.end.position.distanceTo(limb.joint.position)).toBeCloseTo(limb.lengths[1], 4);
        }
      }
      clean(f);
    }
  });

  it('wedges the closed present exactly under the corner and lifts the card on the real lid', () => {
    for (const id of ['santa-0', 'santa-1', 'santa-4']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = facingFor(p, b),
          floor = santaFloor(b);
        const corner = { x: santaContactX(p, b, facing), y: b.top + b.height };
        expect(santaCardPose(p, p.pop - 1, facing, b)).toEqual(NEUTRAL);
        expect(santaCardPose(p, p.settled, facing, b)).toEqual(NEUTRAL);
        at(f, p.wedge + 20, b, facing);
        expect(gap(screenOf(named(f, 'gift-lid')), corner), `${id} closed`).toBeLessThan(0.01);
        expect(lowestWorldY(named(f, 'santa-gift'))).toBeCloseTo(-floor, 4);
        for (const ms of [p.peak, p.peak + 170, p.bounceEnd, p.sink + 200]) {
          at(f, ms, b, facing);
          const q = santaCardPose(p, ms, facing, b);
          const held = cardPoint(q, corner, b);
          expect(gap(screenOf(named(f, 'gift-lid')), held), `${id} ${ms}`).toBeLessThan(0.01);
          expect(held.y).toBeLessThan(corner.y - 4);
          expect(Math.sign(q.angle)).toBe(facing);
        }
      }
      at(f, p.exitEnd + 100);
      expect(named(f, 'santa-gift').visible).toBe(true);
      expect(lowestWorldY(named(f, 'santa-gift'))).toBeCloseTo(-santaFloor(card), 4);
      clean(f);
    }
  });

  it('carries the present in both hands, stands on its soles and pushes off with hands on the rails', () => {
    for (const id of ['santa-0', 'santa-1', 'santa-2', 'santa-5']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = facingFor(p, b),
          floor = santaFloor(b);
        const near = facing > 0 ? f.model.arms[0] : f.model.arms[1],
          far = facing > 0 ? f.model.arms[1] : f.model.arms[0];
        const gift = named(f, 'santa-gift');
        for (const ms of [p.emerge + 320, p.out + 60, p.show + 200, p.place + 100, p.wedge]) {
          at(f, ms, b, facing);
          const z = facing * (6 + 2.1);
          for (const [arm, side] of [
            [near, 1],
            [far, -1],
          ] as const) {
            const world = gift.localToWorld(new THREE.Vector3(0, 6, z * side));
            const grip = { x: world.x, y: -world.y };
            expect(gap(screenOf(arm.end), grip), `${id} ${ms}`).toBeLessThan(0.05);
          }
        }
        for (const ms of [p.travel + 400, p.place, p.pop + 60, p.sink, p.settled + 300, p.landed]) {
          at(f, ms, b, facing);
          for (const leg of f.model.legs)
            expect(lowestWorldY(leg.end), `${id} sole ${ms}`).toBeCloseTo(-floor, 3);
        }
        at(f, p.push + 100, b, facing);
        for (const [arm, grip] of [
          [near, f.model.railGrips[facing > 0 ? 0 : 1]],
          [far, f.model.railGrips[facing > 0 ? 1 : 0]],
        ] as const)
          expect(gap(screenOf(arm.end), screenOf(grip))).toBeLessThan(0.05);
        at(f, p.unfolded + 40, b, facing);
        expect(lowestWorldY(f.model.sleigh)).toBeCloseTo(-floor, 3);
      }
      clean(f);
    }
  });

  it('thinks its greeting above the card while preparing to leave, then sleighs fully out of view', () => {
    for (const id of ids(6)) {
      const f = fixture(id),
        p = f.plan;
      const bubble = named(f, 'santa-greeting');
      at(f, p.unfold - 10);
      expect(bubble.visible).toBe(false);
      expect(bubble.userData['text']).toBe(SANTA_GREETING);
      for (const b of layouts)
        for (const ms of [p.unfold + 300, p.seated, p.bubbleOut - 50]) {
          at(f, ms, b);
          expect(bubble.visible).toBe(true);
          expect(bubble.scale.x).toBeGreaterThan(0);
          expect(bubble.scale.y).toBeGreaterThan(0);
          const x = bubble.position.x,
            y = -bubble.position.y;
          expect(x - bubble.scale.x / 2).toBeGreaterThanOrEqual(0);
          expect(x + bubble.scale.x / 2).toBeLessThanOrEqual(view.x);
          expect(y - bubble.scale.y / 2).toBeGreaterThanOrEqual(0);
          expect(y + bubble.scale.y / 2).toBeLessThanOrEqual(b.top);
        }
      at(f, p.glide);
      const scale = f.actor.scale.x;
      at(f, p.exitEnd);
      const facing = facingFor(p);
      const exit = santaExitPoint(p, card, view, facing);
      expect(f.actor.position.x).toBeCloseTo(exit.x, 3);
      expect(f.actor.scale.x).toBe(scale);
      expect(f.model.sleigh.visible).toBe(true);
      if (!p.flies) expect(lowestWorldY(f.model.sleigh)).toBeCloseTo(-santaFloor(card), 3);
      clean(f);
    }
  });
});

function frameEquals(f: Fixture, probe: number, elsewhere: number) {
  at(f, probe);
  const pose = f.actor.matrixWorld.clone();
  const hand = f.model.arms[0].end.matrixWorld.clone();
  const lid = named(f, 'gift-lid').matrixWorld.clone();
  at(f, elsewhere);
  at(f, probe);
  expect(f.actor.matrixWorld.equals(pose)).toBe(true);
  expect(f.model.arms[0].end.matrixWorld.equals(hand)).toBe(true);
  expect(named(f, 'gift-lid').matrixWorld.equals(lid)).toBe(true);
}
