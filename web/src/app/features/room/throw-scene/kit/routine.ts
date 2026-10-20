import type * as THREE from 'three';
import type { Point } from '../flight/flight-math';
import type { TargetBounds } from '../landing/landing-geometry';

/** A character performance: its scene object, length, card animation and per-frame pose. */
export interface CharacterRoutine {
  readonly object: THREE.Group;
  readonly duration: number;
  cardAnimation(
    facing: number,
    b?: TargetBounds,
  ): {
    frames: Keyframe[];
    options: KeyframeAnimationOptions;
  };
  update(
    elapsed: number,
    actor: THREE.Group,
    start: Point,
    b: TargetBounds,
    view: Point,
    facing: number,
  ): void;
}
