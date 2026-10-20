import type { CharacterDefinition } from '../../character';
import { tomatoContact } from './tomato-choreography';
import { makeTomato } from './tomato-model';
import { TomatoTrick } from './tomato-trick';

export const tomatoCharacter: CharacterDefinition<TomatoTrick['plan']> = {
  emoji: '🍅',
  makeModel: (id) => makeTomato(id),
  keepsThrowProfile: true,
  createAct(stage) {
    const trick = new TomatoTrick(stage.projectile);
    const plan = trick.plan;
    return {
      trick,
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      cardAnimation: () => trick.cardAnimation(),
      perform(ms, at) {
        stage.object.visible = ms < trick.duration;
        stage.object.position.set(0, 0, 0);
        trick.update(ms, stage.projectile, at.start, at.b, at.view);
      },
      landingPoint: (at) => tomatoContact(plan, at.b),
    };
  },
  planOf: (act) => (act.trick instanceof TomatoTrick ? act.trick.plan : undefined),
};
