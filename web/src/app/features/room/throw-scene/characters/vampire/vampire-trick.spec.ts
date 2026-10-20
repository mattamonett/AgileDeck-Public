import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeVampire, vampireModel } from './vampire-model';
import { VampireTrick } from './vampire-trick';
import {
  VAMPIRE_DURATION,
  vampireCardPose,
  vampireFloor,
  vampireLandingPoint,
  vampirePlan,
} from './vampire-choreography';
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
function fixture(id: string) {
  const actor = makeVampire(id),
    trick = new VampireTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, plan: trick.plan, model: vampireModel(actor) };
}
type Fixture = ReturnType<typeof fixture>;
const sideFor = (f: Fixture, b = card) =>
  sideOf(b.left + b.width / 2 - vampireLandingPoint(f.plan, b, view).x);
function at(f: Fixture, ms: number, b = card, facing = sideFor(f, b)) {
  f.trick.update(ms * f.plan.pace, f.actor, start, b, view, facing);
  f.actor.updateMatrixWorld(true);
}
function clean(f: Fixture) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}

describe('vampire bite performance', () => {
  it('samples a reproducible plan whose routes, gulps, gestures and exits vary', () => {
    expect(vampirePlan('again')).toEqual(vampirePlan('again'));
    const plans = Array.from({ length: 40 }, (_, i) => vampirePlan(`vampire-${i}`));
    for (const key of [
      'travel',
      'bend',
      'flap',
      'biteU',
      'crouch',
      'strength',
      'exitRise',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(40);
    for (const key of ['circle', 'gulps', 'wipe'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    expect(new Set(plans.map((p) => p.exit)).size).toBe(3);
    for (const p of plans) expect(p.exitEnd + 600).toBeLessThan(VAMPIRE_DURATION);
  });

  it('drives the real fang tip into the card beside the value and keeps it in the wound while draining', () => {
    for (const id of ['vampire-0', 'vampire-1', 'vampire-2', 'vampire-3']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(f, b),
          { bite } = f.trick.contact(b, facing);
        const u = (bite.x - b.left) / b.width,
          v = (bite.y - b.top) / b.height;
        expect(facing > 0 ? u : 1 - u).toBeLessThan(0.25);
        expect(v).toBeGreaterThan(0.2);
        expect(v).toBeLessThan(0.75);
        for (const ms of [p.bite, p.bite + 200, p.bite + 120 + 180, p.release - 1]) {
          at(f, ms, b, facing);
          const fang = screenOf(f.model.fang),
            wound = cardPoint(vampireCardPose(p, ms, facing, b, bite), bite, b);
          expect(Math.hypot(fang.x - wound.x, fang.y - wound.y), `${id} ${ms}`).toBeLessThan(0.05);
        }
        expect(vampireCardPose(p, p.formed + 150, facing, b, bite)).toEqual({
          x: 0,
          y: 0,
          angle: 0,
          sx: 1,
          sy: 1,
        });
        expect(vampireCardPose(p, p.release + 1000, facing, b, bite)).toEqual({
          x: 0,
          y: 0,
          angle: 0,
          sx: 1,
          sy: 1,
        });
      }
      clean(f);
    }
  });

  it('braces a clawed hand on the card edge and keeps both feet on the floor while it bites', () => {
    for (const id of ['vampire-0', 'vampire-4']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(f, b),
          { bite } = f.trick.contact(b, facing);
        for (const ms of [p.bite - 100, p.bite + 300, p.release - 20]) {
          at(f, ms, b, facing);
          const arm = f.model.arms[facing > 0 ? 0 : 1];
          const hand = screenOf(arm.end);
          const edge = cardPoint(
            vampireCardPose(p, ms, facing, b, bite),
            VampireTrick.gripPoint(b, bite, facing),
            b,
          );
          expect(Math.hypot(hand.x - edge.x, hand.y - edge.y), `${id} hand ${ms}`).toBeLessThan(
            0.5,
          );
          let lowest = Infinity;
          for (const leg of f.model.legs) lowest = Math.min(lowest, lowestWorldY(leg.end));
          expect(lowest).toBeCloseTo(-vampireFloor(b), 2);
          for (const limb of [...f.model.arms, ...f.model.legs]) {
            expect(limb.joint.position.length()).toBeCloseTo(limb.lengths[0], 4);
            expect(limb.end.position.distanceTo(limb.joint.position)).toBeCloseTo(
              limb.lengths[1],
              4,
            );
          }
        }
      }
      clean(f);
    }
  });

  it('arrives and leaves as a bat, transforming in place, and flies fully out of view', () => {
    for (const id of ['vampire-0', 'vampire-1', 'vampire-2', 'vampire-5', 'vampire-6']) {
      const f = fixture(id),
        p = f.plan;
      at(f, p.travel * 0.5);
      expect(f.model.bat.visible).toBe(true);
      expect(f.model.human.visible).toBe(false);
      at(f, p.bite);
      expect(f.model.human.visible).toBe(true);
      expect(f.model.bat.visible).toBe(false);
      at(f, p.perch + 200);
      const batAt = screenOf(f.model.bat);
      at(f, p.perch + 420);
      const head = screenOf(f.model.head);
      expect(Math.hypot(batAt.x - head.x, batAt.y - head.y)).toBeLessThan(14);
      at(f, p.exitEnd);
      const bat = screenOf(f.model.bat);
      expect(bat.x < -40 || bat.x > view.x + 40 || bat.y < -40).toBe(true);
      expect(f.model.human.visible).toBe(false);
      clean(f);
    }
  });

  it('leaves puncture wounds and drips that grow with each gulp and clear only after it has gone', () => {
    const f = fixture('vampire-0'),
      p = f.plan;
    const drip = f.trick.object.getObjectByName('vampire-drip-0');
    const wound = f.trick.object.getObjectByName('vampire-puncture-0');
    at(f, p.bite - 1);
    expect(wound?.visible).toBe(false);
    at(f, p.bite + 1);
    expect(wound?.visible).toBe(true);
    const length = () => {
      if (!(drip instanceof THREE.Mesh)) throw new Error('Missing drip');
      const pos = drip.geometry.getAttribute('position');
      return Math.abs(pos.getY(pos.count - 1) - pos.getY(0));
    };
    at(f, p.bite + 150);
    const early = length();
    at(f, p.release);
    expect(length()).toBeGreaterThan(early + 8);
    at(f, p.exitEnd);
    expect(wound?.visible).toBe(true);
    at(f, VAMPIRE_DURATION - 10);
    expect(wound?.visible).toBe(false);
    clean(f);
  });
});
