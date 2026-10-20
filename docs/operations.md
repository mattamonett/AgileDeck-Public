# Operations reference

This page is for anyone running the Docker Compose stack. For first-time setup
(the `.env` file, a domain, TLS, and editing the site operator details), see
[self-hosting](self-hosting.md). Commands below run from the repository root,
where `docker compose` finds `docker-compose.yml` and `.env`.

## What runs where

| Piece | Where | Reachable from |
| --- | --- | --- |
| `web` (nginx) | Serves the Angular build on container port 8080 and proxies `/api/` and `/socket.io/` to the `api` service | Published on `${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8080}` |
| `api` (Node) | Express and Socket.IO on container port 3000 | Only the `poker` Compose network; port 3000 is not published |
| SQLite database | `/app/api/data/poker.db` (plus `-wal` and `-shm` files) | The `poker_data` volume (named `poker_poker_data` by Docker) |

The browser talks to one origin: the web container. nginx forwards API and
socket traffic to `http://api:3000`, adding `X-Forwarded-For` and
`X-Forwarded-Proto`. The `poker` network uses the subnet `172.30.0.0/24`, and
the web container has the fixed address `172.30.0.10` on it.

Both containers run read-only with all capabilities dropped,
`no-new-privileges`, a small `/tmp` tmpfs, and JSON log files capped at three
10 MB files.

## Configuration

Compose reads `.env` (copy it from `.env.example`). The values that matter:

