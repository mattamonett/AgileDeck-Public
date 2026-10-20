import { clamp, ease } from '../../kit';
import * as THREE from 'three';
import { seededRandom, type Point } from '../../flight/flight-math';
import type { TargetBounds } from '../../landing/landing-geometry';
import { evenPath, lingeringProgress } from '../../flight/approach-flow';

export const BOUQUET_SCALE = 0.85,
  BOUQUET_TIP = -23,
  BOUQUET_DURATION = 10000,
  BOUQUET_DEPTH = 172;
export const bouquetEase = ease;
export interface BouquetPlan {
  readonly pace: number;
  readonly side: number;
  readonly travel: number;
  readonly pause: number;
  readonly loft: number;
  readonly settle: number;
  readonly land: number;
  readonly bloom: number;
  readonly lag: number;
  readonly shy: boolean;
  readonly shyFlower: number;
  readonly lilac: boolean;
  readonly order: readonly number[];
  readonly phase: number;
  readonly force: number;
  readonly lean: number;
  readonly petals: readonly number[];
  readonly departure: number;
  readonly lie: number;
  readonly cleanup: number;
  readonly breeze: number;
}
export function bouquetPlan(id: string): BouquetPlan {
  const r = seededRandom(id + ':a-little-gift'),
    travel = 1650 + r() * 250,
    settle = 380 + r() * 100;
  const land = travel + settle,
    bloom = 650 + r() * 150,
    lag = 350 + r() * 150,
    shy = r() < 0.5;
  const order = [0, 1, 2, 3, 4];
  for (let i = 4; i > 0; i--) {
    const j = Math.floor(r() * (i + 1)),
      a = order[i],
      b = order[j];
    if (a !== undefined && b !== undefined) {
      order[i] = b;
      order[j] = a;
    }
  }
  const first = land + bloom + (shy ? lag : 0) + 600 + r() * 150,
    spacing = 160 + r() * 40;
  const petals = Array.from({ length: 8 }, (_, i) => first + i * spacing),
    last = first + 7 * spacing;
  const departure = last + 250 + r() * 100,
    lie = 950 + r() * 150;
  return {
    pace: 0.94 + r() * 0.12,
    side: r() < 0.5 ? -1 : 1,
    travel,
    pause: 0.08 + r() * 0.04,
    loft: 24 + r() * 20,
    settle,
    land,
    bloom,
    lag,
    shy,
    shyFlower: Math.floor(r() * 5),
    lilac: r() < 0.5,
    order,
    phase: r() * Math.PI * 2,
    force: 0.85 + r() * 0.3,
    lean: 0.06 + r() * 0.05,
    petals,
    departure,
    lie,
    cleanup: Math.max(last + 2500, departure + lie + 400) + 250 + r() * 100,
    breeze: 12 + r() * 10,
  };
}
export function bouquetLandingPoint(
  p: BouquetPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  let facing = chosen ?? p.side;
  if (chosen === undefined) {
    if (b.left < 22) facing = -1;
    else if (b.left + b.width > view.x - 22) facing = 1;
  }
  return { x: b.left + b.width * (facing > 0 ? 0.14 : 0.86), y: b.top + b.height };
}
export function bouquetOpen(p: BouquetPlan, ms: number, i: number) {
  const index = p.order.indexOf(i),
    delay = index * 55 + (p.shy && i === p.shyFlower ? p.lag : 0);
  return 0.15 + 0.85 * bouquetEase((ms - p.land - delay) / (p.bloom - 220));
}
export function bouquetBranch(p: BouquetPlan, ms: number, i: number) {
  const open = bouquetOpen(p, ms, i),
    sway =
      Math.sin(ms / 330 + p.phase + i) *
      0.012 *
      bouquetEase((ms - p.land) / 500) *
      (1 - bouquetEase((ms - p.departure + 300) / 300));
  return -(i - 2) * (0.075 + open * 0.14) + sway;
}
export function bouquetFold(open: number, layer: number, daisy: boolean) {
  return daisy
    ? 0.92 * (1 - open) + 0.05
    : layer
      ? 0.8 * (1 - open) + 0.38
      : 1.05 * (1 - open) + 0.12;
}
export function bouquetCardPose(p: BouquetPlan, ms: number, facing: number) {
  const age = ms - p.land,
    touch = age > 0 && age < 420 ? Math.sin((age / 420) * Math.PI) : 0;
  const lateT = (ms - p.land - p.lag) / (p.bloom - 220),
    late = p.shy && lateT > 0 && lateT < 1 ? Math.sin(Math.PI * lateT) * 0.35 : 0;
  const lift =
    ms > p.departure && ms < p.departure + 300
      ? Math.sin(((ms - p.departure) / 300) * Math.PI) * 0.5
      : 0;
  const weight = (touch * 1.8 + late - lift) * p.force;
  return { y: weight, angle: -facing * weight * 0.3, sy: 1 - weight * 0.003 };
}
export function bouquetCardPoint(
  p: BouquetPlan,
  ms: number,
  raw: Point,
  b: TargetBounds,
  facing: number,
): Point {
  const q = bouquetCardPose(p, ms, facing),
    a = (q.angle * Math.PI) / 180,
    x = raw.x - b.left - b.width / 2,
    y = (raw.y - b.top - b.height / 2) * q.sy;
  return {
    x: b.left + b.width / 2 + x * Math.cos(a) - y * Math.sin(a),
    y: b.top + b.height / 2 + x * Math.sin(a) + y * Math.cos(a) + q.y,
  };
}
const glide = (p: BouquetPlan, t: number) => lingeringProgress(t, 0.65, 0.7, p.pause);
export function bouquetPose(
  p: BouquetPlan,
  ms: number,
  start: Point,
  b: TargetBounds,
  view: Point,
  facing: number,
) {
  const anchor = bouquetLandingPoint(p, b, view, facing),
    card = bouquetCardPose(p, ms, facing),
    a = facing * p.lean;
  let tip = anchor,
    angle = a,
    bank = 0,
    depth = BOUQUET_DEPTH;
  if (ms < p.travel) {
    const t = clamp(ms / p.travel),
      q = glide(p, t),
      root = {
        x: anchor.x + Math.sin(a) * BOUQUET_TIP * BOUQUET_SCALE,
        y: anchor.y + Math.cos(a) * BOUQUET_TIP * BOUQUET_SCALE - 12,
      };
    const room = Math.max(0, Math.min(root.x - 26, view.x - 26 - root.x)),
      c2 = root.x - facing * Math.min(38, room),
      c1 = start.x + (root.x - start.x) * 0.35;
    const loft = Math.min(p.loft, Math.max(0, Math.min(start.y, root.y) - 64));
    const point = evenPath(
      (s) => ({
        x:
          (1 - s) ** 3 * start.x +
          3 * (1 - s) ** 2 * s * c1 +
          3 * (1 - s) * s * s * c2 +
          s ** 3 * root.x,
        y: start.y + (root.y - start.y) * s - Math.sin(s * Math.PI) * loft,
      }),
      q,
    );
    angle = a + facing * Math.sin(q * Math.PI) * 0.18;
    bank = Math.sin(q * Math.PI) * 0.12;
    return {
      point,
      rotation: new THREE.Euler(0, bank, angle, 'ZXY'),
      depth: BOUQUET_DEPTH + 16 + Math.sin(q * Math.PI) * 8,
      lay: 0,
    };
  }
  if (ms < p.land) {
    const q = bouquetEase((ms - p.travel) / p.settle);
    tip = { x: anchor.x, y: anchor.y - 12 * (1 - q) };
    depth += 16 * (1 - q);
  } else if (ms < p.departure) {
    tip = bouquetCardPoint(p, ms, anchor, b, facing);
    angle -= (card.angle * Math.PI) / 180;
    angle +=
      facing *
      Math.sin(ms / 410 + p.phase) *
      0.018 *
      bouquetEase((ms - p.land) / 400) *
      (1 - bouquetEase((ms - p.departure + 300) / 300));
  } else {
    const q = bouquetEase((ms - p.departure) / p.lie);
    angle = a + (-facing * 1.16 - a) * q;
    tip = { x: anchor.x + facing * q * 4, y: anchor.y + q * 20 };
  }
  const point = {
    x: tip.x + Math.sin(angle) * BOUQUET_TIP * BOUQUET_SCALE,
    y: tip.y + Math.cos(angle) * BOUQUET_TIP * BOUQUET_SCALE,
  };
  return {
    point,
    rotation: new THREE.Euler(0, 0, angle, 'ZXY'),
    depth,
    lay: bouquetEase((ms - p.departure) / p.lie),
  };
}
export function bouquetFrames(p: BouquetPlan, facing: number) {
  const frames: Keyframe[] = [];
  for (let ms = 0; ms <= BOUQUET_DURATION; ms += 20) {
    const q = bouquetCardPose(p, ms, facing);
    frames.push({
      offset: ms / BOUQUET_DURATION,
      translate: `0px ${q.y}px`,
      rotate: `${q.angle}deg`,
      scale: `1 ${q.sy}`,
    });
  }
  return { frames, options: { duration: BOUQUET_DURATION * p.pace, easing: 'linear' } };
}
