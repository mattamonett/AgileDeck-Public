import type { CharacterDefinition } from '../../character';
import { hopPoint } from '../../flight/flight-math';
import { makeGrimReaper, ReaperTrick, reaperWalk } from './grim-reaper';
import { reaperApproach, reaperLandingPoint } from './reaper-choreography';

export const reaperCharacter: CharacterDefinition<ReaperTrick['plan']> = {
  emoji: '☠️',
  makeModel: () => makeGrimReaper(),
  motion: (start, end, _profile, t) => hopPoint(start, end, t, 8),
  createAct(stage, id) {
    const trick = new ReaperTrick(id);
    const plan = trick.plan;
    return {
      trick,
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      cardAnimation: (facing) => trick.cardAnimation(facing),
      land: (ms, b, end, viewport) => trick.update(ms, stage.projectile, b, end, viewport),
      landingPoint: (at) => reaperLandingPoint(plan, at.b, at.view),
      approachDuration(distance) {
        return (1650 + Math.min(700, distance * 0.65)) * plan.pace;
      },
      approach({ t, start, end, b, view }) {
        const object = stage.projectile;
        const contactFacing = Math.sign(b.left + b.width / 2 - end.x) || 1;
        const point = reaperApproach(plan, start, end, view, t);
        const previous = reaperApproach(plan, start, end, view, Math.max(0, t - 0.005));
        const facing = t > 0.94 ? contactFacing : Math.sign(point.x - previous.x) || contactFacing;
        reaperWalk(object, Math.hypot(point.x - start.x, point.y - start.y) / 140, facing);
        object.position.set(point.x, -point.y, 140);
        return true;
      },
    };
  },
  planOf: (act) => (act.trick instanceof ReaperTrick ? act.trick.plan : undefined),
};
