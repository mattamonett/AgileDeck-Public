import type { CharacterDefinition } from '../../character';
import { alienLandingPoint, alienApproach } from './alien-choreography';
import { makeAlien, AlienTrick, alienTravel } from './alien-trick';
import { hopPoint } from '../../flight/flight-math';

export const alienCharacter: CharacterDefinition<AlienTrick['plan']> = {
  emoji: '👽',
  makeModel: () => makeAlien(),
  motion: (start, end, _profile, t) => hopPoint(start, end, t, 8),
  createAct(stage, id) {
    const trick = new AlienTrick(id);
    const plan = trick.plan;
    return {
      trick,
      object: trick.object,
      get duration() {
        return trick.duration;
      },
      cardAnimation: (facing, bounds) => trick.cardAnimation(facing, bounds),
      land(ms, b, end, viewport) {
        stage.object.position.set(0, 0, 0);
        trick.update(
          ms,
          stage.projectile,
          b,
          end,
          viewport ?? { x: window.innerWidth, y: window.innerHeight },
        );
      },
      initialEnd: (b, view) => alienLandingPoint(plan, b, view),
      landingPoint: (at) => alienLandingPoint(plan, at.b, at.view),
      approachDuration(distance) {
        return (1300 + Math.min(650, distance)) * plan.pace;
      },
      approach({ t, start, end, b, view }) {
        const object = stage.projectile;
        const facing = end.x < b.left + b.width / 2 ? 1 : -1;
        const point = alienApproach(plan, start, end, facing, view, t);
        const previous = alienApproach(plan, start, end, facing, view, Math.max(0, t - 0.005));
        const travelFacing = t > 0.94 ? facing : Math.sign(point.x - previous.x) || facing;
        object.position.set(point.x, -point.y, 140);
        alienTravel(
          object,
          plan,
          t,
          travelFacing,
          Math.hypot(point.x - start.x, point.y - start.y),
        );
        return true;
      },
    };
  },
  planOf: (act) => (act.trick instanceof AlienTrick ? act.trick.plan : undefined),
};
