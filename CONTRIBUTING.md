# Contributing to Agile Deck

Thanks for helping. Bug reports, small fixes and new throwable characters are the easiest places to start.

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Read [AGENTS.md](AGENTS.md). It is the source of truth for architecture, strict TypeScript, validation, authorization, rate limiting and testing rules, for people and AI tools alike.
- Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Setting up

You need Node.js 22.18 or newer (24 recommended).

```sh
npm install
npm run dev
```

See the [README](README.md#develop-locally) for the local ports and how to turn on the admin page.

## Making a change

- Keep pull requests small and focused on one thing.
- Keep socket payloads, DTOs, event names and validation schemas in `shared/`, and validate every input at the boundary.
- Add or update tests for changed behaviour, especially authorization, rate limits, schema changes and anything that touches the database.
- Database changes need a new Prisma migration in `api/prisma/migrations/`. Never edit a migration that has already been released.
- Don't weaken a security guard or a test to make a feature pass. If a limit needs to change, explain the cost and abuse trade-off in the pull request and update `docs/security.md` and `docs/operations.md`.
- New throwable characters: the `.agents/skills/add-character/` guide describes the structure and quality bar, and `node tools/character-preview/server.mjs` serves a preview page.

## Checks

Run the full gate before opening a pull request; CI runs the same command:

```sh
npm run check
```

`npm test` runs only the throw-scene animation specs a change affects. Run `npm run test:all` if you changed shared animation code.

## Licence

By contributing, you agree that your contribution is licensed under the project's [MIT License](LICENSE).
