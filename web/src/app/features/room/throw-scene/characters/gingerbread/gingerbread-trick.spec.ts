import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { gingerbreadModel, makeGingerbread } from './gingerbread-model';
import { GingerbreadTrick } from './gingerbread-trick';
import {
  GINGERBREAD_DURATION,
  gingerbreadCardPose,
  gingerbreadExitX,
  gingerbreadFloor,
  gingerbreadLandingPoint,
  gingerbreadPlan,
  gingerbreadTapAt,
  gingerbreadTugEnd,
  type GingerbreadPlan,
} from './gingerbread-choreography';
import { cardPoint, lowestWorldY, screenOf, sideOf } from '../../kit';
import { disposeObject } from '../../engine/throw-models';

const view = { x: 1200, y: 850 },
  start = { x: 260, y: 480 },
  card = { left: 600, top: 420, width: 84, height: 122 };
const layouts = [
  card,
  { left: 8, top: 500, width: 58, height: 84 },
  { left: 1120, top: 500, width: 58, height: 84 },
];
const NEUTRAL = { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };

function fixture(id: string) {
  const actor = makeGingerbread(id),
    trick = new GingerbreadTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, plan: trick.plan, model: gingerbreadModel(actor) };
}
type Fixture = ReturnType<typeof fixture>;
const sideFor = (p: GingerbreadPlan, b = card, chosen?: number) =>
  sideOf(b.left + b.width / 2 - gingerbreadLandingPoint(p, b, view, chosen).x);
function at(f: Fixture, ms: number, b = card, facing = sideFor(f.plan, b)) {
  f.trick.update(ms * f.plan.pace, f.actor, start, b, view, facing);
  f.actor.updateMatrixWorld(true);
  f.trick.object.updateMatrixWorld(true);
}
function clean(f: Fixture) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
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
const ids = (n: number) => Array.from({ length: n }, (_, i) => `ginger-${i}`);

