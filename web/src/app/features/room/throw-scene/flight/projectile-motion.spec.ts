import { describe, expect, it } from 'vitest';
import { ALL_EMOJIS_WITH_TAGS } from '@poker/shared';
import { flightProfile } from './flight-math';
import { motionPoint, motionPose, PROJECTILE_STYLES, styleProfile } from './projectile-motion';
import { FlightTrails } from './flight-trails';
import * as THREE from 'three';

describe('projectile personalities', () => {
  it('covers the full picker and reaches both anchors without exceeding the event lifetime', () => {
    expect(Object.keys(PROJECTILE_STYLES)).toHaveLength(ALL_EMOJIS_WITH_TAGS.length);
    for (const { char } of ALL_EMOJIS_WITH_TAGS) {
      for (const end of [
        { x: 800, y: 180 },
        { x: 10, y: 400 },
        { x: 100, y: 50 },
      ]) {
        const start = { x: 100, y: 220 };
        const profile = styleProfile(flightProfile('test', 1500, 30), char);
        expect(profile.duration + 900).toBeLessThanOrEqual(3000);
        expect(motionPoint(start, end, profile, char, -1)).toEqual(start);
        expect(motionPoint(start, end, profile, char, 2)).toEqual(end);
        for (const t of [0.1, 0.4, 0.7, 0.99]) {
          const point = motionPoint(start, end, profile, char, t);
          expect(Number.isFinite(point.x + point.y)).toBe(true);
        }
      }
    }
  });

  it('keeps the balloon upright while rockets take longer scenic routes', () => {
    const base = flightProfile('test', 500, 160);
    const balloon = styleProfile(base, '🎈');
    const rocket = styleProfile(base, '🚀');
    expect(rocket.duration).toBeGreaterThanOrEqual(1650);
    for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      const pose = motionPose({ x: 0, y: 100 }, { x: 500, y: 100 }, balloon, '🎈', t);
      expect(pose.x).toBe(0);
      expect(pose.y).toBe(0);
      expect(Math.abs(pose.z)).toBeLessThanOrEqual(0.12);
    }
  });

  it('aims the rocket nose along the actual trajectory in every direction', () => {
    const start = { x: 200, y: 200 };
    const profile = styleProfile(flightProfile('test', 500, 100), '🚀');
    for (const end of [
      { x: 800, y: 100 },
      { x: 0, y: 100 },
      { x: 200, y: 500 },
    ]) {
      const a = motionPoint(start, end, profile, '🚀', 0.498);
      const b = motionPoint(start, end, profile, '🚀', 0.502);
      const pose = motionPose(start, end, profile, '🚀', 0.5);
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      expect(-Math.sin(pose.z)).toBeCloseTo((b.x - a.x) / length);
      expect(Math.cos(pose.z)).toBeCloseTo(-(b.y - a.y) / length);
    }
  });

  it('bounds trail allocation and removes expired particles and cleared scenes', () => {
    const scene = new THREE.Scene();
    const trails = new FlightTrails(scene);
    for (let i = 0; i < 400; i++) trails.emit('smoke', new THREE.Vector3(), 0, 100, i);
    expect(scene.children.length).toBe(180);
    trails.update(800);
    expect(scene.children.length).toBe(0);
    expect(trails.active).toBe(false);
    trails.emit('rainbow', new THREE.Vector3(), 0, 900, 1);
    trails.clear();
    expect(scene.children.length).toBe(0);
  });
});
