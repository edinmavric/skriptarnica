# Decisions

Small decisions not covered by SPEC.md, newest last. Expensive-to-change decisions were confirmed with the project owner (marked ✅).

## Phase 0 — Foundation (2026-10-25)

- **TypeScript 5.9.3, not 7.x.** `typescript-eslint@8.72` (used by `eslint-config-next`) requires `typescript <6.1`, and SPEC §2 asks for TS 5.x. Revisit when typescript-eslint supports TS 7.
- **ESLint 9.39, not 10.** `eslint-plugin-react`, `eslint-plugin-import` and `eslint-plugin-jsx-a11y` (bundled by `eslint-config-next@16.4`) only declare support up to ESLint 9.
- **Postgres driver: `postgres` (postgres.js)**, not `@neondatabase/serverless`. The same driver works against local Docker Postgres and Neon's pooled TCP endpoint. `prepare: false` because Neon's pooler runs PgBouncer in transaction mode. Revisit if we move to the edge runtime.
- ✅ **Local DB: Docker Postgres 17** (`docker-compose.yml`, host port **5433** so it doesn't collide with a system Postgres on 5432). Preview/production use Neon.
- ✅ **CI: GitHub Actions workflow committed; no remote yet.** The same steps were run locally. CI goes green on the first push.
- **Extensions migration.** `drizzle/0000_extensions.sql` is a custom migration that enables `pg_trgm`, `unaccent` and `citext` before any table needs them.
- **Drizzle casing: `snake_case`.** TS fields are camelCase, DB columns snake_case.
- **i18n: next-intl 4 without locale routing.** Only `sr-Latn` is active (SPEC §9), so URLs carry no locale prefix. `en.json` is a key-for-key skeleton. Message types come from `sr-Latn.json` (`src/i18n/global.d.ts`), so a missing key is a type error.
- **Env validation in `src/env.ts`** uses zod directly, without `@t3-oss/env-nextjs`. It validates server and client vars on the server and only `NEXT_PUBLIC_*` in the browser. `next.config.ts` imports it, so `dev`, `build` and `start` fail fast.
- **Sentry v11** replaced `sendDefaultPii` with `dataCollection`. The PII-off equivalent is `sentryDataCollection` in `src/lib/sentry-scrub.ts`, plus a `beforeSend` scrubber for emails and IPs. Sentry is disabled when no DSN is set. Source maps upload only when `SENTRY_AUTH_TOKEN` is present.
- **Security headers.** The static headers (HSTS, nosniff, Referrer-Policy, Permissions-Policy, `frame-ancestors 'none'`) are in `next.config.ts` now. The **nonce-based CSP** comes in Phase 1/2 through `proxy.ts` (Next 16's replacement for `middleware.ts`), once fonts and third-party scripts are known.
- **`npm audit` gate at `high`.** As of today, `drizzle-kit` pulls a dev-only esbuild with a moderate advisory that only affects esbuild's dev server, which we don't run. The fix offered is a downgrade.
- **Health endpoint** (`/api/health`) checks only the database for now. Redis and R2 checks are added with those services (Phase 2/4).
