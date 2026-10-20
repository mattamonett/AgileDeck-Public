# Character quality standard

The accepted Poker benchmark is the Alien-through-Bouquet quality pass. Use this standard for new characters, throwable objects and refinements. The goal is a convincing, memorable performance at in-game scale, with personality expressed in every stage. Scale technique and complexity to the idea; extra meshes and longer routines do not by themselves improve quality.

## Intent becomes a performance

Before modeling, describe the emotional payoff, signature action, material behavior and ending in a short brief. Inspect existing picker names, tags, dialogue and authored actions when refining a character. Preserve the reference or joke that gives it meaning.

- Cute: appealing proportions, expressive eyes, soft anticipation and an affectionate payoff.
- Funny or insulting: a readable setup, a well-timed escalation or failure, and a consequential recovery or exit. Cosmetic particle differences are insufficient.
- Magical: a specific transformation, believable origin for the magic and a visible consequence on the card.
- Gross, when requested: wet chunks, liquid jets, greasy stains, gravity-driven edge ooze and puddles with recognizable material differences. A few brown dots do not convey diarrhea.
- Horror, when requested: connect bites, cuts and pulls to wounds, blood or held entrails; show resistance, release and fallout. Unrelated red particles do not convey the action.
- Recognizable people or events: preserve the supplied appearance cues, signature action and exact authored dialogue; do not replace the reference with a generic attack.

Choose complementary variations for approach, action, response and ending. Each alternative should tell the same character's story. Do not impose these example tones on characters whose brief calls for something else.

## Artwork and materials at real scale

Build a recognizable silhouette and species/object-specific anatomy. Use layered or shaped geometry where visible: a muzzle instead of a generic sphere face, curved horns, split hooves, petal layers, ragged skin, a hollow nozzle, a wrapped bow or a glass handle. Add a few readable surface and facial details, selected for their benefit on the smallest card. Maintain useful contrast on light and dark backgrounds.

Give articulated parts fixed lengths and correct pivots. Attach hands, leaves, cuffs and props to the parts they follow. Put explicit contact markers on the actual relevant surface: skin, stem cap, hoof sole, horn tip, mouth, tool tip or nozzle. Check model scale and transform order; a plausible-looking root position is not proof that the surface touches.

Select reviewed source examples by mechanics, locating their current files before copying patterns:

- Alien: scanner grip, card lift, inspection and a character-specific equipment gag.
- Dog, Cat, Goat and Dinosaur: species rigs, feet, weight and physical departures.
- Zombie, Chainsaw and Reaper: connected horror actions and consequential card effects.
- Heart and Tomato: matching whole/broken geometry, continuous release and grounded pieces.
- Rocket: exact nose/nozzle support, origin-bound flame/smoke and thrust-driven escape.
- Bouquet: fixed curved stems, hinged petals, delayed bloom, exact petal detachment and full-size resting gift.

The maintained review harness is in `tools/character-preview/`; generated bundles and screenshots belong in ignored `output/`. Older implementations are references to inspect, not automatic quality approval.

## One coherent timeline

Sample one stable plan per throw from the event ID. Let the model own that plan and share it with travel, actor poses, card response and effects. Retain side, alternatives, palette and timing through reflow; recompute geometry against current bounds without resampling. Use normalized or canonical time with one pace mapping so faster/slower performances keep contact, effect births and cleanup synchronized.

Derive poses from elapsed time rather than accumulated frame updates. Repeated seeking to the same instant must reproduce the same pose. Compose continuous approach, anticipation, contact, action, recovery and ending, with time for the viewer to read the payoff. Keep a paused character still; step from actual body travel rather than running legs on a stationary body. Let loose parts lag and settle for a reason.

Use compatible bounded alternatives, such as a shy bud, delayed sticky peel, engine hesitation or surprised recovery. Vary route, pause, action order/strength and ending within the same intent. Test each authored alternative and meaningful parameter extremes rather than relying on many arbitrary seeds.

## Exact contact and causal effects

Evaluate contact markers through the complete native transform hierarchy against the current transformed card surface. Use current card orientation and depth, not only its axis-aligned rectangle or a hard-coded screen offset. Retain unanimated layout bounds separately where needed to avoid feeding the card's reaction back into its own positioning.

Anticipation precedes contact; pressure, damage, splashes and recoil follow the actual contact. Match response direction, pivot and force to the action. Anchored marks and caught particles must track the live surface, including rotation, reveal and resize. Keep votes readable and restore individual cosmetic transforms without changing game state.

Emit breath from the mouth, smoke from the flame tip, jets from the wound, petals from their hinge and debris from the broken surface. At detachment, preserve the attached piece's world position, orientation, scale and visible geometry. Ease new flutter/spin in after release rather than introducing an instantaneous jump. Recompute cached birth poses for changed bounds without choosing a new performance.

Separate materials by behavior: chunks tumble, seeds catch or bounce, fluid stretches and runs down edges, foam lingers, light smoke expands and petals drift. Use bounded shaped effects and thin runoff rather than an opaque particle wall. Time runoff, falling drops and puddle formation as connected consequences.

## Physical endings and complete cleanup

Finish the action before cleaning it up. An actor may walk or fly out, hop down, slump, drain or rest as a gift; use the ending that follows from its intent. Keep its size through the physical ending. Shrinking or fading in place is not a substitute for departure or landing; an authored magical disappearance is appropriate when it is the intended payoff.

Land pieces and resting actors on their measured native geometry, including rotation, protrusions and model scale. Check the lowest transformed vertices or equivalent support geometry so objects neither float nor pass through the floor. Let important debris settle before cleanup and prevent routes, tumbles and waiting actors from colliding unintentionally or hiding the card.

Restore card transforms, overlays, clipping and filters on normal completion, cancellation and reflow. Bound mesh/particle counts; reuse resources during updates and dispose each owned geometry, material and texture exactly once. Preserve reduced-motion and WebGL fallbacks.

## Completion evidence

Build and lint the affected workspace and run meaningful focused tests for the new observable risks. Useful invariants include one reproducible plan, fixed joined limbs/props, exact contact before reaction, continuous stage transitions and effect births, retained choices through reflow, real floor support, finite seekable poses, neutral restoration and bounded complete disposal. Do not weaken assertions simply to accommodate a defect. Passing tests cannot prove visual quality.

Inspect a single routine in the browser at actual in-game sizes. The reviewed pass used 58 × 84 and 84 × 122 cards; verify the current sizes rather than assuming they never change. Cover light/dark, fronts/backs, both approach sides, narrow placement, cards near both viewport edges, each authored alternative, and representative speed/strength extremes. Resize during a supported contact or effects beat and finish the run. Verify no remaining card animation, overlay or browser error; exercise cancellation when introducing a new cleanup path.

Use paused beat inspection for geometry/contact and full playback for rhythm, continuity, readability and the ending. A static screenshot cannot establish motion quality. Fix visible defects, rerun the affected checks and capture a representative proof. Record the reviewed seeds/alternatives and limitations in an existing review record. Mark an item reviewed only after its implementation and browser pass; if browser review is unavailable, report it as unverified. Check the set's variety: if swapping models preserves essentially the same performance, the character needs more design work.
