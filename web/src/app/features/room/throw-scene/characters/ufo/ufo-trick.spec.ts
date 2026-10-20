import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ProjectileSchema } from '@poker/shared';
import { UfoTrick } from './ufo-trick';
import { makeUfo } from './ufo-model';
import {
  UFO_DURATION,
  UFO_SCALE,
  ufoPlan,
  ufoLandingPoint,
  ufoApproach,
  ufoCardPose,
  ufoCardPoint,
} from './ufo-choreography';
import { requireSceneObject as part } from '../../engine/scene-object';
import { LandingEffect, landingKind } from '../../landing/landing-effects';
import { disposeObject } from '../../engine/throw-models';
import { approachPace } from '../../testing/approach-pace.testing';
import { ufoCharacter } from './ufo-character';
const b = { left: 360, top: 270, width: 84, height: 122 },
  view = { x: 900, y: 760 },
  start = { x: 100, y: 330 };
function update(
  trick: UfoTrick,
  craft: THREE.Group,
  parent: THREE.Group,
  ms: number,
  bounds = b,
  viewport = view,
) {
  const end = ufoLandingPoint(trick.plan, bounds, viewport);
  parent.position.set(end.x, -end.y, 150);
  trick.update(ms * trick.plan.pace, craft, bounds, end, viewport);
  parent.updateMatrixWorld(true);
  craft.updateMatrixWorld(true);
  return end;
}
function fixture(id: string) {
  const trick = new UfoTrick(id),
    craft = makeUfo(),
    parent = new THREE.Group();
  parent.add(trick.object);
  return { trick, craft, parent };
}
function clean(trick: UfoTrick, craft: THREE.Group) {
  disposeObject(craft);
  disposeObject(trick.object);
}
describe('Flying saucer tractor beam', () => {
  it('keeps its identity and shares reproducible choices with meaningful variations in every phase', () => {
    expect(ProjectileSchema.safeParse({ targetUserId: 'player', emoji: '🛸' }).success).toBe(true);
    expect(landingKind('🛸')).toBe('🛸');
    expect(ufoPlan('same')).toEqual(ufoPlan('same'));
    const plans = Array.from({ length: 40 }, (_, i) => ufoPlan('ufo-' + i));
    for (const key of [
      'pace',
      'lift',
      'hover',
      'faultAt',
      'release',
      'pause',
      'bend',
      'exit',
      'phase',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBeGreaterThan(20);
    expect(new Set(plans.map((p) => p.fault))).toEqual(new Set([true, false]));
    expect(new Set(plans.map((p) => p.scans))).toEqual(new Set([2, 3]));
    expect(new Set(plans.map((p) => p.side))).toEqual(new Set([-1, 1]));
    for (const p of plans) expect(p.release + 1100 + 1200 * p.exit).toBeLessThan(UFO_DURATION);
  });
  it('searches through a clear arc, slowing to scan without stopping dead, and arrives at the actual hover point', () => {
    for (let i = 0; i < 20; i++)
      for (const [bounds, from, viewport] of [
        [b, start, view],
        [b, { x: 820, y: 600 }, view],
        [
          { left: 160, top: 560, width: 58, height: 84 },
          { x: 189, y: 240 },
          { x: 390, y: 844 },
        ],
        [
          { left: 160, top: 200, width: 58, height: 84 },
          { x: 189, y: 640 },
          { x: 390, y: 844 },
        ],
      ] as const) {
        const p = ufoPlan('ufo-' + i),
          end = ufoLandingPoint(p, bounds, viewport),
          pace = approachPace((t) => ufoApproach(p, from, end, viewport, t));
        expect(pace.slowest).toBeGreaterThan(0.3);
        expect(pace.pace(0.7 + p.pause / 2)).toBeLessThan(1);
      }
    for (let i = 0; i < 8; i++) {
      const p = ufoPlan('ufo-' + i),
        end = ufoLandingPoint(p, b, view);
      expect(ufoApproach(p, start, end, view, 0)).toEqual(start);
      expect(ufoApproach(p, start, end, view, 1)).toEqual(end);
      for (let q = 0; q <= 1; q += 0.01) {
        const at = ufoApproach(p, start, end, view, q);
        expect(at.x).toBeGreaterThan(33);
        expect(at.x).toBeLessThan(view.x - 33);
        expect(at.y).toBeGreaterThan(34);
      }
    }
  });
  it('connects the beam to the actual gimballed aperture and live affine card in all phases', () => {
    for (let i = 0; i < 6; i++)
      for (const size of [
        { width: 84, height: 122 },
        { width: 58, height: 84 },
      ]) {
        const { trick, craft, parent } = fixture('ufo-' + i),
          bounds = { ...b, ...size },
          beam = part(trick.object, 'tractor-beam');
        if (!(beam instanceof THREE.Mesh)) throw Error('Missing beam mesh');
        for (const ms of [550, 1100, 1750, trick.plan.faultAt + 120, trick.plan.release + 400]) {
          update(trick, craft, parent, ms, bounds);
          const position = beam.geometry.getAttribute('position'),
            apex = part(craft, 'beam-origin').getWorldPosition(new THREE.Vector3());
          const at = beam.localToWorld(
            new THREE.Vector3(position.getX(0), position.getY(0), position.getZ(0)),
          );
          expect(at.distanceTo(apex)).toBeLessThan(0.0001);
          for (const vertex of [1, 2]) {
            const raw = {
                x: vertex === 1 ? bounds.left + 2 : bounds.left + bounds.width - 2,
                y: bounds.top + bounds.height * 0.62,
              },
              edge = ufoCardPoint(trick.plan, ms, raw, bounds),
              point = beam.localToWorld(
                new THREE.Vector3(
                  position.getX(vertex),
                  position.getY(vertex),
                  position.getZ(vertex),
                ),
              );
            expect(point.x).toBeCloseTo(edge.x, 3);
            expect(-point.y).toBeCloseTo(edge.y, 3);
            expect(point.z).toBeCloseTo(172, 5);
          }
        }
        clean(trick, craft);
      }
  });
  it('releases motes from the moving card face before drawing them into the real emitter', () => {
    const { trick, craft, parent } = fixture('motes'),
      p = trick.plan;
    for (let i = 0; i < 8; i++) {
      const phase = i / 8 + p.phase,
        ms = 600 + (Math.ceil(phase) - phase) * 1100 + 0.001;
      update(trick, craft, parent, ms);
      const mote = part(trick.object, 'mote-' + i),
        point = mote.getWorldPosition(new THREE.Vector3()),
        at = ufoCardPoint(
          p,
          ms,
          {
            x: b.left + b.width * (0.16 + i * 0.095),
            y: b.top + b.height * (0.65 + (i % 3) * 0.08),
          },
          b,
        );
      expect(point.x).toBeCloseTo(at.x, 4);
      expect(-point.y).toBeCloseTo(at.y, 4);
      expect(point.z).toBeCloseTo(172, 4);
    }
    clean(trick, craft);
  });
  it('synchronizes lift, failure dip, release and settling while preserving the card transform contract', () => {
    const craft = makeUfo(),
      effect = new LandingEffect('🛸', craft, 'ufo-0'),
      p = effect.planOf(ufoCharacter);
    if (!p) throw Error('Missing plan');
    const animation = effect.cardAnimation(1, b);
    if (!animation) throw Error('Missing animation');
    expect(animation.options.duration).toBe(effect.duration);
    expect(effect.duration).toBe(UFO_DURATION * p.pace);
    expect(ufoCardPose(p, 649, b)).toEqual({ x: 0, y: 0, angle: 0 });
    expect(ufoCardPose(p, 1200, b).y).toBeCloseTo(-p.lift, 5);
    for (let i = 0; i < 20; i++) {
      const q = ufoPlan('ufo-' + i);
      if (q.fault) {
        expect(
          ufoCardPose(q, q.faultAt + 120, b).y -
            ufoCardPose({ ...q, fault: false }, q.faultAt + 120, b).y,
        ).toBeCloseTo(3, 6);
      }
    }
    expect(ufoCardPose(p, p.release + 951, b)).toEqual({ x: 0, y: 0, angle: 0 });
    expect(ufoCardPose(p, UFO_DURATION, b)).toEqual({ x: 0, y: 0, angle: 0 });
    for (const frame of animation.frames) expect(frame['transform']).toBeUndefined();
    expect(animation.frames.at(-1)?.['translate']).toBe('0 0');
    expect(ufoCardPose(p, 1750, { ...b, top: 0 }).y).toBeGreaterThanOrEqual(0);
    cleanResources(effect, craft);
  });
  it('keeps the same hovering choice and adapts beam contacts at edges and after live reflow', () => {
    const { trick, craft, parent } = fixture('reflow'),
      before = trick.plan;
    for (const bounds of [
      { left: 8, top: 500, width: 58, height: 84 },
      { left: 320, top: 270, width: 84, height: 122 },
      { left: 820, top: 400, width: 58, height: 84 },
    ]) {
      const end = update(trick, craft, parent, 1750, bounds);
      expect(end.x).toBeGreaterThanOrEqual(34);
      expect(end.x).toBeLessThanOrEqual(view.x - 34);
      expect(trick.plan).toBe(before);
      const beam = part(trick.object, 'tractor-beam');
      if (!(beam instanceof THREE.Mesh)) throw Error('Missing beam');
      const positions = beam.geometry.getAttribute('position'),
        at = beam.localToWorld(
          new THREE.Vector3(positions.getX(0), positions.getY(0), positions.getZ(0)),
        );
      expect(
        at.distanceTo(part(craft, 'beam-origin').getWorldPosition(new THREE.Vector3())),
      ).toBeLessThan(0.0001);
    }
    clean(trick, craft);
  });
  it('physically escapes at full size, seeks deterministically and disposes every bounded resource', () => {
    for (let seed = 0; seed < 4; seed++) {
      const { trick, craft, parent } = fixture('ufo-' + seed),
        p = trick.plan,
        resources: THREE.Mesh[] = [];
      craft.traverse((o) => {
        if (o instanceof THREE.Mesh) resources.push(o);
      });
      trick.object.traverse((o) => {
        if (o instanceof THREE.Mesh) resources.push(o);
      });
      for (let ms = 0; ms < UFO_DURATION; ms += 79) {
        update(trick, craft, parent, ms);
        for (const root of [craft, trick.object])
          root.traverse((o) =>
            expect(
              [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()].every(
                Number.isFinite,
              ),
            ).toBe(true),
          );
      }
      const escape = p.release + 1100 + 1200 * p.exit;
      update(trick, craft, parent, escape - 1);
      expect(craft.visible).toBe(true);
      expect(craft.scale.x).toBe(UFO_SCALE);
      expect(p.side > 0 ? craft.position.x > view.x + 98 : craft.position.x < -98).toBe(true);
      expect(craft.position.y).toBeGreaterThan(88);
      update(trick, craft, parent, escape);
      expect(craft.visible).toBe(false);
      update(trick, craft, parent, UFO_DURATION);
      expect(trick.object.visible).toBe(false);
      update(trick, craft, parent, 1750);
      const matrix = craft.matrixWorld.toArray();
      update(trick, craft, parent, 6100);
      update(trick, craft, parent, 1750);
      expect(craft.matrixWorld.toArray()).toEqual(matrix);
      const after: THREE.Mesh[] = [];
      for (const root of [craft, trick.object])
        root.traverse((o) => {
          if (o instanceof THREE.Mesh) after.push(o);
        });
      expect(after).toEqual(resources);
      const objects: THREE.Mesh[] = [];
      const lines: THREE.Line[] = [];
      for (const root of [craft, trick.object])
        root.traverse((o) => {
          if (o instanceof THREE.Mesh) objects.push(o);
          else if (o instanceof THREE.Line) lines.push(o);
        });
      const all = [...objects, ...lines],
        disposals = all.map((o) => vi.spyOn(o.geometry, 'dispose')),
        materials = all.flatMap((o) => (Array.isArray(o.material) ? o.material : [o.material])),
        materialDisposals = materials.map((o) => vi.spyOn(o, 'dispose'));
      clean(trick, craft);
      for (const spy of [...disposals, ...materialDisposals]) expect(spy).toHaveBeenCalledOnce();
    }
  });
});
function cleanResources(effect: LandingEffect, craft: THREE.Group) {
  disposeObject(effect.object);
  disposeObject(craft);
}
