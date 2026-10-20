# Moonlit Garden

The `default` room theme renders the selected emerald, gold, and peach garden design. Other theme IDs, room rules, voting, settings, approval flow, observer mode, and Socket.IO contracts are preserved. A separate throwable picker remains available on desktop and touch screens. Fibonacci indicators mark 1, 2, 3, 5, 8, 13, and 21.

## Rendering

- Angular renders the responsive controls, estimation deck, and two-sided CSS 3D player cards.
- Generated WebP artwork supplies the garden and botanical card backs. A separate portrait background preserves the garden framing on phones. CSS fireflies, lantern glow, and mist add atmosphere.
- `ThrowSceneComponent` dynamically imports Three.js. The renderer uses a transparent canvas, continuous ballistic arcs, per-event seeded variation, spinning 3D paper/tomatoes/pies/bouquets/beer/dirt, and emoji sprites for the remaining existing choices.
- Contact triggers card recoil and paper fragments, irregular tomato/cream/liquid splashes, petals, or particles. Residue follows the target when the page scrolls. Objects bounce or break apart and then disappear.
- The animation loop runs outside Angular and stops when idle. Pixel ratio, active flights, and fragment counts are bounded. Hidden tabs clear the scene. Geometry, textures, materials, events, and animations are disposed on teardown.
- Reduced-motion users get brief contact feedback without the 3D download or ambient motion. WebGL initialization/context failure falls back to DOM feedback. Voting does not depend on WebGL.

These are art-directed kinematic throws rather than a general-purpose rigid-body physics engine. Rendering speed still depends on the device; mobile viewports have been checked in a desktop browser, not on physical phones.

## Verification

The focused specs are `web/src/app/features/room/table/player-card/player-card.component.spec.ts` and `web/src/app/features/room/throw-scene/flight/flight-math.spec.ts`. They cover deterministic trajectory variation, endpoint accuracy in either direction and across rows, impact materials, single throws, long-press barrages, cancellation, keyboard access, self-targeting, and reveal guards. `npm run test:all -w web` runs every throw-scene spec.

Three.js loads in its own lazy chunk, and each layout downloads only the background it uses.

## Local development

`npm run dev` serves the web app on 4300 and the API on 3300. The
development build sets the localhost-only `LOCAL_API_ORIGIN` through Angular
CLI `define`; production builds use the page's own origin, where the web
container proxies the API. To run a second copy on other ports, pass a different
`LOCAL_API_ORIGIN` with `--define`.

## Artwork provenance and prompts

Generated with the built-in imagegen tool using the approved garden concept as reference. Assets are in `web/public/garden/`. Images were encoded as WebP for delivery.

### Desktop garden

Production background artwork for a web application. Based on the attached enchanted garden mockup, create ONLY the moonlit garden environment WITHOUT ANY UI, WITHOUT THE TABLE, WITHOUT CARDS, WITHOUT TEXT, WITHOUT LOGO. Wide landscape 16:9, high resolution. Exquisitely detailed painterly cinematic botanical garden at night. Dark emerald leaves, curling gold branches and soft peach flowers framing left and right edges, two warm antique brass lanterns near side edges around 40% height, luminous moon in upper left quadrant, navy teal moonlight. Leave the central 75% of composition very dark quiet deep teal atmospheric empty space so a UI table can be overlaid. Rich dimensional foliage in outer 15% edges, intricate realistic textures, delicate fairy dust. Match elegant emerald/gold/peach art direction of reference. No text no numbers no furniture no cards no UI. This is an actual background asset, not a mockup.

### Card back

Production playing card BACK texture asset for Agile Deck. Use attached garden mockup as visual style reference. Render ONLY a SINGLE flat perfectly front-on rectangular card back filling entire portrait 2:3 image, no surrounding scene, no perspective, no shadow outside card, no text or numbers. Deep midnight emerald textured fine linen background, fine intricate metallic antique gold double border with botanical filigree corners, exquisitely painted gold crescent moon centered above a small bouquet of peach flowers, gold leaves and fine curved botanical stems, tiny stars, symmetrical balanced art nouveau ornamental composition. Extraordinary craftsmanship and rich crisp print detail, upscale illustrated collectible card. Art fills frame and border inset 5%. No UI no hands no other cards.

### Mobile garden

Create a portrait 9:16 mobile background asset matching this attached moonlit garden artwork. ONLY environment artwork, NO text, NO UI, NO cards, NO table, NO people. Exquisite painted cinematic emerald botanical garden at night, crescent/full moon small in upper-left corner, warm brass lantern peeking at each edge around 25% height, layered dark teal leaves and small peach flowers framing narrow outer 10% edges, ornamental gold hanging branches near upper corners, delicate fireflies. Central 80% width is nearly black very dark emerald quiet empty atmosphere for overlaying an application UI. Portrait composition deliberately keeps foliage visible at the narrow side margins. Fine rich detail same refined art direction as reference. Actual image asset not screenshot.

### Unanimous garden celebration
Matching revealed votes now gather fireflies under the cards, trace gold connections, open procedural flowers along the table, and release drifting peach petals. The main bloom lasts about three seconds, fading completely by 4.6 seconds. Canvas work runs outside Angular and stops when complete, hidden, reset, or destroyed. Reduced-motion preferences skip the canvas and retain the table highlight and accessible announcement. Narrow layouts use fewer particles and smaller flowers along the side rails.

Verified with four local socket clients: matching votes trigger the celebration, reset removes it, and mixed votes do not trigger it. Visually checked desktop and 390px mobile; no runtime errors. Web build and lint pass with the existing bundle/CommonJS warnings. No API or shared-contract changes.

