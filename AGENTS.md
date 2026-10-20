# Contributor and agent guidelines

This file is the source of truth for automated and human-assisted changes in this repository. Keep changes small, type-safe, tested where practical, and aligned with the current Angular/API/shared architecture.

## Core Principles

- Preserve strict TypeScript. Do not weaken compiler settings or work around them with `any`, broad `as` casts, non-null assertions, or suppressed errors.
- Prefer explicit domain types from `@poker/shared` over duplicated local shapes.
- Treat all data crossing process, socket, storage, query-string, and form boundaries as untrusted until it is parsed or narrowed.
- Keep code easy to review: small functions, direct control flow, clear names, and minimal hidden side effects.
- Prefer boring, local fixes over broad refactors unless the refactor is required for correctness.
- Do not introduce new dependencies when the platform, Angular, TypeScript, Zod, Prisma, or existing helpers already solve the problem cleanly.

## Strict Type Patterns

- Use `unknown` for untrusted input, then narrow with Zod schemas, type guards, or explicit checks.
- Prefer discriminated unions and exhaustive `switch` handling for state machines and event variants.
- Respect `noUncheckedIndexedAccess`: handle possibly missing array and map lookups before use.
- Respect `exactOptionalPropertyTypes`: omit optional properties when absent instead of assigning `undefined` unless the type explicitly allows it.
- Use `??` instead of `||` when preserving valid falsy values such as `0`, `false`, or an empty string.
- Keep DTOs serializable. Do not put class instances, functions, Dates, or framework objects in shared socket payloads unless the contract explicitly supports them.
- Prefer `readonly` for data that should not be mutated after construction.
- Avoid mutation through aliases. When updating state, create clear replacement objects or use the established store/repository pattern.

## Workspace Standards

- Root scripts coordinate the workspaces. Use targeted workspace scripts when possible:
  - `npm run build -w shared`
  - `npm run test -w shared`
  - `npm run build -w api`
  - `npm run test -w api`
  - `npm run build -w web`
  - `npm run lint -w web`
  - `npm run test -w web`
  - `npm run test:all -w web` (every throw-scene character spec; `test -w web` runs only those a change affects)
  - `npm run check` (complete build, lint, and test gate)
- Run the narrowest meaningful verification for the files touched. For shared contract changes, build and test both affected consumers when practical.
- Keep generated output, dependency updates, and formatting churn out of feature changes unless explicitly required.
- Do not edit production environment values or initiate production deployments.

## Shared Package

- `@poker/shared` owns socket event names, game event names, DTOs, payload types, constants, and Zod schemas.
- Add or update shared schemas with any socket payload contract change.
- Export schema-inferred types when consumers need the parsed shape.
- Do not use magic socket strings in API or web code. Use the exported event enums/constants.
- Keep validation messages and limits consistent between frontend and API by sharing schemas and constants.

## API Standards

- Socket handlers act as controllers: parse payloads, check rate limits, authorize, call services, and emit responses.
- Services contain business rules and should be usable without socket-specific assumptions.
- Repositories own Prisma persistence. They should not emit socket events or contain UI-facing behavior.
- Validate every socket payload with `safeParse` before using it.
- Use the secure visitor/session identity from the socket handshake for identity-sensitive operations. Do not trust client-provided user identity.
- Check authorization on every interactive event:
  - user exists in the room
  - user is approved when the action requires participation
  - user is approved for room settings and approval/denial of newcomers; this is a collaborative application with no separate admin role
- Use `withRoomLock(roomId, ...)` for critical room transitions that can race, such as joins and cleanup.
- Use Prisma `$transaction` when multiple database writes must succeed or fail together.
- Apply rate limiting to user-triggered socket events. Keep faster limits for lightweight interactions and slower limits for expensive or disruptive actions.
- Keep disconnect cleanup compatible with the existing grace period so refreshes do not unnecessarily remove users or approval state.

