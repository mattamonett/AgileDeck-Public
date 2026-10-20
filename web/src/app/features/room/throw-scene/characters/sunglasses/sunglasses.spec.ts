import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeSunglasses, sunglassesModel, sunglassesTravel } from './sunglasses';
import {
  SunglassesTrick,
  glassFragmentPose,
  flamePose,
  flameTip,
  flameBase,
} from './sunglasses-trick';
import {
  SUNGLASSES_DURATION,
  SUNGLASSES_SCALE,
  sunglassesPlan,
  sunglassesApproach,
  sunglassesLandingPoint,
  sunglassesCardPose,
  sunglassesCardPoint,
} from './sunglasses-choreography';
import { LandingEffect } from '../../landing/landing-effects';
import { disposeObject } from '../../engine/throw-models';
import { approachPace } from '../../testing/approach-pace.testing';
import { requireSceneObject } from '../../engine/scene-object';
import { sunglassesCharacter } from './sunglasses-character';

const b = { left: 400, top: 400, width: 84, height: 122 },
  view = { x: 1200, y: 850 };
function fixture(id: string) {
  const craft = makeSunglasses(id),
    trick = new SunglassesTrick(craft),
    parent = new THREE.Group();
  parent.add(trick.object);
  return { craft, trick, parent, model: sunglassesModel(craft) };
}
function update(f: ReturnType<typeof fixture>, ms: number, bounds = b) {
  const end = sunglassesLandingPoint(bounds);
  f.parent.position.set(end.x, -end.y, 150);
  f.trick.update(ms * f.trick.plan.pace, f.craft, bounds, end);
  f.parent.updateMatrixWorld(true);
  f.craft.updateMatrixWorld(true);
}
function clean(f: ReturnType<typeof fixture>) {
  disposeObject(f.craft);
  disposeObject(f.trick.object);
}
function mesh(object: THREE.Object3D, name: string) {
  const part = requireSceneObject(object, name);
  if (!(part instanceof THREE.Mesh)) throw Error('Missing mesh');
  return part;
}
describe('sunglasses shatter and fire', () => {
  it('samples one shared plan and varies every stage reproducibly', () => {
    const craft = makeSunglasses('shared'),
      effect = new LandingEffect('🕶️', craft, 'shared');
    expect(effect.planOf(sunglassesCharacter)).toBe(sunglassesModel(craft).plan);
    expect(effect.duration).toBe(SUNGLASSES_DURATION * sunglassesModel(craft).plan.pace);
    const plans = Array.from({ length: 40 }, (_, i) => sunglassesPlan('shades-' + i));
    expect(sunglassesPlan('shared')).toEqual(sunglassesPlan('shared'));
    for (const key of ['pace', 'bend', 'pause', 'hit', 'force', 'burn', 'wind', 'phase'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(40);
    for (const key of ['side', 'bilateral', 'bronze'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    disposeObject(craft);
    disposeObject(effect.object);
  });
  it('cruises slowly through its posing beat without stopping dead on a bounded route', () => {
    for (let seed = 0; seed < 20; seed++)
      for (const [bounds, from, viewport] of [
        [b, { x: 250, y: 610 }, view],
        [b, { x: 1000, y: 200 }, view],
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
        const p = sunglassesPlan('shades-' + seed),
          end = sunglassesLandingPoint(bounds);
        const pace = approachPace((t) => sunglassesApproach(p, from, end, viewport, t));
        expect(pace.slowest).toBeGreaterThan(0.3);
        expect(pace.pace(0.64 + p.pause / 2)).toBeLessThan(1);
      }
  });
  it('arrives on a bounded route in the exact intact landing pose', () => {
    for (let seed = 0; seed < 8; seed++) {
      const f = fixture('shades-' + seed),
        p = f.trick.plan,
        start = { x: 250, y: 610 },
        end = sunglassesLandingPoint(b);
      expect(sunglassesApproach(p, start, end, view, 0)).toEqual(start);
      expect(sunglassesApproach(p, start, end, view, 1)).toEqual(end);
      for (let t = 0; t <= 1; t += 0.01) {
        const at = sunglassesApproach(p, start, end, view, t);
        expect(at.x).toBeGreaterThan(0);
        expect(at.x).toBeLessThan(view.x);
        expect(at.y).toBeGreaterThan(0);
      }
      sunglassesTravel(f.craft, 1);
      f.craft.position.set(end.x, -end.y, 194.4);
      f.craft.updateMatrix();
      const arrival = f.craft.matrix.clone();
      update(f, 0);
      f.craft.matrix.elements.forEach((value, i) =>
        expect(value).toBeCloseTo(arrival.elements[i] ?? Infinity, 10),
      );
      expect(f.model.intact.visible).toBe(true);
      expect(f.model.shards.visible).toBe(false);
      clean(f);
    }
  });
  it('matches the original lenses with shards and releases every piece from its native birth pose', () => {
    const f = fixture('shades-0');
    update(f, f.trick.plan.hit);
    for (const side of [-1, 1]) {
      const temple = mesh(f.craft, `temple-${side}`),
        ear = mesh(f.craft, `ear-${side}`);
      if (!(ear.geometry instanceof THREE.TubeGeometry)) throw Error('Missing connected ear hook');
      const stemEnd = temple.localToWorld(new THREE.Vector3(0, 0, -8));
      const hookStart = ear.localToWorld(ear.geometry.parameters.path.getPoint(0));
      expect(stemEnd.distanceTo(hookStart)).toBeLessThan(0.00001);
    }
    const originalArea = f.model.intact.children
      .filter((o) => o instanceof THREE.Mesh && o.geometry instanceof THREE.CircleGeometry)
      .reduce(
        (sum, o) =>
          o instanceof THREE.Mesh ? sum + triangleArea(o.geometry) * o.scale.x * o.scale.y : sum,
        0,
      );
    const brokenArea = f.model.fragments
      .filter((o) => o.mesh.geometry instanceof THREE.ShapeGeometry)
      .reduce((sum, o) => sum + triangleArea(o.mesh.geometry), 0);
    expect(brokenArea).toBeCloseTo(originalArea, 3);
    for (const fragment of f.model.fragments) {
      expect(fragment.mesh.position.distanceTo(fragment.position)).toBeLessThan(0.00001);
      expect(fragment.mesh.rotation.toArray()).toEqual(fragment.rotation.toArray());
    }
    const contact = requireSceneObject(f.craft, 'bridge-contact').getWorldPosition(
      new THREE.Vector3(),
    );
    expect(contact.z).toBeCloseTo(172, 6);
    const flash = mesh(f.trick.object, 'impact-flash').getWorldPosition(new THREE.Vector3());
    expect(flash.x).toBeCloseTo(contact.x, 6);
    expect(flash.y).toBeCloseTo(contact.y, 6);
    expect(f.model.intact.visible).toBe(false);
    expect(f.model.shards.visible).toBe(true);
    clean(f);
  });
  it('synchronizes paced recoil and ignition with the real contact then restores individual transforms', () => {
    const craft = makeSunglasses('recoil'),
      effect = new LandingEffect('🕶️', craft, 'recoil'),
      p = sunglassesModel(craft).plan;
    expect(sunglassesCardPose(p, p.hit)).toEqual({ x: 0, y: 0, angle: 0 });
    expect(sunglassesCardPose(p, p.hit + 120).y).toBeGreaterThan(1);
    expect(sunglassesCardPose(p, p.hit + 3600)).toEqual({ x: 0, y: 0, angle: 0 });
    const frames = effect.cardAnimation();
    if (!frames) throw Error('Missing card animation');
    expect(frames.options.duration).toBe(effect.duration);
    for (const frame of frames.frames) expect(frame['transform']).toBeUndefined();
    expect(frames.frames.at(-1)?.['translate']).toBe('0 0');
    const f = fixture('recoil');
    update(f, p.hit - 1);
    expect(mesh(f.trick.object, 'impact-flash').visible).toBe(false);
    update(f, p.hit);
    expect(mesh(f.trick.object, 'impact-flash').visible).toBe(true);
    const first = p.side < 0 ? 0 : 1;
    expect(flamePose(p, p.hit + 120, b, first).strength).toBe(0);
    expect(flamePose(p, p.hit + 300, b, first).strength).toBeGreaterThan(0);
    clean(f);
    disposeObject(craft);
    disposeObject(effect.object);
  });
  it('anchors each flame to the live affine card and releases embers from its actual flame tip', () => {
    for (let seed = 0; seed < 4; seed++) {
      const f = fixture('shades-' + seed),
        p = f.trick.plan;
      for (const bounds of [
        b,
        { left: 10, top: 500, width: 58, height: 84 },
        { left: 320, top: 260, width: 58, height: 84 },
      ]) {
        for (const age of [260, 650, 1400]) {
          update(f, p.hit + age, bounds);
          for (let i = 0; i < 12; i++) {
            const base = flameBase(p, bounds, i),
              expected = sunglassesCardPoint(p, p.hit + age, base.raw, bounds);
            const at = requireSceneObject(f.trick.object, 'flame-' + i).getWorldPosition(
              new THREE.Vector3(),
            );
            expect(at.x).toBeCloseTo(expected.x, 6);
            expect(at.y).toBeCloseTo(-expected.y, 6);
          }
        }
        for (let i = 0; i < 18; i++) {
          const index = i % 12,
            birth = p.hit + 360 + flameBase(p, bounds, index).delay + Math.floor(i / 12) * 230;
          update(f, birth, bounds);
          const expected = flameTip(p, birth, bounds, index),
            at = mesh(f.trick.object, 'ember-' + i).getWorldPosition(new THREE.Vector3());
          expect(at.x).toBeCloseTo(expected.x, 6);
          expect(at.y).toBeCloseTo(-expected.y, 6);
          expect(at.z).toBe(176);
        }
      }
      clean(f);
    }
  });
  it('bounces each fragment continuously and plants its actual lowest vertex on the floor before cleanup', () => {
    for (let seed = 0; seed < 4; seed++) {
      const f = fixture('shades-' + seed),
        p = f.trick.plan;
      for (const fragment of f.model.fragments) {
        const birth = glassFragmentPose(fragment, p, 0, b),
          landing = birth.landing * 1000;
        expect(glassFragmentPose(fragment, p, landing - 0.01, b).y).toBeCloseTo(
          glassFragmentPose(fragment, p, landing + 0.01, b).y,
          2,
        );
        expect(
          glassFragmentPose(fragment, p, landing + birth.bounceDuration * 500, b).y,
        ).toBeLessThan(b.top + b.height + 24);
      }
      update(f, p.hit + 2400);
      for (const fragment of f.model.fragments) {
        const positions = fragment.mesh.geometry.getAttribute('position'),
          point = new THREE.Vector3();
        let lowest = Infinity;
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i);
          fragment.mesh.localToWorld(point);
          lowest = Math.min(lowest, point.y);
        }
        expect(lowest).toBeCloseTo(-(b.top + b.height + 24), 4);
      }
      const before = f.model.fragments.map((frag) => frag.mesh.position.clone());
      update(f, p.hit + 2490);
      f.model.fragments.forEach((frag, i) => {
        const prior = before[i];
        if (!prior) throw Error('Missing fragment');
        expect(frag.mesh.position.distanceTo(prior)).toBeLessThan(0.00001);
      });
      clean(f);
    }
  });
  it('retains the plan across reflow and restores all effects with deterministic seeking and bounded disposal', () => {
    for (let seed = 0; seed < 4; seed++) {
      const f = fixture('shades-' + seed),
        p = f.trick.plan,
        resources: (THREE.Mesh | THREE.Line)[] = [];
      for (const root of [f.craft, f.trick.object])
        root.traverse((o) => {
          if (o instanceof THREE.Mesh || o instanceof THREE.Line) resources.push(o);
        });
      for (let ms = 0; ms <= SUNGLASSES_DURATION; ms += 113) {
        update(f, ms);
        expect(f.craft.scale.x).toBe(SUNGLASSES_SCALE);
        for (const root of [f.craft, f.trick.object])
          root.traverse((o) =>
            expect(
              [...o.position.toArray(), ...o.scale.toArray(), ...o.quaternion.toArray()].every(
                Number.isFinite,
              ),
            ).toBe(true),
          );
      }
      update(f, p.hit + 700);
      const matrix = mesh(f.trick.object, 'ember-0').matrixWorld.toArray();
      update(f, 4300);
      update(f, p.hit + 700);
      expect(mesh(f.trick.object, 'ember-0').matrixWorld.toArray()).toEqual(matrix);
      update(f, p.hit + 800, { left: 15, top: 200, width: 58, height: 84 });
      expect(f.trick.plan).toBe(p);
      update(f, SUNGLASSES_DURATION);
      expect(f.craft.visible).toBe(false);
      expect(f.trick.object.visible).toBe(false);
      for (const fragment of f.model.fragments) expect(fragment.mesh.material.opacity).toBe(0);
      const after: (THREE.Mesh | THREE.Line)[] = [];
      for (const root of [f.craft, f.trick.object])
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
function triangleArea(geometry: THREE.BufferGeometry) {
  const vertices = geometry.getAttribute('position'),
    indices = geometry.index,
    count = indices?.count ?? vertices.count;
  let area = 0;
  for (let i = 0; i < count; i += 3) {
    const a = indices?.getX(i) ?? i,
      c = indices?.getX(i + 1) ?? i + 1,
      d = indices?.getX(i + 2) ?? i + 2;
    area +=
      Math.abs(
        (vertices.getX(c) - vertices.getX(a)) * (vertices.getY(d) - vertices.getY(a)) -
          (vertices.getY(c) - vertices.getY(a)) * (vertices.getX(d) - vertices.getX(a)),
      ) / 2;
  }
  return area;
}