| Variable | Default | Purpose |
| --- | --- | --- |
| `COOKIE_SIGNING_SECRET` | none, required | Signs visitor cookies. Production refuses a value shorter than 32 characters or equal to the example placeholder. |
| `COOKIE_SIGNING_SECRET_PREVIOUS` | empty | Accepted only to verify cookies during [rotation](#rotate-the-cookie-signing-secret). |
| `POKER_FRONTEND_URL` | `http://localhost:8080` in Compose | The address people type, no trailing slash; separate several with commas. The API refuses to start in production when it is empty. Browser and socket requests must come from one of these origins. |
| `COOKIE_SECURE` | empty | Secure cookies are on when every frontend URL is `https://`. Set `true` or `false` to override. |
| `ADMIN_PASSWORD` | empty | Turns on the [admin page](#admin-page) at `/admin`. At least 12 characters; empty leaves it off. |
| `TRUSTED_PROXY_IPS` | `172.30.0.10` | Proxies allowed to report the client address. See [client address](#client-address-and-trusted-proxies). |
| `WEB_BIND`, `WEB_PORT` | `127.0.0.1`, `8080` | Where the web container is published. |
| `ALLOW_MISSING_SOCKET_ORIGIN` | `false` | In production, requests without an `Origin` header are refused unless this is `true`. |
| `POKER_VERSION` | `latest` | Image tag for `poker-api` and `poker-web`. |
| `BUILD_TIME` | `Development` | Version string baked into the images and returned by `/api/version`. |

## Start and upgrade

```sh
docker compose up -d --build
```

The API container runs `prisma migrate deploy` before it starts the server, so
an upgrade is: pull the new code, take a [backup](#backups), and run the same
command. The web container waits for the API health check. Data in the
`poker_data` volume is kept.

To keep the previous images for [rollback](#rollback), tag each build:

```sh
export POKER_VERSION="$(date -u +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
BUILD_TIME="$POKER_VERSION" docker compose up -d --build
```

Visitors never need a hard refresh after an upgrade. The service worker serves
the cached build first, so the app asks it for a newer build on startup and
reloads into it when one is ready. A socket error also checks first, so an old
page that the new API rejects reloads instead of showing the error. nginx sends
HTML, `version.json` and the service worker files with `no-store`.

## Check health and logs

```sh
docker compose ps
docker compose logs --tail 100 api web
docker compose exec -T web nginx -t
curl --fail http://127.0.0.1:8080/version.json
curl --fail -H "Origin: http://localhost:8080" http://127.0.0.1:8080/api/version
```

Use your `POKER_FRONTEND_URL` as the `Origin` value; in production the API
refuses requests without an allowed `Origin`. `/api/version` returns the
`BUILD_TIME` of the running API. Compose health checks call the API's `/`
directly inside its container and fetch `/` from nginx.

The API logs one `[DIAG] Database connected` line with the room count at
startup. Origin rejections are summarised at most once a minute.

## Backups

SQLite runs in WAL mode, so recent commits may live in `poker.db-wal`. Never
copy only `poker.db` while the API is running.

The simplest consistent backup stops the API for a moment:

```sh
docker compose stop api
docker run --rm -v poker_poker_data:/data:ro -v "$PWD":/backup alpine \
  tar czf "/backup/poker-data-$(date -u +%Y%m%d-%H%M%S).tar.gz" -C /data .
docker compose start api
```

For a live backup, use SQLite's online backup (or `VACUUM INTO`) from a
container that shares the volume:

```sh
docker run --rm -v poker_poker_data:/data -v "$PWD":/backup alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null && sqlite3 /data/poker.db ".backup /backup/poker.db"'
```

Run `PRAGMA quick_check` on a backup before relying on it. Keep the volume on
local disk, not a network share.

To restore, stop the API, replace the contents of the volume with the backup
(remove any leftover `poker.db-wal` and `poker.db-shm`), and start it again.
Restoring discards every write made since the backup.

## Rollback

```sh
docker image ls poker-api
export POKER_VERSION=previous-tag
docker compose up -d --no-build --pull never --wait api web
```

Migrations only move forward. An older image works only if the database schema
it expects is still compatible. Several migrations drop columns (see
[migration notes](#migration-notes)); an image from before such a migration
will fail against the newer database. In that case either restore the backup
taken before the upgrade, accepting the loss of newer writes, or restore the
dropped column by hand. Do not restore an old database over newer user writes
unless you mean to.

## Rotate the cookie signing secret

Never regenerate the secret during an upgrade; every visitor would get a new
identity and lose their approvals and feedback ownership. To rotate without
resetting visitors, move the current value to `COOKIE_SIGNING_SECRET_PREVIOUS`,
set a new `COOKIE_SIGNING_SECRET`, and recreate the API
(`docker compose up -d api`). Cookies signed with the previous secret stay valid
and are reissued with the new one on the next visit. Remove the previous secret
once returning visitors have refreshed; anyone not seen by then gets a new
identity.

## Client address and trusted proxies

Rate limits and abuse budgets group callers by client address (IPv6 by subnet).
The API reads `X-Forwarded-For` only when the direct peer is listed in
`TRUSTED_PROXY_IPS` (addresses or CIDR ranges, comma separated). It walks the
header from the right, skips trusted hops, and uses the first untrusted address.
Entries further left were written by the caller and are never believed.
`CF-Connecting-IP` and other vendor headers are not read.

The default trusts only the bundled web container at `172.30.0.10`. The Docker
gateway `172.30.0.1` is not trusted by default: traffic to a published port can
arrive from the gateway, so trusting it would let any such caller choose its
address. If you run your own reverse proxy on the same host in front of the web
container, its requests arrive from the gateway. In that case add `172.30.0.1`
to `TRUSTED_PROXY_IPS`, make the proxy replace (not append to)
`X-Forwarded-For`, and keep `WEB_BIND=127.0.0.1` so nothing else reaches the
published port. A proxy on another machine is added by its own address.

## Browser protections and security headers

Visitor cookies are `HttpOnly`, `SameSite=Lax`, signed, and `Secure` as
described under [configuration](#configuration). `/api/init` reissues the
cookie on every visit so attributes and the signing secret stay current.

API responses send `nosniff`, frame denial, `Referrer-Policy: no-referrer`, a
`default-src 'none'` CSP, and HSTS in production, and omit `X-Powered-By`.
Errors are JSON without stack traces; server errors hide their messages.

nginx sets frame denial, `nosniff`, a referrer policy, single-host HSTS, a
Permissions-Policy, and `Cross-Origin-Opener-Policy`. Its CSP allows scripts,
fonts, workers and connections only from the site itself; because the API is
proxied on the same origin, `connect-src 'self'` covers its HTTP and WebSocket
traffic. Styles allow `'unsafe-inline'` because Angular injects component
styles at runtime, and production builds disable inline critical CSS, whose
`onload` handler the CSP would block. nginx accepts request bodies up to 2 MB
(the largest API body, an issue import). Add any new external script, frame, or
connection origin to `docker/nginx.conf`.

nginx serves plain HTTP. Put a TLS-terminating proxy in front of it for any
public deployment; HSTS has no effect until the site is served over HTTPS.

## Container resource limits

The API is limited to 2 CPUs, 1 GiB RAM and 100 processes, with CPU shares of
2048 so it wins under contention. The web container is capped at 0.5 CPU,
64 MiB RAM and 64 processes with 1024 shares. These are limits, not
reservations; check socket latency and CPU throttling under peak traffic before
tuning them.

## Application abuse limits

Daily counters are stored in the database, commit atomically with the change
they allow, survive restarts, and reset at the UTC day boundary. A changed
limit applies to the counters already stored that day, so lowering one can
refuse requests at once and raising one takes effect at once. "Network"
means the client address after the [trusted-proxy rule](#client-address-and-trusted-proxies),
with IPv6 grouped by subnet; people sharing a network share its budgets.

### Operator settings

These limits come from `limits` in `config/site.json` (see
`config/site.example.json`). The API reads the file at startup, so restart it
after a change. Anything left out keeps the default below.

| Setting | Default | What it bounds |
| --- | --- | --- |
| `maxUsersPerRoom` | 25 (2–100) | Approved participants in one room |
| `maxRooms` | 1,000 | Rooms stored at once; creation is refused at the cap |
| `inactiveRoomDays` | 90 | Days without activity before cleanup deletes a room, and age at which unlinked agreements and feedback access are deleted |
| `usageRetentionDays` | 400 | UTC days of app-wide usage counts kept |
| `daily.roomsCreated` | 5 visitor, 20 network, 100 site | New rooms |
| `daily.newVisitors` | 100 network, 1,000 site | First agreement records for new browser IDs |
| `daily.joinRequests` | 3 visitor, 30 network, per room | Lobby requests to join one room |
| `daily.issueImports` | 20 visitor, 40 network, 500 site | Issue imports |
| `daily.feedbackPosts` | 5 visitor, 20 network, 1,000 site | Feedback submissions |
| `daily.feedbackVotes` | 100 visitor, 300 network, 10,000 site | Feedback votes, changes and removals |
| `daily.feedbackReplies` | 20 visitor, 50 network, 500 site | Feedback replies |

`features` in the same file can turn off the feedback page (`feedback`), the
per-room issue backlog (`issues`) and app-wide usage counts (`usageStats`).
Turned-off features answer 404 and the site hides their buttons; their stored
data is kept and returns when the feature is turned back on.

Before raising a limit, weigh what it costs:

- Every room and participant is held in SQLite and the in-memory socket state,
  and each vote or join is broadcast to everyone in the room, so raising
  `maxUsersPerRoom` grows each broadcast and the work per room, and raising
  `maxRooms` grows the database and the cleanup job.
- Network budgets are shared by everyone behind one address (an office, a
  school, a mobile carrier). Low network limits refuse real people on busy
  networks; high ones let one network create more rows and load.
- Site-wide budgets are the backstop against many networks at once. Raising
  them lets a distributed abuser fill the database faster before anyone
  notices; keep them well below what the disk and the admin's review time can
  absorb.
- Longer `inactiveRoomDays` and `usageRetentionDays` keep more data and should
  match what the privacy notice tells visitors.

Everything else in this section is fixed in code.

### Fixed limits

Site password (when `access.passwordProtects` is on): `POST /api/access` allows
10 attempts per network per 15 minutes, then durable daily budgets of 30 per
network and 1,000 site-wide, charged before the password is compared.

Admin password (when `ADMIN_PASSWORD` is set): `POST /api/admin/session` allows
5 attempts per network per 15 minutes, then durable daily budgets of 20 per
network and 200 site-wide, charged before the password is compared. Other admin
requests allow 120 per network per minute.

HTTP: every request reaching Express shares a limit of 1,000 per network per
15 minutes. Rate limiting runs before cookie and body parsing. Compressed
request bodies are rejected.

Engine.IO requires a valid visitor cookie before allocating a transport.
Admission permits 120 attempts per network per minute, 30 per visitor, and
1,000 admitted handshakes globally per minute. The global budget is consumed
only after network, visitor, and capacity checks pass, so rejected traffic from
one network cannot exhaust admission for unrelated networks. Concurrent
transports are capped at 5 per visitor, 100 per network, and 2,000 globally.
Reservations for failed handshakes expire after 10 seconds; admitted transports
keep their slots until close. The namespace connection timeout is 10 seconds,
inbound messages are limited to 16 KiB, and a visitor's sockets share a
300-message budget per 10 seconds.

The in-memory socket connection, join, join-network and health windows each
track at most 10,000 keys. When a table is full, the oldest window is evicted,
which can briefly reset one stale key's count.

Each accepted throw or barrage also consumes a room budget of 40 per second and
a global budget of 200 per second. These shared budgets drop excess throws
without adding overheat to the sender.

Rooms permit `maxUsersPerRoom` approved participants plus 10 separate pending
requests.
Pending requests expire five minutes after their original creation;
reconnecting does not extend that deadline. Expired offline requests are
removed before the next join. A visitor may create 3 join requests per room per
UTC day and a network 30 (`daily.joinRequests`), so expired or denied requests cannot simply be
repeated to keep a lobby full. Visitors who are already approved for the room
do not consume these budgets. Overlapping joins on one socket are rejected, and
a disconnect or leave cancels an unfinished join. A name already used by
another member of the room is refused.

Room creation is limited by `daily.roomsCreated` and `maxRooms`. New visitor
agreements are limited by `daily.newVisitors`; returning identities with the
current agreement do not consume that budget.

Issues: 120 issue requests per network per minute and 90 per visitor per
minute. Issue bodies are parsed only after the visitor and membership checks;
ordinary issue requests accept 100 KB and imports 2 MB. One import adds at most
500 issues and 20 nesting levels, inserted with a single batch in one
transaction. Only one import runs at a time on the server; others get 429.
Imports have the daily budgets in `daily.issueImports`.
A room holds at most 5,000 issues.

Feedback is available to visitors approved in at least one room. Submissions
are limited to 1 per visitor per minute plus the durable `daily.feedbackPosts`
budgets, which an in-memory copy also checks before the database. Votes,
changes, and removals are limited to 30 per visitor per minute and 60 per
network per minute, plus the durable `daily.feedbackVotes` budgets. These
controls limit anonymous identity multiplication; they do not establish
one-person-one-vote.

Reply posting shares a three-per-minute sender limit and the durable
`daily.feedbackReplies` budgets (the visitor budget applies to the original
author). The admin has a fixed allowance of 100 per day that counts
against the same site-wide budget. A feedback item
holds at most 100 replies and the site 100,000; reaching capacity refuses new
replies rather than deleting history. Authorization and Origin checks precede
the 8 KiB reply parser. Read receipts accept at most 20 IDs with a 2 KiB parser.

The fixed limits are defined in `api/src/platform/transport-admission.ts`,
`api/src/socket/rate-limits.ts`, and the services, routes and repositories
under `api/src/modules/`. Review the
[security guide](security.md) and the effect on shared networks before changing
them.

## Retention

A daily job at midnight (server time) removes rooms not updated for
`limits.inactiveRoomDays` (90 by default; skipping any room with connected
sockets), expired daily counters, and orphaned agreements and feedback access
older than the same number of days. Identities linked to a room, approval, or
feedback are kept. Rate-limit statistics are kept for 30 UTC days (fixed) and
usage counters for `limits.usageRetentionDays` (400 by default). Feedback and replies are kept until
deleted by the admin.

## Admin page

The admin page is the `/admin` route of the site. It is off until
`ADMIN_PASSWORD` is set (at least 12 characters; the API refuses to start with a
shorter one). While it is off, every `/api/admin` route answers 404 and `/admin`
explains how to turn it on. The page has **Pending Review**, **Feedback
Review**, **Rooms**, and **Usage** tabs.

### Signing in

Open `/admin` and enter `ADMIN_PASSWORD`. The page never stores the password or
a token: the API sets an HttpOnly, SameSite=Strict `agiledeck_admin_v1` cookie
for `Path=/api/admin`, Secure under the same rule as other cookies, valid for
12 hours. It is signed with the cookie signing secret and bound to the browser
ID and a hash of the password, so it does not work in another browser and
changing `ADMIN_PASSWORD` (then restarting) signs everyone out. **Sign out**
clears it. API restarts keep sessions when `COOKIE_SIGNING_SECRET` is set.

The admin page is reachable wherever the site is, so it is only as strong as
`ADMIN_PASSWORD`: use a long random value (for example
`openssl rand -base64 24`), and change it if it may have leaked. The site
password does not apply to the admin page, so an operator can sign in when
`access.passwordProtects` is `everything`; the admin cookie in turn does not
unlock the rest of the site.

Admin requests share the general HTTP limit and a limit of 120 per network per
minute. Sign-in attempts also pass a window of 5 per network per 15 minutes and
durable daily budgets of 20 per network and 200 site-wide, charged before the
password is compared, so refused attempts reveal nothing. The site-wide budget
bounds total guessing at the cost of letting a distributed attacker block new
sign-ins for the rest of the UTC day; browsers already signed in are
unaffected. Every other admin route needs the cookie (401 without it), and
writes also need the site's `Origin`, before any body is parsed (8 KiB at most).

For development, run `ADMIN_PASSWORD=<at least 12 characters> npm run dev` and
open <http://localhost:4300/admin>. Its banner says **development database**;
production says **production database**.

### Feedback approval

New feedback items and author replies start `pending` and are visible only to
their author and the admin. **Pending Review** lists them oldest first. Approve
publishes an item; reject keeps it private and may include a reason of up to
500 characters, shown to the author. Either decision marks the item as updated
for its author. A decision on an item that was already reviewed returns 409;
reload the list. Admin replies are published immediately.

**Feedback Review** filters all feedback by type, workflow status and
publication status, searches titles, and changes the workflow (New, Under
Review, Closed). Closed items need a reason; duplicates need a published
original. Notes on published items are public. Saves compare the previous
workflow atomically; stale tabs must reload.

### Rooms

Rooms list newest first, 50 per page, with member and issue counts, creation
dates, and last activity (`Room.updatedAt`). Every column sorts server-side.
Approved-member counts include retained browser approvals after departure; they
count browser identities, not people. Selecting a room shows its members with
role, approval, last joined, and rate-limit counts. Browser identifiers are
never shown.

### Deleting rooms and users

Room deletion requires a confirmation showing the room name and approved-member
count, checked again on the server. It deletes the room and its issues,
participants, approvals, observer preferences, and saved results. User deletion
is global for the selected browser identity: it removes memberships, approvals,
observer preferences, agreement and access records, votes, rate-limit history,
and visitor quota records. Network and global budgets remain. Saved result
snapshots in the affected rooms are cleared.

Feedback and replies are kept when a user or room is deleted. User deletion
replaces the feedback owner with an unlinked random identifier; it does not
scrub names typed into feedback, and it does not ban later participation.
Member actions use encrypted references bound to a room and valid for one hour
(or until API restart). Deletion disconnects the affected sockets and refreshes
other participants. Never test a destructive action against production data.

## SQLite

The API enables WAL before accepting requests, keeps `synchronous=FULL`, and
uses one Prisma connection. Prisma uses `BEGIN IMMEDIATE` even for read
transactions, so the single connection queues concurrent work instead of
competing for SQLite's write lock. Long transactions delay everyone, which is
why imports are capped and serialized. Run only one API instance against the
volume.

## Rate-limit statistics

The admin roster shows, per browser identity, the number of rejected requests
over the current UTC day and the 29 before it: HTTP 429 responses, Socket.IO
message, action, join, verification and health limits, throw cooldowns, daily
quota errors, and connection admission limits. Counts measure rejections, not
requests or incidents, and network or global limits may reject a member who did
not cause them. Anonymous requests cannot be attributed.

Recording never changes admission. Rejections update a bounded buffer (2,000
visitor/day keys, saturating counters); one worker flushes at most 100 entries
every 10 seconds, only for identities linked to a current user or remembered
approval. Storage is capped at 100,000 visitor/day rows. Counts are lower
bounds: a process exit loses unflushed hits.

## Usage statistics

`UsageDaily` holds one row per UTC day and metric, with no room, member,
visitor, or network identity. Counted actions: rooms created; rounds revealed
(by hand or automatically) and reset; setting changes (auto reveal, multiplier,
issues panel, theme, mood, room name) when the stored value actually changes;
observer switches; nudges; throws and barrages, plus a per-throwable count; and
issue creates, edits, deletes, imports, next-issue starts, and closed-issue
clears. Counts are recorded after authorization and rate limits pass.

Recording updates an in-memory buffer (at most 2,000 keys); one worker flushes
at most 200 rows every 10 seconds. Possible keys per day are fixed by the
metric list and the throwable catalog. Daily cleanup deletes rows older than
`limits.usageRetentionDays` (400 by default). With `features.usageStats` set to
`false` nothing is recorded, existing rows age out as usual, and the **Usage**
tab says usage stats are turned off. The **Usage** tab shows current room settings, themes and moods for
rooms active in the last 30 days and for all rooms, 7- and 30-day action counts,
and the ten most thrown throwables.

## Room statistics

The room stats page counts votes, reveals, throws, barrages and throwables used
per member. Votes and reveals are written with the vote or reveal itself. Throw
counters are checked against the database on each throw, then collected in an
in-memory buffer (at most 2,000 room/member keys) and written by one worker at
most 200 rows every 10 seconds, so the stats page can lag a throw by that long.
A graceful stop writes the buffer; a crash loses up to one interval of throw
counts. Deleting a room or member on the admin page discards its buffered
counts.

## Migration notes

Migrations run automatically at API start. `20261020000000_init` creates the
whole schema; later migrations change it in order. A schema change needs a new
migration in `api/prisma/migrations/`; `api/tests/migrations/schema-drift.test.ts`
fails when `schema.prisma` and the migrations disagree. Note in this section any
migration that changes or removes data, since it matters for rollback.
