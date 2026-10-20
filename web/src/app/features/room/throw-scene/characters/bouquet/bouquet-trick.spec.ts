import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeBouquet, bouquetModel } from './bouquet-model';
import { BouquetTrick } from './bouquet-trick';
import {
  BOUQUET_DURATION,
  BOUQUET_SCALE,
  bouquetPlan,
  bouquetPose,
  bouquetOpen,
  bouquetCardPose,
  bouquetCardPoint,
  bouquetLandingPoint,
} from './bouquet-choreography';
import { LandingEffect } from '../../landing/landing-effects';
import { disposeObject } from '../../engine/throw-models';
import { requireSceneObject } from '../../engine/scene-object';
import { approachPace } from '../../testing/approach-pace.testing';
import { bouquetCharacter } from './bouquet-character';
const b = { left: 600, top: 420, width: 84, height: 122 },
  start = { x: 260, y: 480 },
  view = { x: 1200, y: 850 };
function fixture(id: string) {
  const actor = makeBouquet(id),
    trick = new BouquetTrick(actor),
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
  f.trick.update(ms * f.trick.plan.pace, f.actor, start, bounds, viewport, facing);
  f.scene.updateMatrixWorld(true);
}
const pos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
function bottom(root: THREE.Object3D) {
  let low = Infinity;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.visible) {
      const v = o.geometry.getAttribute('position');
      for (let n = 0; n < v.count; n++)
        low = Math.min(
          low,
          new THREE.Vector3().fromBufferAttribute(v, n).applyMatrix4(o.matrixWorld).y,
        );
    }
  });
  return low;
}
function clean(f: ReturnType<typeof fixture>) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}
describe('affectionate blooming bouquet', () => {
  it('owns one reproducible plan with compatible choices through every stage and enough time for the finish', () => {
    const actor = makeBouquet('shared'),
      effect = new LandingEffect('💐', actor, 'shared');
    expect(effect.planOf(bouquetCharacter)).toBe(bouquetModel(actor).plan);
    expect(bouquetPlan('repeat')).toEqual(bouquetPlan('repeat'));
    const plans = Array.from({ length: 40 }, (_, i) => bouquetPlan('bouquet-' + i));
    for (const key of [
      'pace',
      'travel',
      'pause',
      'loft',
      'settle',
      'land',
      'bloom',
      'lag',
      'phase',
      'force',
      'lean',
      'departure',
      'lie',
      'cleanup',
      'breeze',
    ] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(40);
    for (const key of ['side', 'shy', 'lilac'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    expect(new Set(plans.map((p) => p.order.join())).size).toBeGreaterThan(20);
    expect(new Set(plans.map((p) => p.shyFlower)).size).toBe(5);
    for (const p of plans) {
      expect(p.cleanup + 800).toBeLessThan(BOUQUET_DURATION);
      expect(p.departure + p.lie + 400).toBeLessThan(p.cleanup);
    }
    disposeObject(actor);
    disposeObject(effect.object);
  });
  it('uses five connected fixed stems, hinged layered petals, rooted leaves and a real cut-stem contact', () => {
    const f = fixture('native'),
      model = bouquetModel(f.actor);
    expect(model.flowers).toHaveLength(5);
    expect(new Set(model.sources.map((p) => p.mesh)).size).toBe(8);
    for (const flower of model.flowers) {
      const stem = requireSceneObject(flower.branch, 'joined-stem');
      if (!(stem instanceof THREE.Mesh) || !(stem.geometry instanceof THREE.TubeGeometry))
        throw Error('Missing real stem');
      const end = stem.geometry.parameters.path.getPoint(1);
      expect(end.distanceTo(flower.head.position)).toBeLessThan(0.000001);
      expect(flower.head.parent).toBe(flower.branch);
      for (const petal of flower.petals) {
        expect(petal.mesh.parent).toBe(petal.hinge);
        expect(petal.hinge.parent).toBe(flower.head);
      }
    }
    const stem = requireSceneObject(f.actor, 'cut-stem-2'),
      contact = requireSceneObject(f.actor, 'stem-contact');
    if (!(stem instanceof THREE.Mesh)) throw Error('Missing cut stem');
    const points = stem.geometry.getAttribute('position');
    let nearest = Infinity;
    for (let n = 0; n < points.count; n++)
      nearest = Math.min(
        nearest,
        new THREE.Vector3()
          .fromBufferAttribute(points, n)
          .add(stem.position)
          .distanceTo(contact.position),
      );
    expect(nearest).toBeLessThan(0.000001);
    clean(f);
  });
  it('drifts shyly through its hesitation without ever stopping dead on the approach', () => {
    for (let i = 0; i < 20; i++)
      for (const [bounds, from, viewport] of [
        [b, start, view],
        [b, { x: 1000, y: 200 }, view],
        [
          { left: 8, top: 500, width: 58, height: 84 },
          { x: 300, y: 700 },
          { x: 390, y: 844 },
        ],
        [
          { left: 160, top: 200, width: 58, height: 84 },
          { x: 189, y: 640 },
          { x: 390, y: 844 },
        ],
      ] as const) {
        const p = bouquetPlan('bouquet-' + i),
          pace = approachPace(
            (t) =>
              bouquetPose(p, Math.min(t, 0.999999) * p.travel, from, bounds, viewport, p.side)
                .point,
          );
        expect(pace.slowest).toBeGreaterThan(0.3);
        expect(pace.pace(0.65 + p.pause / 2)).toBeLessThan(1);
      }
    const f = fixture('bouquet-0'),
      p = f.trick.plan;
    update(f, p.travel * (0.65 + p.pause * 0.2));
    const before = f.actor.position.clone();
    update(f, p.travel * (0.65 + p.pause * 0.8));
    expect(f.actor.position.distanceTo(before)).toBeGreaterThan(1);
    clean(f);
  });
  it('starts at the true sender, bounds both approaches and joins landing/lay poses continuously', () => {
    for (let i = 0; i < 8; i++) {
      const f = fixture('bouquet-' + i),
        p = f.trick.plan;
      update(f, 0);
      expect(f.actor.position.x).toBe(start.x);
      expect(f.actor.position.y).toBe(-start.y);
      for (const at of [p.travel, p.land, p.departure, p.departure + p.lie]) {
        update(f, at - 0.01);
        const point = f.actor.position.clone(),
          turn = f.actor.quaternion.clone();
        update(f, at + 0.01);
        expect(f.actor.position.distanceTo(point), `${i}, ${at}`).toBeLessThan(0.01);
        expect(f.actor.quaternion.angleTo(turn)).toBeLessThan(0.001);
      }
      for (const bounds of [
        b,
        { left: 8, top: 500, width: 58, height: 84 },
        { left: 320, top: 500, width: 58, height: 84 },
      ]) {
        const vp = bounds === b ? view : { x: 390, y: 844 },
          end = bouquetLandingPoint(p, bounds, vp),
          facing = Math.sign(bounds.left + bounds.width / 2 - end.x) || 1;
        const source = bounds === b ? start : { x: 150, y: 540 };
        for (let t = 0; t <= 1; t += 0.01) {
          const q = bouquetPose(p, t * p.travel, source, bounds, vp, facing);
          expect(q.point.x).toBeGreaterThan(0);
          expect(q.point.x).toBeLessThan(vp.x);
          expect(q.point.y).toBeGreaterThan(48);
        }
      }
      clean(f);
    }
  });
  it('plants the actual stem tip on current affine cards before their gentle response, retaining the chosen side through reflow', () => {
    const f = fixture('bouquet-0'),
      p = f.trick.plan;
    for (const bounds of [
      b,
      { left: 8, top: 500, width: 58, height: 84 },
      { left: 320, top: 500, width: 58, height: 84 },
    ])
      for (const at of [p.land, p.land + 150, p.land + p.lag + 150, p.departure - 1]) {
        update(f, at, bounds);
        const anchor = bouquetLandingPoint(p, bounds, view, p.side),
          tip = pos(requireSceneObject(f.actor, 'stem-contact')),
          q = bouquetCardPoint(p, at, anchor, bounds, p.side);
        expect(tip.x).toBeCloseTo(q.x, 6);
        expect(tip.y).toBeCloseTo(-q.y, 6);
        expect(tip.z).toBeCloseTo(172, 6);
        expect(Math.sign(bounds.left + bounds.width / 2 - anchor.x)).toBe(p.side);
      }
    expect(bouquetCardPose(p, p.land - 1, p.side).y).toBe(0);
    expect(bouquetCardPose(p, p.land + 150, p.side).y).toBeGreaterThan(1);
    clean(f);
  });
  it('keeps a shy bud closed longer while every branch remains joined and every bud opens before shedding', () => {
    const shy = Array.from({ length: 20 }, (_, i) => bouquetPlan('bouquet-' + i)).find(
      (p) => p.shy,
    );
    if (!shy) throw Error('Missing shy variant');
    const ordinary = shy.order.find((i) => i !== shy.shyFlower);
    if (ordinary === undefined) throw Error('Missing ordinary bud');
    const time = shy.land + shy.lag * 0.7;
    expect(bouquetOpen(shy, time, shy.shyFlower)).toBe(0.15);
    expect(bouquetOpen(shy, time, ordinary)).toBeGreaterThan(0.15);
    const first = shy.petals[0];
    if (first === undefined) throw Error('Missing shedding');
    for (let i = 0; i < 5; i++) expect(bouquetOpen(shy, first, i)).toBe(1);
  });
  it('detaches actual outer petals with matching vertex poses, then rests their real geometry before cleanup', () => {
    for (let seed = 0; seed < 4; seed++) {
      const f = fixture('bouquet-' + seed),
        p = f.trick.plan,
        model = bouquetModel(f.actor);
      model.sources.forEach((source, i) => {
        const born = p.petals[i];
        if (born === undefined) throw Error('Missing petal');
        update(f, born);
        const drifting = requireSceneObject(f.trick.object, 'drifting-petal-' + i);
        expect(source.mesh.visible).toBe(false);
        expect(drifting.visible).toBe(true);
        expect(pos(drifting).distanceTo(pos(source.mesh))).toBeLessThan(0.000001);
        expect(
          drifting
            .getWorldQuaternion(new THREE.Quaternion())
            .angleTo(source.mesh.getWorldQuaternion(new THREE.Quaternion())),
        ).toBeLessThan(0.000001);
        if (!(drifting instanceof THREE.Mesh)) throw Error('Missing petal mesh');
        const nativeVertex = new THREE.Vector3()
          .fromBufferAttribute(source.mesh.geometry.getAttribute('position'), 3)
          .applyMatrix4(source.mesh.matrixWorld);
        const driftVertex = new THREE.Vector3()
          .fromBufferAttribute(drifting.geometry.getAttribute('position'), 3)
          .applyMatrix4(drifting.matrixWorld);
        expect(nativeVertex.distanceTo(driftVertex)).toBeLessThan(0.000001);
        update(f, p.cleanup - 1);
        expect(bottom(drifting)).toBeCloseTo(-b.top - b.height - 23, 5);
      });
      clean(f);
    }
  });
  it('lays the full-size gift onto its measured underside and anchors the growing border to the live card', () => {
    for (let seed = 0; seed < 6; seed++) {
      const f = fixture('bouquet-' + seed),
        p = f.trick.plan;
      for (const bounds of [
        b,
        { left: 8, top: 500, width: 58, height: 84 },
        { left: 320, top: 500, width: 58, height: 84 },
      ]) {
        update(f, p.land, bounds);
        const line = requireSceneObject(f.trick.object, 'gift-vine-0');
        if (!(line instanceof THREE.Line)) throw Error('Missing vine');
        const point = new THREE.Vector3().fromBufferAttribute(
            line.geometry.getAttribute('position'),
            0,
          ),
          anchor = bouquetLandingPoint(p, bounds, view, p.side);
        expect(point.x).toBeCloseTo(anchor.x, 4);
        expect(point.y).toBeCloseTo(-anchor.y, 4);
        update(f, p.departure + p.lie + 100, bounds);
        expect(bottom(f.actor)).toBeCloseTo(-bounds.top - bounds.height - 23, 5);
        expect(f.actor.scale.x).toBe(BOUQUET_SCALE);
      }
      clean(f);
    }
  });
  it('seeks deterministically with finite transforms, preserves reveal-safe neutral frames and disposes fixed resources once', () => {
    const f = fixture('bouquet-0'),
      p = f.trick.plan,
      resources = new Set<THREE.BufferGeometry | THREE.Material>();
    for (const root of [f.actor, f.trick.object])
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          resources.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) resources.add(m);
        }
      });
    update(f, p.departure + 300);
    const before = f.actor.position.clone(),
      rotation = f.actor.quaternion.clone();
    update(f, p.cleanup + 200);
    update(f, p.departure + 300);
    expect(f.actor.position.distanceTo(before)).toBeLessThan(0.000001);
    expect(f.actor.quaternion.angleTo(rotation)).toBeLessThan(0.000001);
    for (let ms = 0; ms <= BOUQUET_DURATION; ms += 113) {
      update(f, ms);
      for (const root of [f.actor, f.trick.object])
        root.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    }
    expect(f.trick.cardAnimation(p.side).frames.at(-1)).toMatchObject({
      translate: '0px 0px',
      rotate: '0deg',
      scale: '1 1',
    });
    update(f, BOUQUET_DURATION);
    expect(f.actor.visible).toBe(false);
    expect(f.trick.object.visible).toBe(false);
    const spies = Array.from(resources, (r) => vi.spyOn(r, 'dispose'));
    clean(f);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
