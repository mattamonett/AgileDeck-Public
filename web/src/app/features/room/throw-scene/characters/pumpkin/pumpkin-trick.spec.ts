import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makePumpkin, pumpkinModel } from './pumpkin-model';
import { PumpkinTrick } from './pumpkin-trick';
import {
  PUMPKIN_DURATION,
  pumpkinCardPose,
  pumpkinExitPoint,
  pumpkinFloor,
  pumpkinLandingPoint,
  pumpkinPlan,
} from './pumpkin-choreography';
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
  const actor = makePumpkin(id),
    trick = new PumpkinTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, plan: trick.plan, model: pumpkinModel(actor) };
}
type Fixture = ReturnType<typeof fixture>;
const sideFor = (f: Fixture, b = card) =>
  sideOf(b.left + b.width / 2 - pumpkinLandingPoint(f.plan, b, view).x);
function at(f: Fixture, ms: number, b = card, facing = sideFor(f, b)) {
  f.trick.update(ms * f.plan.pace, f.actor, start, b, view, facing);
  f.actor.updateMatrixWorld(true);
  f.trick.object.updateMatrixWorld(true);
}
function clean(f: Fixture) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}
const NEUTRAL = { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };

describe('pumpkin monster performance', () => {
  it('samples a reproducible plan whose approach, chewing and ending vary', () => {
    expect(pumpkinPlan('again')).toEqual(pumpkinPlan('again'));
    const plans = Array.from({ length: 40 }, (_, i) => pumpkinPlan(`pumpkin-${i}`));
    for (const key of ['travel', 'bend', 'hunger', 'exitRise'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(40);
    for (const key of ['roll', 'chews', 'burst'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    expect(new Set(plans.map((p) => p.hops)).size).toBe(3);
    for (const p of plans) expect(p.exitEnd + 500).toBeLessThan(PUMPKIN_DURATION);
  });

  it('closes its real teeth on the card edge and holds it there through the chewing and the tear', () => {
    for (const id of ['pumpkin-0', 'pumpkin-2', 'pumpkin-4']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(f, b),
          { bite } = f.trick.contact(b, facing);
        const v = (bite.y - b.top) / b.height;
        expect(v).toBeGreaterThan(0.6);
        expect(v).toBeLessThan(0.95);
        for (const ms of [p.bite, p.bite + 300, p.tear - 10, p.tear + 120]) {
          at(f, ms, b, facing);
          const mouth = screenOf(f.model.bite),
            held = cardPoint(pumpkinCardPose(p, ms, facing, b, bite), bite, b);
          expect(Math.hypot(mouth.x - held.x, mouth.y - held.y), `${id} ${ms}`).toBeLessThan(0.05);
        }
        expect(pumpkinCardPose(p, p.open - 1, facing, b, bite)).toEqual(NEUTRAL);
        expect(pumpkinCardPose(p, p.exitEnd, facing, b, bite)).toEqual(NEUTRAL);
      }
      clean(f);
    }
  });

  it('keeps its limbs jointed, grips the card with its vines and leaves a bloody bite behind', () => {
    const f = fixture('pumpkin-1'),
      p = f.plan;
    for (let ms = 0; ms < p.exitEnd; ms += 97) {
      at(f, ms);
      for (const limb of [...f.model.arms, ...f.model.legs]) {
        expect(limb.joint.position.length()).toBeCloseTo(limb.lengths[0], 4);
        expect(limb.end.position.distanceTo(limb.joint.position)).toBeCloseTo(limb.lengths[1], 4);
      }
    }
    at(f, p.bite - 1);
    expect(f.trick.object.getObjectByName('pumpkin-tooth-mark-0')?.visible).toBe(false);
    at(f, p.tear + 400);
    for (const name of ['pumpkin-tooth-mark-0', 'pumpkin-card-wound', 'pumpkin-card-drip-0'])
      expect(f.trick.object.getObjectByName(name)?.visible).toBe(true);
    clean(f);
  });

  it('swallows with a travelling bulge, then bursts into its own pieces resting on the floor or hops away', () => {
    for (let i = 0; i < 8; i++) {
      const f = fixture(`pumpkin-${i}`),
        p = f.plan;
      at(f, p.swallow + 260);
      expect(f.model.bulge.visible).toBe(true);
      at(f, p.exitEnd);
      if (p.burst) {
        const floor = -pumpkinFloor(card);
        for (const rib of f.model.ribs) expect(lowestWorldY(rib.mesh)).toBeCloseTo(floor, 2);
        for (const piece of f.model.pieces) expect(lowestWorldY(piece)).toBeCloseTo(floor, 2);
      } else {
        const exit = pumpkinExitPoint(p, card, view, sideFor(f));
        expect(f.actor.position.x).toBeCloseTo(exit.x, 3);
        expect(exit.x < 0 || exit.x > view.x).toBe(true);
      }
      clean(f);
    }
  });
});
