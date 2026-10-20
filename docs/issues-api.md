# Room issues API

All routes require the signed visitor session cookie and `userId` query parameter. The user must belong to the path's room, own that session, and be approved. Issue ids and parent ids must belong to that same room. Writes also require an allowed `Origin` header.

| Method | Route                                                     | Behavior                                                                                                                                                                                                                      |
| ------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/rooms/:roomId/issues?userId=:userId&cursor=:cursor` | Returns `{ issues, nextCursor, activeIssue }`. Omit cursor for the first page; URL-encode the returned cursor for the next page. `activeIssue` keeps the voting heading synchronized even when that issue is on another page. |
| POST   | `/api/rooms/:roomId/issues?userId=:userId`                | Creates an issue; returns `201 { id }`.                                                                                                                                                                                       |
| PUT    | `/api/rooms/:roomId/issues/:issueId?userId=:userId`       | Updates supplied editable fields; returns `200 { id }`.                                                                                                                                                                       |
| GET    | `/api/rooms/:roomId/issues/export?userId=:userId`         | Exports the complete board across all pages.                                                                                                                                                                                  |
| POST   | `/api/rooms/:roomId/issues/import?userId=:userId`         | Atomically imports an array of nested issues; returns `201 { count }` with fresh server ids and timestamps.                                                                                                                   |
| DELETE | `/api/rooms/:roomId/issues/:issueId?userId=:userId`       | Deletes the issue and its descendants; returns `204`.                                                                                                                                                                         |
| POST   | `/api/rooms/:roomId/issues/next?userId=:userId`           | Closes the active issue and starts the next open issue in board order (depth first, wrapping to the top); returns `200 { id }`, with `id: null` when no open issue remains.                                                   |
| GET    | `/api/rooms/:roomId/issues/closed?userId=:userId`         | Returns `{ count }`: how many issues clearing closed issues would delete now.                                                                                                                                                 |
| DELETE | `/api/rooms/:roomId/issues/closed?userId=:userId`         | Deletes every closed issue whose subissues are all closed too; returns `200 { count }`.                                                                                                                                       |

Editable fields: `title` (required on POST; 1–200 characters), `url` (empty or HTTP/HTTPS, max 2,048 characters), `status` (`open`, `in_progress`, `closed`), and `estimate` (finite number or null). POST optionally accepts `parentId`. PUT cannot move an issue to another parent or room. Extra fields, including client dates and ids, are ignored. All returned dates are ISO 8601 UTC strings; the server owns creation and modification times.

`issueNumber` is also editable on both issues and subissues: optional text, max 100 characters, for an externally assigned PBI/Task reference such as `001234` or `TASK-1234`. Surrounding whitespace is trimmed. Omit it on PUT to preserve the existing value, or send an empty string or null to clear it. Unset values are omitted from responses. It is separate from the API's generated issue id and does not need to be unique.

Pages contain at most 50 top-level issues, with all their descendants. Roots sort by original creation time descending, with id descending as a stable tie breaker. Editing never changes the order. Cursors remain usable if their boundary issue is deleted. A room supports 5,000 total issues and 20 levels to bound request and status-propagation work.

Starting an issue starts its ancestors and reopens unrelated in-progress branches. Closing the last open child closes its ancestors. These rules run transactionally across all pages.

After each successful write, Socket.IO emits `issues_changed` with `{ roomId }` to that room. Clients reload their current page using an authenticated GET, and reload on reconnect. The panel keeps local expansion choices, shows request errors, and returns to page one after adding a root.

## Limits

Routes inherit the API's origin checks and global HTTP rate limit. Additional limits are 120 issue requests per network per minute and 90 per authenticated visitor per minute. Request bodies are parsed only after the visitor and membership checks; import bodies may be up to 2 MB and other issue bodies up to 100 KB. Compressed bodies are rejected. Responses are not cached.

Imports use the shared `ImportIssuesSchema` (`shared/src/issues.ts`):

- One import adds at most 500 issues (`ISSUE_IMPORT_LIMIT`), subissues included, with up to 20 nesting levels and one active branch (the last in-progress entry and its ancestors). Larger boards can be imported in parts.
- The room's total, including the import, must stay within 5,000 issues; otherwise the request fails with `409`.
- Only one import runs at a time on the server. A request that arrives while another import is running gets `429` and can be retried shortly.
- Imports have daily budgets of 20 per visitor, 40 per network, and 500 for the whole server, counted per UTC day and kept across restarts. A spent budget returns `429`.

All records are inserted with one batched write in a single transaction; an invalid import rolls back completely. Exported server metadata is discarded on re-import.

Existing rooms begin with an empty backlog. Schema migrations run automatically when the API starts.
