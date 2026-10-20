# Agile Deck web

Angular standalone components and signal stores for the planning-poker client.
Run commands from the repository root:

```sh
npm run build -w shared
npm run start -w web
npm run test -w web
npm run lint -w web
npm run build -w web
```

The development server is at `http://localhost:4300`. Run `npm run dev`
from the repository root to start the web app, the local API on port 3300 and
the database migration. Development builds call the API at
`http://localhost:3300` (the `LOCAL_API_ORIGIN` define in `angular.json`);
production builds call their own origin, where nginx proxies `/api/` and
`/socket.io/` to the API container.
The same command inside `web/` delegates to the root script.
HMR and live reload are disabled; refresh after a rebuild.
The production output is `web/dist/poker-web/browser`.

Source lives in `src/app/`, split into three layers. Each folder keeps a
component's `.ts`, `.html`, `.css` and `.spec.ts` side by side.

- `core/` holds app-wide services with no UI of their own: API URL and request
  helpers, the secure session, the socket, site config and access, storage keys,
  and update checks with the update banner.
- `shared/` holds UI and helpers used by more than one feature: feedback replies
  and status, legal text, the site password form, and clipboard support.
- `features/` holds one folder per route or page:
  - `access/` is the site password gate.
  - `home/` handles room creation and join navigation.
  - `legal/` renders the terms and privacy pages.
  - `feedback/` is the public feedback board.
  - `admin/` is the lazy-loaded `/admin` route: feedback review, rooms and
    usage. It signs in with the `ADMIN_PASSWORD` set on the API, which keeps the
    session in an HttpOnly cookie, and says so when the operator has not set one.
  - `room/` is the lazy-loaded room route. `room-page/` coordinates routing, stores
    and UI actions; `state/` owns room, round and issue state; `services/` owns
    throws, nudges and seasonal throwables; `header/`, `hand/`, `table/`,
    `issues/`, `settings/`, `effects/`, `room-lobby/`, `room-stats/` and
    `room-qr-overlay/` render the page.
  - `room/throw-scene/` renders thrown characters with Three.js: `engine/`
    (renderer, flight setup, models), `flight/`, `landing/`, `kit/` (shared
    character helpers), `seasonal/`, and one folder per character under
    `characters/`.

Use the `@core/*`, `@shared/*` and `@features/*` aliases when an import crosses
those folders, and relative paths inside a feature. ESLint rejects imports
between features, imports from features into `core/` or `shared/`, and relative
imports three or more levels up.

Shared schemas validate HTTP and socket responses before store mutation. View
models explicitly normalize nullable wire fields. Stores and interaction services
remove their socket listeners and cancel owned timers on destruction.

Tests use Angular's Vitest builder with jsdom. They cover state, components, input
validation, deterministic animation behavior, and resource disposal; they do not
replace a real-browser/WebGL visual smoke test. No browser E2E runner is configured.
