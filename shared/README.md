# @poker/shared

Transport contracts used by API and web: socket event names, Zod schemas, DTOs and
the constants both sides must agree on. Build this workspace before compiling or
running consumers: `npm run build -w shared`. Test with `npm run test -w shared`;
the Jest coverage gate requires 100% statements, branches, functions and lines.

| Domain | Contents |
| --- | --- |
| `socket/` | `SocketEvents` and `GameEvents` enums; socket data, replay envelope, error, version and health payloads |
| `room/` | Name rules, timing constants, room mood, room commands and their payload types, public user/room DTOs, room stats |
| `voting.ts` | The vote deck, the vote command, reveal events and result snapshots |
| `themes.ts` | Theme enum, theme catalog and the theme command |
| `throwables/` | Throwable catalog, mood moderation and availability, projectile and nudge commands and events |
| `seasons/` | Halloween, Thanksgiving and Christmas throwables, their UTC season windows and availability payloads |
| `issues.ts` | Issue status, edit/import/response schemas, paging and import limits, export-to-import conversion |
| `legal/` | Agreement acceptance, built-in site agreement and privacy notice, the custom terms/privacy file parser |
| `site/` | `config/site.json` schema and defaults, the public config browsers receive, site access, content rules |
| `feedback/` | Submission, listing, reactions, workflow, replies and admin review contracts |
| `admin/` | Local admin room pages and usage metrics |

Each folder has an `index.ts` barrel and `src/index.ts` re-exports every domain.
Consumers import only from `@poker/shared`; inside this package, modules import
the concrete file they need (never a barrel) so the dependency graph stays
acyclic. Tests mirror the source tree under `tests/`, and `tests/index.test.ts`
pins the exact list of runtime exports.

Never duplicate event strings or editable constraints in consumers. Use
`safeParse` for untrusted input and infer input types from the schemas. Input and
output types can differ: multiplier strings are accepted at the boundary and
become finite, bounded numbers after validation. Optional response fields are
omitted rather than written as `undefined`.
