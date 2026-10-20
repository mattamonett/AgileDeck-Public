import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ProjectileSchema } from '@poker/shared';
import { GoatTrick, makeGoats, goatWalk } from './goat-trick';
import {
  goatPlan,
  goatLandingPoint,
  goatApproach,
  goatApproachFacing,
  goatCardPoint,
  goatCardPose,
  GOAT_DURATION,
  GOAT_SCALE,
} from './goat-choreography';
import { LandingEffect, landingKind } from '../../landing/landing-effects';
import { requireSceneObject as part } from '../../engine/scene-object';
import { disposeObject } from '../../engine/throw-models';
import { approachPace } from '../../testing/approach-pace.testing';
import { goatCharacter } from './goat-character';
const b = { left: 360, top: 270, width: 84, height: 122 },
  view = { x: 900, y: 760 },
  source = { x: 100, y: 330 };
const pos = (root: THREE.Object3D, name: string) =>
  part(root, name).getWorldPosition(new THREE.Vector3());
function frame(trick: GoatTrick, herd: THREE.Group, ms: number, bounds = b, facing = 1) {
  trick.update(
    ms * trick.plan.pace,
    herd,
    bounds,
    goatLandingPoint(trick.plan, bounds, view, source, facing),
    view,
  );
  herd.updateMatrixWorld(true);
}
describe('Three-goat king of the hill', () => {
  it('shares reproducible choices and varies all stages within the completed timeline', () => {
    expect(ProjectileSchema.safeParse({ targetUserId: 'player', emoji: '🐐' }).success).toBe(true);
    expect(landingKind('🐐')).toBe('🐐');
    expect(goatPlan('same')).toEqual(goatPlan('same'));
    const plans = Array.from({ length: 40 }, (_, i) => goatPlan('goat-' + i));
    for (const key of [
      'pace',
      'leader',
      'force',
      'pause',
      'bend',
      'step',
      'departure',
      'exit',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBeGreaterThan(20);
    expect(new Set(plans.map((p) => p.stamp))).toEqual(new Set([true, false]));
    expect(new Set(plans.map((p) => p.order.join(','))).size).toBe(6);
    for (const p of plans) {
      expect(p.departure + 760 + 1600 * p.exit).toBeLessThan(GOAT_DURATION);
      expect(p.hits[1] - p.hits[0]).toBeGreaterThan(1300);
      expect(p.departure - p.hits[1]).toBeGreaterThan(1300);
    }
  });
  it('keeps all four joined legs at fixed lengths throughout each performance', () => {
    for (let seed = 0; seed < 3; seed++)
      for (const facing of [-1, 1])
        for (const size of [
          { width: 84, height: 122 },
          { width: 58, height: 84 },
        ]) {
          const bounds = { ...b, ...size },
            herd = makeGoats(),
            trick = new GoatTrick('goat-' + seed);
          expect(herd.children).toHaveLength(3);
          for (let ms = 0; ms <= GOAT_DURATION; ms += 70) {
            frame(trick, herd, ms, bounds, facing);
            for (const goat of herd.children)
              for (let i = 0; i < 4; i++) {
                const leg = part(goat, 'leg-' + i);
                for (const bone of ['upper-leg', 'lower-leg'])
                  expect(part(leg, bone).scale.y, `${seed} ${facing} ${ms} ${bone}`).toBeCloseTo(
                    9,
                    6,
                  );
                expect(
                  pos(leg, 'knee').distanceTo(leg.getWorldPosition(new THREE.Vector3())),
                ).toBeCloseTo(9 * GOAT_SCALE, 6);
                expect(pos(leg, 'knee').distanceTo(pos(leg, 'hoof'))).toBeCloseTo(
                  9 * GOAT_SCALE,
                  6,
                );
              }
          }
          disposeObject(herd);
          disposeObject(trick.object);
        }
  });
  it('puts each challenger’s actual horn on the king’s native rump at the two bonks', () => {
    for (let seed = 0; seed < 6; seed++)
      for (const facing of [-1, 1])
        for (const size of [
          { width: 84, height: 122 },
          { width: 58, height: 84 },
        ]) {
          const herd = makeGoats(),
            trick = new GoatTrick('goat-' + seed),
            bounds = { ...b, ...size };
          for (const [i, hit] of trick.plan.hits.entries()) {
            frame(trick, herd, hit, bounds, facing);
            const kingIndex = trick.plan.order[i],
              challengerIndex = trick.plan.order[i + 1];
            if (kingIndex === undefined || challengerIndex === undefined)
              throw Error('Missing role');
            const king = herd.children[kingIndex],
              challenger = herd.children[challengerIndex];
            expect(king).toBeDefined();
            expect(challenger).toBeDefined();
            if (king && challenger) {
              expect(
                pos(challenger, 'horn-contact').distanceTo(pos(king, 'rump-contact')),
              ).toBeLessThan(1e-6);
            }
          }
          disposeObject(herd);
          disposeObject(trick.object);
        }
  });
  it('plants every reigning hoof on the live rocking card and leaves waiting hooves still', () => {
    for (const facing of [-1, 1])
      for (const size of [
        { width: 84, height: 122 },
        { width: 58, height: 84 },
      ]) {
        const herd = makeGoats(),
          trick = new GoatTrick('supports'),
          bounds = { ...b, ...size },
          p = trick.plan;
        for (const [index, land] of [p.leader, p.hits[0] + 400, p.hits[1] + 400].entries())
          for (const age of [90, 310, 600]) {
            frame(trick, herd, land + age, bounds, facing);
            const kingIndex = p.order[index];
            if (kingIndex === undefined) throw Error('Missing role');
            const king = herd.children[kingIndex];
            if (!king) throw Error('Missing goat');
            for (let i = 0; i < 4; i++) {
              const at = goatCardPoint(
                  p,
                  land + age,
                  {
                    x: bounds.left + bounds.width / 2 + facing * (i < 2 ? -10 : 10) * GOAT_SCALE,
                    y: bounds.top,
                  },
                  bounds,
                  facing,
                ),
                foot = pos(part(king, 'leg-' + i), 'sole');
              expect(foot.x).toBeCloseTo(at.x, 6);
              expect(-foot.y).toBeCloseTo(at.y, 6);
            }
          }
        frame(trick, herd, 30, bounds, facing);
        const waiting = herd.children[p.order[2]];
        if (!waiting) throw Error('Missing goat');
        const feet = Array.from({ length: 4 }, (_, i) =>
          pos(part(waiting, 'leg-' + i), 'sole').toArray(),
        );
        frame(trick, herd, 200, bounds, facing);
        expect(
          Array.from({ length: 4 }, (_, i) => pos(part(waiting, 'leg-' + i), 'sole').toArray()),
        ).toEqual(feet);
        for (const age of [650, 720]) {
          frame(trick, herd, p.hits[0] + age, bounds, facing);
          const fallen = herd.children[p.order[0]];
          if (!fallen) throw Error('Missing fallen king');
          expect(
            fallen
              .getWorldPosition(new THREE.Vector3())
              .distanceTo(waiting.getWorldPosition(new THREE.Vector3())),
          ).toBeGreaterThan(43);
        }
        for (const age of [480, 530, 590]) {
          frame(trick, herd, p.hits[0] + age, bounds, facing);
          const fallen = herd.children[p.order[0]];
          if (!fallen) throw Error('Missing fallen king');
          expect(
            Math.abs(
              fallen.getWorldPosition(new THREE.Vector3()).x -
                waiting.getWorldPosition(new THREE.Vector3()).x,
            ),
          ).toBeGreaterThan(43);
        }
        disposeObject(herd);
        disposeObject(trick.object);
      }
  });
  it('slows the herd through its beat and around the lane corners without ever stopping dead', () => {
    for (let seed = 0; seed < 20; seed++)
      for (const facing of [-1, 1])
        for (const from of [source, { x: 700, y: 640 }]) {
          const p = goatPlan('goat-' + seed),
            end = goatLandingPoint(p, b, view, from, facing);
          const pace = approachPace((t) => goatApproach(p, from, end, view, t, b));
          expect(pace.slowest).toBeGreaterThan(0.3);
          expect(pace.pace(0.7 + p.pause / 2)).toBeLessThan(1);
        }
  });
  it('turns continuously and meets the landing pose without shrinking', () => {
    const herd = makeGoats(),
      trick = new GoatTrick('travel'),
      p = trick.plan;
    for (const facing of [-1, 1]) {
      const end = goatLandingPoint(p, b, view, source, facing);
      expect(goatApproach(p, source, end, view, 0, b)).toEqual(source);
      expect(goatApproach(p, source, end, view, 1, b)).toEqual(end);
      for (let t = 0.01; t <= 1; t += 0.01) {
        const a = goatApproachFacing(p, source, end, b, t - 0.001),
          next = goatApproachFacing(p, source, end, b, t);
        expect(Math.abs(next - a)).toBeLessThan(0.04);
        goatWalk(herd, 100, next, 0, p.step, facing, p.order);
        for (const goat of herd.children) expect(Math.abs(goat.scale.x)).toBe(1);
      }
      herd.position.set(end.x, -end.y, 168.56);
      goatWalk(herd, 100, facing, 0, p.step, facing, p.order);
      herd.updateMatrixWorld(true);
      const before = herd.children.map((goat) =>
        Array.from({ length: 4 }, (_, i) => pos(part(goat, 'leg-' + i), 'sole').toArray()),
      );
      frame(trick, herd, 0, b, facing);
      expect(
        herd.children.map((goat) =>
          Array.from({ length: 4 }, (_, i) => pos(part(goat, 'leg-' + i), 'sole').toArray()),
        ),
      ).toEqual(before);
    }
    disposeObject(herd);
    disposeObject(trick.object);
  });
  it('responds to hoof landings and the optional stamp, then fully restores the card', () => {
    const herd = makeGoats(),
      effect = new LandingEffect('🐐', herd, 'card'),
      p = effect.planOf(goatCharacter);
    if (!p) throw Error('Missing plan');
    const animation = effect.cardAnimation(1);
    if (!animation) throw Error('Missing card animation');
    expect(effect.duration).toBe(GOAT_DURATION * p.pace);
    expect(animation.options.duration).toBe(effect.duration);
    for (const facing of [-1, 1]) {
      expect(goatCardPose(p, p.leader - 1, facing)).toEqual({ x: 0, y: 0, angle: 0, sx: 1, sy: 1 });
      for (const land of [p.leader, p.hits[0] + 400, p.hits[1] + 400])
        expect(goatCardPose(p, land + 90, facing).y).toBeCloseTo(6 * p.force, 6);
      expect(goatCardPose(p, p.hits[0], facing).y).toBe(0);
      expect(goatCardPose(p, GOAT_DURATION, facing)).toEqual({
        x: 0,
        y: 0,
        angle: 0,
        sx: 1,
        sy: 1,
      });
    }
    disposeObject(herd);
    disposeObject(effect.object);
  });
  it('retains the chosen edge and adapts real hoof and horn contacts through reflow', () => {
    const herd = makeGoats(),
      trick = new GoatTrick('reflow'),
      p = trick.plan,
      small = { left: 8, top: 500, width: 58, height: 84 };
    const first = goatLandingPoint(p, small, { x: 390, y: 844 }, source),
      facing = first.x > small.left + small.width / 2 ? -1 : 1;
    expect(facing).toBe(-1);
    const moved = { left: 560, top: 270, width: 84, height: 122 };
    const end = goatLandingPoint(p, moved, view, source, facing);
    expect(end.x).toBeGreaterThan(moved.left + moved.width);
    for (const bounds of [small, moved]) {
      frame(trick, herd, p.hits[1], bounds, facing);
      const king = herd.children[p.order[1]],
        challenger = herd.children[p.order[2]];
      if (!king || !challenger) throw Error('Missing goats');
      expect(pos(king, 'rump-contact').distanceTo(pos(challenger, 'horn-contact'))).toBeLessThan(
        1e-6,
      );
    }
    disposeObject(herd);
    disposeObject(trick.object);
  });
  it('leaves the viewport at full size with bounded resources, finite seeking and complete disposal', () => {
    const herd = makeGoats(),
      trick = new GoatTrick('exit'),
      meshes: THREE.Mesh[] = [];
    for (const root of [herd, trick.object])
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) meshes.push(o);
      });
    const geometries = new Set(meshes.map((o) => o.geometry));
    for (const facing of [-1, 1]) {
      for (let ms = 0; ms < GOAT_DURATION; ms += 113) {
        frame(trick, herd, ms, b, facing);
        herd.traverse((o) => {
          expect(
            [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()].every(
              Number.isFinite,
            ),
          ).toBe(true);
        });
      }
      frame(trick, herd, trick.plan.departure + 600 + 800 * trick.plan.exit, b, facing);
      const first = herd.children[trick.plan.order[0]],
        second = herd.children[trick.plan.order[1]],
        winner = herd.children[trick.plan.order[2]];
      if (!first || !second || !winner) throw Error('Missing herd');
      expect(
        Math.abs(
          first.getWorldPosition(new THREE.Vector3()).x -
            second.getWorldPosition(new THREE.Vector3()).x,
        ),
      ).toBeCloseTo(88, 6);
      expect(
        Math.abs(
          first.getWorldPosition(new THREE.Vector3()).x -
            winner.getWorldPosition(new THREE.Vector3()).x,
        ),
      ).toBeCloseTo(44, 6);
      expect(-first.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(b.top + b.height + 40);
      frame(trick, herd, GOAT_DURATION - 1, b, facing);
      expect(herd.visible).toBe(true);
      expect(herd.scale.x).toBe(GOAT_SCALE);
      for (const goat of herd.children) {
        const at = goat.getWorldPosition(new THREE.Vector3());
        expect(facing > 0 ? at.x < -89 : at.x > view.x + 89).toBe(true);
      }
      frame(trick, herd, GOAT_DURATION, b, facing);
      expect(herd.visible).toBe(false);
      expect(trick.object.visible).toBe(false);
      frame(trick, herd, pick(trick), b, facing);
      const matrices = herd.children.map((o) => o.matrixWorld.toArray());
      frame(trick, herd, 7200, b, facing);
      frame(trick, herd, pick(trick), b, facing);
      expect(herd.children.map((o) => o.matrixWorld.toArray())).toEqual(matrices);
    }
    const after: THREE.Mesh[] = [];
    for (const root of [herd, trick.object])
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) after.push(o);
      });
    expect(after).toHaveLength(meshes.length);
    expect(new Set(after.map((o) => o.geometry))).toEqual(geometries);
    const disposals = meshes.map((o) => vi.spyOn(o.geometry, 'dispose')),
      materials = meshes.flatMap((o) => (Array.isArray(o.material) ? o.material : [o.material]));
    const materialDisposals = materials.map((o) => vi.spyOn(o, 'dispose'));
    disposeObject(herd);
    disposeObject(trick.object);
    for (const disposed of [...disposals, ...materialDisposals])
      expect(disposed).toHaveBeenCalledOnce();
  });
});
function pick(trick: GoatTrick) {
  return trick.plan.hits[0] + 250;
}
