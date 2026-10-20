import { facingFrom, type CharacterDefinition } from '../../character';
import { bouquetLandingPoint } from './bouquet-choreography';
import { makeBouquet } from './bouquet-model';
import { BouquetTrick } from './bouquet-trick';

export const bouquetCharacter: CharacterDefinition<BouquetTrick['plan']> = {
  emoji: '💐',
  makeModel: (id) => makeBouquet(id),
  keepsThrowProfile: true,
  createAct(stage) {
    const trick = new BouquetTrick(stage.projectile);
    const plan = trick.plan;
    return {
      trick,
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      cardAnimation: (facing) => trick.cardAnimation(facing),
      perform(ms, at) {
        stage.object.visible = ms < trick.duration;
        stage.object.position.set(0, 0, 0);
        trick.update(ms, stage.projectile, at.start, at.b, at.view, facingFrom(at.b, at.end));
      },
      landingPoint: (at) => bouquetLandingPoint(plan, at.b, at.view, at.facing),
    };
  },
  planOf: (act) => (act.trick instanceof BouquetTrick ? act.trick.plan : undefined),
};
