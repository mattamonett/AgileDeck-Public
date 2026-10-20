import { isChristmasProjectile, isThanksgivingProjectile } from '@poker/shared';
import { facingFrom, type CharacterAct, type CharacterDefinition } from '../character';
import { hopPoint } from '../flight/flight-math';
import { makeSeasonalCharacter } from './seasonal-models';
import {
  seasonalLandingPoint,
  seasonalRoutine,
  type SeasonalPlan,
  type SeasonalProjectile,
} from './seasonal-routines';

const characters = new Map<SeasonalProjectile, CharacterDefinition<SeasonalPlan>>();
const plans = new WeakMap<CharacterAct, SeasonalPlan>();

/** The seasonal characters share one performance path; each emoji gets its own definition. */
export function seasonalCharacter(kind: SeasonalProjectile): CharacterDefinition<SeasonalPlan> {
  const known = characters.get(kind);
  if (known) return known;
  const hops =
    isChristmasProjectile(kind) || isThanksgivingProjectile(kind) || kind === '🤕' || kind === '🪆';
  const character: CharacterDefinition<SeasonalPlan> = {
    emoji: kind,
    makeModel: (id) => makeSeasonalCharacter(kind, id),
    motion: (start, end, _profile, t) => (hops ? hopPoint(start, end, t, 8) : undefined),
    createAct(stage) {
      const routine = seasonalRoutine(kind, stage.projectile);
      const act: CharacterAct = {
        trick: routine,
        object: routine.object,
        get duration() {
          return routine.duration;
        },
        cardAnimation: (facing, bounds) => routine.cardAnimation(facing, bounds),
        perform(ms, at) {
          stage.object.visible = ms < routine.duration;
          stage.object.position.set(0, 0, 0);
          routine.update(ms, stage.projectile, at.start, at.b, at.view, facingFrom(at.b, at.end));
        },
        landingPoint: (at) => seasonalLandingPoint(routine.plan, at.b, at.view, at.facing),
      };
      plans.set(act, routine.plan);
      return act;
    },
    planOf: (act) => plans.get(act),
  };
  characters.set(kind, character);
  return character;
}
