---
name: add-character
description: Design, add, or refine animated throwable characters for the Poker / Agile Deck app. Use for character concepts, movement toward a player's card, arrival routines, optional thought bubbles, and character model or animation polish.
---

# Add Character

Create a recognizable character whose approach, action at the card, card response, and departure each express its personality. Give every performance small, intentional variations so repeated throws stay fresh. Apply this skill to concept proposals as well as implementation; a request for ideas alone does not authorize adding characters.

Read [the character quality standard](references/quality-standard.md) before designing or refining a routine. It captures the accepted Alien-through-Bouquet benchmark, implementation lessons and completion criteria. Apply it to throwable objects as well as creatures and people. Existing native artwork or passing tests alone do not establish that a character meets this standard.

## Character intake

Use details already supplied in the conversation. Ask only the missing questions, preferably together in a concise message:

1. **What is the character's name?**
2. **How does the character move toward the card?** For example: struts, sneaks, hops, waddles, flies, or carries something awkwardly.
3. **What does it do when it reaches the card?** Establish the main action, the card's reaction, and how the character finishes or leaves.
4. **Does it have thought-bubble text?** If yes, ask for the wording and when it should appear. If the user wants help writing it, propose short text appropriate to the character. “None” is a complete answer.

Choose a suitable **emoji icon yourself**, checking the existing catalog for collisions before assigning an identifier. Show the chosen icon alongside the name; do not turn emoji selection into another required user question. Preserve existing identifiers when refining a character so saved selections and socket payloads remain compatible.

When asked to invent ideas, fill in the answers as proposals instead of asking the user to invent them. For multiple characters, use a compact table covering name/icon, approach, action at the card, card response, departure, and thought bubble. Describe what can vary in each movement stage; do not leave variation as an unspecified implementation detail. Match the requested personality and tone; detail and creativity do not imply weapons, horror, or aggression.

Summarize the character concept using those same fields. Honor requests to review before adding. If implementation is already authorized and the answers are sufficient, continue without a redundant approval checkpoint. Do not block progress over incidental artistic choices.

## Required design quality

- Establish the intended emotional payoff from the user's brief and existing signature action. Push that intent through artwork, motion and card effects: cute should be exceptionally cute, comedy needs a readable setup and payoff, magic needs convincing transformation, and requested grossness or horror needs material-specific consequences. Preserve recognizable references and exact authored dialogue. Do not add gore or aggression to unrelated characters.
- Design a distinct silhouette and balanced head, torso, and limb proportions that read at actual card size. Animal bodies should suit the species; avoid reusing a humanoid body for every animal.
- Give arms and legs connected, rounded forms with believable shoulder, elbow, wrist, hip, knee, and foot placement where appropriate. Bend limbs at joints rather than rotating a single rigid limb. Attach cuffs, straw, feathers, and other details to the joint they should follow.
- Keep hands or paws visibly on carried props during approach and interaction. Use a simple articulated rig or inverse kinematics when useful; avoid floating objects, detached wrists, and overstretched limbs.
- Add selective character-specific details that survive the small scale: eye highlights and blinks, cheeks, muzzle, beak, clothing layers, apron pockets, feather bands, or a shaped tail. Prefer a few clear details over visual clutter or extra geometry with no visible benefit.
- Build with the app's existing code-native Three.js model and animation system. Select relevant reviewed examples using the quality reference: articulated animals, held props, material breakup, hinged blooms and contact-driven effects need different techniques. Adapt the mechanics to the character rather than copying another character's gag or assuming an older model is the benchmark.

## Character-specific choreography and variation

Design the whole sequence around the character's anatomy, temperament, habits, and props. Specify four distinct beats: **approach**, **action at the card**, **card response**, and **departure**. The card response should visibly follow the action's cause, direction, and point of contact. A shared rig or animation helper is fine; a shared gag, generic card wobble, or identical retreat with a different model is not a finished character design.

- **Approach:** Allow either side of the target card when space permits; do not always choose the side nearest the source. Travel continuously from the actual source to the chosen side. Vary the route shape, pace, acceleration, braking, and pauses in ways that suit the character. A purposeful detour, creeping hesitation, uneven bounding, and a heavy waddle should have different motion profiles, not merely different overall durations. Keep routes within the usable viewport and away from important controls.
- **Action:** Give the character a signature interaction with anticipation and follow-through. Add bounded differences such as which reachable corner it uses, how it handles its prop, how far it overcommits, or a small recovery gesture. Use a few compatible, authored alternatives where they strengthen the personality; unrelated random gags are not a substitute for a coherent character.
- **Card response:** Design a distinctive physical or visual consequence for that interaction: its pivot, bend, lift, compression, slide, surface effect, or recovery should tell the same story. Vary a small amount of response strength, direction, duration, or settling behavior. Keep the card readable and restore it completely.
- **Departure:** Choreograph a character-specific ending that follows from what just happened. Vary its exit route, timing, or final gesture within that idea. Do not default every character to walking backward, accelerating sideways, shrinking, or fading away. A fade can clean up an already completed departure; it should not replace the ending.

