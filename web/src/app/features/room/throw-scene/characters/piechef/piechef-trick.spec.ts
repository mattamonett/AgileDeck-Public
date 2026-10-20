import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makePiechef, piechefModel } from './piechef-model';
import { PiechefTrick } from './piechef-trick';
import {
  PIECHEF_DURATION,
  piechefCardPose,
  piechefExitPoint,
  piechefFloor,
  piechefLandingPoint,
  piechefPlan,
} from './piechef-choreography';
import { cardPoint, lowestWorldY, screenOf, sideOf } from '../../kit';
import type { TargetBounds } from '../../landing/landing-geometry';
import { disposeObject } from '../../engine/throw-models';

const view = { x: 1200, y: 850 },
  start = { x: 260, y: 480 },
  card = { left: 600, top: 420, width: 84, height: 122 };
const layouts: readonly TargetBounds[] = [
  card,
  { left: 90, top: 500, width: 58, height: 84 },
  { left: 1040, top: 380, width: 58, height: 84 },
];
const NEUTRAL = { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };

function fixture(id: string) {
  const actor = makePiechef(id),
    trick = new PiechefTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, plan: trick.plan, model: piechefModel(actor) };
}
type Fixture = ReturnType<typeof fixture>;
const sideFor = (f: Fixture, b: TargetBounds = card, chosen?: number) =>
  sideOf(b.left + b.width / 2 - piechefLandingPoint(f.plan, b, view, chosen).x);
