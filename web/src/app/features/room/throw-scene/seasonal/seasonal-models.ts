import type * as THREE from 'three';
import type { SeasonalProjectile } from './seasonal-routines';
import { makeMummy } from '../characters/mummy/mummy-model';
import { makeVampire } from '../characters/vampire/vampire-model';
import { makeWitch } from '../characters/witch/witch-model';
import { makeDoll } from '../characters/doll/doll-model';
import { makeSpider } from '../characters/spider/spider-model';
import { makePumpkin } from '../characters/pumpkin/pumpkin-model';
import { makeSanta } from '../characters/santa/santa-model';
import { makeReindeer } from '../characters/reindeer/reindeer-model';
import { makeElf } from '../characters/elf/elf-model';
import { makeSnowman } from '../characters/snowman/snowman-model';
import { makeGingerbread } from '../characters/gingerbread/gingerbread-model';
import { makeTurkey } from '../characters/turkey/turkey-model';
import { makePiechef } from '../characters/piechef/piechef-model';
import { makeGravy } from '../characters/gravy/gravy-model';
import { makeScarecrow } from '../characters/scarecrow/scarecrow-model';
import { makeBear } from '../characters/bear/bear-model';
import { makeSquirrel } from '../characters/squirrel/squirrel-model';

/** Each model owns the event-seeded plan that its performance reads back. */
export function makeSeasonalCharacter(kind: SeasonalProjectile, id: string): THREE.Group {
  switch (kind) {
    case '🤕':
      return makeMummy(id);
    case '🧛':
      return makeVampire(id);
    case '🧙':
      return makeWitch(id);
    case '🪆':
      return makeDoll(id);
    case '🕷️':
      return makeSpider(id);
    case '🎃':
      return makePumpkin(id);
    case '🎅':
      return makeSanta(id);
    case '🦌':
      return makeReindeer(id);
    case '🧝':
      return makeElf(id);
    case '⛄':
      return makeSnowman(id);
    case '🍪':
      return makeGingerbread(id);
    case '🦃':
      return makeTurkey(id);
    case '🥷':
      return makePiechef(id);
    case '🫗':
      return makeGravy(id);
    case '🌽':
      return makeScarecrow(id);
    case '🐻':
      return makeBear(id);
    case '🐿️':
      return makeSquirrel(id);
  }
}
