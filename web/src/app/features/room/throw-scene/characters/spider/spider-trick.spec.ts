import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeSpider, spiderModel } from './spider-model';
import { SpiderTrick } from './spider-trick';
import {
  SPIDER_DURATION,
  SPIDER_HUB,
  spiderAnchor,
  spiderBiteSpot,
  spiderCardPose,
  spiderLandingPoint,
  spiderPlan,
} from './spider-choreography';
import { onCard, screenOf, sideOf } from '../../kit';
import { disposeObject } from '../../engine/throw-models';

const view = { x: 1200, y: 850 },
  start = { x: 260, y: 480 },
  card = { left: 600, top: 420, width: 84, height: 122 };
const layouts = [
  card,
  { left: 8, top: 500, width: 58, height: 84 },
  { left: 1120, top: 500, width: 58, height: 84 },
];
function fixture(id: string) {
  const actor = makeSpider(id),
    trick = new SpiderTrick(actor),
    scene = new THREE.Scene();
  scene.add(actor, trick.object);
  return { actor, trick, plan: trick.plan, model: spiderModel(actor) };
}
type Fixture = ReturnType<typeof fixture>;
const sideFor = (f: Fixture, b = card) =>
  sideOf(b.left + b.width / 2 - spiderLandingPoint(f.plan, b, view).x);
function at(f: Fixture, ms: number, b = card, facing = sideFor(f, b)) {
  f.trick.update(ms * f.plan.pace, f.actor, start, b, view, facing);
  f.actor.updateMatrixWorld(true);
  f.trick.object.updateMatrixWorld(true);
}
function linePoint(f: Fixture, name: string, i: number) {
  const line = f.trick.object.getObjectByName(name);
  if (!(line instanceof THREE.Line)) throw new Error(`Missing ${name}`);
  const p = line.geometry.getAttribute('position');
  return { x: p.getX(i), y: -p.getY(i), count: p.count, visible: line.visible };
}
function clean(f: Fixture) {
  disposeObject(f.actor);
  disposeObject(f.trick.object);
}
const NEUTRAL = { x: 0, y: 0, angle: 0, sx: 1, sy: 1 };

describe('giant spider performance', () => {
  it('samples a reproducible plan whose descent, web, bites and exits vary', () => {
    expect(spiderPlan('again')).toEqual(spiderPlan('again'));
    const plans = Array.from({ length: 40 }, (_, i) => spiderPlan(`spider-${i}`));
    for (const key of ['travel', 'bend', 'squeeze', 'biteAngle'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(40);
    for (const key of ['plummet', 'spokes', 'turn', 'bites', 'climb'] as const)
      expect(new Set(plans.map((p) => p[key])).size).toBe(2);
    for (const p of plans) expect(p.exitEnd + 300).toBeLessThan(SPIDER_DURATION);
  });

  it('keeps all eight jointed legs at fixed lengths through the routine', () => {
    const f = fixture('spider-1');
    for (let ms = 0; ms < f.plan.exitEnd; ms += 89) {
      at(f, ms);
      for (const { limb } of f.model.legs) {
        expect(limb.joint.position.length()).toBeCloseTo(limb.lengths[0], 4);
        expect(limb.end.position.distanceTo(limb.joint.position)).toBeCloseTo(limb.lengths[1], 4);
      }
    }
    expect(f.model.legs).toHaveLength(8);
    clean(f);
  });

  it('hangs on a dragline from above and pays each spoke out of its real spinneret', () => {
    for (const id of ['spider-0', 'spider-2']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(f, b),
          anchor = spiderAnchor(b, facing);
        at(f, (p.descend + p.landed) / 2, b, facing);
        const spinneret = screenOf(f.model.spinneret);
        const top = linePoint(f, 'spider-dragline-silk', 0),
          bottom = linePoint(f, 'spider-dragline-silk', 1);
        expect(top.visible).toBe(true);
        expect(top.x).toBeCloseTo(anchor.x, 4);
        expect(top.y).toBeCloseTo(anchor.y, 4);
        expect(Math.hypot(bottom.x - spinneret.x, bottom.y - spinneret.y)).toBeLessThan(1e-4);
        at(f, p.weave + 60, b, facing);
        const laying = linePoint(f, 'spider-spoke-0', 0),
          silk = screenOf(f.model.spinneret);
        expect(Math.hypot(laying.x - silk.x, laying.y - silk.y)).toBeLessThan(1e-4);
        at(f, p.tighten + 500, b, facing);
        const hub = onCard(
          spiderCardPose(p, p.tighten + 500, facing),
          SPIDER_HUB.u,
          SPIDER_HUB.v,
          b,
        );
        const fixed = linePoint(f, 'spider-spoke-0', 0);
        expect(Math.hypot(fixed.x - hub.x, fixed.y - hub.y)).toBeLessThan(1e-4);
      }
      clean(f);
    }
  });

  it('sinks its real fangs into the live card and the card reacts only after the web and bite', () => {
    for (const id of ['spider-0', 'spider-3', 'spider-4']) {
      const f = fixture(id),
        p = f.plan;
      for (const b of layouts) {
        const facing = sideFor(f, b);
        p.strikes.forEach((strike, i) => {
          const spot = spiderBiteSpot(p, i);
          for (const ms of [strike, strike + 150, strike + 330]) {
            at(f, ms, b, facing);
            const fang = screenOf(f.model.fangTip),
              wound = onCard(spiderCardPose(p, ms, facing), spot.u, spot.v, b);
            expect(
              Math.hypot(fang.x - wound.x, fang.y - wound.y),
              `${id} bite ${i} at ${ms}`,
            ).toBeLessThan(0.05);
          }
          expect(Math.abs(spot.u - 0.5) < 0.25 && spot.v < 0.25).toBe(true);
        });
      }
      for (const facing of [-1, 1]) {
        expect(spiderCardPose(p, p.landed - 1, facing)).toEqual(NEUTRAL);
        expect(spiderCardPose(p, p.tighten + 500, facing).sx).toBeLessThan(0.97);
        expect(spiderCardPose(p, p.departure + 700, facing)).toEqual(NEUTRAL);
      }
      clean(f);
    }
  });

  it('either climbs its line out of view or drops off the card and scuttles away', () => {
    for (let i = 0; i < 8; i++) {
      const f = fixture(`spider-${i}`),
        p = f.plan;
      at(f, p.exitEnd);
      const body = screenOf(f.actor);
      if (p.climb) expect(body.y).toBeLessThan(-60);
      else expect(body.x < -60 || body.x > view.x + 60).toBe(true);
      clean(f);
    }
  });
});
