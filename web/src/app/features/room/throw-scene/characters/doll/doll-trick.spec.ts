import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { dollModel, makeDoll } from './doll-model';
import { DollTrick } from './doll-trick';
import {
  DOLL_DURATION,
  DOLL_PRINTS,
  dollCardPose,
  dollExitPoint,
  dollFloor,
  dollLandingPoint,
  dollPlan,
  dollPrintAt,
} from './doll-choreography';
import { lowestWorldY, onCard, sideOf } from '../../kit';
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
  const actor = makeDoll(id),
    trick = new DollTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, plan: trick.plan, model: dollModel(actor) };
}
type Fixture = ReturnType<typeof fixture>;
const sideFor = (f: Fixture, b = card) =>
  sideOf(b.left + b.width / 2 - dollLandingPoint(f.plan, b, view).x);
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

describe('possessed doll performance', () => {
  it('samples a reproducible plan whose gait, freezes, haunting and exit vary', () => {
    expect(dollPlan('again')).toEqual(dollPlan('again'));
    const plans = Array.from({ length: 40 }, (_, i) => dollPlan(`doll-${i}`));
    for (const key of ['travel', 'bend', 'lift', 'fury', 'exitRise'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(40);
    for (const key of ['crab', 'fullSpin', 'prints', 'collapse'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    expect(new Set(plans.map((p) => p.freezes.length)).size).toBe(2);
    expect(new Set(plans.map((p) => p.order.join())).size).toBeGreaterThan(10);
    for (const p of plans) expect(p.exitEnd + 400).toBeLessThan(DOLL_DURATION);
  });

  it('creeps through its freezes, then plants its jointed feet on the floor beside the card', () => {
    for (const id of ['doll-0', 'doll-1', 'doll-2']) {
      const f = fixture(id),
        p = f.plan;
      const freeze = p.freezes[0] ?? 0.3;
      const hold = (freeze + 0.05) * p.travel;
      at(f, hold - 20);
      const before = f.actor.position.clone();
      at(f, hold + 20);
      expect(f.actor.position.distanceTo(before)).toBeGreaterThan(0.2);
      for (const b of layouts)
        for (const ms of [p.spin + 300, p.haunt + 600, p.stare + 500]) {
          at(f, ms, b);
          let lowest = Infinity;
          for (const leg of f.model.legs) lowest = Math.min(lowest, lowestWorldY(leg.end));
          expect(lowest, `${id} ${ms}`).toBeCloseTo(-dollFloor(b), 2);
          for (const limb of [...f.model.arms, ...f.model.legs]) {
            expect(limb.joint.position.length()).toBeCloseTo(limb.lengths[0], 4);
            expect(limb.end.position.distanceTo(limb.joint.position)).toBeCloseTo(
              limb.lengths[1],
              4,
            );
          }
        }
      clean(f);
    }
  });

  it('levitates and contorts the card only while possessed, slapping handprints onto the live card', () => {
    for (const id of ['doll-0', 'doll-3']) {
      const f = fixture(id),
        p = f.plan;
      for (const facing of [-1, 1]) {
        expect(dollCardPose(p, p.haunt - 1, facing)).toEqual(NEUTRAL);
        expect(dollCardPose(p, p.haunt + 700, facing).y).toBeLessThan(-5);
        expect(dollCardPose(p, p.drop + 600, facing)).toEqual(NEUTRAL);
      }
      for (const b of layouts) {
        const facing = sideFor(f, b);
        for (let k = 0; k < p.prints; k++) {
          const born = dollPrintAt(p, k);
          at(f, born - 1, b, facing);
          const print = f.trick.object.getObjectByName(`doll-print-${k}`);
          expect(print?.visible).toBe(false);
          at(f, born + 200, b, facing);
          const spot = DOLL_PRINTS[p.order[k] ?? 0];
          if (!print || !spot) throw new Error('Missing handprint');
          const expected = onCard(dollCardPose(p, born + 200, facing), spot.u, spot.v, b);
          expect(print.visible).toBe(true);
          expect(print.position.x).toBeCloseTo(expected.x, 4);
          expect(print.position.y).toBeCloseTo(-expected.y, 4);
          expect(Math.abs(spot.u - 0.5)).toBeGreaterThan(0.25);
        }
      }
      clean(f);
    }
  });

  it('cracks and weeps blood only once the haunting starts', () => {
    const f = fixture('doll-0'),
      p = f.plan;
    at(f, p.haunt - 10);
    for (const mesh of [...f.model.cracks, ...f.model.tears]) expect(mesh.visible).toBe(false);
    at(f, p.stare);
    for (const mesh of [...f.model.cracks, ...f.model.tears]) expect(mesh.visible).toBe(true);
    clean(f);
  });

  it('either backs away or collapses onto its real body and drags itself out of view', () => {
    for (let i = 0; i < 8; i++) {
      const f = fixture(`doll-${i}`),
        p = f.plan;
      if (p.collapse) {
        at(f, p.exit + 700);
        expect(lowestWorldY(f.actor)).toBeCloseTo(-dollFloor(card), 2);
      }
      at(f, p.exitEnd);
      const exit = dollExitPoint(p, card, view, sideFor(f));
      expect(f.actor.position.x).toBeCloseTo(exit.x, 3);
      expect(exit.x < 0 || exit.x > view.x).toBe(true);
      clean(f);
    }
  });
});
