import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeReindeer, reindeerModel } from './reindeer-model';
import { ReindeerTrick } from './reindeer-trick';
import {
  REINDEER_DURATION,
  REINDEER_SCALE,
  reindeerCardPose,
  reindeerFloor,
  reindeerLandAt,
  reindeerLandingPoint,
  reindeerPlan,
  reindeerPushAt,
  reindeerStage,
  type ReindeerPlan,
} from './reindeer-choreography';
import { cardFit, cardPoint, lowestWorldY, screenOf, sideOf } from '../../kit';
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
  const actor = makeReindeer(id),
    trick = new ReindeerTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, plan: trick.plan, model: reindeerModel(actor) };
}
type Fixture = ReturnType<typeof fixture>;
const sideFor = (plan: ReindeerPlan, b = card, chosen?: number) =>
  sideOf(b.left + b.width / 2 - reindeerLandingPoint(plan, b, view, chosen).x);
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
const plans = (n: number) => Array.from({ length: n }, (_, i) => reindeerPlan(`reindeer-${i}`));
/** Ids covering every launch, gesture, exit and approach combination that the tests need. */
function idWhere(test: (p: ReindeerPlan) => boolean): string {
  for (let i = 0; i < 400; i++) if (test(reindeerPlan(`reindeer-${i}`))) return `reindeer-${i}`;
  throw new Error('No matching plan');
}

