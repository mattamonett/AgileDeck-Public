// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VALID_INTERACTION_CHARACTERS } from '@poker/shared';
import {
  cardContact,
  laxativePose,
  laxativePlan,
  laxativeCardPoint,
  LaxativeTrick,
  LAXATIVE_DURATION,
} from './laxative-trick';
import * as THREE from 'three';
import { disposeObject } from '../../engine/throw-models';
import { projectileStyle } from '../../flight/projectile-motion';

class CardAnimationStub extends EventTarget implements Animation {
  currentTime = null;
  effect = null;
  id = '';
  oncancel = null;
  onfinish = null;
  onremove = null;
  pending = false;
  playbackRate = 1;
  playState: Animation['playState'] = 'idle';
  replaceState: Animation['replaceState'] = 'active';
  startTime = null;
  timeline = null;
  finished = Promise.resolve(this);
  ready = Promise.resolve(this);
  cancel = vi.fn();
  commitStyles = vi.fn();
  finish = vi.fn();
  pause = vi.fn();
  persist = vi.fn();
  play = vi.fn();
  reverse = vi.fn();
  updatePlaybackRate = vi.fn();
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('laxative', () => {
  it('accepts the pill and uses the star toss', () => {
    expect(VALID_INTERACTION_CHARACTERS.has('💊')).toBe(true);
    expect(projectileStyle('💊')).toEqual(projectileStyle('⭐'));
  });
  it('detects swept contact from either side and rejects near misses', () => {
    const b = { left: 100, top: 100, width: 40, height: 80 };
    expect(cardContact({ x: 0, y: 120 }, { x: 200, y: 120 }, b)).toBe(0.5);
    expect(cardContact({ x: 200, y: 120 }, { x: 0, y: 120 }, b)).toBe(0.3);
    expect(cardContact({ x: 0, y: 90 }, { x: 200, y: 90 }, b)).toBeNull();
  });
  it('shakes first, bends in either direction, and restores a repeatable neutral pose', () => {
    expect(laxativePose(100, 1).bend).toBe(0);
    const pose = laxativePose(1000, 1);
    expect(pose.bend).toBe(-laxativePose(1000, -1).bend);
    laxativePose(1600, 1);
    expect(laxativePose(1000, 1)).toEqual(pose);
    expect(laxativePose(3400, 1).bend).toBe(0);
  });
  it.each([-1, 1])('oozes on neighbors, follows reflow, and cleans up (side %s)', (side) => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const target = document.createElement('div');
    const neighbor = document.createElement('div');
    target.textContent = '8';
    document.body.append(target, neighbor);
    const animation = new CardAnimationStub();
    const cancel = animation.cancel;
    target.animate = vi.fn(() => animation);
    const b = { left: 300, top: 100, width: 80, height: 120 };
    const other = { left: side > 0 ? 395 : 200, top: -1000, width: 80, height: 3000 };
    const effect = new LaxativeTrick('test', target, side);
    const rect = () => other;
    effect.update(0, b, [neighbor], rect);
    expect(document.querySelectorAll('[aria-hidden]')).toHaveLength(2);
    for (let ms = 700; ms <= 1100; ms += 20) effect.update(ms, b, [neighbor], rect);
    const piece = effect.object.children[0]!;
    expect(piece.visible).toBe(true);
    const x = piece.position.x;
    other.left += 30;
    effect.update(1120, b, [neighbor], rect);
    expect(piece.position.x).toBeCloseTo(x + 30);
    effect.update(2700, b, [neighbor], rect);
    expect(piece.visible).toBe(false);
    effect.update(3400, b, [neighbor], rect);
    expect(document.querySelectorAll('[aria-hidden]')).toHaveLength(0);
    expect(cancel).toHaveBeenCalledOnce();
    effect.dispose();
    disposeObject(effect.object);
    expect(target.textContent).toBe('8');
  });
  it('varies pressure and burst rhythm reproducibly, with all bursts before recovery', () => {
    const plans = Array.from({ length: 40 }, (_, i) => laxativePlan(`gross-${i}`));
    expect(laxativePlan('gross-8')).toEqual(plans[8]);
    expect(new Set(plans.map((p) => p.bursts.join(','))).size).toBe(40);
    expect(
      Math.max(...plans.map((p) => p.pressure)) - Math.min(...plans.map((p) => p.pressure)),
    ).toBeGreaterThan(0.2);
    for (const plan of plans) {
      expect(plan.bursts).toHaveLength(4);
      let previous = 0;
      for (const burst of plan.bursts) {
        expect(burst).toBeGreaterThan(previous + 400);
        expect(burst).toBeLessThan(2750);
        previous = burst;
      }
      for (const side of [-1, 1])
        for (const width of [58, 84])
          for (let ms = 0; ms <= LAXATIVE_DURATION; ms += 100) {
            const b = { left: 100, top: 80, width, height: (width * 122) / 84 };
            const p = laxativeCardPoint(ms, side, plan, b, 0.9, plan.nozzle);
            expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
            if (ms >= 3400) expect(p.x).toBeCloseTo(b.left + width * 0.9);
          }
    }
  });
  it('uses wet native meshes, trails past both edges, and restores canceled card copies', () => {
    const target = document.createElement('div');
    target.id = 'vote';
    target.dataset['playerId'] = 'player';
    target.textContent = '13';
    target.style.transform = 'rotateY(180deg)';
    document.body.append(target);
    const animation = new CardAnimationStub();
    const cancel = animation.cancel;
    target.animate = vi.fn(() => animation);
    const effect = new LaxativeTrick('surface', target, 1);
    const b = { left: 100, top: 100, width: 58, height: 84 };
    effect.update(3000, b, [], () => b);
    expect(effect.object.children.every((part) => part instanceof THREE.Mesh)).toBe(true);
    expect(
      effect.object.children.some((part) => part.visible && -part.position.y > b.top + b.height),
    ).toBe(true);
    expect(document.querySelectorAll('#vote')).toHaveLength(1);
    expect(document.querySelectorAll('[data-player-id]')).toHaveLength(1);
    const copy = document.querySelector('[aria-hidden] > div');
    expect(copy instanceof HTMLElement && copy.style.transform).toBe('rotateY(180deg)');
    effect.dispose();
    expect(document.querySelectorAll('[aria-hidden]')).toHaveLength(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(target.textContent).toBe('13');
    effect.update(LAXATIVE_DURATION, b, [], () => b);
    expect(effect.object.children.every((part) => !part.visible)).toBe(true);
    disposeObject(effect.object);
  });
});
