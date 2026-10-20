# Testing

## Where tests live

| Workspace | Location | Runner |
| --- | --- | --- |
| `shared` | `shared/tests/`, one folder per contract domain | Jest, 100% coverage gate |
| `api` | `api/tests/unit/<area>/` for one module with its collaborators mocked, `api/tests/integration/` for HTTP and socket flows against a migrated SQLite database, `api/tests/migrations/` for checking the migrations against `schema.prisma` | Jest |
| `web` | `*.spec.ts` beside the code they cover | Vitest through `ng test` |

## Commands

Run from the repository root:

```sh
npm run check       # builds, typechecks, lints, checks formatting, then runs all tests
npm test            # builds shared, then shared/API/web tests
npm run test -w api -- --runInBand
npm run test -w web
```

The shared suite enforces 100% statement/branch/function/line coverage. API gates
require at least 85% statements, functions, and lines, and 75% branches. API Jest
coverage includes real SQLite migrations, HTTP authorization, nested issue
transactions and pagination, Socket.IO broadcasts, room membership/reconnects,
rate limiting, replay protection, and deterministic reveal races. The Angular
Vitest suite covers stores, forms, navigation containers, animation geometry and
resource disposal using jsdom.

For changes to admission, membership, quotas, or retention, use the
[security regression guide](security.md#regression-tests). Coverage percentages
do not replace checks for rejected requests, cancellation, and budget bypasses.

API integration tests create temporary SQLite databases and loopback servers.
Sandboxed runners must permit child processes and loopback binding; failures with
`EPERM` are infrastructure failures, not reasons to delete or skip these tests.
The test bootstrap mocks the normal application database. Do not run development
migration/deployment commands as a substitute for isolated tests.

Use fake timers and controlled promises for countdown/concurrency tests. Mock HTTP
responses with a fresh `Response` per request: response bodies can only be read once.
Do not lower coverage gates or relax strict compiler flags to make a refactor pass.

## What the suites cannot prove

Unit/integration suites cannot prove the absence of regressions. There is currently
no automated real-browser E2E or pixel comparison suite, and jsdom cannot verify
actual GPU rendering. Before a release, smoke-test two browsers joining a room,
approval/denial with multiple tabs, voting/reveal/reset/reconnect, observer changes,
issue import/export/pagination, themes, and interactions with reduced motion on/off.

Large animation dispatchers and issue transaction orchestration remain explicit
follow-up opportunities. Avoid relocating code purely to reach a line-count target;
extract a cohesive domain responsibility and keep regression coverage with it.
