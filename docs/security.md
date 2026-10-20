# Security invariants and regression tests

Use this guide when changing admission, HTTP or socket handlers, membership,
persistent growth, or background work. [AGENTS.md](../AGENTS.md)
makes these rules part of the contributor workflow. [Deployment guidance](operations.md#application-abuse-limits)
owns the current numeric limits and migration requirements; update it when those
limits change.

## Trust and authorization

Identity comes from a validated signed visitor cookie. A room/user ID supplied
by a caller is a lookup key, not a credential. Interactive actions must check
that the user belongs to the cookie's visitor, belongs to the requested room,
and is approved when participation is required. Approved participants have
collaborative permissions; there is no administrator role inside a room. The
site operator's admin page is separate and has its own password (see
[admin password](#admin-password)).

Room creators are approved automatically and remain eligible for feedback.
Anonymous browser identities can be multiplied, so neither approval nor a signed
cookie proves that a visitor is a distinct person. Preserve aggregate network
and global budgets alongside visitor budgets. Origin checks protect browser
flows but do not replace authorization or quotas. There is no human-verification
challenge, so join, room-creation and persistence budgets are the abuse
controls. Add a challenge in front of those budgets if automated joins become a
problem; do not raise the budgets instead.
Browser route guards are navigation aids, not access controls.

Use the shared client-IP helpers in `api/src/platform/http/client-ip.ts`. Only a direct
peer listed in `TRUSTED_PROXY_IPS` may supply `X-Forwarded-For`, which is read
from the right: trusted hops are skipped and the first untrusted address is the
client. Entries to its left are caller-controlled and never believed. Do not
read other forwarding headers, trust a whole network range by default, or
replace IPv6 subnet budgets with individual-address budgets.

The default trusts only the bundled web container (`172.30.0.10` on the `poker`
Compose network); the API port is not published. The remaining assumption is
that anything holding that address, or any other address an operator adds, is
trusted to report the client address honestly. The Docker gateway
(`172.30.0.1`) is deliberately not trusted by default, because traffic to a
published port can arrive from it. An operator who adds it for a reverse proxy
on the same host must make that proxy replace `X-Forwarded-For` and keep the
web port bound to loopback; otherwise any caller reaching the published port
can choose its address.

## Site password

`access.passwordProtects` in `config/site.json` puts the `SITE_PASSWORD`
environment variable in front of room creation (`room-creation`) or the whole
site (`everything`). The password is never read from the settings file, never
sent to the browser, and must be at least 8 characters or the API refuses to
start. `POST /api/access` compares SHA-256 digests in constant time and, on a
match, sets an HttpOnly, SameSite=Lax cookie signed with the cookie signing
secret. The signed payload binds the visitor's browser ID, a 30-day expiry and a
hash of the current password, so the cookie cannot be moved to another browser
ID and changing `SITE_PASSWORD` signs everyone out.

Attempts pass a per-network limiter (10 per 15 minutes) before the origin and
session checks and the 1 KB uncompressed JSON parser, then consume durable daily
budgets (30 per network, 1,000 site-wide) before the comparison, so refused
attempts reveal nothing. The site-wide budget bounds total guessing at the cost
of letting a distributed attacker block new unlocks for the rest of the UTC
day; visitors who already entered the password are unaffected. Already unlocked
visitors are not charged again.

With `room-creation`, the join handler reads the cookie from the socket
handshake and the room service refuses to create a room without it; joining an
existing room is unaffected. With `everything`, Engine.IO admission checks the
cookie after the session and attempt budgets and before allocating a transport,
the namespace middleware checks it again, and an Express gate after cookie
parsing refuses every route except `/`, `/api/init`, `/api/version`,
`/api/site-config` and `/api/access` before any router or parser, and the admin
API under `/api/admin`, which has its own password. Sockets admitted before a
password change keep working until they disconnect. The browser's password page
is a navigation aid; the server enforces the gate.

## Admin password

The admin page (`/admin`, API under `/api/admin` on the public app) is guarded
by the `ADMIN_PASSWORD` environment variable alone. It is never read from a file
or sent to the browser. Unset or empty, the admin is off: every `/api/admin`
route answers 404 before any other work. Set but shorter than 12 characters, the
API refuses to start. Because the admin is reachable wherever the site is, admin
access is only as strong as `ADMIN_PASSWORD`; operators should use a long random
value.

`POST /api/admin/session` passes a per-network limiter (5 per 15 minutes), then
requires an allowed `Origin` and a signed visitor cookie, then the 1 KB
uncompressed JSON parser, and consumes durable daily budgets (20 per network,
200 site-wide) before a constant-time comparison of SHA-256 digests, so refused
attempts reveal nothing. As with the site password, the site-wide budget trades
a possible day-long sign-in lockout under distributed guessing for a hard bound
on total guesses; already signed-in browsers are unaffected and are not charged
again. A match sets an HttpOnly, SameSite=Strict `agiledeck_admin_v1` cookie for
`Path=/api/admin`, Secure under the usual cookie rule, signed with the cookie
signing secret over its purpose, the visitor's browser ID, a 12-hour expiry and a
hash of the current password. It therefore cannot be moved to another browser ID
or used as a site access cookie, and changing `ADMIN_PASSWORD` signs every admin
out. `DELETE` clears it; `GET` reports only whether this browser is signed in.

Every other admin route checks that cookie for the request's browser ID (401
otherwise) and, for every method but `GET`, an allowed `Origin` (403), behind a
120-per-minute network limiter, before the route parsers and any database work.
The site password gate lets only the `/api/admin` prefix through, so the
operator can sign in on a locked site, and the admin cookie does not unlock any
other route. The admin router runs before the member deletion-lease context, as
the former separate listener did, so an admin request never holds a member
lease that its own deletion would invalidate. The admin's 429 responses are recorded by
the same rate-limit telemetry as other HTTP rejections. The browser's admin page
is a navigation aid; the API enforces every check.

## Admission before expensive work

Engine.IO intercepts its own requests before Express. Authenticate and budget
the transport in `allowRequest`, before allocation, even if the client never
sends a Socket.IO namespace CONNECT. Namespace guards must remain in place too.
Transport reservations must expire after failed handshakes and remain counted
until close after successful admission. Enforce visitor, network, and global
concurrency caps, a namespace timeout, and an inbound message-size limit.

For HTTP, the global network limiter precedes cookie parsing and JSON parsing.
Route-specific identity and access checks precede large import or feedback body
parsers. Malformed, unauthorized, and over-budget requests must not bypass
admission or impose the full parsing cost. Keep body limits local to their
routes and reject compressed bodies unless bounded inflation is explicitly
implemented and tested.

Every incoming socket event consumes a general ingress budget, including unknown
events and events outside replay protection. Bounded in-memory counters must not
refuse every new key when full; evict the oldest entry so flooding distinct keys
cannot deny unrelated callers, and keep separate global limits for total cost.
Socket network limits use the same IPv6 subnet grouping as HTTP. Per-action validation, authorization,
replay protection, and cost-based rate limits remain necessary. Keep in-memory
counters and resource reservations bounded and expiring. New queues, timers,
background work, or fan-out paths need explicit limits and cancellation behavior.

## Membership lifecycle

Allow one in-flight join per socket. Recheck connection and cancellation
generation after awaited work and before committing membership, subscribing,
or emitting results. Clean up a membership acquired by an abandoned join.
Leaving must remove room subscriptions, and a late join result must not restore
them. Use the room lock for transitions that race with approval or cleanup.
Commit a join's socket membership under the room lock after rechecking that its
user row still exists, so denial, cleanup, and deletion cannot miss the socket.

Pending requests have a separate capacity pool and expire from their original
creation time; reconnecting must not extend the deadline. Recheck approval and
membership when an expiry callback runs. A full pending lobby must not consume
approved participant capacity or block an approved returning visitor. Preserve
the reconnect grace period and memberships still used by another tab.

Pending sockets wait in a separate `lobby:<roomId>` Socket.IO room, so room-wide
broadcasts reach approved members only. Look up a member's sockets with
`memberChannels(roomId)`, never the room channel alone. Approval moves the
member's sockets into the room and sends the current room and reveal state.
Expired requests cannot be approved.

Deletion leases count the work holding them. A full lease map evicts only idle
leases and refuses new work when every lease is busy; eviction never invalidates
in-flight work. Room leases are taken only for well-formed room IDs, and HTTP
leases last until the response closes. Daily room cleanup deletes each stale room
under its room lock and deletion fence and skips rooms with connected sockets.

## Persistent growth and costly requests

Visitor limits alone are insufficient when changing a room name or obtaining a
new browser cookie creates another bucket. Persistent growth needs network and
global budgets, durable daily counters, and storage thresholds appropriate to
the resource. Commit quota consumption and the associated mutation in the same
transaction. Rejected or failed mutations must roll back their quota writes;
concurrent requests must not exceed the cap.

Persistent records need an explicit retention policy and efficient lookup
indexes. Cleanup must preserve linked identities and current counters. Test the
actual deletion queries against a migrated temporary database before changing
retention rules.
When stored data, retention, or outside processors change, update the built-in
privacy notice (`defaultPrivacyNotice` in `shared/src/legal/default-privacy.ts`), which states
the configured retention periods and leaves out switched-off features. The API
derives the agreement version from a hash of the agreement text it serves, so a
wording or settings change asks visitors to accept again; each acceptance stores
the exact text that was shown. Operator-supplied terms and privacy files are
read once at startup, capped at 100 KB, and rendered as text, never as HTML; a
missing, unreadable, oversized or empty file stops the API.

When `legal.requireAgreement` is off, no acceptance is required or stored, so
the new-visitor budgets (100 per network and 1,000 site-wide per UTC day) are
charged when a browser ID with no stored membership, approval, feedback access
or agreement first creates or joins a room, in the same transaction as the room
or the membership.
Turning agreements off must not remove that budget.

Vote changes and removals also perform work. Include them in the relevant
aggregate budgets.

Requests whose cost grows with their input need a size cap as well as a count
budget. Issue imports are capped at 500 issues and 2 MB, inserted with one
batch, run one at a time server-wide (others get 429), and consume daily
visitor, network, and global budgets. Lobby join requests consume daily
per-room visitor and network budgets, so expired or denied requests cannot be
repeated to keep a lobby full.

## Regression tests

Feedback replies use server-assigned admin/author roles. Parent lookup and original-author authorization run before body parsing; approved readers can see only published replies on published parents. New feedback and author replies stay `pending` and private until the admin approves or rejects them; admin replies publish immediately. Review only moves a `pending` row, so a second decision gets 409 rather than overwriting the first. Approval never changes the parent's human workflow. Separate read receipts apply only to submitted IDs belonging to that thread, already published, and written by the other participant; pending replies and unloaded pages must remain unread. `api/tests/integration/feedback.test.ts` covers role spoofing, private visibility, authorization before parsing, immutability, closure, read receipts, atomic reply quotas/capacity, and deletion against a migrated database. `api/tests/integration/feedback-admin.test.ts` covers the guarded admin review and conversation paths.

Admin handlers are reachable only through the guards described under [admin password](#admin-password): admin off answers 404, and without a valid admin cookie for the caller's browser ID every admin route answers 401 before body parsing and database access; writes also need an allowed `Origin`. Pending and rejected submissions are visible only to a signed-in admin and in the author's own view. `api/tests/integration/admin-session.test.ts` covers admin off, budgets charged before comparison, refusal at the budget even with the right password, cookie binding to the browser ID and password, Origin checks, reachability on a locked site, sign-out and telemetry; `api/tests/integration/feedback-admin.test.ts` covers these guards on the admin routes, bounded parsing/pagination, duplicate integrity and stale updates; `api/tests/unit/bootstrap/app.test.ts` checks that the admin router sits after the site gate and before every parser.

Update the relevant tests when changing these boundaries. Keep HTTP test harness
middleware ordering faithful to production; an early test-only JSON parser can
hide an authorization-before-parsing regression.

| Boundary | Test file | Evidence to preserve or extend |
| --- | --- | --- |
| Transport admission | `api/tests/unit/platform/transport-admission.test.ts`, `api/tests/unit/bootstrap/server.test.ts` | Real polling without a cookie allocates no client; signed unjoined transports hit capacity; close releases a slot; failed reservations expire; IPv6 rotations share a budget. |
| HTTP parsing | `api/tests/integration/issues.test.ts`, `api/tests/integration/feedback.test.ts`, `api/tests/unit/bootstrap/app.test.ts` | Malformed unauthorized bodies fail access checks before parsing; compressed bodies are rejected; global admission remains ahead of parsers. |
| Join/leave lifecycle | `api/tests/unit/socket/socket.test.ts`, `api/tests/unit/rooms/room.service.test.ts` | Controlled promises cover overlap, disconnect/leave during acquisition, cleanup and subscriptions; timers cover pending expiry and approval; unknown event floods consume ingress. |
| Durable budgets and capacity | `api/tests/integration/abuse-quota.test.ts` | Migrated SQLite tests cover database reconnects, new identities/room names, atomic concurrent caps, rollback, registration budgets, separate pending capacity, expiry, and approval capacity. |
| Retention | `api/tests/integration/abuse-quota.test.ts`, `api/tests/unit/maintenance/cleanup.job.test.ts` | Real cleanup deletes old orphan identities and expired counters while retaining recent or linked records. |
| Feedback abuse | `api/tests/integration/feedback.test.ts`, `api/tests/integration/feedback-admin.test.ts` | Fresh identities cannot reset network vote budgets; pending items stay private until reviewed; existing authorization still holds. |
| Imports and lobby | `api/tests/integration/issues.test.ts`, `api/tests/unit/rooms/room.service.test.ts` | Import size and count caps, the single running import, and daily import budgets; daily lobby request budgets per room. |
| Identity and privacy | `api/tests/unit/platform/client-ip.test.ts`, `api/tests/unit/platform/visitor-session.test.ts`, `api/tests/integration/room-approval.test.ts`, `api/tests/unit/socket/socket.test.ts` | Trusted peer policy, signed cookies, cross-visitor authorization, pending visibility, and multi-tab approval remain enforced. |
| Site password | `api/tests/unit/site/site-access.test.ts`, `api/tests/integration/site-access-routes.test.ts`, `api/tests/unit/socket/socket.test.ts`, `api/tests/unit/rooms/room.service.test.ts`, `api/tests/unit/config/site-config.test.ts` | Constant-time match; cookie bound to browser ID, expiry and password; rotation of the signing secret; window limiter and durable network and site-wide budgets charged before comparing; HTTP gate order and open routes; real polling refused before allocation; namespace guard; room creation refused while joins still work; startup refuses a missing or short `SITE_PASSWORD`. |
| Admin password | `api/tests/integration/admin-session.test.ts`, `api/tests/integration/feedback-admin.test.ts`, `api/tests/unit/bootstrap/app.test.ts`, `api/tests/unit/bootstrap/env.test.ts`, `api/tests/unit/platform/signed-access-token.test.ts` | Admin off answers 404; startup refuses a short `ADMIN_PASSWORD`; window limiter and durable network and site-wide budgets charged before comparing, and refusing even the right password once spent; cookie bound to purpose, browser ID, expiry and password; Origin required for sign-in, sign-out and admin writes; admin routes reachable when the site password protects everything; no admin cookie means 401 before parsing. |
| Legal text and agreements | `api/tests/unit/config/site-config.test.ts`, `api/tests/integration/abuse-quota.test.ts`, `api/tests/integration/feedback.test.ts`, `shared/tests/legal/` | Derived agreement version; stale acceptances refused; legal file errors stop startup; with agreements off nothing is stored and new browser IDs still consume the new-visitor budgets. |

Run the API compile, lint, and full test gates from the repository root:

```sh
npm run typecheck -w api
npm run lint -w api
npm run test -w api -- --runInBand
```

Build shared contracts first if they changed, and verify affected web consumers.
Use controlled promises, fake timers, loopback-only servers, and temporary migrated
databases. Do not use production load or the application database for abuse probes.
Passing coverage thresholds alone does not establish these invariants.

## Review new work and changes to limits

For each new entry point, identify what a caller can allocate, parse, persist,
queue, broadcast, or trigger before being authorized. Check what happens when
the caller disconnects, repeats the operation, changes identifiers, opens more
tabs, or restarts the server. Review denial paths and shared-resource cost as
well as the successful path. Document limit changes and their effect on people
sharing a network; retain regression coverage when changing the implementation.

The September 2026 fixes address audit findings 1, 2, 3, 5, 6, and 7. Finding 8
concerned the AI room companion, which has been removed. Bulk-import database
contention (finding 4) is mitigated rather than eliminated: an import adds at
most 500 issues in one batched insert, only one import runs at a time, and
imports have daily visitor, network, and global budgets. Imports still share the
single SQLite connection, so a running import delays other writes for its
duration. New bulk work should have bounded global admission and fair
scheduling across rooms. Tests here validate local behavior, not production
capacity or the absence of other vulnerabilities.

Former open item High #2 (forwarded-address spoofing through a trusted Docker
gateway) no longer applies in the same form: the API port is unpublished, the
browser reaches it only through the web container's proxy, and only that
container's address is trusted by default. The remaining assumption is stated
under [trust and authorization](#trust-and-authorization): any peer listed in
`TRUSTED_PROXY_IPS` is trusted to set `X-Forwarded-For`, and an operator who
trusts the gateway must keep the published port reachable only through their
proxy. See [client address](operations.md#client-address-and-trusted-proxies).

Lobby flooding, where one visitor or network repeatedly filled a room's ten
pending slots, is mitigated by the daily per-room lobby budgets.

## Rate-limit observability

Rejected traffic must not trigger an unbounded write queue or a database write per request. The telemetry buffer and daily table are capped; flushes run in one non-overlapping worker and only retain signed identities already known to a room. Recording is best-effort and must never change admission outcomes. HTTP attribution reads only the signed cookie, socket attribution uses handshake identity, and pre-authentication traffic with no valid identity is unattributed. A signed-in admin may read aggregate 30-day rejection counts; public room DTOs never include telemetry or approval history. Regression coverage in `rate-limit-telemetry.test.ts`, `feedback-admin.test.ts`, and `socket.test.ts` verifies batching, saturation, retry, signature checks, retention, persistence, and privacy.

## Usage statistics

App-wide usage counters carry no room, member, visitor, or network identity, and the key space per day is fixed by the shared metric list and character catalog. Record only after authorization and rate limits pass, keep recording off the database path (bounded in-memory buffer, one non-overlapping flush worker), and keep the `limits.usageRetentionDays` retention in daily cleanup, and record nothing while `features.usageStats` is off. Only signed-in admin requests read the summary; public DTOs never include it. Coverage: `usage-telemetry.test.ts`, `usage-admin.test.ts`, `cron-cleanup.test.ts`, and `room.service.test.ts`.

## Administrative deletion

DELETE endpoints share the admin cookie, same-origin, and rate-limit guards before their bounded uncompressed JSON parsers. There is no public deletion endpoint. Revalidate confirmation details inside the deletion transaction. Opaque authenticated member references bind the target identity to its displayed room and expire after one hour or a process restart.

User deletion must preserve feedback and replies, detach ownership, and remove identity-level membership, agreement, preference, vote, and telemetry records. Room deletion cascades only room-owned records. Keep network and global quotas. Async operation leases invalidate delayed writes when deletion begins; room locks serialize membership transitions, telemetry flushes drain before deleting statistics, and buffered throw counts for the deleted room or visitor are discarded. The bounded lease map invalidates evicted leases rather than allowing old work to bypass a deletion fence. Tests in `admin-deletion.test.ts` and `feedback-admin.test.ts` cover references, interrupted work, telemetry flushing, stale confirmations, cross-site rejection, cascades, and retained feedback.