## Security And Abuse Prevention

Read [the security invariants and regression guide](docs/security.md) when changing API middleware, transports, membership, persistence, feedback, or background work. Current numeric limits and migration requirements are in [the operations guide](docs/operations.md#application-abuse-limits).

- Put cheap admission limits before resource allocation or body parsing. Engine.IO admission must authenticate and limit transports before Socket.IO namespace middleware; Express middleware does not cover intercepted Engine.IO routes.
- Keep HTTP rate limits before JSON parsers and room/feedback authorization before their route-specific parsers. Reject compressed request bodies unless explicitly designed and tested with bounded inflation costs.
- Use trusted peer-based client identity helpers and IPv6 subnet grouping for network budgets. Origin checks, browser guards, and signed anonymous cookies do not replace server authorization or aggregate abuse limits.
- Bound transport concurrency, inbound payload sizes, and all socket events, including unknown or unprotected events. Bound and expire in-memory counters, reservations, timers, and queues; release resources on failure as well as success.
- Permit one in-flight join per socket. Recheck connection/cancellation state after awaited work before committing membership or sending results; clean up abandoned acquisitions. Leaving must remove all room subscriptions. Keep pending capacity and expiry separate from approved participant capacity and reconnect grace.
- For persistent growth or costly actions, apply visitor, network, and global budgets according to cost. Daily quotas must survive restarts and commit atomically with their mutations; changing room IDs or visitor cookies must not reset aggregate budgets.
- Give persistent records an explicit retention policy, preserving linked records and testing cleanup against a migrated database. Retry endpoints must share the relevant work budgets and have a lifetime bound.
- Before relaxing a guard or raising a limit, document the resource cost, shared-network impact, and abuse tradeoff, and update the regression tests. Do not remove guards or weaken tests simply to make a new feature pass.

## Angular Standards

- Use Angular standalone components, signals, signal inputs, outputs, and models.
- Prefer `computed()` for derived state and keep `effect()` limited to side effects that cannot be expressed declaratively.
- Use built-in template control flow: `@if`, `@for`, and `@switch`. Do not add new `*ngIf` or `*ngFor` usage.
- Keep container components responsible for service injection, orchestration, routing, and store interaction.
- Keep presentational components focused on rendering and local UI behavior. Pass data with `input()`/`model()` and emit actions with `output()`.
- Preserve strict templates. Do not hide template typing issues by widening component fields unnecessarily.
- Keep service APIs typed around shared DTOs and parsed payloads.
- Keep component CSS scoped. Use global styles only for resets, design tokens, and true app-wide rules.

## Clean Code Expectations

- Name things after domain concepts: room, user, vote, lobby, observer, interaction, approval, snapshot.
- Keep functions short enough that validation, authorization, persistence, and emission steps remain obvious.
- Prefer early returns for invalid or unauthorized paths.
- Use comments sparingly, only when they explain non-obvious business rules, concurrency, browser behavior, or security decisions.
- Remove dead code instead of preserving it behind comments.
- Keep errors actionable and avoid leaking internal details to clients.

## Testing And Review

- When tests fail, identify whether the failure is a regression, a changed requirement, or a missing edge case before changing assertions.
- Add or update tests for changed business rules, shared schema behavior, authorization, rate limiting, concurrency-sensitive flows, and store-derived state.
- For web-only UI changes, at minimum run the web build or lint command that covers the touched code.
- For shared schema or DTO changes, verify both API and web compile against the new contract.
- Code review should prioritize correctness, security, type safety, race conditions, missing validation, and missing tests before style.

## Deployment Safety

- Agents must not deploy to production or run deployment scripts unless a human explicitly requests that deployment in the current task.
- Keep local development pointed at local services unless the task explicitly requires otherwise.
- Do not modify secrets, production URLs, or remote database settings without explicit human approval.
- If a change affects deployment, update the relevant documentation instead of silently relying on tribal knowledge.
