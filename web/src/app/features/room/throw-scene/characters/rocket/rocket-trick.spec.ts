import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeRocket, nativeRocketPlan } from './rocket-model';
import { RocketTrick, rocketSmokeSource } from './rocket-trick';
import {
  ROCKET_DURATION,
  ROCKET_SCALE,
  rocketPlan,
  rocketPose,
  rocketCardPose,
  rocketCardPoint,
  rocketContact,
  rocketLandingPoint,
} from './rocket-choreography';
import { LandingEffect, landingKind } from '../../landing/landing-effects';
import { disposeObject } from '../../engine/throw-models';
import { requireSceneObject } from '../../engine/scene-object';
import { approachPace } from '../../testing/approach-pace.testing';
import { rocketCharacter } from './rocket-character';
const b = { left: 600, top: 420, width: 84, height: 122 },
  source = { x: 260, y: 480 },
  view = { x: 1200, y: 850 };
function fixture(id: string) {
  const actor = makeRocket(id),
    trick = new RocketTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, scene };
}
function update(
  f: ReturnType<typeof fixture>,
  ms: number,
  bounds = b,
  viewport = view,
  facing = f.trick.plan.side,
) {
  f.trick.update(ms * f.trick.plan.pace, f.actor, source, bounds, viewport, facing);
  f.scene.updateMatrixWorld(true);
}
const pos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
function clean(f: ReturnType<typeof fixture>) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}
function mesh(root: THREE.Object3D, name: string) {
  const o = requireSceneObject(root, name);
  if (!(o instanceof THREE.Mesh)) throw Error('Missing native mesh');
  return o;
}
describe('overenthusiastic rocket engine', () => {
  it('owns one reproducible event plan with whole-stage variation, loops and both engine endings', () => {
    const actor = makeRocket('shared'),
      effect = new LandingEffect('🚀', actor, 'shared');
    expect(effect.planOf(rocketCharacter)).toBe(nativeRocketPlan(actor));
    expect(landingKind('🚀')).toBe('🚀');
    expect(rocketPlan('repeat')).toEqual(rocketPlan('repeat'));
    const plans = Array.from({ length: 40 }, (_, i) => rocketPlan('rocket-' + i));
    for (const key of [
      'pace',
      'ignite',
      'travel',
      'hit',
      'pad',
      'pause',
      'spot',
      'force',
      'rise',
      'departure',
      'exit',
      'bend',
      'phase',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(40);
    for (const key of ['side', 'fault'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    expect(new Set(plans.map((p) => p.route.loop)).size).toBe(2);
    expect(new Set(plans.map((p) => p.fires.length)).size).toBe(2);
    for (const p of plans)
      expect(p.departure + 420 + p.exit + 350 + 550).toBeLessThan(ROCKET_DURATION);
    disposeObject(actor);
    disposeObject(effect.object);
  });
  it('builds real native nose/nozzle markers, flared metal exhaust and fins attached at their roots', () => {
    const f = fixture('native'),
      nose = mesh(f.actor, 'red-nose'),
      positions = nose.geometry.getAttribute('position'),
      tip = requireSceneObject(f.actor, 'nose-tip');
    let nearest = Infinity;
    for (let i = 0; i < positions.count; i++)
      nearest = Math.min(
        nearest,
        new THREE.Vector3()
          .fromBufferAttribute(positions, i)
          .add(nose.position)
          .distanceTo(tip.position),
      );
    expect(nearest).toBeLessThan(0.000001);
    const aperture = mesh(f.actor, 'nozzle-aperture');
    expect(aperture.position).toEqual(requireSceneObject(f.actor, 'nozzle').position);
    for (let i = 0; i < 2; i++) {
      const fin = requireSceneObject(f.actor, `fin-${i}`);
      expect(requireSceneObject(fin, 'fin-root').position.length()).toBe(0);
    }
    update(f, f.trick.plan.fires[0] ?? 0);
    clean(f);
  });
  it('cuts the engine and coasts slowly instead of stopping dead on its approach', () => {
    // Sub-stepped samples measure distance flown, so the route's tight turns still count as travel.
    for (let seed = 0; seed < 12; seed++)
      for (const [bounds, from, viewport] of [
        [b, source, view],
        [b, { x: 1000, y: 200 }, view],
        [
          { left: 160, top: 200, width: 58, height: 84 },
          { x: 189, y: 640 },
          { x: 390, y: 844 },
        ],
      ] as const) {
        const p = rocketPlan('rocket-' + seed),
          pace = approachPace(
            (t) =>
              rocketPose(
                p,
                p.ignite + Math.min(t, 0.999999) * p.travel,
                from,
                bounds,
                viewport,
                p.side,
              ).point,
            300,
            3,
          );
        expect(pace.slowest).toBeGreaterThan(0.3);
        expect(pace.pace(0.57 + p.pause / 2)).toBeLessThan(1);
      }
    for (let seed = 0; seed < 8; seed++) {
      const f = fixture('rocket-' + seed),
        p = f.trick.plan;
      update(f, p.ignite + p.travel * (0.57 + p.pause * 0.2));
      const before = f.actor.position.clone();
      update(f, p.ignite + p.travel * (0.57 + p.pause * 0.8));
      expect(f.actor.position.distanceTo(before)).toBeGreaterThan(1);
      expect(requireSceneObject(f.actor, 'engine-plume').visible).toBe(false);
      clean(f);
    }
  }, 20000);
  it('starts at the true source and joins all actor poses continuously', () => {
    for (let seed = 0; seed < 8; seed++) {
      const f = fixture('rocket-' + seed),
        p = f.trick.plan;
      update(f, 0);
      expect(f.actor.position.x).toBe(source.x);
      expect(f.actor.position.y).toBe(-source.y);
      for (const at of [p.ignite, p.hit, p.hit + 350, p.pad, p.departure, p.departure + 420]) {
        update(f, at - 0.01);
        const point = f.actor.position.clone(),
          turn = f.actor.quaternion.clone();
        update(f, at + 0.01);
        expect(f.actor.position.distanceTo(point), `seed ${seed}, ${at}`).toBeLessThan(0.01);
        expect(f.actor.quaternion.angleTo(turn)).toBeLessThan(0.001);
      }
      clean(f);
    }
  });
  it('makes exact native nose and nozzle contacts on the live affine card before their reactions', () => {
    for (let seed = 0; seed < 5; seed++) {
      const f = fixture('rocket-' + seed),
        p = f.trick.plan;
      for (const bounds of [
        b,
        { left: 8, top: 500, width: 58, height: 84 },
        { left: 310, top: 340, width: 58, height: 84 },
      ]) {
        update(f, p.hit, bounds);
        const tip = pos(requireSceneObject(f.actor, 'nose-tip')),
          at = rocketContact(p, bounds, p.side);
        expect(tip.x).toBeCloseTo(at.x, 6);
        expect(tip.y).toBeCloseTo(-at.y, 6);
        expect(tip.z).toBeCloseTo(172, 6);
        for (const moment of [p.pad + 100, ...p.fires.map((at) => at + 110), p.departure + 180]) {
          update(f, moment, bounds);
          const nozzle = pos(requireSceneObject(f.actor, 'nozzle')),
            at = rocketCardPoint(
              p,
              moment,
              { x: bounds.left + bounds.width / 2, y: bounds.top },
              bounds,
              p.side,
            );
          expect(nozzle.x).toBeCloseTo(at.x, 6);
          expect(nozzle.y).toBeCloseTo(-at.y, 6);
          expect(nozzle.z).toBeCloseTo(172, 6);
          expect(pos(requireSceneObject(f.actor, 'plume-origin')).distanceTo(nozzle)).toBeLessThan(
            0.000001,
          );
        }
      }
      expect(rocketCardPose(p, p.hit - 1, p.side).x).toBeCloseTo(0, 8);
      expect(Math.abs(rocketCardPose(p, p.hit + 50, p.side).x)).toBeGreaterThan(0);
      const fire = p.fires[0];
      if (fire === undefined) throw Error('Missing ignition');
      expect(rocketCardPose(p, fire + 110, p.side).y).toBeGreaterThan(2);
      expect(rocketCardPose(p, p.departure + 421, p.side).y).toBe(0);
      clean(f);
    }
  });
  it('releases smoke from the native flame tip and paper chips from the actual first contact', () => {
    const f = fixture('rocket-0'),
      p = f.trick.plan;
    const fire = p.fires[0];
    if (fire === undefined) throw Error('Missing fire');
    for (const [at, name] of [
      [p.ignite + 75, 'route-smoke-0'],
      [fire + 35, 'cough-smoke-0'],
      [p.departure + 420, 'escape-smoke-0'],
    ] as const) {
      update(f, at);
      const packet = requireSceneObject(f.trick.object, name),
        tip = pos(requireSceneObject(f.actor, 'plume-tip'));
      expect(packet.visible).toBe(true);
      expect(packet.position.distanceTo(tip)).toBeLessThan(0.000001);
      expect(rocketSmokeSource(p, at, source, b, view, p.side).distanceTo(tip)).toBeLessThan(
        0.000001,
      );
    }
    update(f, p.hit);
    const paper = requireSceneObject(f.trick.object, 'rocket-paper-0'),
      tip = pos(requireSceneObject(f.actor, 'nose-tip'));
    expect(paper.position.x).toBeCloseTo(tip.x, 6);
    expect(paper.position.y).toBeCloseTo(tip.y, 6);
    clean(f);
  });
  it('retains the chosen side and native plan through reflow and restores reveal-safe card properties', () => {
    const f = fixture('rocket-1'),
      p = f.trick.plan;
    for (const bounds of [b, { left: 8, top: 500, width: 58, height: 84 }]) {
      const end = rocketLandingPoint(p, bounds, view, p.side);
      expect(Math.sign(bounds.left + bounds.width / 2 - end.x)).toBe(p.side);
      update(f, p.departure + 180, bounds);
      expect(f.trick.plan).toBe(p);
      const strip = mesh(f.trick.object, 'engine-scorch-0');
      expect(strip.visible).toBe(true);
      expect(strip.rotation.z).toBeCloseTo(
        (-rocketCardPose(p, p.departure + 180, p.side).angle * Math.PI) / 180,
        6,
      );
    }
    const animation = f.trick.cardAnimation(p.side);
    expect(animation.options.duration).toBe(f.trick.duration);
    for (const frame of animation.frames) expect(frame['transform']).toBeUndefined();
    expect(animation.frames.at(-1)).toEqual({
      offset: 1,
      translate: '0px 0px',
      rotate: '0deg',
      scale: '1 1',
    });
    update(f, ROCKET_DURATION);
    expect(f.actor.visible).toBe(false);
    expect(f.trick.object.visible).toBe(false);
    clean(f);
  });
  it('keeps routes bounded, provides a real engine hesitation and escapes physically at full size', () => {
    const seen = new Set<boolean>();
    for (let seed = 0; seed < 8; seed++) {
      const f = fixture('rocket-' + seed),
        p = f.trick.plan;
      seen.add(p.fault);
      for (const [bounds, viewport] of [
        [b, view],
        [
          { left: 8, top: 500, width: 58, height: 84 },
          { x: 390, y: 844 },
        ],
        [
          { left: 310, top: 340, width: 58, height: 84 },
          { x: 390, y: 844 },
        ],
      ] as const) {
        const end = rocketLandingPoint(p, bounds, viewport),
          facing = Math.sign(bounds.left + bounds.width / 2 - end.x) || 1;
        for (let ms = p.ignite; ms < p.hit; ms += 37) {
          const q = rocketPose(p, ms, source, bounds, viewport, facing);
          expect(q.point.x).toBeGreaterThanOrEqual(24);
          expect(q.point.x).toBeLessThanOrEqual(viewport.x - 24);
          expect(q.point.y).toBeGreaterThanOrEqual(24);
          expect(q.point.y).toBeLessThanOrEqual(viewport.y - 24);
        }
      }
      update(f, p.departure + 420 + p.exit * 0.14);
      const a = f.actor.position.clone();
      update(f, p.departure + 420 + p.exit * 0.18);
      expect(f.actor.position.distanceTo(a) < 0.00001).toBe(p.fault);
      update(f, p.departure + 420 + p.exit - 0.1);
      expect(f.actor.visible).toBe(true);
      expect(f.actor.position.y).toBeGreaterThan(119);
      expect(f.actor.scale.x).toBe(ROCKET_SCALE);
      update(f, p.departure + 420 + p.exit + 0.1);
      expect(f.actor.visible).toBe(false);
      clean(f);
    }
    expect(seen.size).toBe(2);
  });
  it('seeks deterministically with finite fixed GPU resources disposed completely once', () => {
    const f = fixture('rocket-2'),
      resources: (THREE.Mesh | THREE.Line)[] = [];
    for (const root of [f.actor, f.trick.object])
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) resources.push(o);
      });
    for (let ms = 0; ms < ROCKET_DURATION; ms += 137) {
      update(f, ms);
      for (const root of [f.actor, f.trick.object])
        root.traverse((o) =>
          expect(
            [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()].every(
              Number.isFinite,
            ),
          ).toBe(true),
        );
    }
    update(f, f.trick.plan.departure + 180);
    const before = f.actor.matrixWorld.toArray();
    update(f, 8000);
    update(f, f.trick.plan.departure + 180);
    expect(f.actor.matrixWorld.toArray()).toEqual(before);
    const after: (THREE.Mesh | THREE.Line)[] = [];
    for (const root of [f.actor, f.trick.object])
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) after.push(o);
      });
    expect(after).toEqual(resources);
    const spies = resources.flatMap((o) => [
      vi.spyOn(o.geometry, 'dispose'),
      ...(Array.isArray(o.material) ? o.material : [o.material]).map((m) => vi.spyOn(m, 'dispose')),
    ]);
    clean(f);
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });
});
