import type { CharacterDefinition } from '../../character';
import { makeLaxative, LaxativeTrick, LAXATIVE_DURATION } from './laxative-trick';

export const laxativeCharacter: CharacterDefinition = {
  emoji: '💊',
  makeModel: () => makeLaxative(),
  landingDuration: LAXATIVE_DURATION,
  createFlightTrick({ id, target, b, start, variation }) {
    const trick = new LaxativeTrick(
      id,
      target,
      Math.sign(b.left + b.width / 2 - start.x) || (variation.x < 0.5 ? 1 : -1),
    );
    return {
      object: trick.object,
      afterContact: (ms, bounds, cards, rect) => trick.update(ms, bounds, cards, rect),
      dispose: () => trick.dispose(),
    };
  },
};
