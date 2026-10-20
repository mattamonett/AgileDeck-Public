import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makePigeon, PigeonTrick, PIGEON_THOUGHT } from './po-pigeon';
import {
  PIGEON_DURATION,
  pigeonPlan,
  pigeonLandingPoint,
  pigeonFacing,
  pigeonApproach,
  pigeonBurstActive,
  pigeonRumpPoint,
  pigeonImpactPoint,
  pigeonCardPoint,
  pigeonPacketPoint,
  pigeonCardPose,
} from './pigeon-choreography';
import { requireSceneObject } from '../../engine/scene-object';
import { pigeonTravel } from './pigeon-model';
import { LandingEffect, landingKind } from '../../landing/landing-effects';
import { disposeObject } from '../../engine/throw-models';
import { approachPace } from '../../testing/approach-pace.testing';
import { pigeonCharacter } from './pigeon-character';

const b = { left: 170, top: 240, width: 58, height: 84 };
const viewport = { x: 390, y: 844 };
const position = (object: THREE.Object3D) => object.getWorldPosition(new THREE.Vector3());
function setup(id: string, facing?: number) {
  const bird = makePigeon();
  const trick = new PigeonTrick(id);
  const parent = new THREE.Group();
  parent.add(trick.object);
  const scene = new THREE.Scene();
  scene.add(parent, bird);
  const update = (ms: number, bounds = b, view = viewport) => {
    const end =
      facing === undefined
        ? pigeonLandingPoint(trick.plan, bounds, view)
        : { x: bounds.left + bounds.width * (facing < 0 ? 0.15 : 0.85), y: bounds.top - 1 };
    parent.position.set(end.x, -end.y, 150);
    trick.update(ms * trick.plan.pace, bird, bounds, end, view);
    scene.updateMatrixWorld(true);
    return end;
  };
  const parts = (name: string) => trick.object.children.filter((p) => p.name === name);
  return {
    bird,
    trick,
    update,
    parts,
    dispose: () => {
      disposeObject(bird);
      disposeObject(trick.object);
    },
  };
}
describe('PO Pigeon', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('retains a shared event plan, varied dive/hover timing, a moving hover, both edges and clean burst pauses', () => {
    const plans = Array.from({ length: 40 }, (_, i) => pigeonPlan('pigeon-' + i));
    const sides = new Set<number>();
    for (const [i, plan] of plans.entries()) {
      expect(plan).toEqual(pigeonPlan('pigeon-' + i));
      const end = pigeonLandingPoint(plan, b);
      const start = { x: 30, y: 350 };
      sides.add(pigeonFacing(end, b));
      expect(pigeonApproach(plan, start, end, viewport, 0)).toEqual(start);
      expect(pigeonApproach(plan, start, end, viewport, 1)).toEqual(end);
      const peak = Math.min(
        ...Array.from(
          { length: 101 },
          (_, k) => pigeonApproach(plan, start, end, viewport, k / 100).y,
        ),
      );
      expect(peak).toBeLessThan(end.y - 50);
      for (const [bounds, from] of [
        [b, start],
        [b, { x: 360, y: 700 }],
        [
          { ...b, top: 600 },
          { x: 199, y: 240 },
        ],
        [
          { ...b, top: 200 },
          { x: 199, y: 640 },
        ],
      ] as const) {
        const pace = approachPace((t) =>
          pigeonApproach(plan, from, pigeonLandingPoint(plan, bounds, viewport), viewport, t),
        );
        expect(pace.slowest).toBeGreaterThan(0.3);
        expect(
          Math.min(
            ...Array.from({ length: 31 }, (_, k) => pace.pace(0.3 + k * 0.01 + plan.pause / 2)),
          ),
        ).toBeLessThan(1);
      }
      const left = { ...b, left: 0 };
      const right = { ...b, left: viewport.x - b.width };
      expect(pigeonFacing(pigeonLandingPoint(plan, left, viewport), left)).toBe(1);
      expect(pigeonFacing(pigeonLandingPoint(plan, right, viewport), right)).toBe(-1);
      for (const burst of plan.bursts) {
        expect(pigeonBurstActive(burst + 70, plan)).toBe(true);
        expect(pigeonBurstActive(burst + 200, plan)).toBe(false);
      }
    }
    expect(sides.size).toBe(2);
    for (const key of [
      'pace',
      'detour',
      'pause',
      'pressure',
      'flap',
      'flight',
      'departure',
      'exit',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBeGreaterThan(30);
    const bird = makePigeon();
    const effect = new LandingEffect('🕊️', bird, 'pigeon-3');
    expect(landingKind('🕊️')).toBe('🕊️');
    expect(effect.planOf(pigeonCharacter)).toEqual(pigeonPlan('pigeon-3'));
    expect(requireSceneObject(effect.object, 'pigeon-thought').userData['text']).toBe(
      PIGEON_THOUGHT,
    );
    disposeObject(bird);
    disposeObject(effect.object);
  });
  it('turns continuously in the air and reaches the same facing and scale as the perched pose', () => {
    for (const facing of [-1, 1])
      for (const sourceX of [30, 350]) {
        const run = setup('pigeon-1', facing);
        const end = run.update(0);
        const landed = run.bird.quaternion.clone();
        const start = { x: sourceX, y: 350 };
        let previousRotation: THREE.Quaternion | null = null;
        for (let step = 0; step <= 100; step++) {
          const t = step / 100;
          const point = pigeonApproach(run.trick.plan, start, end, viewport, t);
          const previous = pigeonApproach(
            run.trick.plan,
            start,
            end,
            viewport,
            Math.max(0, t - 0.005),
          );
          pigeonTravel(run.bird, run.trick.plan, t, t * 1700, start, end, point, previous, facing);
          if (t >= 0.75 && previousRotation)
            expect(run.bird.quaternion.angleTo(previousRotation)).toBeLessThan(0.21);
          previousRotation = run.bird.quaternion.clone();
        }
        expect(run.bird.quaternion.angleTo(landed)).toBeLessThan(1e-6);
        expect(run.bird.scale.x).toBe(0.8);
        run.dispose();
      }
  });
  for (const facing of [-1, 1]) {
    it(`releases real rump packets, hits the moving card and keeps planted toes on side ${facing}`, () => {
      const run = setup('pigeon-4', facing);
      const start = run.trick.plan.bursts[0];
      if (start === undefined) throw new Error('Missing burst');
      run.update(0);
      const supports = [-1, 1].map((side) =>
        position(requireSceneObject(requireSceneObject(run.bird, 'pigeon-leg-' + side), 'talon')),
      );
      let end = run.update(start + 80);
      const rump = position(requireSceneObject(run.bird, 'pigeon-rump'));
      const expected = pigeonRumpPoint(start + 80, run.trick.plan, end, facing, b);
      expect(rump.x).toBeCloseTo(expected.x, 6);
      expect(-rump.y).toBeCloseTo(expected.y, 6);
      const jet = run.parts('pigeon-jet')[0];
      if (!jet) throw new Error('Missing jet');
      expect(jet.localToWorld(new THREE.Vector3(0, -0.5, 0)).distanceTo(rump)).toBeLessThan(0.09);
      for (const [i, side] of [-1, 1].entries()) {
        const foot = requireSceneObject(
          requireSceneObject(run.bird, 'pigeon-leg-' + side),
          'talon',
        );
        const support = supports[i];
        if (!support) throw new Error('Missing support');
        expect(position(foot).distanceTo(support)).toBeLessThan(1e-6);
      }
      const chunk = run.parts('pigeon-burst-chunk')[4];
      if (!chunk) throw new Error('Missing chunk');
      run.update(start + 48);
      expect(
        position(chunk).distanceTo(position(requireSceneObject(run.bird, 'pigeon-rump'))),
      ).toBeLessThan(1e-6);
      const contact = start + run.trick.plan.flight + 70;
      end = run.update(contact);
      const lastJet = run.parts('pigeon-jet')[17];
      if (!lastJet) throw new Error('Missing jet end');
      const target = pigeonCardPoint(
        contact,
        pigeonImpactPoint(b, run.trick.plan, 0, facing),
        b,
        run.trick.plan,
        facing,
      );
      const tip = lastJet.localToWorld(new THREE.Vector3(0, 0.5, 0));
      expect(tip.x).toBeCloseTo(target.x, 0);
      expect(-tip.y).toBeCloseTo(target.y, 0);
      expect(Math.abs(pigeonCardPose(contact, run.trick.plan, facing).x)).toBeGreaterThan(0.4);
      for (const side of [-1, 1]) {
        const foot = position(
          requireSceneObject(requireSceneObject(run.bird, 'pigeon-leg-' + side), 'talon'),
        );
        const supported = pigeonCardPoint(
          contact,
          { x: end.x + facing * 2.4, y: end.y },
          b,
          run.trick.plan,
          facing,
        );
        expect(foot.x).toBeCloseTo(supported.x, 6);
        expect(-foot.y).toBeCloseTo(supported.y, 6);
      }
      const moved = { left: 250, top: 330, width: 84, height: 122 };
      end = run.update(contact, moved, { x: 1200, y: 850 });
      const adapted = pigeonCardPoint(
        contact,
        pigeonImpactPoint(moved, run.trick.plan, 0, facing),
        moved,
        run.trick.plan,
        facing,
      );
      const movedTip = lastJet.localToWorld(new THREE.Vector3(0, 0.5, 0));
      expect(movedTip.x).toBeCloseTo(adapted.x, 0);
      expect(-movedTip.y).toBeCloseTo(adapted.y, 0);
      const snapshot = run.trick.object.children.map((p) => p.position.clone());
      run.update(3300, moved);
      run.update(contact, moved, { x: 1200, y: 850 });
      expect(run.trick.object.children.map((p) => p.position)).toEqual(snapshot);
      run.dispose();
    });
  }
  it('keeps fixed leg lengths, joined wing segments and finite transforms across 24 event performances', () => {
    for (let i = 0; i < 24; i++) {
      const run = setup('pigeon-' + i);
      for (const ms of [
        0, 520, 850, 1130, 1350, 1800, 2110, 2460, 2710, 3300, 3690, 3890, 4250, 4800, 5200,
      ]) {
        run.update(ms);
        for (const side of [-1, 1]) {
          const leg = requireSceneObject(run.bird, 'pigeon-leg-' + side);
          const knee = requireSceneObject(leg, 'knee');
          const upper = requireSceneObject(leg, 'upper-leg');
          const lower = requireSceneObject(leg, 'lower-leg');
          for (const bone of [upper, lower])
            expect(
              bone
                .localToWorld(new THREE.Vector3(0, -0.5, 0))
                .distanceTo(bone.localToWorld(new THREE.Vector3(0, 0.5, 0))),
            ).toBeCloseTo(7.2, 6);
          expect(
            upper.localToWorld(new THREE.Vector3(0, 0.5, 0)).distanceTo(position(knee)),
          ).toBeLessThan(1e-6);
          expect(
            lower.localToWorld(new THREE.Vector3(0, -0.5, 0)).distanceTo(position(knee)),
          ).toBeLessThan(1e-6);
          expect(
            lower
              .localToWorld(new THREE.Vector3(0, 0.5, 0))
              .distanceTo(position(requireSceneObject(leg, 'talon'))),
          ).toBeLessThan(1e-6);
          const wing = requireSceneObject(run.bird, 'wing-' + side);
          expect(
            position(wing).distanceTo(position(requireSceneObject(wing, 'fore-wing'))),
          ).toBeCloseTo(Math.sqrt(173) * 0.8, 6);
        }
        for (const root of [run.bird, run.trick.object])
          root.traverse((part) =>
            expect(part.matrixWorld.elements.every(Number.isFinite)).toBe(true),
          );
      }
      run.dispose();
    }
  });
  it('separates packets in the pauses and leaves gross runoff on live card edges and a puddle below', () => {
    const run = setup('pigeon-3');
    const plan = run.trick.plan;
    const end = run.update(0);
    for (const [i, burst] of plan.bursts.entries()) {
      run.update(burst + plan.flight + 161);
      expect(
        run
          .parts('pigeon-jet')
          .slice(i * 18, (i + 1) * 18)
          .every((p) => !p.visible),
      ).toBe(true);
      const release = burst + 48;
      const origin = pigeonPacketPoint(release, release, plan, b, end, i, pigeonFacing(end, b));
      expect(origin).toEqual(pigeonRumpPoint(release, plan, end, pigeonFacing(end, b), b));
    }
    run.update(3300);
    expect(run.parts('pigeon-runoff').every((p) => p.visible)).toBe(true);
    const drips = run.parts('pigeon-runoff');
    expect(drips.some((p) => p.scale.y > 18)).toBe(true);
    const moved = { left: b.left + 30, top: b.top + 60, width: 84, height: 122 };
    const old = position(drips[0] ?? run.bird);
    run.update(3300, { ...b, left: moved.left, top: moved.top });
    const adapted = position(drips[0] ?? run.bird);
    expect(adapted.x - old.x).toBeCloseTo(30);
    expect(adapted.y - old.y).toBeCloseTo(-60);
    run.update(3300, moved);
    const residue = run.trick.object.children.filter((p) => p.userData['cardSurface'] && p.visible);
    expect(residue.length).toBe(48);
    for (const part of residue) {
      const p = position(part);
      expect(p.x).toBeGreaterThan(moved.left);
      expect(p.x).toBeLessThan(moved.left + moved.width);
      expect(-p.y).toBeGreaterThan(moved.top);
      expect(-p.y).toBeLessThan(moved.top + moved.height);
    }
    run.dispose();
  });
  it('banks fully outside the viewport at full size, restores the card and disposes bounded effects', () => {
    for (let i = 0; i < 24; i++) {
      const run = setup('pigeon-' + i);
      const plan = run.trick.plan;
      const end = run.update(plan.departure + 1400 * plan.exit - 1);
      const box = new THREE.Box3().setFromObject(run.bird);
      expect(run.bird.visible).toBe(true);
      expect(run.bird.scale.x).toBe(0.8);
      expect(
        box.min.y > 0 || (pigeonFacing(end, b) < 0 ? box.max.x < 0 : box.min.x > viewport.x),
      ).toBe(true);
      const mesh = run.trick.object.children.find((p) => p instanceof THREE.Mesh);
      if (!(mesh instanceof THREE.Mesh)) throw new Error('Missing effects');
      const geometry = mesh.geometry;
      const spy = vi.spyOn(geometry, 'dispose');
      run.update(PIGEON_DURATION);
      expect(run.bird.visible).toBe(false);
      expect(run.trick.object.children.every((p) => !p.visible)).toBe(true);
      expect(mesh.geometry).toBe(geometry);
      expect(pigeonCardPose(PIGEON_DURATION, plan, pigeonFacing(end, b))).toEqual({
        x: 0,
        y: 0,
        angle: 0,
      });
      expect(run.trick.duration).toBe(PIGEON_DURATION * plan.pace);
      run.dispose();
      expect(spy).toHaveBeenCalledOnce();
    }
  });
});
