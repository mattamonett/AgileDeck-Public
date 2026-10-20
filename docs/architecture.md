# Architecture

Agile Deck has three TypeScript workspaces. Preserve the existing workspace
boundaries; use domain modules within them rather than introducing parallel DTOs,
validation rules, or persistence abstractions for the same concept.

## Domain ownership

| Domain             | Main code                                                                                  | Responsibility                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Contracts          | `shared/src/`                                                                              | Serializable DTOs, schema-derived command inputs, event/theme/issue-status enums, validation, catalogs |
| Room membership    | `api/src/modules/rooms/` (`room-join.service.ts`, `reconcile-users.ts`, `user-cleanup.ts`) | Joining, approval, duplicate reconciliation, reconnect grace period                                    |
| Voting rounds      | `api/src/modules/rooms/revelation.ts`, `socket/handlers/voting.handlers.ts`                | Authorized votes, countdown reservation, snapshots, reset serialization                                |
| Public room data   | `api/src/modules/rooms/public-room.ts`                                                     | Privacy-aware user and room DTO mapping                                                                |
| Issues             | `api/src/modules/issues/`                                                                  | Authorized transactional CRUD/import/export, paging, pure tree/status rules                            |
| Socket controllers | `api/src/socket/`                                                                          | Session/replay checks and focused membership, room settings, voting, interaction handlers              |
| Persistence        | `*.repository.ts` in each `api/src/modules/` folder, `api/prisma/`                         | Prisma access per module and migrations; multi-entity issue transactions remain in the issue service   |
| Browser state      | `web/src/app/features/room/state/`                                                         | Validated socket/HTTP responses, view-model normalization, issue pagination, request cancellation      |
| Browser transport  | `web/src/app/core/` (`api/`, `session/`, `socket/`, `update/`)                             | Secure-session setup, reconnecting sockets, version checks                                             |
| Room UI            | `web/src/app/features/room/`                                                               | Container orchestration plus focused settings, table, cards, issues, throws, nudges and effects        |
| Animation          | `web/src/app/features/room/throw-scene/`                                                   | Landing geometry, card animations, model-specific poses, bounded impact debris, GPU rendering/disposal |

Home and room routes load lazily. Web code is split into `core/` (app-wide
services), `shared/` (UI used by several features) and `features/<name>/`; ESLint
keeps features from importing each other. The admin page is the lazy `/admin`
route in `features/admin/`. The WebGL renderer is also lazy and has an
accessible fallback.

## Request path

In the Compose stack the browser talks to one origin. The web container (nginx)
serves the Angular build and proxies `/api/` and `/socket.io/` to the `api`
service, whose port is not published. The browser therefore uses
`window.location.origin` for HTTP and Socket.IO; development builds point at the
local API through the build-time `LOCAL_API_ORIGIN` define. The admin API is
mounted at `/api/admin` on the same app, answers only while `ADMIN_PASSWORD` is
set, and is guarded by its own password cookie rather than the site password
(see [operations](operations.md#admin-page)).

The client address used for rate limits and budgets comes from
`api/src/platform/http/client-ip.ts`. `X-Forwarded-For` is read only when the direct peer
is listed in `TRUSTED_PROXY_IPS`; the header is walked from the right, trusted
hops are skipped, and the first untrusted address is the client. By default
only the bundled web container is trusted. See
[client address](operations.md#client-address-and-trusted-proxies).

## Important behavior

- Identity comes from the signed HttpOnly session cookie, never a claimed socket
  user id. A visitor can have multiple tabs attached to the same room membership.
- Permissions are collaborative: all approved members can change settings and
  manage the backlog and newcomer approvals. There is no separate host/admin role.
- New rooms approve their creator. Other visitors wait for approval unless their
  room/visitor approval was already persisted. Approval survives user cleanup.
- An unapproved member sees only their own user DTO. Votes remain masked for other
  members until reveal. Approval notifications are sent to the approved user's
  sockets, not broadcast to pending visitors. Denial disconnects all target tabs.
- Only approved non-observers vote. The server rejects votes after reveal and
  rejects clearing a vote during the countdown. The vote check/write, reveal
  snapshot, and reset share the per-room lock.
- Reveal reserves the round before awaiting database work. Only that reservation
  can finish the countdown. Reset clears the reservation and timer; a late lookup
  cannot revive it. Reset serializes with an already-running snapshot commit.
- The round timer is persisted as `roundStartedAt` (room creation and each reset)
  and `roundRevealedAt` (the reveal commit). Room DTOs carry elapsed milliseconds,
  not timestamps, so client clock skew does not matter; clients count locally and
  restart at zero on the payload-free `reset` event. Nothing is sent per tick.
- Disconnect cleanup waits 120 seconds. Rejoining cancels cleanup; a still-connected
  tab preserves membership. Inactive rooms are removed after `limits.inactiveRoomDays` (default 90) by the cron job.
- Pending membership has separate capacity and a five-minute deadline from its
  original creation. Leaving or disconnecting cancels an unfinished join; a socket
  cannot run overlapping joins. Transport admission and durable growth quotas are
  described in [security invariants](security.md) and [abuse limits](operations.md#application-abuse-limits).
- Issue writes authenticate the visitor/room/user tuple and run transactionally.
  Create/update/delete use a discriminated command, so update/delete always have an
  id and create always has a title. See [the HTTP contract](issues-api.md).
- Browser issue requests use generations to ignore stale loads and mutation results
  after navigation. Invalid response data never replaces valid store state.
- Named model parts are checked explicitly. Impact debris has a fixed count bound,
  follows moving card bounds, and disposes geometry/materials on expiry or teardown.
- The room mood (friendly, playful, spicy) only controls which throwables
  members may use; friendly rooms exclude the rough ones.

Testing is described in [testing](testing.md) and the feedback feature in
[feedback](feedback.md).
