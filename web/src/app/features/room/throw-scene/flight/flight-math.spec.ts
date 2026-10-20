import { describe, expect, it } from 'vitest';
import { flightPoint, flightProfile, impactKind, seededRandom } from './flight-math';

describe('throw trajectories', () => {
  it('starts and lands exactly on the anchors in either direction and across rows', () => {
    for (const [start, end] of [
      [
        { x: 50, y: 230 },
        { x: 800, y: 230 },
      ],
      [
        { x: 800, y: 230 },
        { x: 50, y: 230 },
      ],
      [
        { x: 100, y: 450 },
        { x: 100, y: 180 },
      ],
    ] as const) {
      const profile = flightProfile('same-throw', 500, 160);
      expect(flightPoint(start, end, profile, 0)).toEqual(start);
      const landed = flightPoint(start, end, profile, 1);
      expect(landed.x).toBeCloseTo(end.x);
      expect(landed.y).toBeCloseTo(end.y);
      expect(flightPoint(start, end, profile, 0.5).y).toBeLessThan((start.y + end.y) / 2);
    }
  });
  it('reproduces variation for the same network event without making every throw identical', () => {
    expect(flightProfile('one', 250, 150)).toEqual(flightProfile('one', 250, 150));
    expect(flightProfile('one', 250, 150)).not.toEqual(flightProfile('two', 250, 150));
    const random = seededRandom('barrage');
    for (let i = 0; i < 100; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
  it('keeps high arcs within available headroom and clamps animation overshoot', () => {
    const profile = flightProfile('mobile', 2000, 70);
    expect(profile.height).toBeLessThanOrEqual(70);
    expect(profile.duration).toBeLessThan(1330);
    expect(flightPoint({ x: 20, y: 100 }, { x: 70, y: 100 }, profile, -1)).toEqual({
      x: 20,
      y: 100,
    });
    expect(flightPoint({ x: 20, y: 100 }, { x: 70, y: 100 }, profile, 2).y).toBe(100);
  });
  it('matches contact materials to the equipped projectile', () => {
    expect(impactKind('🍅')).toBe('tomato');
    expect(impactKind('🥧')).toBe('cream');
    expect(impactKind('💐')).toBe('petals');
    expect(impactKind('📄')).toBe('paper');
    expect(impactKind('🍺')).toBe('liquid');
    expect(impactKind('💩')).toBe('dust');
    expect(impactKind('🦄')).toBe('spark');
  });
});