Keep the signature gag recognizable while adding small amounts of variation to **every movement stage**, not only particles or colors. Choose compatible variations together: approach side and path must lead naturally into contact, the card must react at that contact, and the exit must start from the resulting pose. Bound the differences so surprise never breaks prop grips, planted feet, legibility, or timing. Preserve explicitly requested actions and text.

For implementation, sample a stable choreography plan once per throw using the existing event ID and seeded random helpers. Share that plan across travel, actor animation, card response, effects, and departure; do not resample randomness each frame or choose conflicting timings in separate modules. The same event should reproduce the same choices on clients, with geometry adapted to each client's available space. Retain the choices across reflow and recompute positions against live target bounds. Different events should produce visibly varied performances; do not seed only by character. Randomize normalized timing parameters together so contact and card reaction remain synchronized at different speeds.

## Required animation quality

- Compose a short sequence with an approach, anticipation, contact or payoff, reaction, and finish. Give the audience time to recognize each beat.
- Match locomotion to the character. Plant feet during pauses; resume a walk or run only when the body actually moves. Avoid continuous treadmill legs and arbitrary constant shaking.
- Use eased weight shifts, acceleration and deceleration, controlled squash/stretch, and follow-through where they improve the action. Let tails, hats, wings, and loose clothing lag or settle naturally.
- Keep props attached through motion, and synchronize visible contact with splashes, crumbs, feathers, card movement, or other effects. Avoid abrupt position jumps between approach, interaction, and departure.
- Thought bubbles are optional. When requested, keep them brief, readable, attached to the speaker, and timed to a specific beat. Mirror/reposition them without reversing text or covering important controls.
- Keep effects legible on both light and dark backgrounds and small enough to leave the card understandable. Prefer shaped splashes and narrow drips over an opaque wall of particles.
- Restore temporary card transforms, clipping, filters, and overlays at completion. Cosmetic actions must not alter votes or player state.

## Implementation and review

Read the project's `AGENTS.md` and its referenced guidance first. Locate the current catalog, picker names/search tags, model factory, travel dispatch, landing geometry, landing effects, and card animation hooks before editing. Keep character-specific logic in focused modules and use existing shared types.

A non-seasonal character lives in its own folder, `web/src/app/features/room/throw-scene/characters/<name>/`, holding its model, choreography, trick, a `<name>-character.ts` definition and its spec. Wiring it up then takes:

1. One import and one entry in the registry, `throw-scene/characters.ts`. The model factory, landing effects, renderer and motion all look characters up there.
2. A row in `PROJECTILE_STYLES` in `throw-scene/flight/projectile-motion.ts`. The compiler requires one for every emoji in the shared catalog.
3. If it has a landing act: `LandingKind` and `landingKind()` in `throw-scene/landing/landing-geometry.ts`.
4. The shared emoji catalog in `shared/src/throwables/catalog.ts` (append to the end of `ALL_EMOJIS_WITH_TAGS`, or of the season's list, with `addedOn` set to the release date so the picker marks it new) and the picker names in `features/room/projectile-names.ts`.

Seasonal characters go through `throw-scene/seasonal/seasonal-models.ts` and `throw-scene/seasonal/seasonal-routines.ts` instead. Import only through relative paths inside the character folder, without path aliases or wide barrels, so that `scripts/web-test.mts` can still select the specs a change affects.

Bound particle and mesh counts, reuse objects during updates, and dispose geometries/materials through the existing lifecycle. Preserve reduced-motion and WebGL fallback behavior. This skill does not authorize production deployment.

Verify the observable risks introduced by the change: reproducible choices for the same event, variation across events, prop-contact alignment, both approach sides, route continuity, current target bounds after reflow, finite transforms, synchronized contact timing, and complete cleanup. Exercise representative seeds plus the extremes of the supported speed, contact, and response ranges; cover narrow viewports and target cards near edges. Run relevant build/lint/tests; do not add tests merely to assert wording or mirror trivial implementation details.

Inspect the character in the browser at actual card size. Check the silhouette, connected limbs, grip, contact moment, timing, readability, and final restoration. Watch characters individually so overlapping routines do not hide defects. Review multiple seeded performances of each changed routine, including both sides and each authored alternative, and check browser errors. Watch the departure as closely as the approach and contact. Compare the set side by side in planning: if swapping models leaves essentially the same choreography, revise it. Passing unit tests alone is not visual approval; fix visible problems and repeat the affected review. If browser verification is unavailable, state that limitation.

Use the quality reference's completion checks: actual contact geometry, continuous transitions and debris births, full physical endings, reveal-safe restoration, and review across current small/large cards, light/dark, fronts/backs, edges and live resize. Record reviewed seeds, alternatives, visible fixes, verification and a representative screenshot in the existing review record when maintaining a catalog pass. Keep unreviewed entries explicitly pending.

Report the result and validation concisely.
