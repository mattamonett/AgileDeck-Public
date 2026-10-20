import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeMummy, mummyModel } from './mummy-model';
import { MummyTrick } from './mummy-trick';
import {
  MUMMY_DURATION,
  mummyBands,
  mummyCardPose,
  mummyExitPoint,
  mummyFeed,
  mummyLandingPoint,
  mummyPlan,
  type MummyPlan,
} from './mummy-choreography';
import { lowestWorldY, onCard, screenOf, sideOf } from '../../kit';
import { disposeObject } from '../../engine/throw-models';

const view = { x: 1200, y: 850 },
  start = { x: 260, y: 480 };
const card = { left: 600, top: 420, width: 84, height: 122 };
const layouts = [
  card,
  { left: 8, top: 500, width: 58, height: 84 },
  { left: 1120, top: 500, width: 58, height: 84 },
];
function fixture(id: string) {
  const actor = makeMummy(id),
    trick = new MummyTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, plan: trick.plan, model: mummyModel(actor) };
}
type Fixture = ReturnType<typeof fixture>;
function side(f: Fixture, b = card) {
  const end = mummyLandingPoint(f.plan, b, view);
  return sideOf(b.left + b.width / 2 - end.x);
}
function at(f: Fixture, ms: number, b = card, facing = side(f, b)) {
  f.trick.update(ms * f.plan.pace, f.actor, start, b, view, facing);
  f.actor.updateMatrixWorld(true);
  f.trick.object.updateMatrixWorld(true);
}
function ribbonCentre(f: Fixture, i: number) {
  const ribbon = f.trick.object.getObjectByName('mummy-ribbon');
  if (!(ribbon instanceof THREE.Mesh)) throw new Error('Missing ribbon');
  const p = ribbon.geometry.getAttribute('position');
  return new THREE.Vector3(
    (p.getX(i * 2) + p.getX(i * 2 + 1)) / 2,
    (p.getY(i * 2) + p.getY(i * 2 + 1)) / 2,
    0,
  );
}
function plans(count: number): MummyPlan[] {
  return Array.from({ length: count }, (_, i) => mummyPlan(`mummy-${i}`));
}

