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

## Process note (2026-10-25)

- The project owner asked for all phases to run in one go without stopping for plan approval. Each phase still gets a short written plan (in the commit message and below), its tests and a commit. Expensive-to-change choices that would normally need a question are made with the conservative default and flagged with ⚠️ here for review.

## Phase 1 — Design system

- **Direction: notebook and highlighter.** Paper `#fbfaf5` / graphite `#1e1d1a`, ink, one highlighter accent (`--marker`, lime-yellow, background only), ballpoint-blue actions (`--pen`). A red notebook margin line and pale ruled lines (`.notebook`) are reserved for "How I studied". Note cards are paper sheets with a folded corner. The serif is Piazzolla, chosen for its sturdy, slightly rough optical-size cuts, not a default Garamond-style serif. UI text is Golos Text, which has `tnum` for prices. JetBrains Mono is used only for course codes.
- **Contrast is a test, not a promise.** `tests/unit/contrast.test.ts` parses `globals.css` and checks every text/background pair in both themes against WCAG AA, plus form-field borders at 3:1 (WCAG 1.4.11). It also asserts that the system-dark and explicit-dark token blocks are identical.
- **Theme without flash, without inline script.** The choice lives in a `theme` cookie, and the server writes `<html data-theme>`. With `system`, CSS follows `prefers-color-scheme`. No blocking script, no CSP exception.
- **CSP: nonce + `strict-dynamic` for scripts, `'unsafe-inline'` for styles only.** React `style` props and Radix positioning use style attributes, which nonces can't cover, and style injection can't execute code. It's set in `src/proxy.ts`, which is Next 16's `proxy.ts`, Node runtime.
- ⚠️ **No ISR/static HTML for public pages.** A nonce CSP requires per-request rendering (Next docs), which conflicts with SPEC §8.2's ISR. Security wins. Public pages render dynamically, and their data is cached with tagged `unstable_cache`, invalidated with `revalidateTag`. Revisit if Next ships nonce support for prerendered HTML.
- **`typedRoutes` disabled.** It rejected links to routes added in later phases. Broken internal links are caught by an e2e crawl instead (Phase 10).
- **Dev-only routes gated by `APP_ENV`, not `NODE_ENV`.** `NODE_ENV` is `production` for every `next build`, including Vercel previews, where e2e with the mock provider must run. `/dev/*` and the mock provider are off when `APP_ENV=production`.
- **i18n `en.json` is generated** from `sr-Latn.json` by `npm run i18n:sync`: same keys, and untranslated strings fall back to Serbian. `npm run i18n:check` runs in CI. A unit test validates ICU syntax and Serbian plural forms, and that none of the SPEC §6.2 banned phrases appear.
- **Combobox is custom (ARIA 1.2 APG)**, not Radix (which has none) and not cmdk. Filtering uses the same normalization as search: `nis` → Niš, `cacak` → Čačak, Cyrillic → Latin.
- **Markdown** goes through remark → rehype → `rehype-sanitize` (allowlist) → React elements via `hast-util-to-jsx-runtime`. No raw HTML, no `dangerouslySetInnerHTML`. User headings are demoted (h1→h2) so pages keep a single h1.
- **The `/dev/ui` demo content** (`demo-data.ts`) is not routed through i18n, since it's sample data for an internal, non-production page. All component and chrome strings are.
