# Agile Deck

Agile Deck is a self-hosted, real-time planning poker app for agile teams. Create a room, share the link, and estimate stories together. It is built with Angular, Node.js, Express, Socket.IO, Prisma and SQLite, with a shared TypeScript contract package.

It is released under the [MIT License](LICENSE).

## Features

- Real-time voting and reveal over Socket.IO, with optional auto-reveal, a round timer and a vote multiplier.
- An approval lobby: the room creator is approved straight away, and any approved participant can let newcomers in.
- Observer mode for people who watch but don't vote.
- A persistent issue backlog per room, with nested issues, estimates, pagination and JSON import and export.
- Themes (Moonlit Garden, Deep Space, Retro CRT, Las Vegas) and a room mood that controls which throwables are allowed.
- Throwable characters, barrages and nudges, animated with Three.js.
- A feedback page where visitors can post ideas and bug reports. New posts stay private until the operator approves them.
- An admin page at `/admin` for feedback, rooms and usage counts, turned on by the `ADMIN_PASSWORD` environment variable.
- QR codes for sharing a room, and a responsive layout for phones.

There are no accounts, ads, analytics or third-party scripts, and no AI features.

## Run it with Docker

You need Docker with the Compose plugin.

```sh
git clone https://github.com/mattamonett/AgileDeck-Public.git
cd AgileDeck-Public
cp .env.example .env
# Edit .env: set COOKIE_SIGNING_SECRET (for example: openssl rand -base64 48)
docker compose up -d --build
```

Open <http://localhost:8080>. To reach it from other machines, put it behind a reverse proxy with HTTPS, or set `WEB_BIND=0.0.0.0` and `POKER_FRONTEND_URL` in `.env`.

Before you put a copy online, read **[docs/self-hosting.md](docs/self-hosting.md)**. It covers reverse proxies and HTTPS, the admin page, and `config/site.json`, where you choose what your copy offers: which moods, themes and throwables are allowed, whether feedback, issues and usage stats are on, room and abuse limits, your own terms and privacy text, and an optional site password.

## Develop locally

You need Node.js 22.18 or newer (24 recommended).

```sh
npm install
npm run dev
```

`npm run dev` builds the shared package, the API and the web app, applies database migrations to a local SQLite file, and then starts:

- Web: <http://localhost:4300>
- API: <http://localhost:3300>
- Admin page: <http://localhost:4300/admin> (start with `ADMIN_PASSWORD=<at least 12 characters> npm run dev` to turn it on)

The API restarts when its source changes and the web app rebuilds on save; refresh the browser to see web changes. Only one local API can run at a time.

### Common commands

```sh
npm run check        # build, typecheck, lint, format check and test (what CI runs)
npm run format       # apply the shared Prettier style
npm test             # tests, with only the throw-scene specs a change affects
npm run test:all     # every test, including all character animation specs
npm run lint
npm run build -w shared && npm run test -w shared
npm run build -w api && npm run test -w api
npm run build -w web && npm run test -w web
```

API integration tests start their own temporary SQLite databases and loopback servers. See [architecture](docs/architecture.md) for how the pieces fit together and [testing](docs/testing.md) for how tests are organised.

## Repository layout

- `shared/`: socket event names, DTOs, constants and Zod schemas used by both the API and the web app, grouped by domain.
- `api/`: Express 5 and Socket.IO server. `src/modules/` holds one folder per feature (routes, services, repositories), `src/platform/` the HTTP, database and concurrency plumbing, and `src/socket/` the socket controllers.
- `web/`: Angular 21 app using standalone components, signals and strict templates. `src/app/core/` holds app-wide services, `src/app/shared/` UI used by several features, and `src/app/features/` one folder per page, including the `/admin` page.
- `config/`: example operator settings (`site.example.json`) and a sample terms file.
- `docker/`: Dockerfiles and the nginx configuration used by `docker-compose.yml`.
- `scripts/`: Node scripts behind the root npm commands.
- `docs/`: [self-hosting, operations, architecture and security notes](docs/README.md).
- `tools/`: local helpers, such as a character preview page.
- `AGENTS.md`: coding, testing and security standards for human and AI contributors.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first. To report a security problem, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Credits and trademarks

Some artwork, such as the garden background and card backs, was generated with AI image tools. "Agile Deck" is the name of this project; the MIT License covers the code and assets but does not grant rights to use the name or logo for another product. "Planning poker" is used here only to describe the estimation technique; the term may be a trademark of its owner.