describe('mummy wrapping performance', () => {
  it('samples one reproducible plan with varied, compatible choices and room to finish', () => {
    expect(mummyPlan('again')).toEqual(mummyPlan('again'));
    const all = plans(40);
    for (const key of [
      'pace',
      'travel',
      'bend',
      'pauseAt',
      'wrap',
      'squeeze',
      'yank',
      'exitRise',
    ] as const)
      expect(new Set(all.map((p) => p[key])).size).toBe(40);
    for (const key of [
      'side',
      'stumble',
      'drag',
      'bands',
      'glance',
      'blinks',
      'rewind',
      'lookBack',
    ] as const)
      expect(new Set(all.map((p) => p[key])).size).toBe(2);
    for (const p of all) {
      expect(p.exitEnd + 200).toBeLessThan(MUMMY_DURATION);
      expect(p.wrapEnd).toBeLessThan(p.stare);
      expect(p.peelEnd).toBeLessThan(p.rewindEnd);
    }
  });

  it('keeps every arm and leg segment at its fixed length through the whole routine', () => {
    for (const id of ['mummy-0', 'mummy-1', 'mummy-2']) {
      const f = fixture(id);
      for (let ms = 0; ms < MUMMY_DURATION; ms += 97) {
        at(f, ms);
        for (const limb of [...f.model.arms, ...f.model.legs]) {
          const [upper, lower] = limb.lengths;
          expect(limb.joint.position.length()).toBeCloseTo(upper, 4);
          expect(limb.end.position.distanceTo(limb.joint.position)).toBeCloseTo(lower, 4);
        }
      }
      disposeObject(f.actor);
      disposeObject(f.trick.object);
    }
  });

  it('feeds the bandage from the gripping hand to the live card edge at the band being wound', () => {
    for (const id of ['mummy-0', 'mummy-3', 'mummy-4']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = side(f, b),
          nearU = facing > 0 ? 0 : 1;
        for (const ms of [
          p.wrapStart + 20,
          p.wrapStart + p.wrap * 1.3,
          p.wrapEnd - 10,
          p.stare + 400,
        ]) {
          at(f, ms, b, facing);
          const expected = onCard(mummyCardPose(p, ms, facing), nearU, mummyFeed(p, ms).v, b);
          const end = ribbonCentre(f, 48);
          expect(end.x).toBeCloseTo(expected.x, 4);
          expect(end.y).toBeCloseTo(-expected.y, 4);
          const grip = screenOf(facing > 0 ? f.model.grip : f.model.backGrip);
          let nearest = Infinity;
          for (let i = 0; i <= 48; i++)
            nearest = Math.min(
              nearest,
              ribbonCentre(f, i).distanceTo(new THREE.Vector3(grip.x, -grip.y, 0)),
            );
          expect(nearest).toBeLessThan(2.5);
        }
      }
      disposeObject(f.actor);
      disposeObject(f.trick.object);
    }
  });

  it('constricts only after a band cinches and releases the card completely once torn away', () => {
    for (const p of plans(8))
      for (const facing of [-1, 1]) {
        expect(mummyCardPose(p, p.wrapStart - 1, facing)).toEqual({
          x: 0,
          y: 0,
          angle: 0,
          sx: 1,
          sy: 1,
        });
        expect(mummyCardPose(p, p.wrapStart + p.wrap * 0.62, facing).sx).toBeLessThan(0.98);
        expect(mummyCardPose(p, p.wrapEnd + 50, facing).sx).toBeLessThan(0.97);
        expect(mummyCardPose(p, p.peelEnd + 950, facing)).toEqual({
          x: 0,
          y: 0,
          angle: 0,
          sx: 1,
          sy: 1,
        });
      }
    const f = fixture('mummy-1'),
      p = f.plan;
    at(f, p.wrapStart - 1);
    for (let k = 0; k < mummyBands(p).length; k++)
      expect(f.trick.object.getObjectByName(`card-band-${k}`)?.visible).toBe(false);
    at(f, p.stare + 300);
    for (let k = 0; k < mummyBands(p).length; k++)
      expect(f.trick.object.getObjectByName(`card-band-${k}`)?.visible).toBe(true);
    at(f, p.peelEnd + 10);
    for (let k = 0; k < mummyBands(p).length; k++)
      expect(f.trick.object.getObjectByName(`card-band-${k}`)?.visible).toBe(false);
    expect(f.trick.cardAnimation(1).frames.at(-1)).toMatchObject({
      translate: '0px 0px',
      rotate: '0deg',
      scale: '1 1',
    });
    disposeObject(f.actor);
    disposeObject(f.trick.object);
  });

  it('stands on its real feet while working and keeps creeping through its acted beat', () => {
    for (const id of ['mummy-0', 'mummy-2', 'mummy-5']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = side(f, b),
          stand = mummyLandingPoint(p, b, view, facing);
        for (const ms of [
          p.grab + 100,
          p.wrapStart + p.wrap * 2.2,
          p.stare + 500,
          p.yankAt + 300,
          p.rewindEnd - 50,
        ]) {
          at(f, ms, b, facing);
          let lowest = Infinity;
          for (const leg of f.model.legs) lowest = Math.min(lowest, lowestWorldY(leg.end));
          expect(lowest).toBeCloseTo(-stand.y, 3);
        }
      }
      const mid = p.travel * (p.pauseAt + (p.stumble ? 0.05 : 0.08));
      at(f, mid - 15);
      const before = f.actor.position.clone();
      at(f, mid + 15);
      expect(f.actor.position.distanceTo(before)).toBeGreaterThan(0.3);
      disposeObject(f.actor);
      disposeObject(f.trick.object);
    }
  });

  it('rewinds its own torso bands or drags the torn cloth off, then walks fully out of view', () => {
    for (const id of ['mummy-0', 'mummy-1', 'mummy-2', 'mummy-3']) {
      const f = fixture(id),
        p = f.plan;
      at(f, p.departure + 600);
      const visibleBands = f.model.bands.filter((band) => band.visible).length;
      expect(visibleBands).toBe(p.rewind ? f.model.bands.length : 0);
      expect(f.trick.object.getObjectByName('mummy-ribbon')?.visible).toBe(!p.rewind);
      const scale = f.actor.scale.x;
      at(f, p.exitEnd);
      const exit = mummyExitPoint(p, card, view, side(f));
      expect(f.actor.position.x).toBeCloseTo(exit.x, 3);
      expect(exit.x < 0 || exit.x > view.x).toBe(true);
      expect(f.actor.scale.x).toBe(scale);
      disposeObject(f.actor);
      disposeObject(f.trick.object);
    }
  });
});
