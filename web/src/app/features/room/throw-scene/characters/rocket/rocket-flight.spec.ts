import { describe, expect, it } from 'vitest';
import { rocketPoint, rocketRoute } from './rocket-flight';

describe('rocket swarm routes', () => {
  it('repeats a given route but varies curves, loops, and timing across a volley', () => {
    expect(rocketRoute('one')).toEqual(rocketRoute('one'));
    const routes = Array.from({ length: 40 }, (_, i) => rocketRoute(`swarm-${i}`));
    expect(routes.some((route) => route.loop)).toBe(true);
    expect(routes.some((route) => !route.loop)).toBe(true);
    expect(new Set(routes.map((route) => route.duration)).size).toBe(40);
    const mids = routes.map((route) =>
      rocketPoint({ x: 100, y: 300 }, { x: 800, y: 300 }, route, 0.5),
    );
    expect(Math.max(...mids.map((p) => p.y)) - Math.min(...mids.map((p) => p.y))).toBeGreaterThan(
      100,
    );
  });

  it('sweeps well above and below nearby cards without extending flight time', () => {
    const start = { x: 600, y: 400 },
      end = { x: 650, y: 400 };
    const points = [];
    const lengths = [];
    for (let i = 0; i < 20; i++) {
      const original = rocketRoute(`wide-${i}`);
      const route = { ...original, viewport: { x: 1280, y: 800 } };
      let previous = start;
      let length = 0;
      for (let step = 1; step <= 100; step++) {
        const point = rocketPoint(start, end, route, step / 100);
        points.push(point);
        length += Math.hypot(point.x - previous.x, point.y - previous.y);
        previous = point;
      }
      lengths.push(length);
      expect(route.duration).toBe(original.duration);
      expect(previous).toEqual(end);
    }
    expect(Math.min(...points.map((p) => p.y))).toBeLessThan(160);
    expect(Math.max(...points.map((p) => p.y))).toBeGreaterThan(640);
    expect(
      Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
    ).toBeGreaterThan(300);
    expect(lengths.reduce((sum, length) => sum + length, 0) / lengths.length).toBeGreaterThan(1000);
  });

  it('lands exactly and keeps excursions inside small screens in either direction', () => {
    for (const [start, end] of [
      [
        { x: 40, y: 70 },
        { x: 340, y: 550 },
      ],
      [
        { x: 340, y: 550 },
        { x: 40, y: 70 },
      ],
      [
        { x: 40, y: 70 },
        { x: 40, y: 70 },
      ],
    ] as const) {
      for (let i = 0; i < 20; i++) {
        const route = { ...rocketRoute(`edge-${i}`), viewport: { x: 390, y: 600 } };
        expect(rocketPoint(start, end, route, 0)).toEqual(start);
        expect(rocketPoint(start, end, route, 1)).toEqual(end);
        for (let step = 1; step < 100; step++) {
          const p = rocketPoint(start, end, route, step / 100);
          expect(p.x).toBeGreaterThanOrEqual(24);
          expect(p.x).toBeLessThanOrEqual(366);
          expect(p.y).toBeGreaterThanOrEqual(24);
          expect(p.y).toBeLessThanOrEqual(576);
        }
      }
    }
  });

  it('doubles back in a loop without jumping at loop entry or exit', () => {
    const route = { ...rocketRoute('loop'), loop: true };
    const start = { x: 100, y: 300 },
      end = { x: 650, y: 300 };
    let previous = rocketPoint(start, end, route, 0);
    let doublesBack = false;
    for (let i = 1; i <= 1000; i++) {
      const next = rocketPoint(start, end, route, i / 1000);
      if (next.x < previous.x) doublesBack = true;
      expect(Math.hypot(next.x - previous.x, next.y - previous.y)).toBeLessThan(5);
      previous = next;
    }
    expect(doublesBack).toBe(true);
  });
});