describe('gingerbread acrobat performance', () => {
  it('samples one reproducible plan whose every choice varies between events', () => {
    expect(gingerbreadPlan('again')).toEqual(gingerbreadPlan('again'));
    const plans = ids(40).map(gingerbreadPlan);
    for (const key of [
      'pace',
      'travel',
      'bend',
      'rhythm',
      'beatAt',
      'strength',
      'hookU',
      'amp',
      'period',
      'wheelSpeed',
      'landGap',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size, key).toBe(40);
    for (const key of [
      'side',
      'approach',
      'test',
      'taps',
      'swings',
      'flips',
      'flipDir',
      'stick',
      'bow',
      'stow',
      'exit',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size, key).toBe(2);
    for (const p of plans) expect(p.exitEnd + 450).toBeLessThan(GINGERBREAD_DURATION);
    const thirty = ids(30).map(gingerbreadPlan);
    expect(new Set(thirty.map((p) => p.side)).size).toBe(2);
    expect(new Set(thirty.map((p) => p.pace)).size).toBe(30);
  });

  it('leaves from the sender and never brakes to a dead stop on the way', () => {
    for (const id of ids(10)) {
      const f = fixture(id),
        p = f.plan;
      at(f, 0);
      const body = presence(f.actor);
      expect(Math.hypot(body.x - start.x, body.y + start.y), id).toBeLessThan(45);
      const steps: number[] = [];
      at(f, p.travel * 0.15);
      let previous = f.actor.position.clone();
      for (let ms = p.travel * 0.15 + 8; ms <= p.travel * 0.85; ms += 8) {
        at(f, ms);
        steps.push(f.actor.position.distanceTo(previous));
        previous = f.actor.position.clone();
      }
      const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
      expect(Math.min(...steps), `${id} ${p.approach}`).toBeGreaterThanOrEqual(0.3 * mean);
      const stand = f.trick.layout(start, card, view, sideFor(p)).stand;
      at(f, p.travel);
      expect(f.actor.position.x).toBeCloseTo(stand.x, 6);
      expect(-f.actor.position.y).toBeCloseTo(stand.y, 6);
      clean(f);
    }
  });

  it('moves continuously at full size through every stage', () => {
    for (const id of ids(4)) {
      const f = fixture(id);
      at(f, 0);
      const scale = f.actor.scale.y;
      let previous = f.actor.position.clone(),
        turn = f.actor.quaternion.clone();
      for (let ms = 8; ms < GINGERBREAD_DURATION; ms += 8) {
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
    for (const p of ids(8).map(gingerbreadPlan)) {
      const facing = sideFor(p);
      expect(sideFor(p, { ...card, left: card.left + 140, width: 58, height: 84 }, facing)).toBe(
        facing,
      );
      expect(sideFor(p, { ...card, left: 6 })).toBe(-1);
      expect(sideFor(p, { ...card, left: view.x - card.width - 6 })).toBe(1);
    }
  });

  it('seeks deterministically with finite transforms and restores the card', () => {
    const f = fixture('ginger-0');
    const probe = GINGERBREAD_DURATION * 0.55;
    at(f, probe);
    const pose = f.actor.matrixWorld.clone();
    at(f, GINGERBREAD_DURATION * 0.9);
    at(f, probe);
    expect(f.actor.matrixWorld.equals(pose)).toBe(true);
    for (let ms = 0; ms <= GINGERBREAD_DURATION; ms += 61) {
      at(f, ms);
      for (const root of [f.actor, f.trick.object])
        root.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    }
    for (const id of ids(6)) {
      const g = fixture(id);
      const animation = g.trick.cardAnimation(sideFor(g.plan), card);
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
      clean(g);
    }
    at(f, GINGERBREAD_DURATION + 1);
    expect(f.trick.object.visible).toBe(false);
    clean(f);
  });

  it('disposes every owned geometry and material exactly once', () => {
    const f = fixture('ginger-0');
    at(f, f.plan.land + 100);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    for (const root of [f.actor, f.trick.object])
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          resources.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) resources.add(m);
        }
      });
    const spies = Array.from(resources, (r) => vi.spyOn(r, 'dispose'));
    clean(f);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });

  it('keeps every jointed limb at its fixed length and the cane in the fist until it is stowed', () => {
    for (const id of ids(4)) {
      const f = fixture(id),
        p = f.plan;
      for (let ms = 0; ms < p.exitEnd; ms += 89) {
        at(f, ms);
        for (const limb of [...f.model.arms, ...f.model.legs]) {
          expect(limb.joint.position.length()).toBeCloseTo(limb.lengths[0], 4);
          expect(limb.end.position.distanceTo(limb.joint.position)).toBeCloseTo(limb.lengths[1], 4);
        }
        const stowed = p.stow === 'back' && ms >= p.stowEnd;
        expect(f.model.cane.parent, `${id} ${ms}`).toBe(
          stowed ? f.model.body : f.model.arms[0].end,
        );
      }
      // The hand lets go exactly where the cane comes to rest on his back.
      if (p.stow === 'back') {
        at(f, p.stowEnd - 0.001);
        const held = screenOf(f.model.hook);
        at(f, p.stowEnd);
        const hung = screenOf(f.model.hook);
        expect(Math.hypot(held.x - hung.x, held.y - hung.y)).toBeLessThan(0.05);
      }
      clean(f);
    }
  });

  it('puts the real crook on the live card edge to test it, then pivots the swing exactly on the hooked corner', () => {
    for (const id of ids(8)) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(p, b);
        const st = f.trick.layout(start, b, view, facing);
        const v = (st.testPoint.y - b.top) / b.height;
        expect(v).toBeGreaterThan(0.45);
        expect(v).toBeLessThan(0.9);
        const tests =
          p.test === 'tap'
            ? Array.from({ length: p.taps }, (_, k) => gingerbreadTapAt(p, k))
            : [p.testHit, p.testHit + 150, p.testHit + 300, gingerbreadTugEnd(p)];
        for (const ms of tests) {
          at(f, ms, b, facing);
          const hook = screenOf(f.model.hook),
            edge = cardPoint(gingerbreadCardPose(p, ms, facing, b), st.testPoint, b);
          expect(Math.hypot(hook.x - edge.x, hook.y - edge.y), `${id} test ${ms}`).toBeLessThan(
            0.05,
          );
        }
        for (const ms of [
          p.catchAt,
          p.catchAt + p.period * 0.3,
          p.catchAt + p.period,
          p.release - 1,
        ]) {
          at(f, ms, b, facing);
          const hook = screenOf(f.model.hook),
            corner = cardPoint(gingerbreadCardPose(p, ms, facing, b), st.hookPoint, b);
          expect(Math.hypot(hook.x - corner.x, hook.y - corner.y), `${id} hang ${ms}`).toBeLessThan(
            0.05,
          );
        }
      }
      clean(f);
    }
  });

  it('leaves the card untouched before the test, leans it toward his weight, and restores it after he lets go', () => {
    for (const p of ids(8).map(gingerbreadPlan))
      for (const facing of [-1, 1]) {
        expect(gingerbreadCardPose(p, p.testHit - 1, facing, card)).toEqual(NEUTRAL);
        const hanging = gingerbreadCardPose(p, p.catchAt + 200, facing, card);
        expect(hanging.angle * facing).toBeLessThan(-1);
        expect(gingerbreadCardPose(p, p.release + 900, facing, card)).toEqual(NEUTRAL);
      }
  });

  it('plants its soles on the floor, cartwheels fully out of view and leaves crumbs resting on the floor', () => {
    for (const id of ids(8)) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const floor = -gingerbreadFloor(b);
        for (const ms of [p.testStart, p.testHit + 100, p.land + 30, p.landEnd + 100, p.stowEnd]) {
          at(f, ms, b);
          const soles = Math.min(...f.model.legs.map((l) => lowestWorldY(l.end)));
          expect(soles, `${id} ${ms}`).toBeCloseTo(floor, 3);
        }
      }
      const facing = sideFor(p);
      at(f, p.exitEnd);
      const exitX = gingerbreadExitX(p, view, facing);
      expect(
        exitX < 0 ? f.actor.position.x < -40 : f.actor.position.x > view.x + 40,
        `${id} exits`,
      ).toBe(true);
      at(f, p.exitEnd - 10);
      const crumbs = f.trick.object.children.filter(
        (o) => o.name.startsWith('gingerbread-crumb') && o.visible,
      );
      expect(crumbs.length).toBeGreaterThan(3);
      for (const crumb of crumbs)
        expect(lowestWorldY(crumb)).toBeCloseTo(-gingerbreadFloor(card), 3);
      clean(f);
    }
  });
});
