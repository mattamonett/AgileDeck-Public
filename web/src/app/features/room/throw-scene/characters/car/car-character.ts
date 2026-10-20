import type { CharacterDefinition } from '../../character';
import { carLandingPoint } from './car-choreography';
import { makeRaceCar, racePoint, CarTrick } from './racing-car';

export const carCharacter: CharacterDefinition<CarTrick['plan']> = {
  emoji: '🏎️',
  makeModel: () => makeRaceCar(),
  pinsSide: true,
  prepareFlight(flight) {
    flight.profile.race = {
      bounds: flight.raceBounds(),
      facing: flight.variation.x < 0.5 ? 1 : -1,
      seed: flight.id,
    };
  },
  motion(start, end, profile, t) {
    return profile.race
      ? racePoint(start, end, t, profile.race.bounds, profile.race.facing, profile.race.seed)
      : undefined;
  },
  styleProfile(profile) {
    return { ...profile, duration: 2100, height: 0 };
  },
  createAct(stage, id) {
    const trick = new CarTrick(id);
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
        carLandingPoint(plan, at.b, at.view, at.start, at.landed ? at.facing : undefined),
      approachDuration(distance) {
        return (1200 + Math.min(650, distance * 0.7)) * plan.pace;
      },
      approach({ t, start, end, b, profile }) {
        const object = stage.projectile;
        if (!profile.race) return false;
        const facing = Math.sign(b.left + b.width / 2 - end.x) || 1;
        stage.object.visible = true;
        stage.object.position.set(end.x, -end.y, 150);
        trick.travel(t, object, start, end, profile.race.bounds, facing, b);
        return true;
      },
    };
  },
  planOf: (act) => (act.trick instanceof CarTrick ? act.trick.plan : undefined),
};
