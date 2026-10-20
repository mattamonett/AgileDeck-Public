import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeDumpster, dumpsterModel, dumpsterWorldPoint, DUMPSTER_POINTS } from './dumpster-model';
import { DumpsterTrick, DUMPSTER_TONGUES } from './dumpster-trick';
import {
  DUMPSTER_DURATION,
  DUMPSTER_LID,
  DUMPSTER_REACH,
  dumpsterCardPoint,
  dumpsterCardPose,
  dumpsterFloor,
  dumpsterFrames,
  dumpsterPlan,
  dumpsterPose,
  dumpsterRest,
  dumpsterScale,
  dumpsterSlamHit,
  dumpsterTouchdown,
} from './dumpster-choreography';
import { LandingEffect, landingKind } from '../../landing/landing-effects';
import { disposeObject } from '../../engine/throw-models';
import { requireSceneObject } from '../../engine/scene-object';
import { projectileName } from '@features/room/projectile-names';
import { dumpsterCharacter } from './dumpster-character';

const b = { left: 600, top: 300, width: 84, height: 122 },
  start = { x: 260, y: 380 },
  view = { x: 1200, y: 850 };
const layouts = [
  { bounds: b, source: start, viewport: view },
  {
    bounds: { left: 6, top: 520, width: 58, height: 84 },
    source: { x: 300, y: 560 },
    viewport: { x: 390, y: 844 },
  },
  {
    bounds: { left: 326, top: 520, width: 58, height: 84 },
    source: { x: 60, y: 560 },
    viewport: { x: 390, y: 844 },
  },
];
function fixture(id: string) {
  const actor = makeDumpster(id),
    trick = new DumpsterTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, scene };
}
type Fixture = ReturnType<typeof fixture>;
function update(f: Fixture, ms: number, bounds = b, viewport = view, source = start) {
  f.trick.update(ms * f.trick.plan.pace, f.actor, source, bounds, viewport);
  f.scene.updateMatrixWorld(true);
}
function clean(f: Fixture) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}
const pos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
function extent(root: THREE.Object3D) {
  const box = new THREE.Box3(),
    point = new THREE.Vector3();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.visible) {
      const vertices = o.geometry.getAttribute('position');
      for (let n = 0; n < vertices.count; n++)
        box.expandByPoint(point.fromBufferAttribute(vertices, n).applyMatrix4(o.matrixWorld));
    }
  });
  return box;
}

