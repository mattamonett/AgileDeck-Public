import type { LandingContext } from '../character';
import type { Point } from './flight-math';
import { landingPoint, type LandingEffect, type TargetBounds } from '../landing/landing-effects';

const CARDS = '[data-player-id] .card-display, [data-observer-id]';

/** Every player and observer card in the room. */
export function roomCards(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CARDS));
}

/** The area around every card, which is where a race may drive. */
export function raceBounds(root: HTMLElement): TargetBounds {
  const rects = roomCards(root).map((card) => card.getBoundingClientRect());
  if (!rects.length)
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  const left = Math.max(0, Math.min(...rects.map((b) => b.left)) - 70);
  const top = Math.max(0, Math.min(...rects.map((b) => b.top)) - 65);
  const right = Math.min(window.innerWidth, Math.max(...rects.map((b) => b.right)) + 70);
  const bottom = Math.min(window.innerHeight, Math.max(...rects.map((b) => b.bottom)) + 65);
  return { left, top, width: Math.max(100, right - left), height: Math.max(100, bottom - top) };
}

/**
 * The target card's bounds for this frame. A staged performance reads the card's layout box,
 * not its animated bounding box, to avoid feedback from its own card animation into contact
 * geometry; everything else uses the measured box.
 */
export function cardBounds(
  target: HTMLElement,
  measured: DOMRect,
  staged: boolean,
  rect: (element: HTMLElement) => DOMRect,
): DOMRect {
  const parent = target.offsetParent;
  const parentBounds = staged && parent instanceof HTMLElement ? rect(parent) : null;
  return parentBounds
    ? new DOMRect(
        parentBounds.left + target.offsetLeft,
        parentBounds.top + target.offsetTop,
        target.offsetWidth,
        target.offsetHeight,
      )
    : measured;
}

/** Where the throw meets the card: the character's own contact point, or the generic spot. */
export function contactPoint(landing: LandingEffect | null, at: LandingContext): Point {
  return landing?.act
    ? landing.act.landingPoint(at)
    : landingPoint(landing?.kind ?? null, at.b, at.variation);
}
