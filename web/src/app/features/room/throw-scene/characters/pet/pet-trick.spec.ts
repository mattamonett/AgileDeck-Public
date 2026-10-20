import { describe, expect, it } from 'vitest';
import { makePet } from './pet-trick';
import { LandingEffect, landingKind } from '../../landing/landing-effects';
import { disposeObject } from '../../engine/throw-models';

const end = { x: 120, y: 240 };
describe('pet interactions', () => {
  it('registers both effects and hides them when their lifetime ends', () => {
    for (const kind of ['🐱', '🐶'] as const) {
      expect(landingKind(kind)).toBe(kind);
      const pet = makePet(kind === '🐶');
      const effect = new LandingEffect(kind, pet);
      effect.update(effect.duration, { left: 100, top: 100, width: 100, height: 150 }, end);
      expect(effect.object.visible).toBe(false);
      expect(pet.visible).toBe(false);
      disposeObject(effect.object);
      disposeObject(pet);
    }
  });
});