function at(f: Fixture, ms: number, b: TargetBounds = card, facing = sideFor(f, b)) {
  f.trick.update(ms * f.plan.pace, f.actor, start, b, view, facing);
  f.actor.updateMatrixWorld(true);
  f.trick.object.updateMatrixWorld(true);
}
function clean(f: Fixture) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}
/** Centre of the visible geometry, as the shared routine checks judge it. */
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
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('clumsy pie chef performance', () => {
  it('samples one reproducible plan whose approach, stumble, peel, recovery and exit vary', () => {
    expect(piechefPlan('again')).toEqual(piechefPlan('again'));
    const plans = Array.from({ length: 40 }, (_, i) => piechefPlan(`piechef-${i}`));
    for (const key of [
      'pace',
      'travel',
      'bend',
      'beatAt',
      'severity',
      'tripDist',
      'splatU',
      'splatV',
      'strength',
      'peelTime',
      'askew',
      'exitRise',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size, key).toBe(40);
    for (const key of ['side', 'beat', 'tripFoot', 'tinEnd', 'exit'] as const)
      expect(new Set(plans.map((p) => p[key])).size, key).toBe(2);
    for (const key of ['stumble', 'recovery'] as const)
      expect(new Set(plans.map((p) => p[key])).size, key).toBe(3);
    for (const p of plans) expect(p.exitEnd + 600).toBeLessThan(PIECHEF_DURATION);
    expect(new Set(Array.from({ length: 30 }, (_, i) => piechefPlan(`🥷-${i}`).pace)).size).toBe(
      30,
    );
  });

  it('leaves from the sender and flows to the card without a dead stop', () => {
    for (const id of ['🥷-0', '🥷-1', '🥷-2', '🥷-3', '🥷-4', '🥷-5']) {
      const f = fixture(id);
      at(f, 0);
      const body = presence(f.actor);
      expect(
        Math.hypot(body.x - start.x, body.y + start.y),
        `${id} leaves from the sender`,
      ).toBeLessThan(45);
      const steps: number[] = [];
      let previous = f.actor.position.clone();
      for (let ms = f.plan.travel * 0.15; ms <= f.plan.travel * 0.85; ms += 8) {
        at(f, ms);
        if (ms > f.plan.travel * 0.15) steps.push(f.actor.position.distanceTo(previous));
        previous = f.actor.position.clone();
      }
      const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
      for (const step of steps) expect(step, id).toBeGreaterThanOrEqual(0.3 * mean);
      at(f, f.plan.travel);
      const stand = piechefLandingPoint(f.plan, card, view);
      expect(distance({ x: f.actor.position.x, y: -f.actor.position.y }, stand)).toBeLessThan(0.01);
      clean(f);
    }
  });

  it('moves continuously at full size through every stage and keeps its side through reflow', () => {
    for (const id of ['🥷-0', '🥷-1', '🥷-2', '🥷-6']) {
      const f = fixture(id);
      at(f, 0);
      const scale = f.actor.scale.y;
      let previous = f.actor.position.clone(),
        turn = f.actor.quaternion.clone();
      for (let ms = 8; ms < PIECHEF_DURATION; ms += 8) {
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
    for (let i = 0; i < 8; i++) {
      const f = fixture(`🥷-${i}`);
      const facing = sideFor(f);
      const moved = { ...card, left: card.left + 140, width: 58, height: 84 };
      expect(sideFor(f, moved, facing)).toBe(facing);
      expect(sideFor(f, { ...card, left: 6 })).toBe(-1);
      expect(sideFor(f, { ...card, left: view.x - card.width - 6 })).toBe(1);
      clean(f);
    }
  });

  it('seeks deterministically with finite transforms, restores the card and cleans up', () => {
    const f = fixture('🥷-0'),
      end = PIECHEF_DURATION;
    const probe = end * 0.55;
    at(f, probe);
    const pose = f.actor.matrixWorld.clone();
    const tin = f.model.pie.matrixWorld.clone();
    at(f, end * 0.9);
    at(f, f.plan.splat + 10);
    at(f, probe);
    expect(f.actor.matrixWorld.equals(pose)).toBe(true);
    expect(f.model.pie.matrixWorld.equals(tin)).toBe(true);
    for (let ms = 0; ms <= end; ms += 61) {
      at(f, ms);
      for (const root of [f.actor, f.trick.object])
        root.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    }
    const animation = f.trick.cardAnimation(sideFor(f));
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
    at(f, end + 1);
    expect(f.trick.object.visible).toBe(false);
    expect(f.actor.visible).toBe(false);
    at(f, 3000);
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

  it('plants the real filling face on the live card below the value, mitts on the tin rim throughout', () => {
    for (const id of ['🥷-0', '🥷-1', '🥷-2', '🥷-3']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(f, b),
          contact = f.trick.contactPoint(b, facing);
        expect((contact.y - b.top) / b.height).toBeGreaterThan(0.7);
        for (const ms of [p.splat, p.splat + 60, p.splat + p.hold / 2, p.peel - 1]) {
          at(f, ms, b, facing);
          const face = screenOf(f.model.face),
            live = cardPoint(piechefCardPose(p, ms, facing), contact, b);
          expect(distance(face, live), `${id} face at ${ms}`).toBeLessThan(0.05);
        }
        for (const ms of [
          p.travel * 0.3,
          p.travel * 0.6,
          p.travel - 10,
          p.splat,
          p.peel + p.peelTime / 2,
          p.peelEnd + 200,
          p.release - 5,
        ]) {
          at(f, ms, b, facing);
          f.model.grips.forEach((grip, i) => {
            const rim = f.model.rims[i];
            if (!rim) throw new Error('Missing rim');
            expect(
              distance(screenOf(grip), screenOf(rim)),
              `${id} mitt ${i} at ${ms}`,
            ).toBeLessThan(1);
          });
        }
        expect(piechefCardPose(p, p.splat - 1, facing)).toEqual(NEUTRAL);
        expect(piechefCardPose(p, p.settled, facing)).toEqual(NEUTRAL);
        expect(piechefCardPose(p, p.splat + 60, facing)).not.toEqual(NEUTRAL);
      }
      clean(f);
    }
  });

  it('keeps jointed limbs and both soles on the floor while it presses, peels and recovers', () => {
    for (const id of ['🥷-1', '🥷-4', '🥷-7']) {
      const f = fixture(id),
        p = f.plan;
      for (let ms = 0; ms < p.exitEnd; ms += 89) {
        at(f, ms);
        for (const limb of [...f.model.arms, ...f.model.legs]) {
          expect(limb.joint.position.length()).toBeCloseTo(limb.lengths[0], 4);
          expect(limb.end.position.distanceTo(limb.joint.position)).toBeCloseTo(limb.lengths[1], 4);
        }
      }
      for (const b of layouts)
        for (const ms of [
          p.splat + 100,
          p.peel + 50,
          p.peelEnd - 20,
          p.recover + 200,
          p.departure - 10,
        ]) {
          at(f, ms, b);
          for (const leg of f.model.legs)
            expect(lowestWorldY(leg.end), `${id} sole at ${ms}`).toBeCloseTo(-piechefFloor(b), 2);
        }
      clean(f);
    }
  });

  it('runs filling down to the card edge, drips into a puddle, and leaves physically', () => {
    for (let i = 0; i < 10; i++) {
      const f = fixture(`🥷-${i}`),
        p = f.plan;
      const facing = sideFor(f);
      at(f, p.splat - 1);
      expect(f.trick.object.getObjectByName('piechef-splat')?.visible).toBe(false);
      at(f, p.exitEnd);
      expect(f.trick.object.getObjectByName('piechef-splat')?.visible).toBe(true);
      expect(f.trick.object.getObjectByName('piechef-puddle')?.visible).toBe(true);
      const exit = piechefExitPoint(p, card, view, facing);
      expect(f.actor.position.x).toBeCloseTo(exit.x, 3);
      expect(f.actor.scale.y).toBeCloseTo(f.actor.scale.x, 6);
      const actorBox = new THREE.Box3().setFromObject(f.model.body);
      expect(actorBox.max.x < 0 || actorBox.min.x > view.x).toBe(true);
      if (p.tinEnd === 'drop')
        expect(lowestWorldY(f.model.pie)).toBeCloseTo(-piechefFloor(card), 2);
      else {
        const rim = f.model.rims[facing > 0 ? 1 : 0],
          grip = f.model.grips[facing > 0 ? 1 : 0];
        if (!rim) throw new Error('Missing rim');
        expect(distance(screenOf(grip), screenOf(rim))).toBeLessThan(0.6);
      }
      at(f, PIECHEF_DURATION - 5);
      expect(f.trick.object.getObjectByName('piechef-splat')?.visible).toBe(false);
      clean(f);
    }
  });
});
