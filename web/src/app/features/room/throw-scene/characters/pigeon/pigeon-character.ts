import type { CharacterDefinition } from '../../character';
import { pigeonApproach, pigeonLandingPoint, pigeonFacing } from './pigeon-choreography';
import { pigeonTravel } from './pigeon-model';
import { makePigeon, pigeonPoint, PigeonTrick } from './po-pigeon';

export const pigeonCharacter: CharacterDefinition<PigeonTrick['plan']> = {
  emoji: '🕊️',
  makeModel: () => makePigeon(),
  motion(start, end, profile, t) {
    return pigeonPoint(start, end, t);
  },
  createAct(stage, id) {
    const trick = new PigeonTrick(id);
    const plan = trick.plan;
    return {
      trick,
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      cardAnimation: (facing) => trick.cardAnimation(facing),
      land: (ms, b, end, viewport) => trick.update(ms, stage.projectile, b, end, viewport),
      landingPoint: (at) => pigeonLandingPoint(plan, at.b, at.view),
      approachDuration(distance) {
        return (1450 + Math.min(650, distance * 0.65)) * plan.pace;
      },
      approach({ t, elapsed, start, end, b, view }) {
        const object = stage.projectile;
        const point = pigeonApproach(plan, start, end, view, t);
        const previous = pigeonApproach(plan, start, end, view, Math.max(0, t - 0.005));
        const contactFacing = pigeonFacing(end, b);
        pigeonTravel(
          object,
          plan,
          t,
          elapsed / plan.pace,
          start,
          end,
          point,
          previous,
          contactFacing,
        );
        object.position.set(point.x, -point.y, 160);
        return true;
      },
    };
  },
  planOf: (act) => (act.trick instanceof PigeonTrick ? act.trick.plan : undefined),
};
