import type { CharacterDefinition } from '../../character';
import { dumpsterLandingPoint } from './dumpster-choreography';
import { makeDumpster } from './dumpster-model';
import { DumpsterTrick } from './dumpster-trick';

export const dumpsterCharacter: CharacterDefinition<DumpsterTrick['plan']> = {
  emoji: '🗑️',
  makeModel: (id) => makeDumpster(id),
  createAct(stage) {
    const trick = new DumpsterTrick(stage.projectile);
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
      landingPoint: (at) => dumpsterLandingPoint(at.b, at.view),
    };
  },
  planOf: (act) => (act.trick instanceof DumpsterTrick ? act.trick.plan : undefined),
};