describe('Dumpster Fire', () => {
  it('owns one reproducible plan whose choices vary every stage', () => {
    expect(projectileName('🗑️')).toBe('Dumpster Fire');
    expect(landingKind('🗑️')).toBe('🗑️');
    const actor = makeDumpster('native'),
      effect = new LandingEffect('🗑️', actor, 'native');
    expect(effect.planOf(dumpsterCharacter)).toBe(dumpsterModel(actor).plan);
    disposeObject(actor);
    disposeObject(effect.object);
    expect(dumpsterPlan('repeat')).toEqual(dumpsterPlan('repeat'));
    const plans = Array.from({ length: 60 }, (_, i) => dumpsterPlan('dumpster-' + i));
    for (const key of [
      'pace',
      'travel',
      'loft',
      'crack',
      'climb',
      'burnEnd',
      'wind',
      'shake',
      'slam',
      'exitEnd',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(60);
    for (const key of ['side', 'exit', 'backdraft', 'sputter', 'bump'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    expect(new Set(plans.map((p) => p.tumble)).size).toBe(3);
    expect(new Set(plans.map((p) => p.palette)).size).toBe(5);
    expect(new Set(plans.map((p) => p.puffs.length))).toEqual(new Set([1, 2, 3]));
    expect(new Set(plans.map((p) => p.skid > 0))).toEqual(new Set([true, false]));
    expect(new Set(plans.map((p) => p.flare === null)).size).toBe(2);
    for (const p of plans) {
      const beats = [
        p.travel,
        p.settled,
        ...p.puffs,
        p.open,
        p.climbStart,
        p.climbStart + p.climb,
        p.burnEnd,
        p.fadeEnd,
        p.slam,
        p.roll,
        p.exitEnd,
      ];
      for (let i = 1; i < beats.length; i++) expect(beats[i]).toBeGreaterThan(beats[i - 1] ?? 0);
      expect(p.exitEnd + 40).toBeLessThan(DUMPSTER_DURATION);
      expect(p.skid > 0).toBe(p.bounce === 0);
    }
  });

  it('is lobbed from the real source and comes down moving toward its chosen side inside the viewport', () => {
    for (let i = 0; i < 12; i++) {
      const p = dumpsterPlan('dumpster-' + i);
      for (const { bounds, source, viewport } of layouts) {
        const first = dumpsterPose(p, 0, source, bounds, viewport);
        expect(first.x).toBeCloseTo(source.x, 8);
        expect(first.y).toBeCloseTo(source.y, 8);
        const down = dumpsterTouchdown(p, bounds, viewport),
          last = dumpsterPose(p, p.travel - 0.01, source, bounds, viewport);
        expect(last.x).toBeCloseTo(down.x, 1);
        expect(last.y).toBeCloseTo(down.y, 1);
        expect(Math.abs(Math.sin(last.roll / 2))).toBeLessThan(0.01);
        expect(Math.abs(Math.sin(last.spin / 2))).toBeLessThan(0.01);
        const near = dumpsterPose(p, p.travel - 30, source, bounds, viewport);
        if (Math.min(down.x, viewport.x - down.x) > 60)
          expect(Math.sign(last.x - near.x)).toBe(p.side);
        expect(near.y).toBeLessThan(last.y);
        let previous = first;
        for (let ms = 10; ms <= p.travel + 600; ms += 10) {
          const q = dumpsterPose(p, ms, source, bounds, viewport);
          expect(Math.hypot(q.x - previous.x, q.y - previous.y)).toBeLessThan(25);
          expect(q.x).toBeGreaterThan(0);
          expect(q.x).toBeLessThan(viewport.x);
          expect(q.y).toBeGreaterThan(30);
          previous = q;
        }
      }
    }
  });

  it('rests its real wheels on the floor with the closed lid just under the card', () => {
    for (let seed = 0; seed < 6; seed++) {
      const f = fixture('dumpster-' + seed),
        p = f.trick.plan;
      for (const { bounds, source, viewport } of layouts) {
        const floor = dumpsterFloor(bounds, viewport);
        for (const ms of [
          p.travel + 100,
          p.travel + 460,
          p.settled - 10,
          p.roll + (p.exitEnd - p.roll) * 0.25,
        ]) {
          update(f, ms, bounds, viewport, source);
          expect(extent(f.actor).min.y).toBeCloseTo(-floor, 1);
          expect(f.actor.scale.z).toBeCloseTo(dumpsterScale(bounds), 8);
        }
        if (p.bounce) {
          update(f, p.travel + 290, bounds, viewport, source);
          expect(extent(f.actor).min.y).toBeGreaterThan(-floor + 1);
        }
        update(f, p.settled - 10, bounds, viewport, source);
        expect(-extent(f.actor).max.y).toBeCloseTo(bounds.top + bounds.height + 2, 0);
        const box = extent(f.actor);
        expect(box.min.x).toBeGreaterThan(0);
        expect(box.max.x).toBeLessThan(viewport.x);
      }
      const low = { left: 600, top: 760, width: 84, height: 122 };
      update(f, p.settled + 50, low);
      expect(-extent(f.actor).min.y).toBeLessThanOrEqual(view.y - 3 + 1e-6);
      clean(f);
    }
  });

  it('keeps its lids on their hinges, flips them over the back and slams them shut', () => {
    for (const id of ['dumpster-0', 'dumpster-1', 'dumpster-7']) {
      const f = fixture(id),
        p = f.trick.plan,
        model = dumpsterModel(f.actor);
      update(f, p.travel);
      expect(Math.abs(model.lids[0].rotation.x)).toBeLessThan(1e-6);
      update(f, p.open - 10);
      for (const lid of model.lids) expect(-lid.rotation.x).toBeGreaterThan(0.05);
      update(f, (p.climbStart + p.climb + p.burnEnd) / 2);
      for (const lid of model.lids) expect(-lid.rotation.x).toBeCloseTo(DUMPSTER_LID.open, 1);
      update(f, dumpsterSlamHit(p) + 1);
      for (const lid of model.lids) expect(Math.abs(lid.rotation.x)).toBeLessThan(0.08);
      let previous: number[] | null = null;
      for (let ms = 0; ms < p.exitEnd; ms += 5) {
        const lids = dumpsterPose(p, ms, start, b, view).lids;
        if (previous)
          lids.forEach((angle, i) =>
            expect(Math.abs(angle - (previous?.[i] ?? 0))).toBeLessThan(0.6),
          );
        previous = [...lids];
      }
      const hinge = pos(requireSceneObject(f.actor, 'hinge-knuckle')),
        left = pos(model.lids[0]);
      expect(Math.abs(hinge.z - left.z)).toBeLessThan(2);
      clean(f);
    }
  });

  it('starts fire in the real mouth after the lid opens and climbs the live card from the bottom', () => {
    const f = fixture('dumpster-0'),
      p = f.trick.plan;
    update(f, p.open - 5);
    expect(requireSceneObject(f.trick.object, 'mouth-flame-3').visible).toBe(false);
    expect(requireSceneObject(f.trick.object, 'card-flame-0').visible).toBe(false);
    update(f, p.climbStart + p.climb * 0.35);
    const pose = dumpsterPose(p, p.climbStart + p.climb * 0.35, start, b, view);
    expect(
      pos(requireSceneObject(f.trick.object, 'mouth-flame-0')).distanceTo(
        pos(requireSceneObject(f.actor, 'mouth-left')),
      ),
    ).toBeLessThan(1e-6);
    expect(
      pos(requireSceneObject(f.actor, 'mouth')).distanceTo(
        dumpsterWorldPoint(pose, DUMPSTER_POINTS.mouth),
      ),
    ).toBeLessThan(1e-6);
    expect(requireSceneObject(f.trick.object, 'card-flame-0').visible).toBe(true);
    expect(requireSceneObject(f.trick.object, 'card-flame-14').visible).toBe(false);
    const ms = p.climbStart + p.climb + 400;
    update(f, ms);
    DUMPSTER_TONGUES.forEach((tongue, i) => {
      const at = dumpsterCardPoint(
        p,
        ms,
        { x: b.left + tongue.u * b.width, y: b.top + b.height * (1 - tongue.v) },
        b,
      );
      const flame = pos(requireSceneObject(f.trick.object, `card-flame-${i}`));
      expect(requireSceneObject(f.trick.object, `card-flame-${i}`).visible).toBe(true);
      expect(flame.x).toBeCloseTo(at.x, 6);
      expect(flame.y).toBeCloseTo(-at.y, 6);
    });
    update(f, p.fadeEnd + 10);
    for (let i = 0; i < DUMPSTER_TONGUES.length; i++)
      expect(requireSceneObject(f.trick.object, `card-flame-${i}`).visible).toBe(false);
    clean(f);
  });

  it('shakes the card while it burns, jolts it at contact and slam, and restores it completely', () => {
    for (let i = 0; i < 8; i++) {
      const p = dumpsterPlan('dumpster-' + i),
        still = dumpsterCardPose(p, p.travel - 1);
      expect(still.x).toBeCloseTo(0, 8);
      expect(still.y).toBeCloseTo(0, 8);
      expect(still.angle).toBeCloseTo(0, 8);
      expect(dumpsterCardPose(p, p.travel + 120).y).toBeLessThan(-0.5);
      const burning = Array.from({ length: 20 }, (_, n) =>
        dumpsterCardPose(p, p.climbStart + p.climb + n * 37),
      );
      expect(Math.max(...burning.map((q) => Math.abs(q.x)))).toBeGreaterThan(0.4);
      expect(dumpsterCardPose(p, dumpsterSlamHit(p) + 130).y).toBeLessThan(-0.5);
      const end = dumpsterCardPose(p, p.roll);
      expect(Math.abs(end.x) + Math.abs(end.y) + Math.abs(end.angle)).toBeLessThan(1e-6);
      expect(dumpsterFrames(p).frames.at(-1)).toMatchObject({
        translate: '0px 0px',
        rotate: '0deg',
      });
    }
  });

  it('releases smoke, embers and burning scraps from their real origins', () => {
    const f = fixture('dumpster-0'),
      p = f.trick.plan,
      puff = p.puffs[0] ?? 0;
    update(f, puff);
    const seam = pos(requireSceneObject(f.actor, 'lid-seam')),
      smoke = requireSceneObject(f.trick.object, 'smoke-0');
    update(f, puff + 1);
    expect(smoke.visible).toBe(true);
    expect(Math.hypot(smoke.position.x - seam.x, smoke.position.y - seam.y)).toBeLessThan(0.2);
    for (let i = 0; i < 18; i++) {
      const birth = f.trick.emberBirth(i),
        tip = f.trick.tonguePose(birth.at, birth.tongue, b);
      if (tip.strength <= 0.25) continue;
      update(f, birth.at);
      const ember = pos(requireSceneObject(f.trick.object, `ember-${i}`));
      expect(ember.x).toBeCloseTo(tip.tip.x, 6);
      expect(ember.y).toBeCloseTo(-tip.tip.y, 6);
    }
    for (let i = 0; i < p.debris; i++) {
      const first = f.trick.debrisPose(p.open + 400 + i * 40, i, start, b, view, 1);
      const launch = first.t * 1000,
        born = f.trick.debrisPose(p.open + 400 + i * 40 - launch + 0.001, i, start, b, view, 1);
      const pose = dumpsterPose(p, p.open + 400 + i * 40 - launch, start, b, view),
        mouth = dumpsterWorldPoint(pose, DUMPSTER_POINTS.mouth);
      expect(Math.hypot(born.x - mouth.x, born.y - mouth.y)).toBeLessThan(0.2);
      const end = f.trick.debrisPose(
        p.open + 400 + i * 40 - launch + born.life * 1000,
        i,
        start,
        b,
        view,
        1,
      );
      expect(end.y).toBeCloseTo(mouth.y, 4);
      expect(Math.abs(end.x - mouth.x)).toBeLessThan(DUMPSTER_REACH * 0.5);
    }
    clean(f);
  });

  it('keeps its choices through reflow and recomputes positions against the live card', () => {
    const f = fixture('dumpster-3'),
      p = f.trick.plan,
      ms = p.climbStart + p.climb + 300,
      moved = { left: 300, top: 260, width: 58, height: 84 };
    update(f, ms);
    const before = f.trick.plan;
    update(f, ms, moved);
    expect(f.trick.plan).toBe(before);
    expect(f.actor.position.x).toBeCloseTo(dumpsterRest(moved, view).x, 0);
    const flame = pos(requireSceneObject(f.trick.object, 'card-flame-2')),
      tongue = DUMPSTER_TONGUES[2] ?? { u: 0, v: 0 };
    const at = dumpsterCardPoint(
      p,
      ms,
      { x: moved.left + tongue.u * moved.width, y: moved.top + moved.height * (1 - tongue.v) },
      moved,
    );
    expect(flame.x).toBeCloseTo(at.x, 6);
    expect(flame.y).toBeCloseTo(-at.y, 6);
    clean(f);
  });

  it('rolls fully off screen at full size, seeks deterministically and disposes its resources once', () => {
    for (const id of ['dumpster-0', 'dumpster-5']) {
      const f = fixture(id),
        p = f.trick.plan;
      update(f, p.exitEnd - 1);
      const box = extent(f.actor);
      expect(box.min.x > view.x || box.max.x < 0).toBe(true);
      expect(f.actor.scale.z).toBeCloseTo(dumpsterScale(b), 8);
      update(f, DUMPSTER_DURATION);
      expect(f.actor.visible).toBe(false);
      expect(f.trick.object.visible).toBe(false);
      clean(f);
    }
    const f = fixture('dumpster-0'),
      p = f.trick.plan,
      resources = new Set<THREE.BufferGeometry | THREE.Material>();
    for (const root of [f.actor, f.trick.object])
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          resources.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) resources.add(m);
        }
      });
    const probe = p.climbStart + p.climb + 200;
    update(f, probe);
    const before = pos(requireSceneObject(f.trick.object, 'card-flame-4')),
      lid = f.actor.getObjectByName('lid-left')?.rotation.x;
    update(f, p.exitEnd - 200);
    update(f, probe);
    expect(pos(requireSceneObject(f.trick.object, 'card-flame-4')).distanceTo(before)).toBeLessThan(
      1e-6,
    );
    expect(f.actor.getObjectByName('lid-left')?.rotation.x).toBe(lid);
    for (let ms = 0; ms <= DUMPSTER_DURATION; ms += 97) {
      update(f, ms);
      for (const root of [f.actor, f.trick.object])
        root.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    }
    const spies = Array.from(resources, (r) => vi.spyOn(r, 'dispose'));
    clean(f);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
