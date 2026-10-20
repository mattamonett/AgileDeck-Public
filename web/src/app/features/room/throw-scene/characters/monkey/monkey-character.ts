import type { CharacterDefinition } from '../../character';
import { makeMonkey, MonkeyTrick } from './monkey-trick';

export const monkeyCharacter: CharacterDefinition = {
  emoji: '🐒',
  makeModel: () => makeMonkey(),
  createFlightTrick({ id }) {
    const trick = new MonkeyTrick(id);
    return {
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      perform: (ms, actor, source, b, view) => trick.update(ms, actor, source, b, view),
      cardAnimation: (facing) => trick.cardAnimation(facing),
    };
  },
};
