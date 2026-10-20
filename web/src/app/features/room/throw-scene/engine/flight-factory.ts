import type * as THREE from 'three';
import type { FlightTrick } from '../character';
import { characterFor } from '../characters';
import { flightProfile, type FlightProfile, type Point } from '../flight/flight-math';
import { makeShadow, type FlightShadow } from '../flight/flight-shadow';
import { styleProfile } from '../flight/projectile-motion';
import {
  LandingEffect,
  landingKind,
  landingPoint,
  landingVariation,
  type TargetBounds,
} from '../landing/landing-effects';
import { LightningStorm } from '../landing/lightning-storm';
import type { Projectile } from '../projectile';
import { makeProjectile } from './throw-models';

/** One projectile in the air or landing, with the scene objects and timing that drive it. */
export interface Flight {
  projectile: Projectile;
  object: THREE.Group;
  storm: LightningStorm | null;
  trick: FlightTrick | null;
  landing: LandingEffect | null;
  landingAnimation: Animation | null;
  landingCard: { width: number; height: number; facing: number } | null;
  shadow: FlightShadow;
  source: HTMLElement;
  target: HTMLElement;
  start: Point;
  end: Point;
  profile: FlightProfile;
  landingVariation: Point;
  born: number;
  hitAt: number;
  lastTrail: number;
  trailSequence: number;
}

/**
 * Builds a flight from the thrower's card to the target's: the landing point, flight profile,
 * character trick and scene objects. The caller adds the objects to its scene.
 */
export function createFlight(
  projectile: Projectile,
  source: HTMLElement,
  target: HTMLElement,
  raceBounds: () => TargetBounds,
): Flight {
  const a = source.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const start = { x: a.left + a.width / 2, y: a.top + a.height * 0.5 };
  const kind = landingKind(projectile.emoji);
  const variation = landingVariation(projectile.id);
  const character = characterFor(projectile.emoji);
  if (character?.pinsSide) variation.x = start.x <= b.left + b.width / 2 ? 0 : 1;
  const viewport = { x: window.innerWidth, y: window.innerHeight };
  const storm = projectile.emoji === '⚡' ? new LightningStorm(projectile.id) : null;
  const object = storm?.object ?? makeProjectile(projectile.emoji, projectile.id);
  const landing = kind ? new LandingEffect(kind, object, projectile.id) : null;
  const act = landing?.act;
  const end = act?.initialEnd?.(b, viewport) ?? landingPoint(kind, b, variation);
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const baseProfile = flightProfile(projectile.id, distance, Math.min(start.y, end.y) - 20);
  const profile = character?.keepsThrowProfile
    ? baseProfile
    : styleProfile(baseProfile, projectile.emoji, Math.min(start.y, end.y) - 20);
  const approachDuration = act?.approachDuration?.(distance);
  if (approachDuration !== undefined) profile.duration = approachDuration;
  character?.prepareFlight?.({
    id: projectile.id,
    variation,
    profile,
    raceBounds,
  });
  storm?.update(0, end, b.top);
  const trick =
    character?.createFlightTrick?.({ id: projectile.id, target, b, start, variation }) ?? null;
  return {
    projectile,
    object,
    storm,
    trick,
    landing,
    landingAnimation: null,
    landingCard: null,
    shadow: makeShadow(),
    source,
    target,
    start,
    end,
    profile,
    landingVariation: variation,
    born: performance.now(),
    hitAt: 0,
    lastTrail: 0,
    trailSequence: 0,
  };
}
