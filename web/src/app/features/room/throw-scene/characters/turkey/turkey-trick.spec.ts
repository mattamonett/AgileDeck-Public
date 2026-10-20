import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeTurkey, turkeyModel } from './turkey-model';
import { TurkeyTrick } from './turkey-trick';
import {
  PECK_HOLD,
  TURKEY_DURATION,
  TURKEY_LOOSE,
  turkeyCardPose,
  turkeyExitPoint,
  turkeyFloor,
  turkeyLandingPoint,
  turkeyPlan,
} from './turkey-choreography';
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
const NEUTRAL = { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };

function fixture(id: string) {
  const actor = makeTurkey(id),
    trick = new TurkeyTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, plan: trick.plan, model: turkeyModel(actor) };
}
type Fixture = ReturnType<typeof fixture>;
const sideFor = (f: Fixture, b = card, chosen?: number) =>
  sideOf(b.left + b.width / 2 - turkeyLandingPoint(f.plan, b, view, chosen).x);
function at(f: Fixture, ms: number, b = card, facing = sideFor(f, b)) {
  f.trick.update(ms * f.plan.pace, f.actor, start, b, view, facing);
  f.actor.updateMatrixWorld(true);
  f.trick.object.updateMatrixWorld(true);
}
function clean(f: Fixture) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}
/** Centre of the visible geometry of the actor. */
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
  return box;
}

