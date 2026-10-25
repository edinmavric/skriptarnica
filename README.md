# Skriptarnica

Study notes marketplace and student communities. The full specification is in [`SPEC.md`](SPEC.md). Decisions are in [`docs/DECISIONS.md`](docs/DECISIONS.md).

> "Skriptarnica" is a working name, defined only in `src/config/site.ts`.

## Requirements

- Node.js 22 (`nvm use`)
- Docker with Compose v2 (for the local Postgres)

## Local setup

```bash
nvm use                      # Node 22
npm install
cp .env.example .env         # fill in values; see comments in the file
docker compose up -d         # Postgres 17 (localhost:5433), Redis, SeaweedFS storage, Inngest
npm run db:migrate           # applies drizzle/ migrations (never `drizzle-kit push`)
npm run storage:setup        # creates the storage buckets
npm run db:seed -- all       # catalog plus demo content (never in production)
npm run dev                  # http://localhost:3000
```

Check that everything is connected: `curl localhost:3000/api/health`.

In development:

- Demo accounts: `milica.demo@example.com` and `djordje.demo@example.com`, password `demo-skripta-2026`.
- Emails aren't sent; read them at `/dev/outbox`. The mock payment page is `/dev/mock-checkout`.
- Inngest (background jobs) dashboard: http://localhost:8288.
- Admin: `npm run admin:grant -- <email>` for an existing account; it must turn on 2FA before `/admin` opens.

If `docker compose` fails with `client version 1.42 is too old`, your Compose plugin is older than the Docker engine. Upgrade the plugin, or prefix the command with `DOCKER_API_VERSION=1.44`.

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
