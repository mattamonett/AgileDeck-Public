import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  LandingEffect,
  landingKind,
  landingPoint,
  landingVariation,
  makeSlotMachine,
  type LandingKind,
} from './landing-effects';
import { disposeObject, makeProjectile } from '../engine/throw-models';
import { BOUQUET_SCALE } from '../characters/bouquet/bouquet-choreography';

const bounds = { left: 100, top: 120, width: 100, height: 140 };
const variation = { x: 0.5, y: 0.5 };
const center = { x: 150, y: 190 };

describe('special projectile landings', () => {
  it('places hovering objects above the target and flowers at its base', () => {
    expect(landingPoint('🛸', bounds, variation).y).toBeLessThan(bounds.top);
    expect(landingPoint('🎈', bounds, variation).y).toBeLessThan(bounds.top);
    expect(landingPoint('💐', bounds, variation).y).toBeCloseTo(bounds.top + bounds.height * 0.88);
    expect(landingPoint('🛸', { ...bounds, top: 0 }, variation).y).toBeGreaterThan(0);
    expect(landingKind('🍕')).toBeNull();
  });

  it('spreads repeated throws across the card for every interaction type', () => {
    for (const kind of [null, '🛸', '💣', '💐', '🥧', '🎈', '🎰', '🎩'] as const) {
      const points = Array.from({ length: 30 }, (_, i) =>
        landingPoint(kind, bounds, landingVariation(`barrage-${i}`)),
      );
      expect(new Set(points.map((p) => `${p.x}:${p.y}`)).size).toBe(30);
      expect(
        Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
      ).toBeGreaterThan(bounds.width * 0.6);
      for (const point of points) {
        expect(point.x).toBeGreaterThan(bounds.left);
        expect(point.x).toBeLessThan(bounds.left + bounds.width);
        if (kind !== '🛸' && kind !== '🎈') {
          expect(point.y).toBeGreaterThan(bounds.top);
          expect(point.y).toBeLessThan(bounds.top + bounds.height);
        }
      }
    }
  });

  it('keeps each event stable while following card movement and resize', () => {
    const sample = landingVariation('same-event');
    expect(sample).toEqual(landingVariation('same-event'));
    for (const kind of [null, '🛸', '💣', '💐', '🥧', '🎈', '🎰', '🎩'] as const) {
      const first = landingPoint(kind, bounds, sample);
      const moved = landingPoint(
        kind,
        { ...bounds, left: bounds.left + 70, top: bounds.top + 50 },
        sample,
      );
      expect(moved.x - first.x).toBeCloseTo(70);
      expect(moved.y - first.y).toBeCloseTo(50);
      const resized = landingPoint(kind, { ...bounds, width: bounds.width * 2 }, sample);
      expect(resized.x - bounds.left).toBeCloseTo((first.x - bounds.left) * 2);
    }
  });

  it('waits for the bomb fuse before hiding the bomb and revealing smoke', () => {
    const bomb = makeProjectile('💣', 'test');
    const effect = new LandingEffect('💣', bomb);
    effect.update(500, bounds, center);
    expect(bomb.visible).toBe(true);
    expect(effect.object.children.slice(2).every((puff) => !puff.visible)).toBe(true);
    effect.update(550, bounds, center);
    expect(bomb.visible).toBe(false);
    expect(effect.object.children.slice(2).every((puff) => puff.visible)).toBe(true);
    expect(effect.cardAnimation()?.options.delay).toBe(550);
    disposeObject(bomb);
    disposeObject(effect.object);
  });

  it('stops all three matching reels before the coin payout', () => {
    const slot = makeSlotMachine();
    const effect = new LandingEffect('🎰', slot);
    const reels = slot.children.filter((child) => child.name === 'reel');
    expect(reels).toHaveLength(3);
    effect.update(400, bounds, center);
    expect(reels.every((reel) => reel.rotation.x !== 0)).toBe(true);
    expect(effect.object.children.every((coin) => !coin.visible)).toBe(true);
    effect.update(940, bounds, center);
    expect(reels.every((reel) => reel.rotation.x === 0)).toBe(true);
    expect(effect.object.children.every((coin) => !coin.visible)).toBe(true);
    effect.update(1300, bounds, center);
    expect(effect.object.children.every((coin) => coin.visible)).toBe(true);
    disposeObject(slot);
    disposeObject(effect.object);
  });

  it('releases the balloon string and slides the cream downward', () => {
    const balloon = new THREE.Group();
    const tether = new LandingEffect('🎈', balloon);
    tether.update(800, bounds, center);
    const tiedY = balloon.position.y;
    expect(tether.object.children.every((piece) => piece.visible)).toBe(true);
    tether.update(1400, bounds, center);
    expect(tether.object.children.every((piece) => !piece.visible)).toBe(true);
    expect(balloon.position.y).toBeGreaterThan(tiedY);
    const pie = new THREE.Group();
    const cream = new LandingEffect('🥧', pie);
    cream.update(200, bounds, center);
    const firstY = cream.object.position.y;
    cream.update(1000, bounds, center);
    expect(pie.visible).toBe(false);
    expect(cream.object.position.y).toBeLessThan(firstY);
    disposeObject(tether.object);
    disposeObject(cream.object);
  });

  it('finishes every effect and leaves card animations at their original position', () => {
    const kinds: LandingKind[] = ['🛸', '💣', '💐', '🥧', '🎈', '🎰', '🎩'];
    for (const kind of kinds) {
      const projectile =
        kind === '💐' || kind === '🎩' || kind === '🛸'
          ? makeProjectile(kind, 'test')
          : new THREE.Group();
      const effect = new LandingEffect(kind, projectile);
      const scene = new THREE.Scene();
      scene.add(projectile, effect.object);
      const animation = effect.cardAnimation();
      if (animation) expect(animation.frames.at(-1)?.['translate']).toMatch(/^0(?:px)? 0(?:px)?$/);
      for (const time of [0, 300, 800, 1200, effect.duration]) {
        effect.update(time, bounds, landingPoint(kind, bounds, variation));
        effect.object.traverse((child) => {
          expect(child.position.toArray().every(Number.isFinite)).toBe(true);
          expect(child.scale.toArray().every(Number.isFinite)).toBe(true);
        });
      }
      expect(effect.object.visible).toBe(false);
      if (kind === '🎩' || kind === '🛸') {
        expect(projectile.visible).toBe(false);
        expect(projectile.scale.x).toBe(0.8);
      } else if (kind === '💐') {
        expect(projectile.visible).toBe(false);
        expect(projectile.scale.x).toBe(BOUQUET_SCALE);
      } else expect(projectile.scale.x).toBe(0);
      disposeObject(effect.object);
      disposeObject(projectile);
      expect(scene.children).toHaveLength(0);
    }
  });
});
