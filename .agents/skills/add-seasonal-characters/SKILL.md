---
name: add-seasonal-characters
description: Propose and implement limited-time seasonal throwable characters for Poker / Agile Deck. Use for holiday or occasion themed character sets with an availability window and five concepts to review before adding characters.
---

# Add Seasonal Characters

Create a cohesive seasonal set with varied personalities, silhouettes, approaches, card interactions, card responses, and departures. Each character must have its own complete choreography and small, character-appropriate variations on repeated throws. Present **exactly five character options before adding anything**, then implement only the concepts the user approves. Five options are choices to review, not an obligation to add all five.

Use [add-character](../add-character/SKILL.md) for character design, animation, implementation, and visual-review standards. Read it before proposing or implementing characters. This seasonal workflow adds theme, availability, and the five-option review step; its review requirement takes precedence over the base skill's default permission to proceed directly when implementing a new seasonal set. Explicit user instructions can change the workflow.

Also read its [character quality standard](../add-character/references/quality-standard.md). Each selected seasonal character must meet the same accepted artwork, exact-contact, material-effects, seeded-variation and physical-ending standard as regular throwables. A holiday costume over a generic routine is insufficient. Choose the intended payoff for each character and carry it through the whole performance; a Halloween theme alone does not require gore.

## Seasonal intake

Reuse information already supplied. Ask for missing essentials together:

1. **What holiday or occasion is the theme?** This can be a holiday, season, anniversary, celebration, or other event. Ask about locale or desired tone only when it materially affects the concepts. Do not infer horror or aggression from a request for more detail or creativity.
2. **When should the characters be available?** Establish the start and end dates, whether the window repeats annually or is a one-time event, and the timezone. If omitted, propose the project's existing timezone convention explicitly for review rather than silently choosing a boundary. Clarify ambiguous dates before implementation; concepts may be drafted while timing is pending.

Do not make the user invent all five characters. Generate the concepts and fill in the base character questions yourself as proposals. Incorporate any supplied names, actions, movement styles, or text. If the user provides one character, retain it as an option and supply four complementary options unless instructed otherwise.

## Present five options

Lead with the theme and proposed availability in plain language, including recurrence and timezone. Then present a compact five-row table with:

- **Character name and emoji:** Choose the icon yourself and check the catalog for identifier collisions before implementation.
- **Design/personality:** Describe the distinct silhouette, proportions, and a few visible signature details.
- **Approach:** How it moves toward either side of the card, handles props, and varies its route and pace.
- **Action at the card:** Its signature interaction, including small variations in contact or execution.
- **Card response:** The distinctive consequence of that action and what subtly varies in the response.
- **Departure:** How it finishes and leaves, including character-appropriate variation in the exit or final gesture.
- **Thought bubble:** Short proposed wording and its timing, or explicitly “None.”

Make the options distinct at every stage, not just their main action. Apply the base skill's choreography and seeded-variation requirements: different props, colors, timing offsets, or particle effects alone do not make five generic approaches, card wobbles, and retreats unique. Show the proposed variation within the relevant table cells; use brief per-character notes if the table would become difficult to read. Keep the theme recognizable and the tone consistent with the user's request. Apply the base skill's standards for articulated limbs, prop grips, expressive faces, planted feet, anticipation, follow-through, and readable effects when describing the designs.

End by asking which options to add or revise. **Wait for the user's selection or approval before adding characters to code or the catalog.** Read-only inspection and concept planning are fine during review. If approval or selection already exists in the conversation for the presented concepts, honor it without asking again. Refining an approved set does not require inventing five replacement options unless requested.

## Implement the approved selection

Follow the base skill and the repository's guidance. Keep existing character identifiers stable when revising an approved design. Use the existing seasonal availability service and shared types rather than inventing a separate date check for each UI and API path.

- Make the agreed dates precise in code: use an inclusive start and exclusive end. For example, “all November” includes November 30 and ends at December 1 00:00 in the agreed timezone. Do not assume a fixed date for a movable holiday unless the chosen window is explicitly fixed.
- Enforce availability on the server for every relevant interaction path, including single throws, barrages, and reactions; hiding picker entries alone is insufficient.
- Label the limited-time collection and its window in the picker. Refresh availability for clients that remain open across a boundary, and replace expired equipped selections with the existing safe fallback.
- Review out-of-season characters in the character preview (`node tools/character-preview/server.mjs`). There is no staging stack or preview flag; do not change the real calendar to unlock a season.
- Verify just before the start, exactly at the start, just before the end, and exactly at the end. Cover annual or one-time behavior as applicable and stale client selections.
- Complete the base skill's visual review at actual card size, covering multiple seeds, both approach sides, authored alternatives, distinctive card responses and departures, and cleanup for each approved character. Concepts being approved is not proof that the implemented animation looks right.

Report which characters were added, their availability and validation. Approving concepts does not authorize deploying to production.
