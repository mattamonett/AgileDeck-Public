import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeUnicorn, RainbowRide, unicornCurveFoot } from './unicorn-flight';
import { nativeUnicornPlan } from './unicorn-model';
import {
  UNICORN_DURATION,
  UNICORN_SCALE,
  unicornPlan,
  unicornArrival,
  unicornProgress,
  unicornRideParameter,
  unicornBridgePoint,
  unicornLandingPoint,
  unicornCardPose,
  unicornCardPoint,
} from './unicorn-choreography';
import { LandingEffect } from '../../landing/landing-effects';
import { disposeObject } from '../../engine/throw-models';
import { requireSceneObject } from '../../engine/scene-object';
import { approachPace } from '../../testing/approach-pace.testing';
import { unicornCharacter } from './unicorn-character';

const b = { left: 600, top: 420, width: 84, height: 122 },
  start = { x: 260, y: 480 },
  view = { x: 1200, y: 850 };
function fixture(id: string) {
  const actor = makeUnicorn(id),
    ride = new RainbowRide(actor),
    scene = new THREE.Scene();
  scene.add(actor, ride.object);
  return { actor, ride, scene };
}
function update(
  f: ReturnType<typeof fixture>,
  ms: number,
  bounds = b,
  source = start,
  viewport = view,
) {
  f.ride.update(
    ms * f.ride.plan.pace,
    f.actor,
    source,
    unicornLandingPoint(bounds),
    bounds,
    viewport,
  );
  f.scene.updateMatrixWorld(true);
}
function clean(f: ReturnType<typeof fixture>) {
  disposeObject(f.actor);
  disposeObject(f.ride.object);
}
function mesh(root: THREE.Object3D, name: string) {
  const o = requireSceneObject(root, name);
  if (!(o instanceof THREE.Mesh)) throw Error('Missing mesh');
  return o;
}
describe('unicorn rainbow gift', () => {
  it('samples a shared model-owned plan and varies approach, gift, flourish and departure', () => {
    const actor = makeUnicorn('shared'),
      effect = new LandingEffect('🦄', actor, 'shared');
    expect(effect.planOf(unicornCharacter)).toBe(nativeUnicornPlan(actor));
    const plans = Array.from({ length: 40 }, (_, i) => unicornPlan('unicorn-' + i));
    expect(unicornPlan('repeat')).toEqual(unicornPlan('repeat'));
    for (const key of [
      'pace',
      'form',
      'ride',
      'rise',
      'bend',
      'pause',
      'step',
      'magic',
      'departure',
      'exit',
      'force',
      'phase',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(40);
    for (const key of ['side', 'pulses', 'wink'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    for (const p of plans) expect(p.departure + p.exit + 650).toBeLessThan(UNICORN_DURATION);
    disposeObject(actor);
    disposeObject(effect.object);
  });
  it('trots slowly through its admiring beat on the arch without ever stopping dead', () => {
    const layouts = [
      { bounds: b, source: start, viewport: view },
      { bounds: b, source: { x: 1000, y: 200 }, viewport: view },
      {
        bounds: { left: 160, top: 560, width: 58, height: 84 },
        source: { x: 189, y: 240 },
        viewport: { x: 390, y: 844 },
      },
      {
        bounds: { left: 160, top: 200, width: 58, height: 84 },
        source: { x: 189, y: 640 },
        viewport: { x: 390, y: 844 },
      },
    ];
    for (let seed = 0; seed < 20; seed++)
      for (const { bounds, source, viewport } of layouts) {
        const p = unicornPlan('unicorn-' + seed),
          end = unicornLandingPoint(bounds);
        const pace = approachPace((t) =>
          unicornBridgePoint(
            p,
            source,
            end,
            viewport,
            unicornRideParameter(p, source, end, viewport, p.form + t * p.ride),
          ),
        );
        expect(pace.slowest).toBeGreaterThan(0.3);
        expect(pace.pace(0.6 + p.pause / 2)).toBeLessThan(1);
      }
  });
  it('forms before riding, keeps planted waiting hooves still and rides the same arch', () => {
    for (let seed = 0; seed < 6; seed++) {
      const f = fixture('unicorn-' + seed),
        p = f.ride.plan,
        end = unicornLandingPoint(b);
      expect(unicornBridgePoint(p, start, end, view, 0)).toEqual(start);
      expect(unicornBridgePoint(p, start, end, view, 1)).toEqual(end);
      update(f, p.form * 0.2);
      const feet = Array.from({ length: 4 }, (_, i) =>
        requireSceneObject(requireSceneObject(f.actor, 'leg-' + i), 'sole').getWorldPosition(
          new THREE.Vector3(),
        ),
      );
      update(f, p.form * 0.7);
      expect(f.actor.position.x).toBe(start.x);
      for (let i = 0; i < 4; i++) {
        const previous = feet[i];
        if (!previous) throw Error('Missing hoof');
        expect(
          requireSceneObject(requireSceneObject(f.actor, 'leg-' + i), 'sole')
            .getWorldPosition(new THREE.Vector3())
            .distanceTo(previous),
        ).toBeLessThan(0.00001);
      }
      const beat = p.form + p.ride * (0.6 + p.pause * 0.5);
      expect(unicornProgress(p, beat)).toBeGreaterThan(0.6);
      expect(unicornProgress(p, beat)).toBeLessThan(0.75);
      update(f, beat);
      const point = unicornBridgePoint(
        p,
        start,
        end,
        view,
        unicornRideParameter(p, start, end, view, beat),
      );
      expect(f.actor.position.x).toBeCloseTo(point.x, 6);
      expect(f.actor.position.y).toBeCloseTo(-point.y, 6);
      for (let s = 0; s <= 1; s += 0.02) {
        const q = unicornBridgePoint(p, start, end, view, s);
        expect(q.x).toBeGreaterThan(0);
        expect(q.x).toBeLessThan(view.x);
        expect(q.y).toBeGreaterThan(0);
      }
      clean(f);
    }
  });
  it('keeps both leg segments fixed and joined throughout the full performance at both card sizes', () => {
    for (let seed = 0; seed < 6; seed++) {
      const f = fixture('unicorn-' + seed);
      const layouts = [
        { bounds: b, source: start, viewport: view },
        { bounds: { left: 150, top: 400, width: 58, height: 84 }, source: start, viewport: view },
        {
          bounds: { left: 25, top: 580, width: 58, height: 84 },
          source: { x: 272, y: 620 },
          viewport: { x: 390, y: 844 },
        },
        {
          bounds: { left: 280, top: 580, width: 58, height: 84 },
          source: { x: 72, y: 620 },
          viewport: { x: 390, y: 844 },
        },
        {
          bounds: { left: 8, top: 580, width: 58, height: 84 },
          source: { x: 272, y: 620 },
          viewport: { x: 390, y: 844 },
        },
        {
          bounds: { left: 310, top: 580, width: 58, height: 84 },
          source: { x: 72, y: 620 },
          viewport: { x: 390, y: 844 },
        },
      ];
      for (const { bounds, source, viewport } of layouts)
        for (let ms = 0; ms < UNICORN_DURATION; ms += 157) {
          update(f, ms, bounds, source, viewport);
          for (let i = 0; i < 4; i++) {
            const leg = requireSceneObject(f.actor, 'leg-' + i),
              upper = requireSceneObject(leg, 'upper-leg'),
              lower = requireSceneObject(leg, 'lower-leg'),
              knee = requireSceneObject(leg, 'knee');
            const sole = requireSceneObject(leg, 'sole').getWorldPosition(new THREE.Vector3());
            expect(
              upper.scale.y,
              JSON.stringify({
                seed,
                ms,
                i,
                bounds,
                root: f.actor.position.toArray(),
                q: f.actor.quaternion.toArray(),
                local: leg.worldToLocal(sole).toArray(),
              }),
            ).toBeCloseTo(12, 5);
            expect(lower.scale.y, `lower seed ${seed} at ${ms}`).toBeCloseTo(12, 5);
            const joint = knee.getWorldPosition(new THREE.Vector3()),
              top = upper.localToWorld(new THREE.Vector3(0, 0.5, 0)),
              bottom = upper.localToWorld(new THREE.Vector3(0, -0.5, 0));
            expect(Math.min(top.distanceTo(joint), bottom.distanceTo(joint))).toBeLessThan(0.00001);
            const lowerTop = lower.localToWorld(new THREE.Vector3(0, 0.5, 0)),
              lowerBottom = lower.localToWorld(new THREE.Vector3(0, -0.5, 0));
            expect(
              Math.min(lowerTop.distanceTo(joint), lowerBottom.distanceTo(joint)),
            ).toBeLessThan(0.00001);
          }
        }
      clean(f);
    }
  });
  it('plants soles on the same rainbow arch and on the live affine card during the gift', () => {
    for (let seed = 0; seed < 4; seed++) {
      const f = fixture('unicorn-' + seed),
        p = f.ride.plan,
        end = unicornLandingPoint(b),
        path = (t: number) => unicornBridgePoint(p, start, end, view, t);
      const ms = p.form + p.ride * (0.6 + p.pause * 0.5);
      update(f, ms);
      const u = unicornRideParameter(p, start, end, view, ms),
        at = path(u),
        prior = path(unicornRideParameter(p, start, end, view, ms - 15));
      const moving = Math.min(1, Math.hypot(at.x - prior.x, at.y - prior.y) / 1.8);
      expect(moving).toBeGreaterThan(0);
      for (let i = 0; i < 4; i++) {
        const q = unicornCurveFoot(
            p,
            path,
            u,
            i,
            unicornProgress(p, ms) * Math.hypot(end.x - start.x, end.y - start.y),
            moving,
          ),
          at = requireSceneObject(requireSceneObject(f.actor, 'leg-' + i), 'sole').getWorldPosition(
            new THREE.Vector3(),
          );
        expect(at.x).toBeCloseTo(q.x, 5);
        expect(at.y).toBeCloseTo(-q.y, 5);
        expect(at.z).toBeCloseTo(172, 5);
      }
      for (const time of [unicornArrival(p) + 400, p.magic + 650]) {
        update(f, time);
        for (let i = 0; i < 4; i++) {
          const q = unicornCardPoint(
              p,
              time,
              {
                x: end.x + p.side * ((i < 2 ? -13 : 13) + (i % 2 ? 1 : -1)) * UNICORN_SCALE,
                y: b.top,
              },
              b,
            ),
            at = requireSceneObject(
              requireSceneObject(f.actor, 'leg-' + i),
              'sole',
            ).getWorldPosition(new THREE.Vector3());
          expect(at.x).toBeCloseTo(q.x, 5);
          expect(at.y).toBeCloseTo(-q.y, 5);
        }
      }
      clean(f);
    }
  });
  it('sends each packet from the actual horn tip to the current card at synchronized gift times', () => {
    for (let seed = 0; seed < 6; seed++) {
      const f = fixture('unicorn-' + seed),
        p = f.ride.plan;
      for (let i = 0; i < p.pulses; i++) {
        update(f, p.magic + i * 220);
        const tip = requireSceneObject(f.actor, 'horn-tip').getWorldPosition(new THREE.Vector3()),
          packet = mesh(f.ride.object, 'horn-packet-' + i).getWorldPosition(new THREE.Vector3());
        expect(tip.distanceTo(packet)).toBeLessThan(0.00001);
        update(f, p.magic + i * 220 + 450);
        const at = unicornCardPoint(
            p,
            p.magic + i * 220 + 450,
            { x: b.left + b.width / 2, y: b.top + b.height * 0.28 },
            b,
          ),
          arrived = mesh(f.ride.object, 'horn-packet-' + i).getWorldPosition(new THREE.Vector3());
        expect(arrived.x).toBeCloseTo(at.x, 6);
        expect(arrived.y).toBeCloseTo(-at.y, 6);
        expect(arrived.z).toBe(174);
      }
      expect(unicornCardPose(p, p.magic + 450).y).toBe(0);
      expect(unicornCardPose(p, p.magic + 650).y).toBeLessThan(0);
      clean(f);
    }
  });
  it('uses paced individual card transforms, restores the reveal, and retains choices across live reflow', () => {
    const f = fixture('reflow'),
      p = f.ride.plan,
      animation = f.ride.cardAnimation();
    expect(animation.options.duration).toBe(f.ride.duration);
    for (const frame of animation.frames) expect(frame['transform']).toBeUndefined();
    expect(animation.frames.at(-1)?.['translate']).toBe('0 0');
    expect(unicornCardPose(p, UNICORN_DURATION)).toEqual({ x: 0, y: 0, angle: 0 });
    for (const bounds of [
      b,
      { left: 8, top: 500, width: 58, height: 84 },
      { left: 310, top: 340, width: 58, height: 84 },
    ]) {
      update(f, p.magic + 600, bounds);
      expect(f.ride.plan).toBe(p);
      for (let i = 0; i < 6; i++) {
        const raw = {
            x: bounds.left + bounds.width / 2,
            y: bounds.top + (bounds.height * (i + 0.5)) / 6,
          },
          expected = unicornCardPoint(p, p.magic + 600, raw, bounds),
          at = mesh(f.ride.object, 'gift-stripe-' + i).getWorldPosition(new THREE.Vector3());
        expect(at.x).toBeCloseTo(expected.x, 6);
        expect(at.y).toBeCloseTo(-expected.y, 6);
      }
    }
    clean(f);
  });
  it('joins the perch to departure continuously and physically exits full size in both directions', () => {
    for (let seed = 0; seed < 6; seed++) {
      const f = fixture('unicorn-' + seed),
        p = f.ride.plan;
      for (const bounds of [
        b,
        { left: 8, top: 580, width: 58, height: 84 },
        { left: 310, top: 580, width: 58, height: 84 },
      ])
        for (const moment of [unicornArrival(p), p.departure]) {
          const viewport = bounds === b ? view : { x: 390, y: 844 };
          update(f, moment - 0.01, bounds, start, viewport);
          const prior = f.actor.position.clone(),
            rotation = f.actor.quaternion.clone();
          update(f, moment + 0.01, bounds, start, viewport);
          expect(f.actor.position.distanceTo(prior)).toBeLessThan(0.01);
          expect(f.actor.quaternion.angleTo(rotation)).toBeLessThan(0.001);
        }
      update(f, p.departure + p.exit - 0.01);
      expect(f.actor.visible).toBe(true);
      expect(Math.abs(f.actor.scale.x)).toBe(UNICORN_SCALE);
      expect(p.side > 0 ? f.actor.position.x > view.x + 109 : f.actor.position.x < -109).toBe(true);
      expect(f.actor.position.y).toBeGreaterThan(89);
      update(f, p.departure + p.exit);
      expect(f.actor.visible).toBe(false);
      clean(f);
    }
  });
  it('seeks deterministically with finite bounded geometry and disposes every resource once', () => {
    for (let seed = 0; seed < 4; seed++) {
      const f = fixture('unicorn-' + seed),
        resources: (THREE.Mesh | THREE.Line)[] = [];
      for (const root of [f.actor, f.ride.object])
        root.traverse((o) => {
          if (o instanceof THREE.Mesh || o instanceof THREE.Line) resources.push(o);
        });
      for (let ms = 0; ms <= UNICORN_DURATION; ms += 173) {
        update(f, ms);
        for (const root of [f.actor, f.ride.object])
          root.traverse((o) =>
            expect(
              [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()].every(
                Number.isFinite,
              ),
            ).toBe(true),
          );
      }
      const time = f.ride.plan.magic + 220;
      update(f, time);
      const matrix = mesh(f.ride.object, 'horn-packet-1').matrixWorld.toArray();
      update(f, 8400);
      update(f, time);
      expect(mesh(f.ride.object, 'horn-packet-1').matrixWorld.toArray()).toEqual(matrix);
      update(f, UNICORN_DURATION);
      expect(f.actor.visible).toBe(false);
      expect(f.ride.object.visible).toBe(false);
      const after: (THREE.Mesh | THREE.Line)[] = [];
      for (const root of [f.actor, f.ride.object])
        root.traverse((o) => {
          if (o instanceof THREE.Mesh || o instanceof THREE.Line) after.push(o);
        });
      expect(after).toEqual(resources);
      const geometries = resources.map((o) => vi.spyOn(o.geometry, 'dispose')),
        materials = resources
          .flatMap((o) => (Array.isArray(o.material) ? o.material : [o.material]))
          .map((m) => vi.spyOn(m, 'dispose'));
      clean(f);
      for (const spy of [...geometries, ...materials]) expect(spy).toHaveBeenCalledOnce();
    }
  });
});
