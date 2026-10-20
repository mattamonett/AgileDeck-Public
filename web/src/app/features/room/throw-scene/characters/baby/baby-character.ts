import type { CharacterDefinition } from '../../character';
import { makeBabyBrent, babyCrawl } from './baby-brent';
import { babyLandingPoint, babyApproach, babyApproachFacing } from './baby-choreography';
import { BabyTrick } from './baby-trick';
import { hopPoint } from '../../flight/flight-math';

export const babyCharacter: CharacterDefinition<BabyTrick['plan']> = {
  emoji: '👶',
  makeModel: () => makeBabyBrent(),
  pinsSide: true,
  motion: (start, end, _profile, t) => hopPoint(start, end, t, 8),
  createAct(stage, id) {
    const trick = new BabyTrick(id);
    const plan = trick.plan;
    return {
      trick,
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      cardAnimation: (facing) => trick.cardAnimation(facing),
      land: (ms, b, end, viewport) => trick.update(ms, stage.projectile, b, end, viewport),
      landingPoint: (at) =>
        babyLandingPoint(plan, at.b, at.view, at.start, at.landed ? at.facing : undefined),
      approachDuration(distance) {
        return (1800 + Math.min(700, distance * 0.8)) * plan.pace;
      },
      approach({ t, start, end, b, view }) {
        const object = stage.projectile;
        const point = babyApproach(plan, start, end, view, t, b);
        const previous = babyApproach(plan, start, end, view, Math.max(0, t - 0.005), b);
        const facing = babyApproachFacing(plan, start, end, b, t);
        const stride = Math.min(1, Math.hypot(point.x - previous.x, point.y - previous.y));
        object.position.set(point.x, -point.y, 165);
        babyCrawl(
          object,
          Math.hypot(point.x - start.x, point.y - start.y),
          facing,
          stride,
          plan.step,
        );
        return true;
      },
    };
  },
  planOf: (act) => (act.trick instanceof BabyTrick ? act.trick.plan : undefined),
};