describe('wild turkey performance', () => {
  it('samples one reproducible plan whose strut, display, pecks, startle and escape all vary', () => {
    expect(turkeyPlan('again')).toEqual(turkeyPlan('again'));
    const plans = Array.from({ length: 40 }, (_, i) => turkeyPlan(`turkey-${i}`));
    for (const key of [
      'pace',
      'travel',
      'bend',
      'weave',
      'stride',
      'surge',
      'cadence',
      'beatAt',
      'swivel',
      'fanHold',
      'shock',
      'jump',
      'exitRise',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size, key).toBe(40);
    for (const key of ['side', 'earlyFan', 'escape', 'shimmies'] as const)
      expect(new Set(plans.map((p) => p[key])).size, key).toBe(2);
    for (const key of ['beat', 'trigger'] as const)
      expect(new Set(plans.map((p) => p[key])).size, key).toBe(3);
    expect(new Set(plans.map((p) => p.pecks.length))).toEqual(new Set([2, 3, 4]));
    expect(new Set(plans.map((p) => p.loose.length))).toEqual(new Set([3, 4, 5, 6]));
    expect(new Set(plans.map((p) => p.pecks.map((k) => k.v.toFixed(3)).join())).size).toBe(40);
    for (const p of plans) {
      expect(p.exitEnd + 400).toBeLessThan(TURKEY_DURATION);
      for (const k of p.loose) expect(k).toBeLessThan(TURKEY_LOOSE);
      for (const peck of p.pecks) {
        // Pecks stay off the value in the middle of the card.
        expect(peck.u).toBeLessThan(0.25);
      }
    }
  });

  it('struts continuously from the sender, without dead stops, to its stand point by plan.travel', () => {
    for (const id of ['turkey-0', 'turkey-1', 'turkey-2', 'turkey-3', 'turkey-4']) {
      const f = fixture(id),
        p = f.plan;
      const points: THREE.Vector3[] = [];
      for (let ms = 0.15 * p.travel; ms <= 0.85 * p.travel; ms += 8) {
        at(f, ms);
        points.push(f.actor.position.clone());
      }
      const steps = points.slice(1).map((q, i) => q.distanceTo(points[i] ?? q));
      const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
      for (const s of steps) expect(s, id).toBeGreaterThan(0.3 * mean);
      at(f, p.travel);
      const stand = turkeyLandingPoint(p, card, view, sideFor(f));
      expect(f.actor.position.x).toBeCloseTo(stand.x, 4);
      expect(-f.actor.position.y).toBeCloseTo(stand.y, 4);
      clean(f);
    }
  });

  it('leaves from the real sender and moves continuously at full size through every stage', () => {
    for (const id of ['turkey-0', 'turkey-1', 'turkey-2']) {
      const f = fixture(id);
      at(f, 0);
      const body = presence(f.actor).getCenter(new THREE.Vector3());
      expect(
        Math.hypot(body.x - start.x, body.y + start.y),
        `${id} leaves from the sender`,
      ).toBeLessThan(45);
      const scale = f.actor.scale.y;
      let previous = f.actor.position.clone(),
        turn = f.actor.quaternion.clone();
      for (let ms = 8; ms < TURKEY_DURATION; ms += 8) {
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
    for (let i = 0; i < 8; i++) {
      const f = fixture(`turkey-${i}`);
      const facing = sideFor(f);
      const moved = { ...card, left: card.left + 140, width: 58, height: 84 };
      expect(sideFor(f, moved, facing)).toBe(facing);
      expect(sideFor(f, { ...card, left: 6 })).toBe(-1);
      expect(sideFor(f, { ...card, left: view.x - card.width - 6 })).toBe(1);
      clean(f);
    }
  });

  it('seeks deterministically with finite transforms and ends with a neutral card', () => {
    const f = fixture('turkey-0');
    const probe = TURKEY_DURATION * 0.55;
    at(f, probe);
    const pose = f.actor.matrixWorld.clone();
    const head = f.model.beakTip.matrixWorld.clone();
    at(f, TURKEY_DURATION * 0.9);
    at(f, probe);
    expect(f.actor.matrixWorld.equals(pose)).toBe(true);
    expect(f.model.beakTip.matrixWorld.equals(head)).toBe(true);
    for (let ms = 0; ms <= TURKEY_DURATION; ms += 61) {
      at(f, ms);
      for (const root of [f.actor, f.trick.object])
        root.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    }
    for (let i = 0; i < 12; i++) {
      const g = fixture(`turkey-${i}`);
      const animation = g.trick.cardAnimation(sideFor(g));
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
    at(f, TURKEY_DURATION + 1);
    expect(f.trick.object.visible).toBe(false);
    clean(f);
  });

  it('puts its real beak tip on the live card at every peck, and the card is knocked from that side', () => {
    for (const id of Array.from({ length: 12 }, (_, i) => `turkey-${i}`)) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(f, b);
        for (const peck of p.pecks)
          for (const ms of [peck.at, peck.at + PECK_HOLD / 2, peck.at + PECK_HOLD]) {
            at(f, ms, b, facing);
            const tip = screenOf(f.model.beakTip);
            const spot = onCard(
              turkeyCardPose(p, ms, facing),
              facing > 0 ? peck.u : 1 - peck.u,
              peck.v,
              b,
            );
            expect(Math.hypot(tip.x - spot.x, tip.y - spot.y), `${id} ${ms}`).toBeLessThan(0.05);
          }
        const first = p.pecks[0];
        if (!first) throw new Error('No pecks');
        expect(turkeyCardPose(p, first.at - 1, facing)).toEqual(NEUTRAL);
        expect(turkeyCardPose(p, p.recover, facing)).toEqual(NEUTRAL);
        expect(Math.sign(turkeyCardPose(p, first.at + 40, facing).x)).toBe(facing);
        at(f, first.at - 1, b, facing);
        expect(f.trick.object.getObjectByName('turkey-peck-0')?.visible).toBe(false);
        at(f, first.at + 200, b, facing);
        expect(f.trick.object.getObjectByName('turkey-peck-0')?.visible).toBe(true);
      }
      clean(f);
    }
  });

  it('keeps jointed legs and neck at fixed lengths with toes planted on the floor while standing', () => {
    for (const id of ['turkey-1', 'turkey-2']) {
      const f = fixture(id),
        p = f.plan;
      for (let ms = 0; ms < p.exitEnd; ms += 97) {
        at(f, ms);
        for (const limb of [...f.model.legs, f.model.neck]) {
          expect(limb.joint.position.length()).toBeCloseTo(limb.lengths[0], 4);
          expect(limb.end.position.distanceTo(limb.joint.position)).toBeCloseTo(limb.lengths[1], 4);
        }
      }
      for (const b of layouts)
        for (const ms of [
          p.displayStart + 300,
          p.displayEnd,
          ...p.pecks.map((k) => k.at),
          p.triggerAt + 100,
        ]) {
          at(f, ms, b);
          for (const leg of f.model.legs)
            expect(lowestWorldY(leg.end), `${id} ${ms}`).toBeCloseTo(-turkeyFloor(b), 3);
        }
      clean(f);
    }
  });

  it('sheds real feathers from where they grew, which drift down and rest on the floor', () => {
    for (let i = 0; i < 6; i++) {
      const f = fixture(`turkey-${i}`),
        p = f.plan;
      p.loose.forEach((j, k) => {
        const born = p.births[k] ?? 0,
          source = f.model.loose[j];
        if (!source) throw new Error('Missing loose feather');
        at(f, born - 0.01);
        expect(source.visible).toBe(true);
        const attached = source.getWorldPosition(new THREE.Vector3());
        at(f, born);
        const shed = f.trick.object.getObjectByName(`turkey-shed-${k}`);
        if (!shed) throw new Error('Missing shed feather');
        expect(source.visible).toBe(false);
        expect(shed.visible).toBe(true);
        expect(shed.getWorldPosition(new THREE.Vector3()).distanceTo(attached)).toBeLessThan(0.05);
      });
      const late = TURKEY_DURATION - 560;
      at(f, late);
      const rest = p.loose.map((_, k) =>
        f.trick.object.getObjectByName(`turkey-shed-${k}`)?.position.clone(),
      );
      at(f, late - 60);
      p.loose.forEach((_, k) => {
        const shed = f.trick.object.getObjectByName(`turkey-shed-${k}`);
        if (!(shed instanceof THREE.Mesh)) throw new Error('Missing shed feather');
        expect(
          shed.position.distanceTo(rest[k] ?? new THREE.Vector3()),
          `feather ${k} at rest`,
        ).toBeLessThan(1e-6);
        if ((p.births[k] ?? 0) < p.departure || p.escape === 'flight')
          expect(lowestWorldY(shed)).toBeCloseTo(-turkeyFloor(card), 3);
      });
      clean(f);
    }
  });

  it('leaves the viewport at full size by running or flapping away', () => {
    for (let i = 0; i < 8; i++) {
      const f = fixture(`turkey-${i}`),
        p = f.plan;
      const scale = (at(f, 0), f.actor.scale.y);
      at(f, p.exitEnd);
      expect(f.actor.scale.y).toBe(scale);
      const exit = turkeyExitPoint(p, card, view, sideFor(f));
      expect(f.actor.position.x).toBeCloseTo(exit.x, 3);
      const box = presence(f.actor);
      expect(box.max.x < 0 || box.min.x > view.x, `turkey-${i} off screen`).toBe(true);
      clean(f);
    }
  });

  it('disposes every owned geometry and material exactly once', () => {
    const f = fixture('turkey-0');
    at(f, f.plan.startle + 600);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    for (const root of [f.actor, f.trick.object])
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          resources.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) resources.add(m);
        }
      });
    let meshes = 0;
    f.actor.traverse((o) => (meshes += o instanceof THREE.Mesh ? 1 : 0));
    expect(meshes).toBeLessThan(170);
    const spies = Array.from(resources, (r) => vi.spyOn(r, 'dispose'));
    clean(f);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
