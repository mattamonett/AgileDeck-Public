import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { makeRaceCar, CarTrick, racePoint } from './racing-car';
import {
  carPlan,
  carLandingPoint,
  carApproach,
  carDistance,
  carCardPoint,
  carCardPose,
  carDriverPoint,
  carClimb,
  CAR_SCALE,
  CAR_DURATION,
} from './car-choreography';
import { LandingEffect } from '../../landing/landing-effects';
import { requireSceneObject } from '../../engine/scene-object';
import { disposeObject } from '../../engine/throw-models';
import { carCharacter } from './car-character';
const bounds = { left: 340, top: 220, width: 84, height: 122 };
const view = { x: 900, y: 700 };
const board = { left: 0, top: 0, width: view.x, height: view.y };
function world(part: THREE.Object3D) {
  return part.getWorldPosition(new THREE.Vector3());
}
function near(a: THREE.Vector3, b: THREE.Vector3) {
  expect(a.distanceTo(b)).toBeLessThan(0.00001);
}
function bones(car: THREE.Group) {
  car.updateMatrixWorld(true);
  const driver = requireSceneObject(car, 'driver');
  for (const side of ['left', 'right'])
    for (const arm of [true, false]) {
      const root = requireSceneObject(driver, side + (arm ? '-arm' : '-leg'));
      const first = requireSceneObject(root, arm ? 'upper-arm' : 'thigh');
      const second = requireSceneObject(root, arm ? 'forearm' : 'shin');
      const a = first.localToWorld(new THREE.Vector3(0, -0.5, 0));
      const b = first.localToWorld(new THREE.Vector3(0, 0.5, 0));
      const c = second.localToWorld(new THREE.Vector3(0, -0.5, 0));
      const d = second.localToWorld(new THREE.Vector3(0, 0.5, 0));
      near(a, world(root));
      near(b, world(requireSceneObject(root, arm ? 'elbow' : 'knee')));
      near(b, c);
      near(d, world(requireSceneObject(root, arm ? 'glove' : 'boot')));
      expect(a.distanceTo(b)).toBeCloseTo((arm ? 8 : 7) * CAR_SCALE, 5);
      expect(c.distanceTo(d)).toBeCloseTo((arm ? 8 : 7) * CAR_SCALE, 5);
    }
}
describe('two-stage racing catastrophe', () => {
  it('retains compatible variations in racing, crash, recovery and departure, with room at either edge', () => {
    const plans = Array.from({ length: 40 }, (_, i) => carPlan('car-' + i));
    expect(plans[0]).toEqual(carPlan('car-0'));
    expect(new Set(plans.map((p) => p.turns))).toEqual(new Set([1, 2]));
    expect(new Set(plans.map((p) => p.helmet))).toEqual(new Set([false, true]));
    expect(new Set(plans.map((p) => p.coughs))).toEqual(new Set([2, 3]));
    for (const field of [
      'pace',
      'hit',
      'force',
      'arc',
      'brake',
      'wheelSpeed',
      'slide',
      'slideDuration',
      'departure',
      'exit',
    ] as const)
      expect(new Set(plans.map((p) => p[field])).size).toBe(40);
    expect(
      new Set(
        plans.map((p) =>
          Math.sign(bounds.left - carLandingPoint(p, bounds, view, { x: 80, y: 300 }).x),
        ),
      ),
    ).toEqual(new Set([-1, 1]));
    for (const p of plans) {
      expect(p.hit).toBeGreaterThan(480);
      expect(carClimb(p) + 500).toBeLessThan(p.departure - 650);
      expect(p.departure + 1600 * p.exit).toBeLessThan(CAR_DURATION);
      const left = { ...bounds, left: 4 };
      const right = { ...bounds, left: view.x - bounds.width - 4 };
      expect(carLandingPoint(p, left, view, { x: 0, y: 300 }).x).toBeGreaterThan(
        left.left + left.width,
      );
      expect(carLandingPoint(p, right, view, { x: view.x, y: 300 }).x).toBeLessThan(right.left);
    }
  });
  it('follows repeatable racing lines, brakes without teleporting, turns continuously and rolls tyres by actual path distance', () => {
    const start = { x: 130, y: bounds.top + bounds.height / 2 };
    for (let seed = 0; seed < 12; seed++)
      for (const facing of [-1, 1]) {
        const car = makeRaceCar();
        const trick = new CarTrick('car-' + seed);
        const p = trick.plan;
        const end = carLandingPoint(p, bounds, view, start, facing);
        expect(racePoint(start, end, 0.4, board, facing, p.seed)).toEqual(
          racePoint(start, end, 0.4, board, facing, p.seed),
        );
        expect(carApproach(p, start, end, board, facing, 0, bounds)).toEqual(start);
        expect(carApproach(p, start, end, board, facing, 1, bounds)).toEqual(end);
        let previous = start;
        let rotation: THREE.Quaternion | undefined;
        let distance = 0;
        for (let i = 0; i <= 300; i++) {
          const t = i / 300;
          const point = carApproach(p, start, end, board, facing, t, bounds);
          expect(Math.hypot(point.x - previous.x, point.y - previous.y)).toBeLessThan(12);
          previous = point;
          expect(point.x).toBeGreaterThanOrEqual(40);
          expect(point.x).toBeLessThanOrEqual(view.x - 40);
          expect(point.y).toBeGreaterThanOrEqual(40);
          expect(point.y).toBeLessThanOrEqual(view.y - 40);
          trick.travel(t, car, start, end, board, facing, bounds);
          if (facing < 0 && t < 0.998) {
            const box = new THREE.Box3().setFromObject(car);
            const xOverlap =
              Math.min(box.max.x, bounds.left + bounds.width) - Math.max(box.min.x, bounds.left);
            const yOverlap =
              Math.min(-box.min.y, bounds.top + bounds.height) - Math.max(-box.max.y, bounds.top);
            expect(
              xOverlap > 2 && yOverlap > 2,
              'premature far-side collision ' + seed + '/' + t,
            ).toBe(false);
          }
          const current = carDistance(p, start, end, board, facing, t, bounds);
          expect(current).toBeGreaterThanOrEqual(distance);
          distance = current;
          expect(requireSceneObject(car, 'rear-wheel-near').rotation.z).toBeCloseTo(
            -distance / (11 * CAR_SCALE),
            6,
          );
          if (rotation)
            expect(rotation.angleTo(car.quaternion), seed + '/' + facing + '/' + t).toBeLessThan(
              0.35,
            );
          rotation = car.quaternion.clone();
          expect(car.scale.toArray()).toEqual([CAR_SCALE, CAR_SCALE, CAR_SCALE]);
        }
        expect(car.rotation.y).toBeCloseTo(facing > 0 ? 0 : Math.PI);
        expect(car.rotation.z).toBeCloseTo(0);
        disposeObject(car);
        disposeObject(trick.object);
      }
  });
  it('contacts with the actual bumper and helmet at two distinct synchronized hits on either side and card size', () => {
    for (let seed = 0; seed < 12; seed++) {
      const car = makeRaceCar();
      const trick = new CarTrick('car-' + seed);
      const p = trick.plan;
      for (const size of [
        { width: 84, height: 122 },
        { width: 58, height: 84 },
      ])
        for (const facing of [-1, 1]) {
          const b = { ...bounds, ...size };
          const end = carLandingPoint(p, b, view, { x: 80, y: 300 }, facing);
          trick.update(0, car, b, end, view);
          const bumper = world(requireSceneObject(car, 'bumper-contact'));
          expect(bumper.x).toBeCloseTo(facing > 0 ? b.left : b.left + b.width, 5);
          expect(-bumper.y).toBeCloseTo(end.y, 5);
          expect(carCardPose(90, p, facing).angle * facing).toBeGreaterThan(1);
          trick.update(p.hit * p.pace, car, b, end, view);
          const helmet = world(requireSceneObject(car, 'helmet-contact'));
          const hit = carDriverPoint(p, b, facing);
          expect(helmet.x).toBeCloseTo(hit.x, 5);
          expect(-helmet.y).toBeCloseTo(hit.y, 5);
          expect(carCardPose(p.hit - 1, p, facing).angle).toBe(0);
          expect(carCardPose(p.hit + 90, p, facing).angle * facing).toBeGreaterThan(1);
          for (const ms of [
            p.hit + 100,
            p.slide + p.slideDuration / 2,
            p.slide + p.slideDuration,
          ]) {
            trick.update(ms * p.pace, car, b, end, view);
            const point = world(requireSceneObject(car, 'helmet-contact'));
            const slide = Math.max(0, Math.min(1, (ms - p.slide) / p.slideDuration));
            const eased = slide * slide * (3 - 2 * slide);
            const target = carCardPoint(
              ms,
              { x: hit.x, y: hit.y + (b.top + b.height - 28 - hit.y) * eased },
              b,
              p,
              facing,
            );
            expect(point.x).toBeCloseTo(target.x, 5);
            expect(-point.y).toBeCloseTo(target.y, 5);
          }
        }
      disposeObject(car);
      disposeObject(trick.object);
    }
  });
  it('keeps fixed joined limbs, gloves on the real steering wheel and a continuous breakaway tyre release', () => {
    for (let seed = 0; seed < 12; seed++)
      for (const facing of [-1, 1]) {
        const car = makeRaceCar();
        const trick = new CarTrick('car-' + seed);
        const p = trick.plan;
        const end = carLandingPoint(p, bounds, view, { x: 80, y: 300 }, facing);
        const driver = requireSceneObject(car, 'driver');
        for (let ms = 0; ms <= CAR_DURATION; ms += 35) {
          trick.update(ms * p.pace, car, bounds, end, view);
          bones(car);
          const right = requireSceneObject(driver, 'right-arm');
          near(
            world(requireSceneObject(right, 'palm-contact')),
            world(requireSceneObject(driver, 'steering-right-grip')),
          );
          let finite = true;
          car.traverse((part) => {
            finite &&= part.matrixWorld.elements.every(Number.isFinite);
          });
          expect(finite).toBe(true);
        }
        trick.update((carClimb(p) + 1025) * p.pace, car, bounds, end, view);
        const leftPalm = world(
          requireSceneObject(requireSceneObject(driver, 'left-arm'), 'palm-contact'),
        );
        near(
          leftPalm,
          driver.localToWorld(
            new THREE.Vector3(
              p.helmet ? -1 : -13,
              p.helmet ? 17 : 12,
              facing * (p.helmet ? 8.4 : 7),
            ),
          ),
        );
        const wheel = requireSceneObject(car, facing > 0 ? 'front-wheel-near' : 'front-wheel-far');
        trick.update(179.999 * p.pace, car, bounds, end, view);
        const before = world(wheel);
        trick.update(180 * p.pace, car, bounds, end, view);
        expect(world(wheel).distanceTo(before)).toBeLessThan(0.01);
        trick.update(900 * p.pace, car, bounds, end, view);
        expect(world(wheel).x * facing).toBeLessThan(before.x * facing - 15);
        disposeObject(car);
        disposeObject(trick.object);
      }
  }, 20000);
  it('retains its contact edge and current card creases after resize without replacing reveal transforms', () => {
    const car = makeRaceCar();
    const effect = new LandingEffect('🏎️', car, 'car-1');
    const p = effect.planOf(carCharacter);
    if (!p) throw new Error('Missing car plan');
    const source = { x: 0, y: 400 };
    const mobile = { left: 4, top: 380, width: 58, height: 84 };
    const chosen = carLandingPoint(p, mobile, { x: 390, y: 844 }, source);
    const facing = chosen.x < mobile.left ? 1 : -1;
    for (const b of [mobile, bounds]) {
      const end = carLandingPoint(p, b, view, source, facing);
      expect(end.x < b.left ? 1 : -1).toBe(facing);
      effect.update(p.hit * p.pace, b, end, view);
      const helmet = world(requireSceneObject(car, 'helmet-contact'));
      const hit = carDriverPoint(p, b, facing);
      expect(helmet.x).toBeCloseTo(hit.x, 5);
      expect(-helmet.y).toBeCloseTo(hit.y, 5);
      effect.update((p.hit + 110) * p.pace, b, end, view);
      effect.object.updateMatrixWorld(true);
      const mark = world(requireSceneObject(effect.object, 'helmet-card-crease'));
      const point = carCardPoint(p.hit + 110, hit, b, p, facing);
      expect(mark.x).toBeCloseTo(point.x, 5);
      expect(-mark.y).toBeCloseTo(point.y, 5);
    }
    expect(effect.planOf(carCharacter)).toBe(p);
    expect(effect.cardAnimation(1)?.frames.every((frame) => frame['transform'] === undefined)).toBe(
      true,
    );
    disposeObject(car);
    disposeObject(effect.object);
  });
  it('releases the glass shards from the actual folded windshield at the shatter beat', () => {
    for (const facing of [-1, 1]) {
      const car = makeRaceCar();
      const effect = new LandingEffect('🏎️', car, 'car-0');
      const p = effect.planOf(carCharacter);
      if (!p) throw new Error('Missing car plan');
      const end = carLandingPoint(p, bounds, view, { x: 80, y: 300 }, facing);
      effect.update(110 * p.pace, bounds, end, view);
      effect.object.updateMatrixWorld(true);
      const windshield = requireSceneObject(car, 'windshield');
      expect(windshield.visible).toBe(false);
      const shards: THREE.Object3D[] = [];
      effect.object.traverse((part) => {
        if (part.name === 'car-glass-shard') shards.push(part);
      });
      expect(shards).toHaveLength(8);
      shards.forEach((shard, i) => {
        const point = windshield.localToWorld(
          new THREE.Vector3(i < 4 ? -1 : 1, ((i % 4) - 1.5) * 4, 0),
        );
        expect(world(shard).x).toBeCloseTo(point.x, 5);
        expect(world(shard).y).toBeCloseTo(point.y, 5);
        expect(shard.visible).toBe(true);
      });
      disposeObject(car);
      disposeObject(effect.object);
    }
  });
  it('reverses the full-size wreck and its loose wheel out of the viewport before hiding', () => {
    for (let seed = 0; seed < 12; seed++)
      for (const facing of [-1, 1]) {
        const car = makeRaceCar();
        const trick = new CarTrick('car-' + seed);
        const p = trick.plan;
        const end = carLandingPoint(p, bounds, view, { x: 80, y: 300 }, facing);
        for (let i = 0; i <= 200; i++) {
          const ms = p.departure + (1600 * p.exit * i) / 200;
          trick.update(ms * p.pace, car, bounds, end, view);
          expect(car.scale.toArray()).toEqual([CAR_SCALE, CAR_SCALE, CAR_SCALE]);
          expect(car.rotation.y).toBe(facing > 0 ? 0 : Math.PI);
          if (i === 199) expect(car.visible).toBe(true);
        }
        expect(car.visible).toBe(false);
        expect(facing > 0 ? car.position.x : view.x - car.position.x).toBeLessThan(-115);
        const wheel = world(
          requireSceneObject(car, facing > 0 ? 'front-wheel-near' : 'front-wheel-far'),
        );
        expect(facing > 0 ? wheel.x : view.x - wheel.x).toBeLessThan(-115);
        disposeObject(car);
        disposeObject(trick.object);
      }
  });
  it('reuses bounded geometry and disposes every native resource while restoring the card', () => {
    const car = makeRaceCar();
    const effect = new LandingEffect('🏎️', car, 'car-0');
    const p = effect.planOf(carCharacter);
    if (!p) throw new Error('Missing car plan');
    const end = carLandingPoint(p, bounds, view, { x: 80, y: 300 });
    const geometry = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const collect = (part: THREE.Object3D) => {
      if (part instanceof THREE.Mesh) {
        geometry.add(part.geometry);
        materials.add(part.material);
      }
    };
    car.traverse(collect);
    effect.object.traverse(collect);
    const count = geometry.size;
    for (let ms = 0; ms <= CAR_DURATION; ms += 37) effect.update(ms * p.pace, bounds, end, view);
    car.traverse(collect);
    effect.object.traverse(collect);
    expect(geometry.size).toBe(count);
    effect.update(effect.duration, bounds, end, view);
    expect(car.visible).toBe(false);
    expect(effect.object.visible).toBe(false);
    expect(effect.cardAnimation(1)?.frames.at(-1)).toMatchObject({
      translate: '0px 0px',
      rotate: '0deg',
      scale: '1 1',
    });
    let disposed = 0;
    for (const resource of [...geometry, ...materials])
      resource.addEventListener('dispose', () => disposed++);
    disposeObject(car);
    disposeObject(effect.object);
    expect(disposed).toBe(geometry.size + materials.size);
  });
});
