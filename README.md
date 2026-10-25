# Skriptarnica

Study notes marketplace and student communities. The full specification is in [`SPEC.md`](SPEC.md). Decisions are in [`docs/DECISIONS.md`](docs/DECISIONS.md).

> "Skriptarnica" is a working name, defined only in `src/config/site.ts`.

## Requirements

- Node.js 22 (`nvm use`)
- Docker with Compose v2 (for the local Postgres)

## Local setup

```bash
npm install
cp .env.example .env        # fill in values; see comments in the file
npm run db:up               # Postgres 17 on localhost:5433
npm run db:migrate          # applies drizzle/ migrations (never `drizzle-kit push`)
npm run dev                 # http://localhost:3000
```

Check that everything is connected: `curl localhost:3000/api/health`.

If `docker compose` fails with `client version 1.42 is too old`, your Compose plugin is older than the Docker engine. Upgrade the plugin, or run `DOCKER_API_VERSION=1.44 npm run db:up`.

## Scripts

| Script                | What it does                                 |
| --------------------- | -------------------------------------------- |
| `npm run dev`         | Dev server (Turbopack)                       |
| `npm run build`       | Production build (fails on an invalid env)   |
| `npm run lint`        | ESLint                                       |
| `npm run format`      | Prettier write (`format:check` in CI)        |
| `npm run typecheck`   | `tsc --noEmit`                               |
| `npm test`            | Vitest unit tests                            |
| `npm run db:generate` | Generate a migration from the Drizzle schema |
| `npm run db:migrate`  | Apply migrations                             |
| `npm run db:studio`   | Drizzle Studio                               |

## Environment

All variables are validated with zod in `src/env.ts`, and the app does not start with an invalid env. Every variable is documented in `.env.example`. `SKIP_ENV_VALIDATION=true` is only for tooling (unit tests).

## Project structure

See SPEC §2.1. In short: routes in `src/app`, design system in `src/components/ui`, domain logic in `src/server/services`, authorization in `src/server/policies`, i18n messages in `src/i18n/messages`.
