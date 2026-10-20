import {
  isChristmasProjectile,
  isHalloweenProjectile,
  isThanksgivingProjectile,
} from '@poker/shared';
import type { CharacterDefinition } from './character';
import { seasonalCharacter } from './seasonal/seasonal-character';
import { alienCharacter } from './characters/alien/alien-character';
import { architectCharacter } from './characters/architect/architect-character';
import { babyCharacter } from './characters/baby/baby-character';
import { bouquetCharacter } from './characters/bouquet/bouquet-character';
import { bulletTimeCharacter } from './characters/bullettime/bullettime-character';
import { carCharacter } from './characters/car/car-character';
import { catCharacter } from './characters/cat/cat-character';
import { chainsawCharacter } from './characters/chainsaw/chainsaw-character';
import { dinosaurCharacter } from './characters/dinosaur/dinosaur-character';
import { dogCharacter } from './characters/dog/dog-character';
import { dumpsterCharacter } from './characters/dumpster/dumpster-character';
import { ghostCharacter } from './characters/ghost/ghost-character';
import { goatCharacter } from './characters/goat/goat-character';
import { hatCharacter } from './characters/hat/hat-character';
import { heartCharacter } from './characters/heart/heart-character';
import { hippieCharacter } from './characters/hippie/hippie-character';
import { laxativeCharacter } from './characters/laxative/laxative-character';
import { melloMaryCharacter } from './characters/mellomary/mellomary-character';
import { monkeyCharacter } from './characters/monkey/monkey-character';
import { nillCharacter } from './characters/nill/nill-character';
import { pigeonCharacter } from './characters/pigeon/pigeon-character';
import { reaperCharacter } from './characters/reaper/reaper-character';
import { rocketCharacter } from './characters/rocket/rocket-character';
import { sharkCharacter } from './characters/shark/shark-character';
import { sunglassesCharacter } from './characters/sunglasses/sunglasses-character';
import { tomatoCharacter } from './characters/tomato/tomato-character';
import { trumpCharacter } from './characters/trump/trump-character';
import { ufoCharacter } from './characters/ufo/ufo-character';
import { unicornCharacter } from './characters/unicorn/unicorn-character';
import { wrestlerCharacter } from './characters/wrestler/wrestler-character';
import { zombieCharacter } from './characters/zombie/zombie-character';

/** Every throwable character with its own model. Adding a character adds one entry here. */
const CHARACTERS: readonly CharacterDefinition[] = [
  alienCharacter,
  architectCharacter,
  babyCharacter,
  bouquetCharacter,
  bulletTimeCharacter,
  carCharacter,
  catCharacter,
  chainsawCharacter,
  dinosaurCharacter,
  dogCharacter,
  dumpsterCharacter,
  ghostCharacter,
  goatCharacter,
  hatCharacter,
  heartCharacter,
  hippieCharacter,
  laxativeCharacter,
  melloMaryCharacter,
  monkeyCharacter,
  nillCharacter,
  pigeonCharacter,
  reaperCharacter,
  rocketCharacter,
  sharkCharacter,
  sunglassesCharacter,
  tomatoCharacter,
  trumpCharacter,
  ufoCharacter,
  unicornCharacter,
  wrestlerCharacter,
  zombieCharacter,
];
const byEmoji = new Map(CHARACTERS.map((character) => [character.emoji, character]));

/** The character thrown as this emoji, or undefined for a plain prop. */
export function characterFor(emoji: string): CharacterDefinition | undefined {
  if (
    isHalloweenProjectile(emoji) ||
    isChristmasProjectile(emoji) ||
    isThanksgivingProjectile(emoji)
  )
    return seasonalCharacter(emoji);
  return byEmoji.get(emoji);
}
