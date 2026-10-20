import type * as THREE from 'three';
import type { FlightProfile, Point } from './flight/flight-math';
import type { TargetBounds } from './landing/landing-geometry';

/** Keyframes a performance plays on the target card. */
export interface CardAnimation {
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
}

/** The landing effect a character performs inside. */
export interface ActStage {
  /** The effect's own group, which performances position and show. */
  readonly object: THREE.Group;
  /** The thrown model the character animates. */
  readonly projectile: THREE.Group;
}

/** Where a whole-routine performance plays out this frame. */
export interface PerformScene {
  readonly start: Point;
  readonly end: Point;
  readonly b: TargetBounds;
  readonly view: Point;
  readonly target?: HTMLElement;
}

/** What a character reads to place its contact point each frame. */
export interface LandingContext {
  readonly b: TargetBounds;
  readonly view: Point;
  readonly start: Point;
  readonly variation: Point;
  /** Facing the card animation last used, if it has started. */
  readonly facing: number | undefined;
  /** Whether the throw has already made contact. */
  readonly landed: boolean;
}

/** One frame of a walk-up before contact; t runs from 0 to 1 over the flight. */
export interface ApproachFrame {
  readonly t: number;
  readonly elapsed: number;
  readonly start: Point;
  readonly end: Point;
  readonly b: TargetBounds;
  readonly view: Point;
  readonly profile: FlightProfile;
}

/** Throw-time setup a character can apply to its flight profile. */
export interface FlightSetup {
  readonly id: string;
  readonly variation: Point;
  readonly profile: FlightProfile;
  raceBounds(): TargetBounds;
}

/** One character's performance for one throw. */
export interface CharacterAct {
  /** The performance object; its definition reads the typed plan back from it. */
  readonly trick: object;
  readonly object: THREE.Object3D;
  readonly duration: number;
  cardAnimation(facing: number, bounds: TargetBounds | undefined): CardAnimation | null | undefined;
  /** Plays the landing after a walk-up reaches the card. */
  land?(ms: number, b: TargetBounds, end: Point, viewport: Point | undefined): void;
  /** Plays a routine that runs from the throw itself, with no separate flight. */
  perform?(ms: number, at: PerformScene): void;
  /** Releases page elements the performance added outside the WebGL scene. */
  release?(): void;
  landingPoint(at: LandingContext): Point;
  /** Contact point used to size the flight when it differs from the generic landing spot. */
  initialEnd?(b: TargetBounds, view: Point): Point;
  /** Flight duration of the walk-up for a throw of this length. */
  approachDuration?(distance: number): number;
  /** Poses the actor during the walk-up; false hands the frame back to the plain flight. */
  approach?(frame: ApproachFrame): boolean;
}

/** Throw-time details a flight trick is built from. */
export interface FlightTrickSetup {
  readonly id: string;
  readonly target: HTMLElement;
  /** The target card's bounds when thrown. */
  readonly b: TargetBounds;
  readonly start: Point;
  readonly variation: Point;
}

/** A character performance the renderer runs beside the flight rather than in the landing effect. */
export interface FlightTrick {
  readonly object: THREE.Object3D;
  /** How long the flight lasts after contact, when the trick decides it. */
  readonly duration?: number;
  /** Plays a whole routine from the throw, from the thrower's card to the target's layout box. */
  perform?(
    ms: number,
    actor: THREE.Group,
    source: TargetBounds,
    b: TargetBounds,
    view: Point,
  ): void;
  cardAnimation?(facing: number): CardAnimation;
  /** Takes over from the landed model once the throw makes contact. */
  afterContact?(
    ms: number,
    b: TargetBounds,
    cards: readonly HTMLElement[],
    rect: (card: HTMLElement) => TargetBounds,
  ): void;
  /** Releases anything the trick changed outside the WebGL scene. */
  dispose?(): void;
}

/** Everything the throw engine needs to stage one throwable character. */
export interface CharacterDefinition<P = unknown> {
  readonly emoji: string;
  makeModel(id: string): THREE.Group;
  /** Landing length for a character that has no act of its own. */
  readonly landingDuration?: number;
  /** The character walks up from the thrower's side of the card. */
  readonly pinsSide?: boolean;
  /** The flight keeps the plain throw profile instead of the emoji's style. */
  readonly keepsThrowProfile?: boolean;
  prepareFlight?(flight: FlightSetup): void;
  /** Flight path point, or undefined to use the emoji's style. */
  motion?(start: Point, end: Point, profile: FlightProfile, t: number): Point | undefined;
  styleProfile?(profile: FlightProfile): FlightProfile;
  createAct?(stage: ActStage, id: string): CharacterAct;
  createFlightTrick?(setup: FlightTrickSetup): FlightTrick;
  planOf?(act: CharacterAct): P | undefined;
}

export const facingFrom = (b: TargetBounds, end: Point) =>
  Math.sign(b.left + b.width / 2 - end.x) || 1;