describe('Rudy the Rooftop Rookie', () => {
  it('samples one reproducible plan whose approach, springboard, skid, gesture and exit all vary', () => {
    expect(reindeerPlan('again')).toEqual(reindeerPlan('again'));
    const all = plans(40);
    for (const key of [
      'pace',
      'travel',
      'bend',
      'gather',
      'contactU',
      'bounceDepth',
      'loadDepth',
      'hop',
      'loft',
      'skid',
      'exitRise',
    ] as const)
      expect(new Set(all.map((p) => p[key])).size, key).toBe(40);
    for (const key of ['side', 'approach', 'launch', 'gesture', 'flicks', 'exit', 'buck'] as const)
      expect(new Set(all.map((p) => p[key])).size, key).toBe(2);
    expect(new Set(all.map((p) => p.bounces)).size).toBe(3);
    expect(new Set(all.map((p) => p.surges)).size).toBe(3);
    for (const p of all) {
      expect(p.travel).toBeLessThan(p.takeoff);
      expect(p.perch).toBeLessThan(reindeerLandAt(p, p.bounces));
      expect(reindeerLandAt(p, p.bounces)).toBeLessThan(p.spring);
      expect(p.spring + 900).toBeLessThan(p.halt + 400);
      expect(p.steady + 600).toBeLessThan(p.glance);
      expect(p.exitEnd + 450).toBeLessThan(REINDEER_DURATION);
    }
  });

  it('shares its plan through the model, flips sides near edges and keeps the side through reflow', () => {
    const all = Array.from(
      { length: 30 },
      (_, i) => new ReindeerTrick(makeReindeer(`reindeer-${i}`)).plan,
    );
    expect(new Set(all.map((p) => p.side)).size).toBe(2);
    expect(new Set(all.map((p) => p.pace)).size).toBe(30);
    for (const p of all.slice(0, 8)) {
      const facing = sideFor(p);
      expect(sideFor(p, { ...card, left: card.left + 140, width: 58, height: 84 }, facing)).toBe(
        facing,
      );
      expect(sideFor(p, { ...card, left: 6 })).toBe(-1);
      expect(sideFor(p, { ...card, left: view.x - card.width - 6 })).toBe(1);
    }
  });

  it('never dead-stops on the approach, bounding or building up speed', () => {
    for (const id of [
      idWhere((p) => p.approach === 'bound'),
      idWhere((p) => p.approach === 'cautious'),
      'reindeer-2',
      'reindeer-3',
    ]) {
      const f = fixture(id),
        p = f.plan;
      const steps: number[] = [];
      let previous: THREE.Vector3 | null = null;
      for (let ms = p.travel * 0.15; ms <= p.travel * 0.85; ms += 8) {
        at(f, ms);
        if (previous) steps.push(f.actor.position.distanceTo(previous));
        previous = f.actor.position.clone();
      }
      const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
      for (const step of steps) expect(step, id).toBeGreaterThanOrEqual(mean * 0.3);
      at(f, p.travel);
      const stand = reindeerLandingPoint(p, card, view, sideFor(p));
      expect(f.actor.position.x).toBeCloseTo(stand.x, 4);
      expect(-f.actor.position.y).toBeCloseTo(stand.y, 4);
      clean(f);
    }
  });

  it('leaves from the sender and moves continuously at full size through every stage', () => {
    for (const id of [
      'reindeer-0',
      'reindeer-1',
      'reindeer-2',
      idWhere((p) => p.launch === 'back' && p.exit === 'past'),
    ]) {
      const f = fixture(id);
      at(f, 0);
      const body = presence(f.actor);
      expect(Math.hypot(body.x - start.x, body.y + start.y), id).toBeLessThan(45);
      const scale = f.actor.scale.y;
      let previous = f.actor.position.clone(),
        turn = f.actor.quaternion.clone();
      for (let ms = 8; ms < REINDEER_DURATION; ms += 8) {
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

  it('seeks deterministically with finite transforms and returns a neutral card', () => {
    const f = fixture('reindeer-0'),
      p = f.plan;
    const probe = (p.perch + p.spring) / 2;
    at(f, probe);
    const pose = f.actor.matrixWorld.clone();
    const sole = f.model.soles[0].matrixWorld.clone();
    at(f, p.exitEnd);
    at(f, 300);
    at(f, probe);
    expect(f.actor.matrixWorld.equals(pose)).toBe(true);
    expect(f.model.soles[0].matrixWorld.equals(sole)).toBe(true);
    for (let ms = 0; ms <= REINDEER_DURATION; ms += 61) {
      at(f, ms);
      for (const root of [f.actor, f.trick.object])
        root.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    }
    for (const b of layouts) {
      const animation = f.trick.cardAnimation(sideFor(p, b), b);
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
    at(f, REINDEER_DURATION + 1);
    expect(f.trick.object.visible).toBe(false);
    expect(f.actor.visible).toBe(false);
    clean(f);
  });

  it('plants the real hoof soles on the live top edge while the card compresses about its bottom edge', () => {
    for (const id of ['reindeer-0', 'reindeer-1', idWhere((p) => p.bounces === 3)]) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(p, b);
        const s = reindeerStage(p, b, view, facing, REINDEER_SCALE * cardFit(b));
        const times = [p.perch, p.perch + 40, p.perch + 120];
        for (let k = 1; k <= p.bounces; k++)
          times.push(reindeerLandAt(p, k) + 1, reindeerLandAt(p, k) + 70);
        times.push(p.spring - 100, p.spring - 1);
        for (const ms of times) {
          at(f, ms, b, facing);
          const q = reindeerCardPose(p, ms, facing, b);
          f.model.soles.forEach((sole, i) => {
            const rest = [11.6, 10.4, -9.6, -11][i] ?? 0;
            const expected = cardPoint(
              q,
              { x: s.contact.x + facing * rest * REINDEER_SCALE * cardFit(b), y: b.top },
              b,
            );
            const got = screenOf(sole);
            expect(
              Math.hypot(got.x - expected.x, got.y - expected.y),
              `${id} hoof ${i} at ${ms}`,
            ).toBeLessThan(0.05);
          });
          // The bottom edge stays planted; only the top gives way.
          const bottom = cardPoint(q, { x: b.left + b.width / 2, y: b.top + b.height }, b);
          expect(bottom.x).toBeCloseTo(b.left + b.width / 2, 6);
          expect(bottom.y).toBeCloseTo(b.top + b.height, 6);
        }
        expect(reindeerCardPose(p, p.perch - 1, facing, b)).toEqual(NEUTRAL);
        expect(reindeerCardPose(p, p.perch + 60, facing, b).sy).toBeLessThan(0.97);
        expect(reindeerCardPose(p, p.spring - 1, facing, b).sy).toBeLessThan(1 - p.loadDepth * 0.9);
        expect(reindeerCardPose(p, p.spring + 900, facing, b)).toEqual(NEUTRAL);
        // Hooves leave the card between bounces.
        if (p.bounces > 0) {
          const hop = (reindeerPushAt(p, 0) + reindeerLandAt(p, 1)) / 2;
          at(f, hop, b, facing);
          const q = reindeerCardPose(p, hop, facing, b);
          const top = cardPoint(q, s.contact, b);
          for (const sole of f.model.soles) expect(screenOf(sole).y).toBeLessThan(top.y - 1);
        }
      }
      clean(f);
    }
  });

  it('keeps every leg segment at its fixed length and soles on the floor when standing, skidding and recovering', () => {
    for (const id of [
      idWhere((p) => p.launch === 'over' && p.gesture === 'hoof'),
      idWhere((p) => p.launch === 'back' && p.gesture === 'nose'),
    ]) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(p, b);
        const floor = reindeerFloor(b);
        const near = facing > 0 ? 0 : 1;
        for (const ms of [
          p.travel + 20,
          p.takeoff - 10,
          p.land + 1,
          (p.land + p.halt) / 2,
          p.halt - 5,
          p.steady,
          p.steady + 120,
          p.glance,
          p.departure,
        ]) {
          at(f, ms, b, facing);
          f.model.soles.forEach((sole, i) => {
            const lifted = ms > p.steady && ms < p.departure && i === near;
            if (lifted) return;
            // A long gather scrapes the near forehoof once; skip it while it is off the floor.
            if (ms < p.takeoff && i === near && p.gather > 260) return;
            expect(screenOf(sole).y, `${id} hoof ${i} at ${ms}`).toBeCloseTo(floor, 3);
          });
          let lowest = Infinity;
          for (const leg of f.model.legs) lowest = Math.min(lowest, lowestWorldY(leg.end));
          expect(lowest, `${id} lowest at ${ms}`).toBeCloseTo(-floor, 2);
        }
        at(f, (p.steady + p.glance) / 2, b, facing);
        const nearSole = screenOf(f.model.soles[near]);
        expect(nearSole.y).toBeLessThan(floor - 6 * cardFit(b));
        if (p.gesture === 'nose') {
          const nose = screenOf(f.model.nose);
          expect(Math.hypot(nearSole.x - nose.x, nearSole.y - nose.y)).toBeLessThan(
            2 * REINDEER_SCALE,
          );
        }
      }
      for (let ms = 0; ms < REINDEER_DURATION; ms += 53) {
        at(f, ms);
        for (const leg of f.model.legs) {
          expect(leg.joint.position.length()).toBeCloseTo(leg.lengths[0], 4);
          expect(leg.end.position.distanceTo(leg.joint.position)).toBeCloseTo(leg.lengths[1], 4);
        }
      }
      clean(f);
    }
  });

  it('skids where the flight lands and leaves skid marks that clear only after he has gone', () => {
    for (const id of [idWhere((p) => p.launch === 'over'), idWhere((p) => p.launch === 'back')]) {
      const f = fixture(id),
        p = f.plan;
      const facing = sideFor(p);
      const s = reindeerStage(p, card, view, facing, REINDEER_SCALE * cardFit(card));
      expect(s.over).toBe(p.launch === 'over');
      at(f, p.land);
      expect(f.actor.position.x).toBeCloseTo(s.land.x, 4);
      at(f, p.halt);
      expect(f.actor.position.x).toBeCloseTo(s.halt.x, 4);
      expect(Math.sign(s.halt.x - s.land.x)).toBe(s.dir);
      if (s.over) expect(Math.sign(s.land.x - (card.left + card.width / 2))).toBe(facing);
      else expect(Math.sign(s.land.x - s.stand.x)).toBe(-facing);
      const mark = f.trick.object.getObjectByName('reindeer-skid-mark-0');
      at(f, p.land - 1);
      expect(mark?.visible).toBe(false);
      at(f, p.departure);
      expect(mark?.visible).toBe(true);
      at(f, p.exitEnd);
      expect(mark?.visible).toBe(true);
      at(f, p.exitEnd + 420);
      expect(mark?.visible).toBe(false);
      clean(f);
    }
  });

  it('gallops fully out of view at full size by either exit route', () => {
    for (const id of [
      idWhere((p) => p.exit === 'away'),
      idWhere((p) => p.exit === 'past'),
      idWhere((p) => p.launch === 'back' && p.exit === 'away'),
    ]) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        at(f, p.departure, b);
        const scale = f.actor.scale.x;
        at(f, p.exitEnd, b);
        expect(f.actor.position.x < -60 || f.actor.position.x > view.x + 60, `${id} exit`).toBe(
          true,
        );
        expect(f.actor.scale.x).toBe(scale);
      }
      clean(f);
    }
  });

  it('disposes every owned geometry and material exactly once', () => {
    const f = fixture('reindeer-0');
    at(f, f.plan.halt + 100);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    for (const root of [f.actor, f.trick.object])
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          resources.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) resources.add(m);
        }
      });
    let meshes = 0;
    for (const root of [f.actor, f.trick.object])
      root.traverse((o) => (meshes += o instanceof THREE.Mesh ? 1 : 0));
    expect(resources.size).toBe(meshes * 2);
    const spies = Array.from(resources, (r) => vi.spyOn(r, 'dispose'));
    clean(f);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
