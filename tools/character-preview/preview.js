import * as THREE from 'three';
import { ThrowRenderer } from '../../web/src/app/features/room/throw-scene/engine/throw-renderer';
import {
  AlienTrick,
  makeAlien,
} from '../../web/src/app/features/room/throw-scene/characters/alien/alien-trick';
import {
  alienPlan,
  alienLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/alien/alien-choreography';
import { disposeObject } from '../../web/src/app/features/room/throw-scene/engine/throw-models';
import { makeProjectile } from '../../web/src/app/features/room/throw-scene/engine/throw-models';
import {
  LandingEffect,
  landingPoint,
  landingVariation,
} from '../../web/src/app/features/room/throw-scene/landing/landing-effects';
import {
  LaxativeTrick,
  laxativePlan,
} from '../../web/src/app/features/room/throw-scene/characters/laxative/laxative-trick';
import {
  zombiePlan,
  zombieLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/zombie/zombie-trick';
import {
  chainsawPlan,
  chainsawLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/chainsaw/chainsaw-choreography';
import {
  reaperPlan,
  reaperLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/reaper/reaper-choreography';
import {
  dogPlan,
  dogLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/dog/dog-choreography';
import {
  catPlan,
  catLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/cat/cat-choreography';
import {
  hatPlan,
  hatLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/hat/hat-choreography';
import {
  pigeonPlan,
  pigeonLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/pigeon/pigeon-choreography';
import { MonkeyTrick } from '../../web/src/app/features/room/throw-scene/characters/monkey/monkey-trick';
import {
  monkeyPlan,
  monkeyFacing,
} from '../../web/src/app/features/room/throw-scene/characters/monkey/monkey-choreography';
import {
  sharkPlan,
  sharkLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/shark/shark-choreography';
import {
  nillPlan,
  nillLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/nill/nill-choreography';
import {
  carPlan,
  carLandingPoint,
  carClimb,
} from '../../web/src/app/features/room/throw-scene/characters/car/car-choreography';
import {
  trumpPlan,
  trumpLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/trump/trump-choreography';
import {
  architectPlan,
  architectLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/architect/architect-choreography';
import {
  babyPlan,
  babyLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/baby/baby-choreography';
import {
  wrestlerPlan,
  wrestlerLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/wrestler/wrestler-choreography';
import {
  goatPlan,
  goatLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/goat/goat-choreography';
import {
  ufoPlan,
  ufoLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/ufo/ufo-choreography';
import {
  sunglassesPlan,
  sunglassesLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/sunglasses/sunglasses-choreography';
import { RainbowRide } from '../../web/src/app/features/room/throw-scene/characters/unicorn/unicorn-flight';
import {
  unicornPlan,
  unicornArrival,
  unicornLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/unicorn/unicorn-choreography';
import {
  HeartTrick,
  heartHalfPose,
} from '../../web/src/app/features/room/throw-scene/characters/heart/heart-trick';
import { heartModel } from '../../web/src/app/features/room/throw-scene/characters/heart/broken-heart';
import { heartPlan } from '../../web/src/app/features/room/throw-scene/characters/heart/heart-choreography';
import { DinosaurTrick } from '../../web/src/app/features/room/throw-scene/characters/dinosaur/dinosaur-trick';
import {
  dinoPlan,
  dinoArrival,
  dinoLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/dinosaur/dinosaur-choreography';
import { BouquetTrick } from '../../web/src/app/features/room/throw-scene/characters/bouquet/bouquet-trick';
import {
  bouquetPlan,
  bouquetLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/bouquet/bouquet-choreography';
import { MelloMaryTrick } from '../../web/src/app/features/room/throw-scene/characters/mellomary/mellomary-trick';
import {
  melloPlan,
  melloLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/mellomary/mellomary-choreography';
import { HippieTrick } from '../../web/src/app/features/room/throw-scene/characters/hippie/hippie-trick';
import { BulletTimeTrick } from '../../web/src/app/features/room/throw-scene/characters/bullettime/bullettime-trick';
import {
  bulletTimePlan,
  bulletLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/bullettime/bullettime-choreography';
import { GhostTrick } from '../../web/src/app/features/room/throw-scene/characters/ghost/ghost-trick';
import { DumpsterTrick } from '../../web/src/app/features/room/throw-scene/characters/dumpster/dumpster-trick';
import {
  dumpsterPlan,
  dumpsterSlamHit,
} from '../../web/src/app/features/room/throw-scene/characters/dumpster/dumpster-choreography';
import {
  ghostPlan,
  ghostLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/ghost/ghost-choreography';
import {
  hippiePlan,
  hippieLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/hippie/hippie-choreography';
import { TomatoTrick } from '../../web/src/app/features/room/throw-scene/characters/tomato/tomato-trick';
import { tomatoPlan } from '../../web/src/app/features/room/throw-scene/characters/tomato/tomato-choreography';
import { RocketTrick } from '../../web/src/app/features/room/throw-scene/characters/rocket/rocket-trick';
import {
  rocketPlan,
  rocketLandingPoint,
} from '../../web/src/app/features/room/throw-scene/characters/rocket/rocket-choreography';
import {
  seasonalRoutine,
  seasonalLandingPoint,
} from '../../web/src/app/features/room/throw-scene/seasonal/seasonal-routines';
import { mummyPlan } from '../../web/src/app/features/room/throw-scene/characters/mummy/mummy-choreography';
import { vampirePlan } from '../../web/src/app/features/room/throw-scene/characters/vampire/vampire-choreography';
import { witchPlan } from '../../web/src/app/features/room/throw-scene/characters/witch/witch-choreography';
import {
  dollPlan,
  dollPrintAt,
} from '../../web/src/app/features/room/throw-scene/characters/doll/doll-choreography';
import { spiderPlan } from '../../web/src/app/features/room/throw-scene/characters/spider/spider-choreography';
import { pumpkinPlan } from '../../web/src/app/features/room/throw-scene/characters/pumpkin/pumpkin-choreography';
import { reindeerPlan } from '../../web/src/app/features/room/throw-scene/characters/reindeer/reindeer-choreography';
import { gingerbreadPlan } from '../../web/src/app/features/room/throw-scene/characters/gingerbread/gingerbread-choreography';
import { turkeyPlan } from '../../web/src/app/features/room/throw-scene/characters/turkey/turkey-choreography';
import { gravyPlan } from '../../web/src/app/features/room/throw-scene/characters/gravy/gravy-choreography';
import { santaPlan } from '../../web/src/app/features/room/throw-scene/characters/santa/santa-choreography';
import { scarecrowPlan } from '../../web/src/app/features/room/throw-scene/characters/scarecrow/scarecrow-choreography';
import { snowmanPlan } from '../../web/src/app/features/room/throw-scene/characters/snowman/snowman-choreography';
import { elfPlan } from '../../web/src/app/features/room/throw-scene/characters/elf/elf-choreography';
import { piechefPlan } from '../../web/src/app/features/room/throw-scene/characters/piechef/piechef-choreography';
import { bearPlan } from '../../web/src/app/features/room/throw-scene/characters/bear/bear-choreography';
import { squirrelPlan } from '../../web/src/app/features/room/throw-scene/characters/squirrel/squirrel-choreography';
const liveCanvas = document.querySelector('#live');
const stillCanvas = document.querySelector('#still');
const table = document.querySelector('#table');
const card = document.querySelector('.target .card-display');
const status = document.querySelector('#status');
let errors = 0;
window.addEventListener(
  'error',
  (e) =>
    (document.querySelector('#errors').textContent = `Browser errors: ${++errors} ${e.message}`),
);
window.addEventListener(
  'unhandledrejection',
  (e) =>
    (document.querySelector('#errors').textContent = `Browser errors: ${++errors} ${e.reason}`),
);
let sequence = 0;
let live = new ThrowRenderer(liveCanvas, table);
const renderer = new THREE.WebGLRenderer({
  canvas: stillCanvas,
  alpha: true,
  antialias: true,
});
renderer.setClearColor(0, 0);
renderer.localClippingEnabled = true;
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
const camera = new THREE.OrthographicCamera(0, innerWidth, 0, -innerHeight, 0.1, 2000);
camera.position.z = 800;
const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffe6c5, 1.5));
const key = new THREE.DirectionalLight(0xffedd6, 1.9);
key.position.set(-200, 500, 600);
scene.add(key);
const rim = new THREE.DirectionalLight(0x89c9ce, 0.9);
rim.position.set(500, -100, 200);
scene.add(rim);
let actor = null;
let trick = null;
let animation = null;
let timer = 0;
let frozen = 1500;
let character = '👽';
const studies = {
  '🗑️': {
    name: 'dumpster',
    title: '🗑️ Dumpster Fire',
    description:
      'A closed green dumpster with a black lid is lobbed in a heavy arc, flipping, spinning or wobbling, and thuds or skids to rest just under the card. It rumbles and burps smoke through a cracked lid, then the lid creaks or blasts open and fire pours out, climbing the whole card while it shakes. The flames are red, orange, blue, white or purple. They die back into the dumpster, the lid slams shut (sometimes popping once more), and it rolls off screen on its wheels.',
    beats: [],
  },
  '👻': {
    name: 'ghost',
    title: '👻 BOO!',
    description:
      'A sheet ghost floats in on a wobbly weave, sometimes thinning to a wisp on the way. It looms up beside the card and shouts BOO. The card is so scared it leaps out of its body, sprouts googly eyes and sneaker legs, spins its legs and zigzags off the screen, while its pale body stays on the table with the vote still readable. The ghost doubles over laughing, then floats away or sinks through the floor, and the card gets its colour back.',
    beats: [],
  },
  '🎺': {
    name: 'mellomary',
    title: '🎺 MelloMary',
    description:
      'A harlequin from the marching band in a purple-sequin and orange-and-red diamond costume with a white ruff and a silver mellophone. She marches in with the horn up or creeps in like an imp, hushing herself. Then she either crouches beside the card and springs into a big jester pose that makes it flinch away and shiver, or plays a short tune whose notes land on the card and make it hop for joy. She bows or keeps playing, does an about-face or a twirl, and marches off the screen.',
    beats: [],
  },
  '🥋': {
    name: 'bullettime',
    title: '🥋 Bullet Time',
    description:
      "Two plain white stick men stage a Matrix fight beside the card. The hero flips in (over the card when thrown from its far side) or knee-slides into place, and an agent in a black necktie strides in or materialises out of falling green code. The hero beckons and they brawl like the subway fight: a mid-air clash, punch flurries, a leg sweep (the agent kips back up when he is the one swept), spinning or side kicks and sometimes a shot to the hero's chin. Then the hero bends right back under a slow-motion punch that lands on the card instead: it ripples green with code and tilts away before springing back. A spinning kick or palm strike sends the agent tumbling away as he dissolves into code, and the hero dusts off his hands and flies up out of view or strolls off.",
    beats: [],
  },
  '☮️': {
    name: 'hippie',
    title: '☮️ Peace, man',
    description:
      "A long-haired hippie lady with a daisy crown, tie-dye blouse, fringed vest and bell-bottoms strolls or skips in, stopping to smell her daisy and flashing a peace sign on the way. She stretches up on tiptoe to tuck the daisy into the card's top corner, and the card mellows out into a slow sway while she grooves along. Then she turns and wanders off with a wave or a peace sign over her shoulder.",
    beats: [],
  },
  '💐': {
    name: 'bouquet',
    title: '💐 A small gift, just for you',
    description:
      'Roses and daisies arrive on joined stems with a satin bow. They settle gently, open into a pretty fan and leave a floral border. Sometimes one shy bud opens late. Real outer petals drift down before the gift tips into a soft rest beneath the card.',
    beats: [
      [0, 'Wrapped buds'],
      [800, 'Offering'],
      [1500, 'Hover'],
      [2100, 'Stem contact'],
      [2300, 'Opening'],
      [2900, 'Shy bud'],
      [3400, 'Full bloom'],
      [4000, 'Petal release'],
      [5000, 'Petal drift'],
      [5900, 'Tip down'],
      [6900, 'Resting gift'],
      [8500, 'Cleanup'],
      [10000, 'Restored'],
    ],
  },
  '🦌': {
    name: 'reindeer',
    title: '\ud83e\udd8c Rudy the Rooftop Rookie',
    description:
      'An overconfident rookie bounds in (or cautiously builds up), vaults onto the card and bounces on it as a springboard, then launches over it or gets flung backwards. He lands in a snowy skid, wobbles upright, checks his hoof or rubs his nose with a blush, and bucks or slinks off into a gallop.',
    beats: [],
  },
  '🍪': {
    name: 'gingerbread',
    title: "\ud83c\udf6a Ginger Snap's candy-cane trapeze",
    description:
      'A show-off gingerbread acrobat sneaks or skips in, tests the card edge with his candy cane, then hooks the top corner and swings one-handed while the card leans under his weight. He flips down to a stuck or wobbly landing, bows, stows the cane and cartwheels away, leaving crumbs on the floor.',
    beats: [],
  },
  '🦃': {
    name: 'turkey',
    title: '\ud83e\udd83 Wild Turkey, briefly in charge',
    description:
      'A pompous tom struts in with a head-bob on every step, fans a tail of barred feathers and pecks the card two to four times, each peck knocking it and leaving a little dent. When the card wobbles, flips or lunges back, it does a wide-eyed double take and runs or flaps off in a panic, shedding feathers that drift down to the floor.',
    beats: [],
  },
  '🫗': {
    name: 'gravy',
    title: '\ud83e\uded7 The Gravy Boat Captain means well',
    description:
      'An earnest captain-hatted chef carries an oversized gravy boat to the card, pours carefully, then tips too far and sloshes or floods it; the card sags and runoff drips into a floor puddle. He mops it up with a dinner roll that visibly lifts the gravy away, then backs off sheepishly or walks away eating the soggy roll.',
    beats: [],
  },
  '🎅': {
    name: 'santa',
    title: '\ud83c\udf85 A special delivery',
    description:
      'Santa shuffles or scurries in with his sack, pulls out a present and wedges it under a corner; its spring pops and the card bobs and balances on the lid before settling. He belly-laughs, tosses a flat-pack sleigh that unfolds, kicks off and waves or tips his hat as he glides or flies away \u2014 "Ho ho ho! Merry Christmas!"',
    beats: [],
  },
  '🌽': {
    name: 'scarecrow',
    title: '\ud83c\udf3d The Sleepy Scarecrow loses its hat',
    description:
      'A drowsy straw scarecrow pogo-hops on its stake and dozes beside the card while a crow lands on top and caws until it wakes with a start. Its flailing arms knock the card, but the crow swoops off with the floppy hat in a shower of straw \u2014 then comes back wearing it, and the scarecrow chases it off or gives up and nods back to sleep.',
    beats: [],
  },
  '⛄': {
    name: 'snowman',
    title: '\u26c4 Flurry the Snow Sculptor',
    description:
      "Flurry rolls a growing snowball to the card and pats it into a tiny snowman, star or snow tree, then presents it proudly. A swelling (or fake-out) sneeze blows it apart, frosts the card's edges and knocks off his carrot nose; he kicks it up, pushes it back on and rolls away as a snowball with scarf and nose still showing.",
    beats: [],
  },
  '🧝': {
    name: 'elf',
    title: '\ud83e\udddd Wrapped with care (mostly)',
    description:
      'A fussy elf trots in with a ribbon spool, pins the ribbon to the card and wraps it until the card pinches at the waist, then ties a bow \u2014 fussily straightening it if it comes out crooked \u2014 for a smug ta-da. The spool slips and rolls away, towing the elf after it while the ribbon unthreads off the card, until it scoops the spool up and runs off.',
    beats: [],
  },
  '🥷': {
    name: 'piechef',
    title: '\ud83e\udd77 The Clumsy Pie Chef',
    description:
      'A baker carries a pumpkin pie in both oven mitts, catches a toe near the card and stumbles it face first onto the card. He peels the tin away as filling and cream run down the card and drip into a puddle, then drops or tucks the tin, tries a wipe, a toque fix or a shrug, and hurries or tiptoes away.',
    beats: [],
  },
  '🐻': {
    name: 'bear',
    title: '\ud83d\udc3b The Hungry Bear',
    description:
      'A chubby, round-eared bear waddles in nose-down on a scent trail, rears up and pats sticky honey pawprints up the card, then peels a pumpkin pie off the card or hooks it out from under the edge. It sits facing you and eats it bite by bite \u2014 the pie losing chunks, crumbs falling \u2014 then yawns and either dozes off where it sits or plods away half asleep.',
    beats: [],
  },
  '🐿️': {
    name: 'squirrel',
    title: '\ud83d\udc3f\ufe0f The Acorn Hoarder',
    description:
      'A red squirrel bounds in with a giant acorn in its teeth, parks it, and pushes acorns from its cheeks one by one under the card, which lifts with each one. It shoves the giant acorn in after them; the card teeters, the giant springs back and the card slams down, squeezing the hoard out across the floor. The squirrel frantically stuffs every acorn back into its cheeks and staggers off with the giant one.',
    beats: [],
  },
  '🎃': {
    name: 'pumpkin',
    title: '🎃 Trick, then treat',
    description:
      'A carved, candle-lit pumpkin monster hops or rolls over on root legs, snapping its hinged jaws. Vine hands grab the card as it bites the edge, chews and tears out a bloody chunk, and a lump slides down as it swallows. Then it either swells, cracks and bursts into its own rind, pulp, seeds and gore — or gags, spits the chunk back and belches its way off.',
    beats: [],
  },
  '🕷️': {
    name: 'spider',
    title: '🕷️ Something on your card',
    description:
      'A huge hairy spider skitters off, vanishes over the top and drops onto the card on its dragline. It spins in place, paying silk from its spinneret into a web, tightens it until the card buckles, then rears up and sinks its fangs in — a bruise blooms with venom and blood. It climbs back up its line, or drops off the card and scuttles away.',
    beats: [],
  },
  '🪆': {
    name: 'doll',
    title: '🪆 She wants to play',
    description:
      'A cracked porcelain doll toddles or crab-walks over, freezing whenever you look. Its head creaks all the way round, its arms rise on invisible strings, and the card lifts and contorts while small bloody handprints appear. Blood runs from its eyes and the cracks spread. The card drops; the doll stares at you, blinks too slowly, then backs away — or collapses and drags itself off.',
    beats: [],
  },
  '🧙': {
    name: 'witch',
    title: '🧙 Hold still, dearie',
    description:
      'A cackling witch swoops in on her broom, uncorks a glowing potion and lets a drop fall on the card. It turns into a frog — bulging eyes, webbed feet and a croaking throat — and hops about, sometimes flicking its tongue at her hat. She points to reverse the spell, which may fizzle the first time, then tosses or pockets the bottle and flies off.',
    beats: [],
  },
  '🧛': {
    name: 'vampire',
    title: '🧛 Just a little nip',
    description:
      'A bat flutters in, dissolves into mist and rises as a caped vampire. It braces a clawed hand on the card, rears back and sinks its fangs in. The card hangs from the bite, shrivelling with every gulp while blood runs down its face. A strand snaps as it pulls away; it wipes its mouth or sweeps its cape, backs off, and leaves as a bat.',
    beats: [],
  },
  '🤕': {
    name: 'mummy',
    title: '🤕 It wants its bandages back',
    description:
      'A shambling mummy plants its feet, draws a living bandage off its own chest and winds it around the card. Each wrap cinches the card tighter until only an eye slit is left, where yellow eyes peer out. Then it tears the bandages away, the card springs loose, and the mummy either spins to rewind itself or drags the cloth off with it.',
    beats: [],
  },
  '🍅': {
    name: 'tomato',
    title: '🍅 A review from the cheap seats',
    description:
      'A glossy tomato takes a heavy spinning lob, squashes and ruptures against the card. Wet pulp and golden seeds spray out; ragged skins tumble to the floor. Sometimes one skin sticks before sliding off. Juice runs down the edge and drips into a little puddle.',
    beats: [
      [0, 'Ready'],
      [600, 'Heavy lob'],
      [1200, 'Skin contact'],
      [1300, 'Squash'],
      [1450, 'Rupture'],
      [1700, 'Seed spray'],
      [2400, 'Peel fall'],
      [3000, 'Sticky skin'],
      [3700, 'Runoff'],
      [4400, 'Puddle'],
      [6300, 'Cleanup'],
      [7600, 'Restored'],
    ],
  },
  '🚀': {
    name: 'rocket',
    title: '🚀 The little engine that eventually could',
    description:
      'A retro rocket wanders and loops, bumps the card nose-first, then parks upright. Its engine coughs and belches smoke before finally blasting off. Sometimes it hesitates once more on the way out.',
    beats: [
      [0, 'Ready'],
      [300, 'Ignition'],
      [800, 'Wandering'],
      [1500, 'Coasting'],
      [2600, 'Nose bump'],
      [2900, 'Reposition'],
      [3400, 'On the pad'],
      [3900, 'First cough'],
      [4350, 'Last cough'],
      [4750, 'Full thrust'],
      [5400, 'Liftoff'],
      [5800, 'Engine recovery'],
      [6500, 'Escape'],
      [7400, 'Scorch'],
      [9000, 'Restored'],
    ],
  },
  '🦖': {
    name: 'dino',
    title: '🦖 A very big little tantrum',
    description:
      'A brash little T. rex charges over, hops onto the card, takes a big breath and roars through its actual mouth. One heavy stomp compresses the card and kicks up paper dust. It either puffs proudly or startles at its own strength, then hops down and lumbers away.',
    beats: [
      [0, 'Arrival'],
      [650, 'Charge'],
      [1100, 'Brake'],
      [1800, 'Hop'],
      [2300, 'Perch'],
      [2700, 'Inhale'],
      [3000, 'Roar'],
      [3300, 'Card flutter'],
      [3700, 'Foot lift'],
      [3900, 'Stomp'],
      [4100, 'Paper dust'],
      [4500, 'Reaction'],
      [5200, 'Turn'],
      [5600, 'Hop down'],
      [6500, 'Lumber away'],
      [10000, 'Restored'],
    ],
  },
  '❤️': {
    name: 'heart',
    title: '❤️ It was going so well',
    description:
      'A glossy candy heart floats in with little love echoes and a hopeful double heartbeat. Its tip touches the card, which keeps a brief heart imprint before a jagged crack opens. The matching halves hang for an awkward beat, then fall, bounce and slump. Sometimes one stubborn half tries one last hopeful hop.',
    beats: [
      [0, 'Arrival'],
      [650, 'Hopeful glide'],
      [1100, 'Hesitation'],
      [1800, 'Touch'],
      [1950, 'Heartbreak'],
      [2400, 'Awkward pause'],
      [2850, 'Fall'],
      [3300, 'Bounce'],
      [4000, 'Last hope'],
      [5000, 'Aftermath'],
      [6000, 'Cleanup'],
      [7400, 'Restored'],
    ],
  },
  '🦄': {
    name: 'unicorn',
    title: '🦄 A little rainbow gift',
    description:
      'A soft pony waits as a rainbow bridge forms, then gallops over on joined legs. Its hooves settle on the card, the golden spiral horn bows and sends sparkling magic onto the face. A wink or little prance precedes a fresh skyward rainbow ride, leaving clouds and twinkles to dissolve.',
    beats: [
      [0, 'Clouds'],
      [500, 'Bridge forms'],
      [1600, 'Rainbow gallop'],
      [2850, 'Perch'],
      [3400, 'Horn bow'],
      [3700, 'Magic'],
      [4300, 'Rainbow gift'],
      [4850, 'Flourish'],
      [5600, 'Spring'],
      [6600, 'Sky ride'],
      [8000, 'Dissolve'],
      [9000, 'Restored'],
    ],
  },
  '🕶️': {
    name: 'shades',
    title: '🕶️ Too cool for this card',
    description:
      'Reflective shades take a slow, tilted glide and pose over the card. One sharp snap shatters both lenses and the frame. Sparks ignite the edges, flames dance around the still-readable value, and the real fragments bounce into a smoky burnout.',
    beats: [
      [0, 'Arrival'],
      [350, 'Cool pose'],
      [650, 'Snap'],
      [800, 'Glass burst'],
      [1200, 'Ignition'],
      [1750, 'Burning'],
      [2200, 'Bounce'],
      [3200, 'Aftermath'],
      [4100, 'Burnout'],
      [5200, 'Restored'],
    ],
  },
  '🛸': {
    name: 'ufo',
    title: '🛸 Please remain on the card',
    description:
      'A metallic saucer searches overhead, unfolds a bright tractor beam and suspends the card while scanning it. A tiny pilot watches through the glass dome. Sometimes the power hiccups before the beam recovers. The card settles, the emitter closes, and the craft banks into a sudden escape.',
    beats: [
      [0, 'Arrival'],
      [450, 'Beam'],
      [1000, 'Lift'],
      [1550, 'Scan'],
      [2200, 'Power check'],
      [2800, 'Suspended'],
      [3750, 'Lower'],
      [4350, 'Released'],
      [4900, 'Bank'],
      [5600, 'Escape'],
      [6400, 'Restored'],
    ],
  },
  '🐐': {
    name: 'goat',
    title: '🐐 A very disputed throne',
    description:
      'Three stubborn little goats want to be king of this tiny hill. The first goat leaps onto the card; two challengers bonk the king off in turn. Any member of the herd can win. Cloven hooves rock the card, the winner bleats beneath a tiny star crown, and the herd bounds away.',
    beats: [
      [0, 'Arrival'],
      [650, 'First leap'],
      [1000, 'First king'],
      [2100, 'First bonk'],
      [2450, 'New king'],
      [3600, 'Second bonk'],
      [4050, 'Final king'],
      [4600, 'Victory'],
      [5250, 'Hop down'],
      [6300, 'Herd exit'],
      [8000, 'Restored'],
    ],
  },
  '🤼': {
    name: 'wrestler',
    title: '🤼 The card never stood a chance',
    description:
      'John Schlee-na arrives in orange, loads up and drives the actual shoulder into the card. Paper creases and a forceful recoil accompany the tackle. Planted recovery steps lead into a double biceps flex and a face wave or cap-tip flourish, then an athletic victory jog.',
    beats: [
      [0, 'Arrival'],
      [450, 'Wind up'],
      [750, 'Charge'],
      [900, 'Shoulder hit'],
      [1000, 'Compression'],
      [1450, 'Recover'],
      [2300, 'Flex'],
      [3000, 'Flourish'],
      [4000, 'Turn'],
      [4700, 'Victory jog'],
      [6200, 'Restored'],
    ],
  },
  '👶': {
    name: 'baby',
    title: '👶 An extremely important announcement',
    description:
      'Baby Brent crawls over, sits, pats the card and discovers a diaper mishap. The familiar sandy forelock and goatee deliver an enormous sob, wet tears, and the original I pooped announcement. A face wipe or comforting thumb precedes a sniffle and crawl away.',
    beats: [
      [0, 'Arrival'],
      [650, 'Sit'],
      [760, 'Pat'],
      [1250, 'Uh oh'],
      [1750, 'Sob'],
      [2350, 'Wet card'],
      [3300, 'I pooped'],
      [3900, 'Sniffle'],
      [4800, 'Turn'],
      [5700, 'Crawl away'],
      [7200, 'Restored'],
    ],
  },
  '📐': {
    name: 'architect',
    title: '📐 There’s a diagram for that',
    description:
      'A checked-shirt architect arrives with an eraser and green marker, wipes the card into a whiteboard, swaps tools between real hands, and traces a control-flow diagram. A proud check or glasses adjustment precedes pocketing the tools and walking away.',
    beats: [
      [0, 'Arrival'],
      [600, 'Wipe'],
      [1650, 'Tool handoff'],
      [2200, 'Start node'],
      [3400, 'Decision'],
      [4600, 'Branches'],
      [5700, 'Diagram'],
      [6500, 'Proud check'],
      [7100, 'Turn'],
      [7800, 'Walk away'],
      [9000, 'Restored'],
    ],
  },
  '🇺🇸': {
    name: 'trump',
    title: '🇺🇸 A very important inspection',
    description:
      'A red cap, swept blond hair, navy suit and long red tie. Our visitor sizes up the card, delivers a patronizing pat and an opinion, then strides confidently onward. The existing quips have their own pinch, pointing or dismissive hand gestures.',
    beats: [
      [0, 'Arrival'],
      [550, 'Inspect'],
      [1200, 'Opinion'],
      [2000, 'Reach'],
      [2300, 'Pat'],
      [2380, 'Nudge'],
      [3100, 'Verdict'],
      [3700, 'Turn'],
      [4400, 'Stride away'],
      [5600, 'Restored'],
    ],
  },
  '✋': {
    name: 'nill',
    title: '✋ Keep my name out yo mouth',
    description:
      'A very familiar dark suit strides in, plants its dress shoes, delivers a palm slap and a returning backhand, then voices its objection. A tie adjustment or cuff brush precedes a purposeful walk away and one last offended glance.',
    beats: [
      [0, 'Arrival'],
      [350, 'Wind up'],
      [650, 'Slap'],
      [720, 'Follow through'],
      [1320, 'Backhand'],
      [2200, 'Retort'],
      [3250, 'Turn'],
      [3900, 'Last glance'],
      [4800, 'Walk away'],
      [6000, 'Restored'],
    ],
  },
  '🏎️': {
    name: 'car',
    title: '🏎️ A very avoidable accident',
    description:
      'A late brake is followed by a folded bonnet, a breakaway tire, and a driver who brings the steering wheel along for the ride. After the helmet bonk and slow slide, our racer hops back aboard, checks the helmet or offers a sheepish wave, and reverses the smoking wreck away.',
    beats: [
      [0, 'Bumper contact'],
      [200, 'Crush'],
      [350, 'Ejection'],
      [650, 'Helmet bonk'],
      [1200, 'Slide'],
      [2200, 'Hop aboard'],
      [2900, 'Recovery'],
      [3400, 'Cough'],
      [4200, 'Reverse'],
      [6200, 'Restored'],
    ],
  },
  '🦈': {
    name: 'shark',
    title: '🦈 Something hungry in the water',
    description:
      'A steel-gray shark circles in, opens its toothed jaw and bites into the card. Bloody wounds stretch flesh into its mouth, entrails spill out, and the shark banks away with its meal.',
    beats: [
      [0, 'Hover'],
      [450, 'Jaw opens'],
      [650, 'Bite'],
      [950, 'Tear flesh'],
      [1700, 'Another bite'],
      [2500, 'Meal'],
      [3400, 'Bank'],
      [4200, 'Swim away'],
      [5600, 'Restored'],
    ],
  },
  '🐒': {
    name: 'monkey',
    title: '🐒 A very cheeky ambush',
    description:
      'A grinning monkey peeks around the sender’s card, steps out and flings four wet piles from its real hand. It admires the splats and dripping mess, then scurries back and ducks behind the card.',
    beats: [
      [250, 'Peek'],
      [710, 'Wind up'],
      [860, 'Release'],
      [1500, 'Impact'],
      [2800, 'Last throw'],
      [3800, 'Admire'],
      [4800, 'Duck away'],
      [6000, 'Ooze'],
      [7000, 'Restored'],
    ],
  },
  '👽': {
    name: 'alien',
    title: '👽 A very thorough inspection',
    description:
      'A curious visitor lifts your card, scans underneath, and occasionally discovers that its own equipment is the problem.',
    beats: [
      [0, 'Arrival'],
      [850, 'Lift'],
      [1500, 'Scan'],
      [2190, 'Surprise'],
      [3100, 'Settle'],
      [3860, 'Walk away'],
      [4440, 'Beam home'],
      [4700, 'Restored'],
    ],
  },
  '💊': {
    name: 'laxative',
    title: '💊 An extremely bad idea',
    description:
      'A tiny pill. Repeated cramps. Explosive diarrhea, wet splatter, and thick ooze sliding down the sides of the card.',
    beats: [
      [0, 'Uh oh'],
      [700, 'First cramp'],
      [1300, 'Pressure'],
      [2400, 'Disaster'],
      [3200, 'Last burst'],
      [4300, 'Oozing'],
      [5500, 'Cleanup'],
      [6000, 'Restored'],
    ],
  },
  '🧟': {
    name: 'zombie',
    title: '🧟 Still hungry',
    description:
      'It bites its way into the card, tears open the gut, and pulls out a handful of bloody intestines before staggering away with its meal.',
    beats: [
      [0, 'Arrival'],
      [850, 'First bite'],
      [2200, 'Feeding'],
      [4100, 'Gut bite'],
      [4600, 'Pull'],
      [5150, 'Tear free'],
      [5700, 'Stagger away'],
      [6200, 'Restored'],
    ],
  },
  '🪚': {
    name: 'chainsaw',
    title: '🪚 Texas Chainsaw Massacre',
    description:
      'A stitched mask, work shirt, bloody apron and yellow chainsaw. The saw bites into the card, tears through flesh, and leaves hanging intestines before an overhead flourish on the way out.',
    beats: [
      [0, 'Arrival'],
      [500, 'Rev'],
      [1100, 'Bite'],
      [1850, 'Pressure'],
      [2600, 'Torn open'],
      [3300, 'Recover'],
      [4100, 'Saw flourish'],
      [4800, 'Restored'],
    ],
  },
  '☠️': {
    name: 'reaper',
    title: '☠️ The final harvest',
    description:
      'A solemn, hooded figure glides in, opens the card with a hooked scythe, draws its soul from the bloody wound, then descends through a dark portal.',
    beats: [
      [0, 'Arrival'],
      [650, 'Anticipation'],
      [980, 'Slice'],
      [1700, 'Spilled innards'],
      [2400, 'Soul rises'],
      [3200, 'Harvest'],
      [4450, 'Portal descent'],
      [4800, 'Consumed'],
      [5600, 'Restored'],
    ],
  },
  '🐶': {
    name: 'dog',
    title: '🐶 Who’s a good little menace?',
    description:
      'A floppy-eared puppy sniffs the card, lifts its rear leg, leaves a wet yellow mark and puddle, then trots away looking entirely pleased with itself.',
    beats: [
      [0, 'Arrival'],
      [650, 'Sniff'],
      [1550, 'Leg lift'],
      [2200, 'Marking'],
      [2800, 'Runoff'],
      [3350, 'Lower paw'],
      [4050, 'Happy trot'],
      [4800, 'Restored'],
    ],
  },
  '🐱': {
    name: 'cat',
    title: '🐱 Perfectly innocent',
    description:
      'A plush ginger kitten stalks, wiggles, springs at the card and scratches with its real claws. Then it grooms and strolls away as if nothing happened.',
    beats: [
      [0, 'Arrival'],
      [450, 'Wiggle'],
      [850, 'Pounce'],
      [1220, 'First swipe'],
      [1580, 'Claws'],
      [2400, 'Innocent look'],
      [3010, 'Groom'],
      [3290, 'Face wash'],
      [4540, 'Stroll away'],
      [5400, 'Restored'],
    ],
  },
  '🎩': {
    name: 'hat',
    title: '🎩 A very small assistant',
    description:
      'A felt top hat lands on the card. Long pink ears peek out, a round rabbit pops up and greets the audience, then hides before the hat bows and disappears in a magical flourish.',
    beats: [
      [0, 'Arrival'],
      [350, 'Wiggle'],
      [900, 'Ears peek'],
      [1400, 'Pop up'],
      [1850, 'Greeting'],
      [2700, 'Hide'],
      [3350, 'Bow'],
      [4020, 'Poof'],
      [5200, 'Restored'],
    ],
  },
  '🕊️': {
    name: 'pigeon',
    title: '🕊️ How you like that?',
    description:
      'A cheeky pigeon swoops onto the card, braces its toes and fires four wet packets from its rump. Dirty white and brown splatter oozes down the side while the bird admires its work, then banks upward and away.',
    beats: [
      [0, 'Perch'],
      [520, 'First burst'],
      [840, 'Impact'],
      [1160, 'Second burst'],
      [1790, 'Third burst'],
      [2420, 'Last burst'],
      [3300, 'Runoff'],
      [4050, 'Takeoff'],
      [4650, 'Bank away'],
      [6000, 'Restored'],
    ],
  },
};
/** Characters outside the seasonal set whose beat buttons follow the seeded plan. */
const planned = {
  '🗑️': {
    plan: (id) => dumpsterPlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · arrives moving ${p.side > 0 ? 'right' : 'left'} · ${p.tumble} · ${p.skid ? 'skids' : 'thuds'} · ${p.puffs.length} puff${p.puffs.length > 1 ? 's' : ''} · ${p.backdraft ? 'backdraft' : 'creaks open'} · ${p.palette} fire${p.flare === null ? '' : ' · flare-up'} · ${p.sputter ? 'sputters · ' : ''}rolls ${p.exit > 0 ? 'right' : 'left'}${p.bump ? ' over a bump' : ''}`,
    beats: (p) => [
      [0, 'Lob'],
      [p.travel * 0.5, p.tumble === 'flip' ? 'Flip' : p.tumble === 'spin' ? 'Spin' : 'Wobble'],
      [p.travel + 60, 'Touchdown'],
      [p.travel + 300, p.skid ? 'Skid' : 'Bounce'],
      [(p.puffs[0] ?? p.settled) + 250, 'Smoke burp'],
      [p.open - 80, 'Cracked lid'],
      [p.open + (p.backdraft ? 110 : 300), p.backdraft ? 'Backdraft' : 'Lid creaks'],
      [p.climbStart + p.climb * 0.5, 'Climbing'],
      [p.climbStart + p.climb + 300, 'Engulfed'],
      ...(p.flare === null ? [] : [[p.flare + 120, 'Flare-up']]),
      [p.burnEnd + (p.fadeEnd - p.burnEnd) * 0.5, 'Dying down'],
      [dumpsterSlamHit(p) + 20, 'Slam'],
      ...(p.sputter ? [[p.slam + 450, 'Sputter']] : []),
      [p.roll + (p.exitEnd - p.roll) * 0.4, 'Roll away'],
      [p.exitEnd + 100, 'Restored'],
    ],
  },
  '👻': {
    plan: (id) => ghostPlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.approach === 'fade' ? 'fades in' : 'weaves in'} · ${p.swerves.length} swerve${p.swerves.length > 1 ? 's' : ''} · ${p.laugh === 'point' ? 'points and laughs' : 'belly laugh'} · ${p.exit === 'sink' ? 'sinks through the floor' : 'floats away'}`,
    beats: (p) => [
      [0, p.approach === 'fade' ? 'Fade in' : 'Weave in'],
      [p.travel * p.fadeAt, p.approach === 'fade' ? 'Wisp' : 'Mid float'],
      [p.travel + 60, 'Arrive'],
      [(p.travel + p.boo) / 2, 'Loom'],
      [p.boo + 60, 'BOO!'],
      [p.leap + 120, 'Leap out'],
      [(p.leap + p.land) / 2, 'Sprout'],
      [p.land + 60, 'Land'],
      [(p.land + p.bolt) / 2, 'Leg spin'],
      [p.bolt + (p.runEnd - p.bolt) * 0.25, 'Bolt'],
      [p.bolt + (p.runEnd - p.bolt) * 0.6, 'Swerve'],
      [(p.laughStart + p.laughEnd) / 2, 'Laugh'],
      [p.laughEnd + (p.exitEnd - p.laughEnd) * 0.5, p.exit === 'sink' ? 'Sink' : 'Float away'],
      [p.restore + 300, 'Colour returns'],
      [8300, 'Restored'],
    ],
  },
  '🎺': {
    plan: (id) => melloPlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.approach === 'march' ? `marches in${p.flank ? ' (flank)' : ''}` : `creeps in, ${p.peeks.length} peek${p.peeks.length > 1 ? 's' : ''}`} · ${p.act === 'scare' ? `scare${p.fakeOut ? ' with a fake-out' : ''}, ${p.flinch.toFixed(1)}° flinch` : `${p.notes.length}-note tune at ${Math.round(p.period)} ms`} · ${p.turn === 'twirl' ? 'twirls' : 'about-face'} and marches off`,
    beats: (p) =>
      p.act === 'scare'
        ? [
            [0, p.approach === 'march' ? 'March in' : 'Creep in'],
            [
              p.travel * (p.approach === 'march' ? p.flashAt + 0.06 : (p.peeks[0] ?? 0.3)),
              p.approach === 'march' ? 'Horn flash' : 'Shh',
            ],
            [p.travel + 60, 'Arrive'],
            [p.crouch, 'Crouch'],
            ...(p.fakeOut ? [[p.fake + 260, 'Fake-out']] : []),
            [p.pop + 90, 'Pop'],
            [p.pop + 260, 'Ta-da'],
            [p.pop + 500, 'Shiver'],
            [p.poseEnd - 60, 'Hold'],
            [p.bowAt + 560, 'Bow'],
            [(p.depart + p.turned) / 2, p.turn === 'twirl' ? 'Twirl' : 'About-face'],
            [p.turned + p.exit * 0.4, 'March off'],
            [p.end + 100, 'Restored'],
          ]
        : [
            [0, p.approach === 'march' ? 'March in' : 'Creep in'],
            [
              p.travel * (p.approach === 'march' ? p.flashAt + 0.06 : (p.peeks[0] ?? 0.3)),
              p.approach === 'march' ? 'Horn flash' : 'Shh',
            ],
            [p.travel + 60, 'Arrive'],
            [p.raise + 100, 'Horns ready'],
            [p.lips + 120, 'Breath'],
            ...p.notes.flatMap((n, i) => [
              [n.at + (n.land - n.at) * 0.5, `Note ${i + 1}`],
              [n.land + n.hopLength * 0.45, `Hop ${i + 1}`],
            ]),
            [(p.depart + p.turned) / 2, p.turn === 'twirl' ? 'Twirl' : 'About-face'],
            [(p.exitNotes[0] ?? p.turned) + 350, 'Trailing notes'],
            [p.turned + p.exit * 0.6, 'March off'],
            [p.end + 100, 'Restored'],
          ],
  },
  '🥋': {
    plan: (id) => bulletTimePlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · hero ${p.entry === 'flip' ? `flips in (${p.turns} turn${p.turns > 1 ? 's' : ''})` : 'slides in'} · agent ${p.agentEntry === 'glitch' ? 'glitches in' : 'strides in'} · ${p.beckons} beckon${p.beckons > 1 ? 's' : ''} · fight: ${p.exchanges.map((e) => `${e.by} ${e.kind}${e.kind === 'flurry' ? ` ×${e.count}` : ''}`).join(', ')} · ${p.tilt.toFixed(1)}° knock · ${p.finisher === 'kick' ? 'spinning kick' : 'palm strike'} · ${p.exit === 'fly' ? 'flies off' : 'strolls off'} · bubbles: ${p.bubbles}`,
    beats: (p) => [
      [0, 'Run in'],
      [p.travel * (p.run + (1 - p.run) * 0.5), p.entry === 'flip' ? 'Flip' : 'Slide'],
      [p.travel + 120, 'Land'],
      [p.agentIn - 300, p.agentEntry === 'glitch' ? 'Glitch in' : 'Agent strides in'],
      [p.beckonAt + 360, 'Come on'],
      ...p.exchanges.flatMap(bulletExchangeBeats),
      [p.swing - 60, 'Wind-up'],
      [p.swing + (p.hit - p.swing) * 0.35, 'Bullet time'],
      [p.swing + (p.hit - p.swing) * 0.7, 'Whoa'],
      [p.hit + 40, 'Contact'],
      [p.hit + 260, 'No card'],
      [p.upright, 'Upright'],
      [
        p.finisher === 'kick' ? (p.fin + p.strike) / 2 - 70 : p.fin + 150,
        p.finisher === 'kick' ? 'Spin' : 'Step in',
      ],
      [p.strike + 20, p.finisher === 'kick' ? 'Kick' : 'Palm'],
      [p.strike + p.flight * 0.45, 'Glitch out'],
      [(p.dustAt + p.dustEnd) / 2, 'Dust off'],
      [p.exitAt + p.exitLen * 0.6, p.exit === 'fly' ? 'Fly away' : 'Stroll off'],
      [p.end + 100, 'Restored'],
    ],
  },
  '☮️': {
    plan: (id) => hippiePlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.gait === 'skip' ? 'skips' : 'strolls'} in · ${p.sniffAt < p.peaceAt ? 'sniffs, then peace sign' : 'peace sign, then sniffs'} · ${p.swings} swings at ${p.sway.toFixed(1)}° · ${p.farewell === 'wave' ? 'waves goodbye' : 'peace sign over the shoulder'}`,
    beats: (p) => [
      [0, p.gait === 'skip' ? 'Skip in' : 'Stroll in'],
      [p.travel * (p.sniffAt + 0.01), 'Smell the daisy'],
      [p.travel * (p.peaceAt + 0.02), 'Peace sign'],
      [p.travel + 60, 'Arrive'],
      [p.look + 260, 'Size it up'],
      [p.reach + 360, 'Tiptoe stretch'],
      [p.tuck, 'Daisy contact'],
      [p.tuck + 150, 'Nudge'],
      [p.release + 140, 'Let go'],
      [p.swayStart + p.period * 0.25, 'Sway'],
      [p.swayStart + p.period * 0.75, 'Peace, man'],
      [p.depart + 200, 'Turn'],
      [p.turned + 450, p.farewell === 'wave' ? 'Wave' : 'Peace over shoulder'],
      [p.turned + p.exit * 0.75, 'Wander off'],
      [p.exitEnd + 200, 'Daisy fades'],
      [10400, 'Restored'],
    ],
  },
};
/** Still beats for each exchange of the Bullet Time fight. */
function bulletExchangeBeats(e) {
  const who = e.by === 'hero' ? 'Hero' : 'Agent';
  const last = 160 + (e.count - 1) * e.beat + 0.62 * e.beat;
  const beats = {
    clash: [
      [440, 'Leap'],
      [560, `${who} flying kick`],
      [760, 'Backflip'],
    ],
    flurry: [
      [160 + 1.62 * e.beat, `${who} flurry`],
      [160 + 2.62 * e.beat, 'Parry'],
      [last + 60, 'Shove'],
    ],
    sweep:
      e.by === 'hero'
        ? [
            [560, 'Hero sweep'],
            [760, 'Swept'],
            [1080, 'Flat out'],
            [1300, 'Kip-up'],
          ]
        : [
            [600, 'Agent sweep'],
            [725, 'Hop'],
          ],
    spin: [
      [400, `${who} spin kick`],
      [560, 'Duck'],
    ],
    kick: [
      [250, `${who} chamber`],
      [340, 'Kick blocked'],
      [480, 'Slide back'],
    ],
    hit: [
      [230, 'Chin shot'],
      [520, 'Spin away'],
      [950, 'Wipe mouth'],
    ],
  }[e.kind];
  return beats.map(([at, label]) => [e.at + at, label]);
}
const seasonal = {
  '🦌': {
    plan: (id) => reindeerPlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.approach === 'bound' ? `bounds in ×${p.surges}` : 'cautious build-up'} · ${p.bounces} test bounce${p.bounces > 1 ? 's' : ''} · launched ${p.launch === 'over' ? 'over the card' : 'backwards'} · ${p.gesture === 'hoof' ? 'checks his hoof' : 'rubs his nose'} · ${p.buck ? 'bucks' : 'slinks'} off ${p.exit === 'away' ? 'onward' : 'back past the card'}`,
    beats: (p) => [
      [0, 'Arrival'],
      [
        p.travel * (p.approach === 'cautious' ? p.lookAt : 0.5),
        p.approach === 'bound' ? 'Bounding' : 'Look round',
      ],
      [p.travel + p.gather * 0.6, 'Gather'],
      [(p.takeoff + p.perch) / 2, 'Vault'],
      [p.perch + 40, 'Hoof contact'],
      [p.perch + p.period * 0.75, 'Bounce'],
      [p.spring - 60, 'Wind-up'],
      [p.spring + (p.land - p.spring) * 0.45, p.launch === 'over' ? 'Flying pose' : 'Flung back'],
      [p.spring + (p.land - p.spring) * 0.66, 'Uh-oh'],
      [p.land + 80, 'Skid'],
      [p.halt + 250, 'Wobble'],
      [p.steady + 500, p.gesture === 'hoof' ? 'Hoof check' : 'Nose rub'],
      [p.glance + 150, 'Sheepish glance'],
      [p.departure + 250, p.buck ? 'Buck' : 'Slink'],
      [p.departure + (p.exitEnd - p.departure) * 0.7, 'Gallop off'],
      [10200, 'Restored'],
    ],
  },
  '🍪': {
    plan: (id) => gingerbreadPlan(id),
    info: (p) =>
      `${p.approach} in · ${p.test === 'tap' ? `${p.taps} tap${p.taps > 1 ? 's' : ''}` : 'tug'} · ${p.swings} swings · ${p.flips === 2 ? 'double' : 'single'} ${p.flipDir > 0 ? 'forward' : 'back'} flip · ${p.stick ? 'stuck landing' : 'wobbly landing'} · ${p.bow} bow · cane on ${p.stow} · cartwheels ${p.exit}`,
    beats: (p) => [
      [0, 'Arrival'],
      [p.travel, 'At the card'],
      [p.testHit, p.test === 'tap' ? 'Tap test' : 'Tug test'],
      [p.leap, 'Leap'],
      [p.catchAt, 'Hooked'],
      [p.catchAt + p.period * 0.75, 'Swing out'],
      [p.release, 'Let go'],
      [p.land, 'Landing'],
      [p.landEnd + 100, 'Bow'],
      [p.stowAt + 300, 'Stow cane'],
      [p.exitAt + 400, 'Cartwheels'],
      [p.exitEnd, 'Gone'],
      [11900, 'Restored'],
    ],
  },
  '🦃': {
    plan: (id) => turkeyPlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} side · strut beat ${p.beat}${p.earlyFan ? ' + early fan' : ''} · ${p.shimmies} rattles · ${p.pecks.length} pecks · card ${p.trigger} · ${p.escape} away · ${p.loose.length} feathers`,
    beats: (p) => [
      [0, 'Strut'],
      [
        p.travel * p.beatAt,
        p.beat === 'gobble' ? 'Gobble' : p.beat === 'glance' ? 'Glance' : 'Puff',
      ],
      [p.displayStart + 100, 'Tail display'],
      ...p.pecks.map((k, i) => [k.at, `Peck ${i + 1}`]),
      [p.triggerAt + 100, 'Card comes alive'],
      [p.startle - 100, 'Double take'],
      [p.startle + 200, 'Startle leap'],
      [p.departure + 300, p.escape === 'run' ? 'Panic run' : 'Flapping flight'],
      [p.exitEnd, 'Feathers settle'],
      [10400, 'Restored'],
    ],
  },
  '🫗': {
    plan: (id) => gravyPlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} side · ${p.march ? 'march' : 'waddle'} · ${p.beat} beat · ${p.pourHigh > 0.5 ? 'high' : 'low'} pour · ${p.flood ? 'flood' : 'slosh'} · ${p.strokes} ${p.wipe} strokes · ${p.streak ? 'leaves smear' : 'clean'} · ${p.exit === 'nibble' ? `nibbles ${p.bites}` : 'backs away'}`,
    beats: (p) => [
      [0, 'Arrival'],
      [p.travel * p.beatAt, p.beat === 'steady' ? 'Steadies the slosh' : 'Sniffs the gravy'],
      [p.travel + 100, 'Arrives'],
      [p.pour + 100, 'Careful pour'],
      [p.contact + 100, 'Gravy lands'],
      [p.tip + 200, p.flood ? 'Over-tips: flood' : 'Over-tips: slosh'],
      [p.right + 100, 'Rights the boat'],
      [p.oops + 200, 'Oops'],
      [p.stepIn + 200, 'Steps in'],
      [p.wipeStart + 100, 'Mops with the roll'],
      [p.wipeEnd + 100, p.streak ? 'Smear left' : 'Clean card'],
      [p.departure + 200, p.exit === 'nibble' ? 'Walks off nibbling' : 'Backs away'],
      [p.exitEnd, 'Gone'],
      [12500, 'Restored'],
    ],
  },
  '🎅': {
    plan: (id) => santaPlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.scurry ? 'scurries' : 'shuffles'} · ${p.shake ? 'shakes the present' : 'admires it'} · ${p.pull ? 'tugs the ribbon' : 'taps the lid'} · ${p.bounces} bounces · ${p.gesture === 'wave' ? 'waves' : 'tips his hat'} · ${p.kicks} kick${p.kicks > 1 ? 's' : ''} · ${p.flies ? 'takes off' : 'glides away'}`,
    beats: (p) => [
      [0, p.scurry ? 'Scurry in' : 'Shuffle in'],
      [p.travel * p.hitchAt, 'Hitch the sack'],
      [p.travel + 60, 'Arrive'],
      [p.emerge + 150, 'Present from the sack'],
      [p.out + 120, p.shake ? 'Shake it' : 'Admire it'],
      [p.place - 60, 'Set it down'],
      [p.wedge - 60, 'Wedge under the corner'],
      [p.tap + 60, p.pull ? 'Tug the ribbon' : 'Tap the lid'],
      [p.peak, 'Lid contact'],
      [p.peak + 150, 'Spring bounce'],
      [p.bounceEnd + 150, 'Balance, belly laugh'],
      [p.sink + 250, 'Settle'],
      [p.sleighReach + 300, 'Sleigh from the sack'],
      [p.toss + 150, 'Toss'],
      [p.unfold + 250, 'Unfold, Ho ho ho!'],
      [p.board - 100, 'Step on'],
      [p.push + 100, 'Push-off'],
      [p.seated + 100, 'Sit'],
      [p.gestureAt + 350, p.gesture === 'wave' ? 'Wave' : 'Hat tip'],
      [p.exitEnd - 300, p.flies ? 'Take off' : 'Glide away'],
      [11600, 'Restored'],
    ],
  },
  '🌽': {
    plan: (id) => scarecrowPlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.hops} pole hops${p.nod ? ' · nods off mid-hop' : ' · yawns'} · ${p.doze > 0.5 ? 'head-back snore' : 'chin-down doze'} · crow ${p.crowHops} hop${p.crowHops === 1 ? '' : 's'}, ${p.caws} caw${p.caws > 1 ? 's' : ''} · hatted crow lands on ${p.perch === 'arm' ? 'its arm' : 'the card'} · ${p.chase ? 'chases it off' : 'gives up and dozes'}`,
    beats: (p) => [
      [0, 'Pole hop'],
      [p.travel * p.nodAt, p.nod ? 'Nods off' : 'Yawn'],
      [p.travel + 60, 'Plant'],
      [p.dozeAt + 700, 'Doze'],
      [p.crowLand + 60, 'Crow lands'],
      [p.cawAt[0] + 120, 'Caw'],
      [p.startle - 300, 'Peek'],
      [p.startle + 120, 'Startle'],
      [p.startle + 400, 'Flail'],
      [p.knock + 10, 'Knock contact'],
      [p.grab - 150, 'Dive'],
      [p.grab + 10, 'Hat grab'],
      [p.grab + 400, 'Bald pat'],
      [p.perchAt - 300, 'Hatted return'],
      [p.perchAt + 200, p.perch === 'arm' ? 'On its arm' : 'On the card'],
      ...(p.chase
        ? [
            [p.lunge, 'Lunge'],
            [p.exitStart + 900, 'Chase'],
          ]
        : [
            [p.perchAt + 650, 'Sigh'],
            [p.nodOff + 700, 'Back asleep'],
          ]),
      [12000, 'Restored'],
    ],
  },
  '⛄': {
    plan: (id) => snowmanPlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.shoves} shoves · ${p.beat === 'wobble' ? 'ball bump wobble' : 'sniffle'} · ${p.sculpture} sculpture · ${p.pats} pats · ${p.fakeOut ? 'fake-out sneeze' : 'swelling sneeze'} · nose ${p.noseBounce ? 'pings off the card behind him' : 'drops in front'} · rolls ${p.exitAway ? 'away' : 'past the card'}`,
    beats: (p) => [
      [0, 'Push off'],
      [p.travel * p.beatAt, p.beat === 'wobble' ? 'Bump wobble' : 'Sniffle'],
      [p.travel * 0.8, 'Square up'],
      [p.arrive + 60, 'Ball meets card'],
      [p.build + 150, 'First pat'],
      [p.build + 150 + 260 * (p.pats - 1), 'Last pat'],
      [p.admire + 450, 'Ta-da'],
      [p.inhale + 400, p.fakeOut ? 'Ah… false alarm' : 'Ah… ah…'],
      [p.sneeze + 30, 'CHOO'],
      [p.sneeze + 160, 'Burst & shiver'],
      [p.noseLanded - 60, 'Nose lands'],
      [p.sneeze + 700, "Where's my nose?"],
      [p.kick, 'Kick-up'],
      [p.catchAt + 20, 'Catch'],
      [p.refitEnd - 40, 'Nose back on'],
      [p.tuck + 300, 'Tuck'],
      [p.roll + 400, 'Roll away'],
      [12400, 'Restored'],
    ],
  },
  '🧝': {
    plan: (id) => elfPlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.weaves} weaves · ${p.skip ? 'skips' : 'checks the spool'} · ${p.wraps} wraps · squeeze ${p.squeeze.toFixed(2)} · ${p.crooked ? 'crooked bow straightened' : 'straight bow patted'} · spool rolls ${p.rollBack ? 'back' : 'under the card'} ×${p.rollSpeed.toFixed(2)} · ${p.proud ? 'proud exit' : 'hugs it and scurries'}`,
    beats: (p) => [
      [0, 'Arrival'],
      [p.travel * p.beatAt, p.skip ? 'Skip' : 'Spool check'],
      [p.travel + 60, 'Brisk stop'],
      [p.pull + 120, 'Draw ribbon'],
      [p.attach + 20, 'Pin end'],
      [p.wrapStart + p.wrapMs * 0.3, 'Wrap'],
      [p.wrapStart + p.wrapMs * 0.78, 'Tug'],
      [p.wrapEnd + 60, 'Pinched waist'],
      [p.tie + 350, 'Tie bow'],
      [p.tied + 60, p.crooked ? 'Crooked bow' : 'Pat'],
      ...(p.crooked
        ? [
            [p.tied + 450, 'Push'],
            [p.tied + 780, 'Straight'],
          ]
        : []),
      [p.fixed + 150, 'Ta-da'],
      [p.slip + 120, 'Spool slips'],
      [p.grab + 40, 'Grab ribbon'],
      [p.bowGone + 100, 'Unthread'],
      [p.unthreadEnd + 250, 'Card springs back'],
      [p.snatch, 'Catch'],
      [p.snatch + 500, p.proud ? 'Proud exit' : 'Scurry off'],
      [11000, 'Restored'],
    ],
  },
  '🥷': {
    plan: (id) => piechefPlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} side · ${p.beat} · ${p.stumble} trip (${p.tripFoot ? 'back' : 'front'} foot, ${p.severity.toFixed(2)}) · ${p.peelTime > 730 ? 'sticky' : 'quick'} peel · ${p.tinEnd} tin · ${p.recovery} · ${p.exit} exit`,
    beats: (p) => [
      [0, 'Arrival'],
      [p.travel * p.beatAt, p.beat === 'teeter' ? 'Teeter' : 'Sniff'],
      [p.travel * 0.82, 'Trip (approx.)'],
      [p.splat, 'Splat'],
      [p.peel + 100, 'Peel'],
      [p.peelEnd, 'Tin pops free'],
      [p.release + 100, p.tinEnd === 'drop' ? 'Drops tin' : 'Tucks tin'],
      [
        p.recover + 200,
        p.recovery === 'wipe'
          ? 'Awkward wipe'
          : p.recovery === 'toque'
            ? 'Straightens toque'
            : 'Sheepish shrug',
      ],
      [p.departure + 200, p.exit === 'hurry' ? 'Hurries off' : 'Tiptoes off'],
      [10300, 'Restored'],
    ],
  },
  '🐻': {
    plan: (id) => bearPlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.sniffs.length} sniffs · ${p.prints.length} honey prints · ${p.find === 'card' ? 'peels the pie off the card' : 'hooks the pie from under the edge'} · ${p.bites} bites · ${p.nods} nod${p.nods > 1 ? 's' : ''} · ${p.ending === 'sit' ? 'dozes sitting' : p.ending === 'curl' ? 'curls up asleep' : 'waddles off sleepily'}`,
    beats: (p) => [
      [0, 'Waddle'],
      [p.travel * (p.sniffs[0]?.at ?? 0.4), 'Sniff'],
      [p.arrive + 150, 'Smell pie'],
      [p.rear + 250, 'Rear up'],
      [(p.prints[0]?.at ?? 0) + 10, 'Paw contact'],
      [(p.prints.at(-1)?.at ?? 0) + 60, 'Climb'],
      ...(p.find === 'card'
        ? [
            [p.grab + 10, 'Grab pie'],
            [p.lift + 160, 'Sticky peel'],
            [p.snap + 60, 'Pops free'],
          ]
        : [
            [p.drop + 300, 'Peer under'],
            [p.hook + 10, 'Hook pie'],
            [p.hook + 250, 'Drag out'],
            [p.grab + 10, 'Two-paw grab'],
          ]),
      [p.seated + 50, 'Sit'],
      [(p.biteTimes[0] ?? 0) + 5, 'First bite'],
      [(p.biteTimes[0] ?? 0) + 250, 'Chew'],
      [(p.biteTimes.at(-1) ?? 0) + 120, 'Stuff cheeks'],
      [p.swallow, 'Gulp'],
      [p.yawn + 400, 'Yawn'],
      [p.droop + 200, 'Nod off'],
      ...(p.ending === 'waddle'
        ? [
            [p.settle + (p.exitEnd - p.settle) * 0.35, 'Sleepy waddle'],
            [p.exitEnd + 100, 'Gone'],
          ]
        : [
            [p.settle + 200, p.ending === 'sit' ? 'Dozing' : 'Curled up'],
            [p.cleanup + 300, 'Quiet cleanup'],
          ]),
      [13900, 'Restored'],
    ],
  },
  '🐿️': {
    plan: (id) => squirrelPlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.looks.length} look-around${p.looks.length > 1 ? 's' : ''}${p.glance ? ' · glances at you' : ''} · stashes ${p.count} · giant ×${p.giant.toFixed(1)} · ${p.teeters} teeter${p.teeters > 1 ? 's' : ''} · ${p.flop ? 'knocked flat' : 'sits down hard'} · ${p.spill} spill · ${p.orderKind} first · exits ${p.exit > 0 ? 'past the card' : 'the way it came'}`,
    beats: (p) => [
      [0, 'Scurry'],
      [p.travel * (p.looks[0] + p.lookLength / 2), 'Look around'],
      [p.travel + 150, 'Park giant acorn'],
      [p.around + 180, 'Around it'],
      [p.stashStart + p.stashBeat * 0.3, 'Empty a cheek'],
      [p.stashStart + p.stashBeat * 0.8, 'Push under'],
      [p.stashStart + p.stashBeat * (p.count - 0.2), `Stash ×${p.count}`],
      [p.back + 250, 'Fetch giant'],
      [p.contact + 150, 'Shove'],
      [p.wedged + 100, 'Teeter'],
      [p.slip - 20, 'Peak lift'],
      [p.slip + 120, 'Slip'],
      [p.slam + 60, 'Spill'],
      [p.recover - 150, 'Daze'],
      [p.picks[0] + 50, 'Pick'],
      [p.picks[0] + 175, 'Stuff cheek'],
      [p.picks[p.picks.length - 1] + 200, 'Last acorn'],
      [p.bite + 10, 'Grab giant'],
      [p.departure + 400, 'Strained exit'],
      [12000, 'Restored'],
    ],
  },
  '🎃': {
    plan: (id) => pumpkinPlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.roll ? 'rolls in' : `${p.hops} hops`} · ${p.chews} chews · ${p.burst ? 'bursts' : 'spits it back and hops off'}`,
    beats: (p) => [
      [0, 'Hungry'],
      [p.travel * 0.5, p.roll ? 'Roll' : 'Hop'],
      [p.settle - 60, 'Settle'],
      [p.open + 360, 'Gape'],
      [p.bite + 10, 'Teeth contact'],
      [p.bite + 270, 'Chew'],
      [p.tear + 120, 'Tear'],
      [p.swallow + 260, 'Swallow'],
      ...(p.burst
        ? [
            [p.ending + 450, 'Swell'],
            [p.pop + 120, 'Burst'],
            [p.pop + 700, 'Fallout'],
            [p.pop + 1300, 'Guttering'],
          ]
        : [
            [p.ending + 200, 'Gag'],
            [p.ending + 460, 'Spit'],
            [p.ending + 900, 'Belch'],
            [p.ending + 1600, 'Hop away'],
          ]),
      [8400, 'Restored'],
    ],
  },
  '🕷️': {
    plan: (id) => spiderPlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.plummet ? 'plummets' : 'lowers itself'} · ${p.spokes} spokes · ${p.bites} bite${p.bites > 1 ? 's' : ''} · ${p.climb ? 'climbs its line' : 'drops and scuttles'}`,
    beats: (p) => [
      [0, 'Scuttle'],
      [p.travel * (p.bursts[0] + 0.03), 'Stop'],
      [p.travel - 60, 'Over the top'],
      [p.descend + (p.landed - p.descend) * 0.5, p.plummet ? 'Plummet' : 'Lowering'],
      [p.landed + 100, 'Land'],
      [p.weave + 260, 'Spokes'],
      [p.weave + p.spokes * 120 + 300, 'Spiral'],
      [p.tighten + 300, 'Tighten'],
      [p.rear + 200, 'Rear up'],
      [p.strikes[0] + 10, 'Fang contact'],
      [p.strikes[0] + 260, 'Venom'],
      ...(p.bites > 1 ? [[p.strikes[1] + 10, 'Second bite']] : []),
      [p.departure - 100, 'Bruise'],
      [p.departure + (p.exitEnd - p.departure) * 0.45, p.climb ? 'Climb' : 'Drop off'],
      [p.departure + (p.exitEnd - p.departure) * 0.85, 'Gone'],
      [9000, 'Restored'],
    ],
  },
  '🪆': {
    plan: (id) => dollPlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.crab ? 'crab-walks' : 'toddles'} · ${p.freezes.length} freezes · ${p.fullSpin ? 'full head spin' : 'half turn and snap'} · ${p.prints} handprints · ${p.collapse ? 'collapses and crawls' : 'backs away staring'}`,
    beats: (p) => [
      [0, 'Arrival'],
      [p.travel * (p.freezes[0] + 0.04), 'Freeze'],
      [p.travel * 0.7, p.crab ? 'Crab walk' : 'Toddle'],
      ...(p.crab ? [[p.travel + 190, 'Roll upright']] : []),
      [p.spin + 450, 'Head turn'],
      [p.arms + 300, 'Arms rise'],
      [p.haunt + 400, 'Levitate'],
      [dollPrintAt(p, 0) + 60, 'Handprint'],
      [dollPrintAt(p, p.prints - 1) + 200, 'Contort'],
      [p.drop - 150, 'Twist'],
      [p.drop + 120, 'Drop'],
      [p.stare + 600, 'Stare'],
      [p.stare + 820, 'Slow blink'],
      [p.exit + (p.collapse ? 500 : 600), p.collapse ? 'Collapse' : 'Back away'],
      ...(p.collapse ? [[p.exit + 1500, 'Crawl']] : []),
      [11200, 'Restored'],
    ],
  },
  '🧙': {
    plan: (id) => witchPlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.loop ? 'loop-the-loop' : 'zigzag'} · ${p.hops} hops${p.tongue ? ' · tongue flick' : ''} · ${p.fizzle ? 'spell fizzles first' : 'clean reversal'} · ${p.toss ? 'tosses the bottle' : 'pockets the bottle'} · ${p.climb ? 'climbs over' : 'loops back'}`,
    beats: (p) => [
      [0, 'Take off'],
      [p.travel * 0.52, p.loop ? 'Loop' : 'Zigzag'],
      [p.arrive + 150, 'Hover'],
      [p.uncork + 200, 'Potion'],
      [p.pop + 80, 'Pop'],
      [p.pour + 120, 'Pour'],
      [p.contact + 10, 'Splash'],
      [p.contact + 330, 'Frog'],
      [p.hopStart + 260, 'Hop'],
      [p.hopStart + 430, 'Croak'],
      ...(p.tongue ? [[p.tongueAt + 130, 'Tongue']] : []),
      [p.cast + 140, p.fizzle ? 'Fizzle' : 'Reverse spell'],
      [p.hit + 60, 'Poof'],
      [p.restored + 100, 'Restored card'],
      [p.tossAt + 420, p.toss ? 'Toss' : 'Pocket'],
      [p.departure + 500, 'Fly off'],
      [9800, 'Restored'],
    ],
  },
  '🧛': {
    plan: (id) => vampirePlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.circle ? 'circles first' : 'direct swoop'} · ${p.gulps} gulps · ${p.wipe ? 'wipes its mouth' : 'cape flourish'} · ${p.exit} exit`,
    beats: (p) => [
      [0, 'Bat'],
      [p.travel * 0.6, p.circle ? 'Circling' : 'Swoop'],
      [p.perch + 200, 'Mist'],
      [p.formed + 100, 'Risen'],
      [p.bite - 300, 'Rear back'],
      [p.bite + 10, 'Fang contact'],
      [p.bite + 280, 'First gulp'],
      [p.release - 60, 'Drained'],
      [p.release + 120, 'Blood strand'],
      [p.snap + 120, 'Snap'],
      [p.release + 520, p.wipe ? 'Wipe' : 'Flourish'],
      [p.backstep + 160, 'Back away'],
      [p.remist + 200, 'Back to bat'],
      [p.flight + 500, `${p.exit[0].toUpperCase()}${p.exit.slice(1)} exit`],
      [8000, 'Cleanup'],
      [8600, 'Restored'],
    ],
  },
  '🤕': {
    plan: (id) => mummyPlan(id),
    info: (p) =>
      `${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.stumble ? 'stumbles' : 'listens'} · ${p.bands} wraps · ${p.blinks} blink${p.blinks > 1 ? 's' : ''} · ${p.rewind ? `rewinds ×${p.turns}` : 'trails its bandage'}${p.lookBack ? ' · looks back' : ''}`,
    beats: (p) => [
      [0, 'Arrival'],
      [p.travel * (p.pauseAt + 0.04), p.stumble ? 'Stumble' : 'Listen'],
      [p.arrive + 120, 'Plant'],
      [p.grab + 120, 'Grab bandage'],
      [p.wrapStart + p.wrap * 0.4, 'First wrap'],
      [p.wrapStart + p.wrap * 2.5, 'Constrict'],
      [p.wrapEnd - 40, 'Cocooned'],
      [p.stare + 400, 'Eyes peer'],
      [p.stare + 760 + 80, 'Blink'],
      [p.yankAt + 120, 'Brace'],
      [p.yankAt + 240 + 150, 'Tear away'],
      [p.peelEnd + 120, 'Spring loose'],
      [(p.peelEnd + p.rewindEnd) / 2, p.rewind ? 'Rewind' : 'Dropped cloth'],
      [p.departure - 100, p.lookBack ? 'Look back' : 'Turn'],
      [p.departure + 600, 'Shamble off'],
      [10600, 'Restored'],
    ],
  },
};
function seed() {
  return `${studies[character].name}-${sequence}`;
}
function cleanup() {
  clearTimeout(timer);
  animation?.cancel();
  animation = null;
  if (actor) disposeObject(actor);
  if (trick) {
    if (trick instanceof LaxativeTrick || trick instanceof GhostTrick) trick.dispose();
    disposeObject(trick.object);
  }
  actor = null;
  trick = null;
  live.dispose();
  live = new ThrowRenderer(liveCanvas, table);
}
function info() {
  if (seasonal[character])
    return `${seed()} · ${seasonal[character].info(seasonal[character].plan(seed()))}`;
  if (planned[character])
    return `${seed()} · ${planned[character].info(planned[character].plan(seed()))}`;
  if (character === '💐') {
    const p = bouquetPlan(seed());
    return `${seed()} · ${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.lilac ? 'lilac' : 'blush'} roses · ${p.shy ? 'shy bud ' + (p.shyFlower + 1) : 'all buds open'}`;
  }
  if (character === '🍅') {
    const p = tomatoPlan(seed());
    return `${seed()} · ${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} impact · ${p.turns} turns · ${p.force.toFixed(2)} splat · ${p.sticky ? 'sticky skin' : 'all skins fall'}`;
  }
  if (character === '🚀') {
    const p = rocketPlan(seed());
    return `${seed()} · ${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.route.loop ? 'looping route' : 'wandering route'} · ${p.fires.length} coughs · ${p.fault ? 'engine hesitation' : 'clean escape'}`;
  }
  if (character === '🦖') {
    const p = dinoPlan(seed());
    return `${seed()} · ${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'left' : 'right'} seeded side · ${p.pulses} roars · foot ${p.foot + 1} · ${p.startled ? 'surprised by its stomp' : 'proud puff'}`;
  }
  if (character === '❤️') {
    const p = heartPlan(seed());
    return `${seed()} · ${p.pace.toFixed(2)} pace · arrival from ${p.side > 0 ? 'left' : 'right'} · ${p.stubborn ? 'one last hopeful hop' : 'both halves slump'}`;
  }
  if (character === '🦄') {
    const p = unicornPlan(seed());
    return `${seed()} · ${p.pace.toFixed(2)} pace · ${p.side > 0 ? 'right' : 'left'} arrival · ${p.pulses} magic pulses · ${p.wink ? 'wink' : 'little prance'}`;
  }
  if (character === '🕶️') {
    const p = sunglassesPlan(seed());
    return `${seed()} · ${p.pace.toFixed(2)} pace · ${p.force.toFixed(2)} force · ${p.bilateral ? 'both edges' : 'around the rim'} · ${p.bronze ? 'bronze' : 'black'} frames`;
  }
  if (character === '🛸') {
    const p = ufoPlan(seed());
    return `${seed()} · ${p.pace.toFixed(2)} pace · ${p.scans} scans · ${p.lift.toFixed(1)} lift · ${p.fault ? 'power hiccup' : 'steady beam'}`;
  }
  if (character === '🐐') {
    const p = goatPlan(seed());
    return `${seed()} · ${p.pace.toFixed(2)} pace · ${p.force.toFixed(2)} force · ${p.stamp ? 'hoof stamp' : 'proud bleat'} · ${p.order.map((i) => ['cream', 'brown', 'gray'][i]).join(' → ')}`;
  }
  if (character === '🤼') {
    const p = wrestlerPlan(seed());
    return `${seed()} · ${p.pace.toFixed(2)} pace · ${p.force.toFixed(2)} force · ${p.wave ? 'face wave' : 'cap tip'}`;
  }
  if (character === '👶') {
    const p = babyPlan(seed());
    return `${seed()} · ${p.sobs.length} sobs · ${p.pace.toFixed(2)} pace · ${p.force.toFixed(2)} force · ${p.wipe ? 'wipes eye' : 'comforting thumb'}`;
  }
  if (character === '📐') {
    const p = architectPlan(seed());
    return `${seed()} · ${p.pace.toFixed(2)} pace · ${p.pressure.toFixed(2)} pressure · ${p.glasses ? 'adjusts glasses' : 'proud nod'}`;
  }
  if (character === '🇺🇸') {
    const p = trumpPlan(seed());
    return `${seed()} · ${p.phrase} · ${p.pace.toFixed(2)} pace · ${p.force.toFixed(2)} pat`;
  }
  if (character === '🏎️') {
    const p = carPlan(seed());
    return `${seed()} · ${p.turns} tumble${p.turns > 1 ? 's' : ''} · ${p.force.toFixed(2)} force · ${p.pace.toFixed(2)} pace · ${p.helmet ? 'checks helmet' : 'sheepish wave'}`;
  }
  if (character === '✋') {
    const p = nillPlan(seed());
    return `${seed()} · ${p.force.toFixed(2)} force · ${p.pace.toFixed(2)} pace · ${p.tie ? 'straightens tie' : 'brushes cuff'}`;
  }
  if (character === '🦈') {
    const p = sharkPlan(seed());
    return `${seed()} · ${p.bites.length} bites · ${p.force.toFixed(2)} force · ${p.pace.toFixed(2)} pace`;
  }
  if (character === '🐒') {
    const p = monkeyPlan(seed());
    return `${seed()} · four throws · ${p.force.toFixed(2)} force · ${p.pace.toFixed(2)} pace · ${p.wink ? 'cheeky wink' : 'smug grin'}`;
  }
  if (character === '🕊️') {
    const p = pigeonPlan(seed());
    return `${seed()} · four bursts · ${p.pressure.toFixed(2)} pressure · ${p.pace.toFixed(2)} pace`;
  }
  if (character === '🎩') {
    const p = hatPlan(seed());
    return `${seed()} · ${p.pace.toFixed(2)} pace · ${p.wave ? 'paw wave' : 'shy head tilt'} · ${p.flop ? 'floppy ear' : 'ear twitch'}`;
  }
  if (character === '🐱') {
    const p = catPlan(seed());
    return `${seed()} · ${p.strokes} scratches · ${p.pace.toFixed(2)} pace · ${p.wipe ? 'face wash' : 'paw grooming'}`;
  }
  if (character === '🐶') {
    const p = dogPlan(seed());
    return `${seed()} · ${p.sniffs} sniffs · ${p.pace.toFixed(2)} pace · ${p.hop ? 'happy hop' : 'wagging trot'}`;
  }
  if (character === '☠️') {
    const p = reaperPlan(seed());
    return `${seed()} · ${p.strength.toFixed(2)} cut strength · ${p.pace.toFixed(2)} pace`;
  }
  if (character === '🪚') {
    const p = chainsawPlan(seed());
    return `${seed()} · ${p.pressure.toFixed(2)} pressure · ${p.pace.toFixed(2)} pace`;
  }
  if (character === '💊') {
    const p = laxativePlan(seed());
    return `${seed()} · four pressure bursts · ${p.pressure.toFixed(2)} pressure`;
  }
  if (character === '🧟') {
    const p = zombiePlan(seed());
    return `${seed()} · ${p.pace.toFixed(2)} pace · ${p.yank.toFixed(2)} gut pull`;
  }
  const p = alienPlan(seed());
  return `${seed()} · ${p.side === 1 ? 'left' : 'right'} approach · ${p.malfunction ? 'scanner malfunction' : 'successful scan'} · ${p.scans} passes`;
}
let zoom = 1;
/** Magnifies a still inspection around the target card; layout is measured before scaling. */
function applyZoom() {
  const main = document.querySelector('main');
  main.style.transform = stillCanvas.style.transform = '';
  if (zoom === 1 || stillCanvas.hidden) return;
  const b = card.getBoundingClientRect(),
    m = main.getBoundingClientRect();
  const x = b.left + b.width / 2,
    y = b.top + b.height * 0.55;
  stillCanvas.style.transformOrigin = `${x}px ${y}px`;
  main.style.transformOrigin = `${x - m.left}px ${y - m.top}px`;
  stillCanvas.style.transform = main.style.transform = `scale(${zoom})`;
}
function inspect(ms) {
  document.querySelector('main').style.transform = stillCanvas.style.transform = '';
  cleanup();
  frozen = ms;
  if (character === '💐') {
    const p = bouquetPlan(seed());
    if (ms === 800) ms = p.travel * 0.4;
    else if (ms === 1500) ms = p.travel + p.settle * 0.4;
    else if (ms === 2100) ms = p.land;
    else if (ms === 2300) ms = p.land + 230;
    else if (ms === 2900) ms = p.land + p.lag + (p.bloom - 220) * 0.55;
    else if (ms === 3400) ms = p.land + p.bloom + (p.shy ? p.lag : 0) + 200;
    else if (ms === 4000) ms = p.petals[0];
    else if (ms === 5000) ms = p.petals.at(-1) + 400;
    else if (ms === 5900) ms = p.departure + p.lie * 0.35;
    else if (ms === 6900) ms = p.departure + p.lie + 100;
    else if (ms === 8500) ms = p.cleanup + 250;
  }
  if (character === '🍅') {
    const p = tomatoPlan(seed());
    if (ms === 600) ms = p.travel * 0.55;
    else if (ms === 1200) ms = p.travel;
    else if (ms === 1300) ms = p.travel + 70;
    else if (ms === 1450) ms = p.travel + 180;
    else if (ms === 1700) ms = p.travel + 380;
    else if (ms === 2400) ms = p.travel + 1000;
    else if (ms === 3000) ms = p.travel + 120 + p.peelDelay + 350;
    else if (ms === 3700) ms = p.travel + p.runoff + 650;
    else if (ms === 4400) ms = p.travel + p.runoff + 1300;
    else if (ms === 6300) ms = p.cleanup + 250;
  }
  if (character === '🚀') {
    const p = rocketPlan(seed());
    if (ms === 300) ms = p.ignite * 0.8;
    else if (ms === 800) ms = p.ignite + p.travel * 0.32;
    else if (ms === 1500) ms = p.ignite + p.travel * (0.57 + p.pause * 0.5);
    else if (ms === 2600) ms = p.hit;
    else if (ms === 2900) ms = (p.hit + 350 + p.pad) / 2;
    else if (ms === 3400) ms = p.pad + 140;
    else if (ms === 3900) ms = p.fires[0] + 110;
    else if (ms === 4350) ms = p.fires.at(-1) + 110;
    else if (ms === 4750) ms = p.departure + 180;
    else if (ms === 5400) ms = p.departure + 420 + p.exit * 0.1;
    else if (ms === 5800) ms = p.departure + 420 + p.exit * 0.17;
    else if (ms === 6500) ms = p.departure + 420 + p.exit * 0.65;
    else if (ms === 7400) ms = p.departure + 420 + p.exit + 200;
  }
  if (character === '🦖') {
    const p = dinoPlan(seed());
    if (ms === 650) ms = p.travel * 0.3;
    else if (ms === 1100) ms = p.travel * (0.7 + p.pause * 0.5);
    else if (ms === 1800) ms = p.travel + p.jump * 0.5;
    else if (ms === 2300) ms = dinoArrival(p) + 160;
    else if (ms === 2700) ms = p.roar - 80;
    else if (ms === 3000) ms = p.roar + 120;
    else if (ms === 3300) ms = p.roar + 250;
    else if (ms === 3700) ms = p.stomp - 130;
    else if (ms === 3900) ms = p.stomp + 50;
    else if (ms === 4100) ms = p.stomp + 280;
    else if (ms === 4500) ms = p.stomp + 600;
    else if (ms === 5200) ms = p.departure - 150;
    else if (ms === 5600) ms = p.departure + 260;
    else if (ms === 6500) ms = p.departure + 520 + p.exit * 0.55;
  }
  if (character === '❤️') {
    const p = heartPlan(seed());
    if (ms === 650) ms = p.travel * 0.35;
    else if (ms === 1100) ms = p.travel * (0.62 + p.pause * 0.5);
    else if (ms === 1800) ms = p.hit;
    else if (ms === 1950) ms = p.hit + p.split * 0.6;
    else if (ms === 2400) ms = p.drop - 100;
    else if (ms === 2850) ms = p.drop + 300;
    else if (ms === 5000) ms = p.cleanup - 150;
    else if (ms === 6000) ms = p.cleanup + 450;
  }
  if (character === '🦄') {
    const p = unicornPlan(seed());
    if (ms === 500) ms = p.form * 0.65;
    else if (ms === 1600) ms = p.form + p.ride * 0.35;
    else if (ms === 2850) ms = unicornArrival(p) + 200;
    else if (ms === 3400) ms = p.magic - 120;
    else if (ms === 3700) ms = p.magic + 220;
    else if (ms === 4300) ms = p.magic + 600;
    else if (ms === 4850) ms = p.magic + 1300;
    else if (ms === 5600) ms = p.departure - 90;
    else if (ms === 6600) ms = p.departure + p.exit * 0.55;
    else if (ms === 8000) ms = p.departure + p.exit + 350;
  }
  if (character === '🕶️') {
    const p = sunglassesPlan(seed());
    if (ms === 650) ms = p.hit;
    else if (ms === 800) ms = p.hit + 150;
    else if (ms === 1200) ms = p.hit + 550;
    else if (ms === 1750) ms = p.hit + 1100;
    else if (ms === 2200) ms = p.hit + 1600;
    else if (ms === 3200) ms = p.hit + 2550;
    else if (ms === 4100) ms = p.hit + 3450;
  }
  if (character === '🛸') {
    const p = ufoPlan(seed());
    if (ms === 2200) ms = p.faultAt + 120;
    else if (ms === 3750) ms = p.release + 250;
    else if (ms === 4350) ms = p.release + 780;
    else if (ms === 4900) ms = p.release + 1100 + 180;
    else if (ms === 5600) ms = p.release + 1100 + 1200 * p.exit * 0.82;
  }
  if (character === '🐐') {
    const p = goatPlan(seed());
    if (ms === 650) ms = 280 + (p.leader - 280) * 0.65;
    else if (ms === 1000) ms = p.leader + 100;
    else if (ms === 2100) ms = p.hits[0];
    else if (ms === 2450) ms = p.hits[0] + 500;
    else if (ms === 3600) ms = p.hits[1];
    else if (ms === 4050) ms = p.hits[1] + 500;
    else if (ms === 4600) ms = p.hits[1] + 1120;
    else if (ms === 5250) ms = p.departure + 210;
    else if (ms === 6300) ms = p.departure + 600 + 1600 * p.exit * 0.55;
  }
  if (character === '🤼') {
    const p = wrestlerPlan(seed());
    if (ms === 750) ms = p.hit - 100;
    else if (ms === 900) ms = p.hit;
    else if (ms === 1000) ms = p.hit + 100;
    else if (ms === 1450) ms = p.hit + 550;
    else if (ms === 2300) ms = p.hit + 1400;
    else if (ms === 3000) ms = p.hit + 2100;
    else if (ms === 4000) ms = p.departure + 100;
    else if (ms === 4700) ms = p.departure + 180 + 1550 * p.exit * 0.55;
  }
  if (character === '👶') {
    const p = babyPlan(seed());
    if (ms === 760) ms = p.pat;
    else if (ms === 1250) ms = p.discovery + 180;
    else if (ms === 1750) ms = p.sobs[0] + 175;
    else if (ms === 2350) ms = p.sobs[0] + 620;
    else if (ms === 3900) ms = p.departure - 600;
    else if (ms === 4800) ms = p.departure + 210;
    else if (ms === 5700) ms = p.departure + 420 + 1700 * p.exit * 0.5;
  }
  if (character === '📐') {
    const p = architectPlan(seed());
    if (ms === 1650) ms = p.wipe + 260;
    else if (ms === 2200) ms = p.drawStart + 250;
    else if (ms === 3400) ms = p.drawStart + 1200;
    else if (ms === 4600) ms = p.drawStart + 2600;
    else if (ms === 5700) ms = p.drawEnd + 400;
    else if (ms === 6500) ms = p.drawEnd + 850;
    else if (ms === 7100) ms = p.departure + 100;
    else if (ms === 7800) ms = p.departure + 180 + 1300 * p.exit * 0.65;
  }
  if (character === '🇺🇸') {
    const p = trumpPlan(seed());
    if (ms === 2000) ms = p.pat - 200;
    else if (ms === 2300) ms = p.pat;
    else if (ms === 2380) ms = p.pat + 80;
    else if (ms === 3700) ms = p.departure + 80;
    else if (ms === 4400) ms = p.departure + 1450 * p.exit * 0.6;
  }
  if (character === '🏎️') {
    const p = carPlan(seed());
    if (ms === 350) ms = 100 + (p.hit - 100) * 0.5;
    else if (ms === 650) ms = p.hit;
    else if (ms === 1200) ms = p.slide + p.slideDuration * 0.5;
    else if (ms === 2200) ms = carClimb(p) + 250;
    else if (ms === 2900) ms = carClimb(p) + 1025;
    else if (ms === 3400) ms = p.departure - 620;
    else if (ms === 4200) ms = p.departure + 850;
  }
  if (character === '✋') {
    const p = nillPlan(seed());
    if (ms === 350) ms = p.slap - 170;
    else if (ms === 650) ms = p.slap;
    else if (ms === 720) ms = p.slap + 90;
    else if (ms === 1320) ms = p.backhand + 90;
    else if (ms === 2200) ms = p.backhand + 880;
    else if (ms === 3250) ms = p.departure + 150;
    else if (ms === 3900) ms = p.departure + 220 + 1500 * p.exit * (0.32 + p.glance / 2);
    else if (ms === 4800) ms = p.departure + 220 + 1500 * p.exit * 0.75;
  }
  if (character === '🦈') {
    const p = sharkPlan(seed());
    if (ms === 450) ms = p.bites[0] - 140;
    else if (ms === 650) ms = p.bites[0] + 60;
    else if (ms === 950) ms = p.bites[0] + 300;
    else if (ms === 1700) ms = p.bites[1] + 60;
    else if (ms === 2500) ms = p.bites.at(-1) + 480;
    else if (ms === 3400) ms = p.departure + 240;
    else if (ms === 4200) ms = p.departure + 950;
  }
  if (character === '🐒') {
    const p = monkeyPlan(seed());
    if (ms === 710) ms = p.shots[0].release - 100;
    else if (ms === 860) ms = p.shots[0].release + 40;
    else if (ms === 1500) ms = p.shots[0].release + p.shots[0].flight + 80;
    else if (ms === 2800) ms = p.shots[3].release + 20;
    else if (ms === 4800) ms = p.retreat + 550 + p.duck + 80;
  }
  if (character === '🕊️') {
    const burst = { 520: 0, 1160: 1, 1790: 2, 2420: 3 }[ms];
    const p = pigeonPlan(seed());
    if (burst !== undefined) ms = p.bursts[burst] + 70;
    else if (ms === 840) ms = p.bursts[0] + p.flight + 90;
  }
  if (character === '💊') {
    const burst = { 700: 0, 1300: 1, 2400: 2, 3200: 3 }[ms];
    if (burst !== undefined) ms = laxativePlan(seed()).bursts[burst] + 140;
  }
  liveCanvas.hidden = true;
  stillCanvas.hidden = false;
  actor = character === '👽' ? makeAlien() : makeProjectile(character, seed());
  const b = card.getBoundingClientRect();
  const view = { x: innerWidth, y: innerHeight };
  if (seasonal[character]) {
    const source = document.querySelector('.source .card-display').getBoundingClientRect();
    trick = seasonalRoutine(character, actor);
    const end = seasonalLandingPoint(trick.plan, b, view),
      facing = Math.sign(b.left + b.width / 2 - end.x) || 1;
    const frames = trick.cardAnimation(facing, b);
    animation = card.animate(frames.frames, frames.options);
    animation.pause();
    animation.currentTime = ms * trick.plan.pace;
    trick.update(
      ms * trick.plan.pace,
      actor,
      { x: source.left + source.width / 2, y: source.top + source.height / 2 },
      b,
      view,
      facing,
    );
    if (ms * trick.plan.pace >= trick.duration) {
      animation.cancel();
      animation = null;
    }
  } else if (character === '👻') {
    const source = document.querySelector('.source .card-display').getBoundingClientRect();
    trick = new GhostTrick(actor);
    const end = ghostLandingPoint(trick.plan, b, view),
      facing = Math.sign(b.left + b.width / 2 - end.x) || 1;
    const frames = trick.cardAnimation(facing, b);
    animation = card.animate(frames.frames, frames.options);
    animation.pause();
    animation.currentTime = ms * trick.plan.pace;
    trick.update(
      ms * trick.plan.pace,
      actor,
      { x: source.left + source.width / 2, y: source.top + source.height / 2 },
      b,
      view,
      facing,
      card,
    );
    if (ms * trick.plan.pace >= trick.duration) {
      animation.cancel();
      animation = null;
    }
  } else if (character === '🎺') {
    const source = document.querySelector('.source .card-display').getBoundingClientRect();
    trick = new MelloMaryTrick(actor);
    const end = melloLandingPoint(trick.plan, b, view),
      facing = Math.sign(b.left + b.width / 2 - end.x) || 1;
    const frames = trick.cardAnimation(facing, b);
    animation = card.animate(frames.frames, frames.options);
    animation.pause();
    animation.currentTime = ms * trick.plan.pace;
    trick.update(
      ms * trick.plan.pace,
      actor,
      { x: source.left + source.width / 2, y: source.top + source.height / 2 },
      b,
      view,
      facing,
    );
    if (ms * trick.plan.pace >= trick.duration) {
      animation.cancel();
      animation = null;
    }
  } else if (character === '🥋') {
    const source = document.querySelector('.source .card-display').getBoundingClientRect();
    trick = new BulletTimeTrick(actor);
    const end = bulletLandingPoint(trick.plan, b, view),
      facing = Math.sign(b.left + b.width / 2 - end.x) || 1;
    const frames = trick.cardAnimation(facing, b);
    animation = card.animate(frames.frames, frames.options);
    animation.pause();
    animation.currentTime = ms * trick.plan.pace;
    trick.update(
      ms * trick.plan.pace,
      actor,
      { x: source.left + source.width / 2, y: source.top + source.height / 2 },
      b,
      view,
      facing,
    );
    if (ms * trick.plan.pace >= trick.duration) {
      animation.cancel();
      animation = null;
    }
  } else if (character === '☮️') {
    const source = document.querySelector('.source .card-display').getBoundingClientRect();
    trick = new HippieTrick(actor);
    const end = hippieLandingPoint(trick.plan, b, view),
      facing = Math.sign(b.left + b.width / 2 - end.x) || 1;
    const frames = trick.cardAnimation(facing, b);
    animation = card.animate(frames.frames, frames.options);
    animation.pause();
    animation.currentTime = ms * trick.plan.pace;
    trick.update(
      ms * trick.plan.pace,
      actor,
      { x: source.left + source.width / 2, y: source.top + source.height / 2 },
      b,
      view,
      facing,
    );
    if (ms * trick.plan.pace >= trick.duration) {
      animation.cancel();
      animation = null;
    }
  } else if (character === '💐') {
    const source = document.querySelector('.source .card-display').getBoundingClientRect();
    trick = new BouquetTrick(actor);
    const end = bouquetLandingPoint(trick.plan, b, view),
      facing = Math.sign(b.left + b.width / 2 - end.x) || 1;
    const frames = trick.cardAnimation(facing);
    animation = card.animate(frames.frames, frames.options);
    animation.pause();
    animation.currentTime = ms * trick.plan.pace;
    trick.update(
      ms * trick.plan.pace,
      actor,
      { x: source.left + source.width / 2, y: source.top + source.height / 2 },
      b,
      view,
      facing,
    );
    if (ms >= 10000) {
      animation.cancel();
      animation = null;
    }
  } else if (character === '🗑️') {
    const source = document.querySelector('.source .card-display').getBoundingClientRect();
    trick = new DumpsterTrick(actor);
    const frames = trick.cardAnimation();
    animation = card.animate(frames.frames, frames.options);
    animation.pause();
    animation.currentTime = ms * trick.plan.pace;
    trick.update(
      ms * trick.plan.pace,
      actor,
      { x: source.left + source.width / 2, y: source.top + source.height / 2 },
      b,
      view,
    );
    if (ms * trick.plan.pace >= trick.duration) {
      animation.cancel();
      animation = null;
    }
  } else if (character === '🍅') {
    const source = document.querySelector('.source .card-display').getBoundingClientRect();
    trick = new TomatoTrick(actor);
    const frames = trick.cardAnimation();
    animation = card.animate(frames.frames, frames.options);
    animation.pause();
    animation.currentTime = ms * trick.plan.pace;
    trick.update(
      ms * trick.plan.pace,
      actor,
      { x: source.left + source.width / 2, y: source.top + source.height / 2 },
      b,
      view,
    );
    if (ms >= 7600) {
      animation.cancel();
      animation = null;
    }
  } else if (character === '🚀') {
    const source = document.querySelector('.source .card-display').getBoundingClientRect();
    trick = new RocketTrick(actor);
    const end = rocketLandingPoint(trick.plan, b, view),
      facing = Math.sign(b.left + b.width / 2 - end.x) || 1;
    const frames = trick.cardAnimation(facing);
    animation = card.animate(frames.frames, frames.options);
    animation.pause();
    animation.currentTime = ms * trick.plan.pace;
    trick.update(
      ms * trick.plan.pace,
      actor,
      { x: source.left + source.width / 2, y: source.top + source.height / 2 },
      b,
      view,
      facing,
    );
    if (ms >= 9000) {
      animation.cancel();
      animation = null;
    }
  } else if (character === '🦖') {
    const source = document.querySelector('.source .card-display').getBoundingClientRect();
    trick = new DinosaurTrick(actor);
    const end = dinoLandingPoint(trick.plan, b, view),
      facing = Math.sign(b.left + b.width / 2 - end.x) || 1;
    const frames = trick.cardAnimation(facing);
    animation = card.animate(frames.frames, frames.options);
    animation.pause();
    animation.currentTime = ms * trick.plan.pace;
    trick.update(
      ms * trick.plan.pace,
      actor,
      { x: source.left + source.width / 2, y: source.top + source.height / 2 },
      b,
      view,
      facing,
    );
    if (ms >= 10000) {
      animation.cancel();
      animation = null;
    }
  } else if (character === '❤️') {
    const source = document.querySelector('.source .card-display').getBoundingClientRect();
    trick = new HeartTrick(actor);
    const half = heartModel(actor).halves.find((h) => h.side === trick.plan.side);
    if (half && (ms === 3300 || ms === 4000)) {
      const q = heartHalfPose(trick.plan, half, trick.plan.drop, b, view);
      ms =
        trick.plan.drop +
        (q.landing + q.bounceDuration + (ms === 3300 ? -q.bounceDuration * 0.5 : 0.89)) * 1000;
    }
    const frames = trick.cardAnimation();
    animation = card.animate(frames.frames, frames.options);
    animation.pause();
    animation.currentTime = ms * trick.plan.pace;
    trick.update(
      ms * trick.plan.pace,
      actor,
      { x: source.left + source.width / 2, y: source.top + source.height / 2 },
      b,
      view,
    );
    if (ms >= 7400) {
      animation.cancel();
      animation = null;
    }
  } else if (character === '🦄') {
    const source = document.querySelector('.source .card-display').getBoundingClientRect();
    trick = new RainbowRide(actor);
    const frames = trick.cardAnimation();
    animation = card.animate(frames.frames, frames.options);
    animation.pause();
    animation.currentTime = ms * trick.plan.pace;
    trick.update(
      ms * trick.plan.pace,
      actor,
      { x: source.left + source.width / 2, y: source.top + source.height / 2 },
      unicornLandingPoint(b),
      b,
      view,
    );
    if (ms >= 9000) {
      animation.cancel();
      animation = null;
    }
  } else if (character === '🐒') {
    const source = document.querySelector('.source .card-display').getBoundingClientRect();
    trick = new MonkeyTrick(seed());
    const frames = trick.cardAnimation(monkeyFacing(source, b));
    animation = card.animate(frames.frames, frames.options);
    animation.pause();
    animation.currentTime = ms * trick.plan.pace;
    trick.update(ms * trick.plan.pace, actor, source, b, view);
    if (ms >= 7000) {
      animation.cancel();
      animation = null;
    }
  } else if (character === '💊') {
    const source = document.querySelector('.source .card-display').getBoundingClientRect();
    const side = Math.sign(b.left + b.width / 2 - source.left - source.width / 2) || 1;
    trick = new LaxativeTrick(seed(), card, side);
    actor.visible = false;
    const cards = [...table.querySelectorAll('.card-display')];
    for (let step = 0; step < ms; step += 20)
      trick.update(step, b, cards, (el) => el.getBoundingClientRect());
    trick.update(ms, b, cards, (el) => el.getBoundingClientRect());
  } else {
    trick =
      character === '👽' ? new AlienTrick(seed()) : new LandingEffect(character, actor, seed());
    const source = document.querySelector('.source .card-display').getBoundingClientRect();
    const end =
      character === '👽'
        ? alienLandingPoint(trick.plan, b, view)
        : character === '🪚'
          ? chainsawLandingPoint(trick.chainsawPlan, b, view)
          : character === '☠️'
            ? reaperLandingPoint(trick.reaperPlan, b, view)
            : character === '🐶'
              ? dogLandingPoint(trick.dogPlan, b, view)
              : character === '🐱'
                ? catLandingPoint(trick.catPlan, b, view)
                : character === '🎩'
                  ? hatLandingPoint(trick.hatPlan, b)
                  : character === '🕊️'
                    ? pigeonLandingPoint(trick.pigeonPlan, b, view)
                    : character === '🦈'
                      ? sharkLandingPoint(trick.sharkPlan, b, view)
                      : character === '✋'
                        ? nillLandingPoint(trick.nillPlan, b, view, {
                            x: source.left + source.width / 2,
                            y: source.top + source.height / 2,
                          })
                        : character === '🕶️'
                          ? sunglassesLandingPoint(b)
                          : character === '🛸'
                            ? ufoLandingPoint(trick.ufoPlan, b, view)
                            : character === '🐐'
                              ? goatLandingPoint(trick.goatPlan, b, view, {
                                  x: source.left + source.width / 2,
                                  y: source.top + source.height / 2,
                                })
                              : character === '🤼'
                                ? wrestlerLandingPoint(trick.wrestlerPlan, b, view, {
                                    x: source.left + source.width / 2,
                                    y: source.top + source.height / 2,
                                  })
                                : character === '👶'
                                  ? babyLandingPoint(trick.babyPlan, b, view, {
                                      x: source.left + source.width / 2,
                                      y: source.top + source.height / 2,
                                    })
                                  : character === '📐'
                                    ? architectLandingPoint(trick.architectPlan, b, view, {
                                        x: source.left + source.width / 2,
                                        y: source.top + source.height / 2,
                                      })
                                    : character === '🇺🇸'
                                      ? trumpLandingPoint(trick.trumpPlan, b, view, {
                                          x: source.left + source.width / 2,
                                          y: source.top + source.height / 2,
                                        })
                                      : character === '🏎️'
                                        ? carLandingPoint(trick.carPlan, b, view, {
                                            x: source.left + source.width / 2,
                                            y: source.top + source.height / 2,
                                          })
                                        : zombieLandingPoint(b, landingVariation(seed()), view);
    const facing = end.x < b.left + b.width / 2 ? 1 : -1;
    const pace =
      character === '👽'
        ? trick.plan.pace
        : character === '🪚'
          ? trick.chainsawPlan.pace
          : character === '☠️'
            ? trick.reaperPlan.pace
            : character === '🐶'
              ? trick.dogPlan.pace
              : character === '🐱'
                ? trick.catPlan.pace
                : character === '🎩'
                  ? trick.hatPlan.pace
                  : character === '🕊️'
                    ? trick.pigeonPlan.pace
                    : character === '🦈'
                      ? trick.sharkPlan.pace
                      : character === '✋'
                        ? trick.nillPlan.pace
                        : character === '🕶️'
                          ? trick.sunglassesPlan.pace
                          : character === '🛸'
                            ? trick.ufoPlan.pace
                            : character === '🐐'
                              ? trick.goatPlan.pace
                              : character === '🤼'
                                ? trick.wrestlerPlan.pace
                                : character === '👶'
                                  ? trick.babyPlan.pace
                                  : character === '📐'
                                    ? trick.architectPlan.pace
                                    : character === '🇺🇸'
                                      ? trick.trumpPlan.pace
                                      : character === '🏎️'
                                        ? trick.carPlan.pace
                                        : trick.zombiePlan.pace;
    const frames = trick.cardAnimation(facing, b);
    animation = card.animate(frames.frames, frames.options);
    animation.pause();
    animation.currentTime = ms * pace;
    if (character === '👽') trick.update(ms * pace, actor, b, end, view);
    else trick.update(ms * pace, b, end, view);
    if (ms * pace >= frames.options.duration) {
      animation.cancel();
      animation = null;
    }
  }
  scene.add(actor, trick.object);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.right = innerWidth;
  camera.bottom = -innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75) * zoom);
  renderer.render(scene, camera);
  status.textContent = `${info()} · inspection at ${Math.round(ms)} ms`;
  applyZoom();
}
/** Debug hook for console inspection of the current still. */
window.previewState = () => ({ actor, trick, scene, THREE });
function play() {
  document.querySelector('main').style.transform = stillCanvas.style.transform = '';
  cleanup();
  stillCanvas.hidden = true;
  liveCanvas.hidden = false;
  live.add({
    id: seed(),
    emoji: character,
    sourceUserId: 'source',
    targetUserId: 'target',
    side: 'left',
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    startX: 0,
    startY: 0,
  });
  status.textContent = `${info()} · playing`;
  timer = setTimeout(
    () =>
      (status.textContent = `${info()} · complete · active card animations: ${card.getAnimations().length}`),
    seasonal[character]
      ? 15000
      : character === '🎺'
        ? 13500
        : character === '🥋'
          ? 19000
          : character === '☮️'
            ? 12000
            : character === '👻'
              ? 9500
              : character === '🗑️'
                ? 11000
                : character === '💐' || character === '🚀' || character === '🦖'
                  ? 12000
                  : character === '👽'
                    ? 7600
                    : character === '📐' || character === '👶' || character === '🐐'
                      ? 14000
                      : 10000,
  );
}
document.querySelector('#play').onclick = play;
document.querySelector('#next').onclick = () => {
  sequence++;
  buildBeats();
  play();
};
function buildBeats() {
  const beats = document.querySelector('#beats');
  beats.replaceChildren();
  const table = seasonal[character]
    ? seasonal[character].beats(seasonal[character].plan(seed()))
    : planned[character]
      ? planned[character].beats(planned[character].plan(seed()))
      : studies[character].beats;
  for (const [ms, label] of table) {
    const button = document.createElement('button');
    button.textContent = label;
    button.onclick = () => inspect(ms);
    beats.append(button);
  }
}
document.querySelector('#cards').onchange = (e) => {
  document.body.classList.remove('small-cards', 'large-cards');
  if (e.target.value) document.body.classList.add(e.target.value);
  inspect(frozen);
};
document.querySelector('#zoom').onchange = (e) => {
  zoom = Number(e.target.value);
  if (!stillCanvas.hidden) inspect(frozen);
};
document.querySelector('#theme').onclick = () => {
  document.body.classList.toggle('light');
  if (!stillCanvas.hidden) inspect(frozen);
};
document.querySelector('#layout').onchange = (e) => {
  table.className = `table ${e.target.value}`;
  inspect(frozen);
};
document
  .querySelectorAll('[data-ms]')
  .forEach((button) => (button.onclick = () => inspect(Number(button.dataset.ms))));
document.querySelector('#character').onchange = (e) => {
  character = e.target.value;
  sequence = 0;
  document.querySelector('#title').textContent = studies[character].title;
  document.querySelector('#description').textContent = studies[character].description;
  buildBeats();
  inspect(
    character === '💊'
      ? 2400
      : character === '🧟'
        ? 4600
        : character === '🪚'
          ? 2600
          : character === '🕊️'
            ? 3300
            : 1500,
  );
};
window.addEventListener('resize', () => {
  if (!stillCanvas.hidden) inspect(frozen);
});
inspect(1500);
document.querySelector('#flip').onclick = () => {
  card.classList.toggle('flip');
  if (!stillCanvas.hidden) inspect(frozen);
};
