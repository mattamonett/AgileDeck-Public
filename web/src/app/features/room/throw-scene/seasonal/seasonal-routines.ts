import type * as THREE from 'three';
import type {
  ChristmasProjectile,
  HalloweenProjectile,
  ThanksgivingProjectile,
} from '@poker/shared';
import type { Point } from '../flight/flight-math';
import type { TargetBounds } from '../landing/landing-geometry';
import type { CharacterRoutine } from '../kit';
import { mummyLandingPoint, type MummyPlan } from '../characters/mummy/mummy-choreography';
import { MummyTrick } from '../characters/mummy/mummy-trick';
import { vampireLandingPoint, type VampirePlan } from '../characters/vampire/vampire-choreography';
import { VampireTrick } from '../characters/vampire/vampire-trick';
import { witchLandingPoint, type WitchPlan } from '../characters/witch/witch-choreography';
import { WitchTrick } from '../characters/witch/witch-trick';
import { dollLandingPoint, type DollPlan } from '../characters/doll/doll-choreography';
import { DollTrick } from '../characters/doll/doll-trick';
import { spiderLandingPoint, type SpiderPlan } from '../characters/spider/spider-choreography';
import { SpiderTrick } from '../characters/spider/spider-trick';
import { pumpkinLandingPoint, type PumpkinPlan } from '../characters/pumpkin/pumpkin-choreography';
import { PumpkinTrick } from '../characters/pumpkin/pumpkin-trick';
import { santaLandingPoint, type SantaPlan } from '../characters/santa/santa-choreography';
import { SantaTrick } from '../characters/santa/santa-trick';
import {
  reindeerLandingPoint,
  type ReindeerPlan,
} from '../characters/reindeer/reindeer-choreography';
import { ReindeerTrick } from '../characters/reindeer/reindeer-trick';
import { elfLandingPoint, type ElfPlan } from '../characters/elf/elf-choreography';
import { ElfTrick } from '../characters/elf/elf-trick';
import { snowmanLandingPoint, type SnowmanPlan } from '../characters/snowman/snowman-choreography';
import { SnowmanTrick } from '../characters/snowman/snowman-trick';
import {
  gingerbreadLandingPoint,
  type GingerbreadPlan,
} from '../characters/gingerbread/gingerbread-choreography';
import { GingerbreadTrick } from '../characters/gingerbread/gingerbread-trick';
import { turkeyLandingPoint, type TurkeyPlan } from '../characters/turkey/turkey-choreography';
import { TurkeyTrick } from '../characters/turkey/turkey-trick';
import { piechefLandingPoint, type PiechefPlan } from '../characters/piechef/piechef-choreography';
import { PiechefTrick } from '../characters/piechef/piechef-trick';
import { gravyLandingPoint, type GravyPlan } from '../characters/gravy/gravy-choreography';
import { GravyTrick } from '../characters/gravy/gravy-trick';
import {
  scarecrowLandingPoint,
  type ScarecrowPlan,
} from '../characters/scarecrow/scarecrow-choreography';
import { ScarecrowTrick } from '../characters/scarecrow/scarecrow-trick';
import { bearLandingPoint, type BearPlan } from '../characters/bear/bear-choreography';
import { BearTrick } from '../characters/bear/bear-trick';
import {
  squirrelLandingPoint,
  type SquirrelPlan,
} from '../characters/squirrel/squirrel-choreography';
import { SquirrelTrick } from '../characters/squirrel/squirrel-trick';

export type SeasonalProjectile = HalloweenProjectile | ChristmasProjectile | ThanksgivingProjectile;
export type SeasonalPlan =
  | MummyPlan
  | VampirePlan
  | WitchPlan
  | DollPlan
  | SpiderPlan
  | PumpkinPlan
  | SantaPlan
  | ReindeerPlan
  | ElfPlan
  | SnowmanPlan
  | GingerbreadPlan
  | TurkeyPlan
  | PiechefPlan
  | GravyPlan
  | ScarecrowPlan
  | BearPlan
  | SquirrelPlan;
export type SeasonalAct = CharacterRoutine & { readonly plan: SeasonalPlan };

/** Each seasonal performance owns its event plan through the model built for that throw. */
export function seasonalRoutine(kind: SeasonalProjectile, actor: THREE.Group): SeasonalAct {
  switch (kind) {
    case '🤕':
      return new MummyTrick(actor);
    case '🧛':
      return new VampireTrick(actor);
    case '🧙':
      return new WitchTrick(actor);
    case '🪆':
      return new DollTrick(actor);
    case '🕷️':
      return new SpiderTrick(actor);
    case '🎃':
      return new PumpkinTrick(actor);
    case '🎅':
      return new SantaTrick(actor);
    case '🦌':
      return new ReindeerTrick(actor);
    case '🧝':
      return new ElfTrick(actor);
    case '⛄':
      return new SnowmanTrick(actor);
    case '🍪':
      return new GingerbreadTrick(actor);
    case '🦃':
      return new TurkeyTrick(actor);
    case '🥷':
      return new PiechefTrick(actor);
    case '🫗':
      return new GravyTrick(actor);
    case '🌽':
      return new ScarecrowTrick(actor);
    case '🐻':
      return new BearTrick(actor);
    case '🐿️':
      return new SquirrelTrick(actor);
  }
}

export function seasonalLandingPoint(
  plan: SeasonalPlan,
  b: TargetBounds,
  view: Point,
  chosen?: number,
): Point {
  switch (plan.kind) {
    case '🤕':
      return mummyLandingPoint(plan, b, view, chosen);
    case '🧛':
      return vampireLandingPoint(plan, b, view, chosen);
    case '🧙':
      return witchLandingPoint(plan, b, view, chosen);
    case '🪆':
      return dollLandingPoint(plan, b, view, chosen);
    case '🕷️':
      return spiderLandingPoint(plan, b, view, chosen);
    case '🎃':
      return pumpkinLandingPoint(plan, b, view, chosen);
    case '🎅':
      return santaLandingPoint(plan, b, view, chosen);
    case '🦌':
      return reindeerLandingPoint(plan, b, view, chosen);
    case '🧝':
      return elfLandingPoint(plan, b, view, chosen);
    case '⛄':
      return snowmanLandingPoint(plan, b, view, chosen);
    case '🍪':
      return gingerbreadLandingPoint(plan, b, view, chosen);
    case '🦃':
      return turkeyLandingPoint(plan, b, view, chosen);
    case '🥷':
      return piechefLandingPoint(plan, b, view, chosen);
    case '🫗':
      return gravyLandingPoint(plan, b, view, chosen);
    case '🌽':
      return scarecrowLandingPoint(plan, b, view, chosen);
    case '🐻':
      return bearLandingPoint(plan, b, view, chosen);
    case '🐿️':
      return squirrelLandingPoint(plan, b, view, chosen);
  }
}
