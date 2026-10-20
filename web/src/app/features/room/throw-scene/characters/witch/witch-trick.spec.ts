import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BROOM_GRIP, BROOM_HAND_Z, makeWitch, witchModel } from './witch-model';
import { WitchTrick } from './witch-trick';
import {
  WITCH_DROP_GAP,
  WITCH_DURATION,
  WITCH_FALL,
  witchCardPose,
  witchDropTarget,
  witchFrog,
  witchLandingPoint,
  witchPlan,
} from './witch-choreography';
import { lowestWorldY, onCard, screenOf, sideOf } from '../../kit';
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
  const actor = makeWitch(id),
    trick = new WitchTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, plan: trick.plan, model: witchModel(actor) };
}
type Fixture = ReturnType<typeof fixture>;
const sideFor = (f: Fixture, b = card) =>
  sideOf(b.left + b.width / 2 - witchLandingPoint(f.plan, b, view).x);
function at(f: Fixture, ms: number, b = card, facing = sideFor(f, b)) {
  f.trick.update(ms * f.plan.pace, f.actor, start, b, view, facing);
  f.actor.updateMatrixWorld(true);
  f.trick.object.updateMatrixWorld(true);
}
const named = (f: Fixture, name: string) => {
  const o = f.trick.object.getObjectByName(name);
  if (!o) throw new Error(`Missing ${name}`);
  return o;
};
function clean(f: Fixture) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}

describe('witch frog spell performance', () => {
  it('samples a reproducible plan whose flight, frog, spell and exit choices vary', () => {
    expect(witchPlan('again')).toEqual(witchPlan('again'));
    const plans = Array.from({ length: 40 }, (_, i) => witchPlan(`witch-${i}`));
    for (const key of ['travel', 'bend', 'pourU', 'hopHeight', 'exitRise'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(40);
    for (const key of ['loop', 'hops', 'tongue', 'fizzle', 'toss', 'climb'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    for (const p of plans) expect(p.exitEnd + 200).toBeLessThan(WITCH_DURATION);
  });

  it('lets every drop leave the real flask mouth and the first one land on the card before it changes', () => {
    for (const id of ['witch-0', 'witch-1', 'witch-2']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(f, b);
        for (let i = 0; i < 4; i++) {
          const release = p.pour + i * WITCH_DROP_GAP;
          at(f, release + 0.01, b, facing);
          const mouth = screenOf(f.model.mouth),
            drop = named(f, `witch-drop-${i}`).position;
          expect(Math.hypot(drop.x - mouth.x, -drop.y - mouth.y), `${id} drop ${i}`).toBeLessThan(
            0.1,
          );
        }
        expect(witchCardPose(p, p.contact - 1, facing)).toEqual({
          x: 0,
          y: 0,
          angle: 0,
          sx: 1,
          sy: 1,
        });
        at(f, p.contact - 0.01, b, facing);
        const spot = witchDropTarget(p, 0, facing),
          target = onCard(witchCardPose(p, p.contact, facing), spot.u, spot.v, b);
        const drop = named(f, 'witch-drop-0').position;
        expect(Math.hypot(drop.x - target.x, -drop.y - target.y)).toBeLessThan(0.2);
        expect(witchFrog(p, p.contact)).toBe(0);
        expect(witchFrog(p, p.contact + 400)).toBe(1);
        expect(witchCardPose(p, p.contact + WITCH_FALL, facing).sy).not.toBe(1);
      }
      clean(f);
    }
  });

  it('grows frog features on the live card, keeps the value clear and removes them with the counter-spell', () => {
    const f = fixture('witch-0'),
      p = f.plan;
    for (const b of layouts) {
      const facing = sideFor(f, b);
      at(f, p.hopStart + 260, b, facing);
      const q = witchCardPose(p, p.hopStart + 260, facing);
      const eye = named(f, 'frog-eye-0').position,
        root = onCard(q, 0.27, 0.02, b);
      expect(Math.abs(eye.x - root.x)).toBeLessThan(0.01);
      expect(-eye.y).toBeLessThan(root.y + 0.01);
      expect(q.y).toBeLessThan(-2);
      for (const name of ['frog-eye-0', 'frog-eye-1', 'frog-foot-0', 'frog-haunch-1', 'frog-smile'])
        expect(named(f, name).visible).toBe(true);
    }
    at(f, p.restored + 10);
    for (const name of [
      'frog-eye-0',
      'frog-foot-0',
      'frog-haunch-1',
      'frog-smile',
      'witch-stain-0',
    ])
      expect(named(f, name).visible).toBe(false);
    expect(f.trick.cardAnimation(1).frames.at(-1)).toMatchObject({
      translate: '0px 0px',
      rotate: '0deg',
      scale: '1 1',
    });
    clean(f);
  });

  it('keeps the steering hand on the broom and the limbs jointed throughout', () => {
    const f = fixture('witch-3'),
      p = f.plan,
      grip = new THREE.Vector3();
    for (let ms = 0; ms < p.exitEnd; ms += 113) {
      at(f, ms);
      const hand = screenOf(f.model.arms[1].end);
      grip.set(BROOM_GRIP.x, BROOM_GRIP.y, -BROOM_HAND_Z);
      f.actor.localToWorld(grip);
      expect(Math.hypot(hand.x - grip.x, hand.y + grip.y), `grip at ${ms}`).toBeLessThan(0.05);
      for (const limb of [...f.model.arms, ...f.model.legs]) {
        expect(limb.joint.position.length()).toBeCloseTo(limb.lengths[0], 4);
        expect(limb.end.position.distanceTo(limb.joint.position)).toBeCloseTo(limb.lengths[1], 4);
      }
    }
    clean(f);
  });

  it('pockets or tosses the empty bottle onto the floor, then flies fully out of view', () => {
    for (let i = 0; i < 8; i++) {
      const f = fixture(`witch-${i}`),
        p = f.plan;
      at(f, p.exitEnd);
      const potion = f.model.potion;
      if (p.toss) {
        expect(potion.parent).toBe(f.trick.object);
        expect(lowestWorldY(potion)).toBeCloseTo(-(card.top + card.height + 6), 0);
      } else expect(potion.parent).toBe(f.model.holster);
      const cork = named(f, 'witch-flying-cork');
      expect(cork.position.y).toBeCloseTo(
        -(card.top + card.height + 6) + 0.75 * f.actor.scale.x,
        3,
      );
      const broom = screenOf(f.actor);
      expect(broom.x < -60 || broom.x > view.x + 60 || broom.y < -60).toBe(true);
      clean(f);
    }
  });
});
