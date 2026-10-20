import type { CharacterDefinition } from '../../character';
import { catApproach, catLandingPoint } from './cat-choreography';
import { catWalk } from './cat-model';
import { CatTrick } from './cat-trick';
import { makePet } from '../pet/pet-trick';

export const catCharacter: CharacterDefinition<CatTrick['plan']> = {
  emoji: '🐱',
  makeModel: () => makePet(false),
  createAct(stage, id) {
    const trick = new CatTrick(id);
    const plan = trick.plan;
    return {
      trick,
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      cardAnimation: (facing) => trick.cardAnimation(facing),
      land: (ms, b, end, viewport) => trick.update(ms, stage.projectile, b, end, viewport),
      landingPoint: (at) => catLandingPoint(plan, at.b, at.view),
      approachDuration(distance) {
        return (1500 + Math.min(700, distance * 0.65)) * plan.pace;
      },
      approach({ t, elapsed, start, end, b, view, profile }) {
        const object = stage.projectile;
        const contactFacing = Math.sign(b.left + b.width / 2 - end.x) || 1;
        const point = catApproach(plan, start, end, view, t);
        const previous = catApproach(plan, start, end, view, Math.max(0, t - 0.005));
        const facing = t > 0.94 ? contactFacing : Math.sign(point.x - previous.x) || contactFacing;
        const distance = Math.hypot(point.x - start.x, point.y - start.y);
        const stride = Math.min(
          1,
          (Math.hypot(point.x - previous.x, point.y - previous.y) / (profile.duration * 0.005)) * 7,
        );
        catWalk(object, distance, facing, elapsed * plan.strength, stride);
        object.position.set(point.x, -point.y, 140);
        return true;
      },
    };
  },
  planOf: (act) => (act.trick instanceof CatTrick ? act.trick.plan : undefined),
};
