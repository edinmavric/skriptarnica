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

## Phase 2 — Auth and onboarding

- **Better Auth 1.7** with the Drizzle adapter, uuid v7 IDs (`advanced.database.generateId`), and plugins `username`, `twoFactor` (TOTP + backup codes), `magicLink`, `haveIBeenPwned`, `nextCookies`. Schema was checked against `npx auth@1.7.12 generate`.
- **Mutating auth endpoints run as Server Actions, not public HTTP.** Sign-up, sign-in, magic link, reset, verification resend and TOTP go through our action pipeline: zod → Turnstile → Upstash rate limit → progressive lockout → `auth.api.*`. Their raw `/api/auth/*` routes are listed in `disabledPaths`, so the protections can't be bypassed. Only link callbacks (verify-email, magic-link verify, reset-password redirect), OAuth and get-session stay public. BA's built-in rate limiter is disabled in favour of ours.
- **HIBP fails closed.** If the Pwned Passwords API is unreachable, sign-up and reset return an error instead of accepting an unchecked password. `HIBP_ENABLED=false` exists only for offline test runs.
- **Turnstile fails closed** and is verified server-side with the client IP. Dev/CI use Cloudflare's documented always-pass test keys.
- **Lockout:** 5 free failures per account, then 1 min doubling up to 1 h, keyed by an email hash in Redis. Plus an IP sliding window (10/10 min). Integration-tested.
- **Sign-in allowed before email verification;** buying, selling and posting require it (`canParticipate`). This matches SPEC §4.1.2.
- **Consents:** sign-up records `terms`, `privacy`, `age_15` and `marketing_email` with document versions and IP hash, append-only. A version bump or a Google/magic-link sign-up with no consent goes to `/prihvati-uslove` before the app area. Age confirmations are consent rows (`age_15`, and `age_18` for sellers). That enum extension of SPEC §3.2 is recorded here.
- **No raw IPs with sessions** (`disableIpTracking`). Elsewhere IPs are salted SHA-256 (`IP_HASH_SALT`).
- **Auth emails are sent inline, not via a job.** Verification and reset links must arrive now, and a queue adds a failure mode. Notification and digest emails go through Inngest (Phase 8).
- **Dev outbox:** with no `RESEND_API_KEY` (local/test only; env validation requires it on preview/production), emails go to a Redis list, viewable at `/dev/outbox`, with JSON at `/api/dev/outbox` for e2e.
- **Student email verification** needs a click on the confirmation page (a POST action), so mail-client link scanners can't consume the token. Domains match exactly or as subdomains of `universities.email_domains ∪ faculties.email_domains`.
- **Onboarding** is resumable (`student_profiles.onboarding_step`) and every step is skippable. Course suggestions: the current year is pre-marked "Slušam" and earlier years "Položio", and the user corrects them.
- **Catalog seed:** `catalog.sample.json` holds real universities/faculties/programs marked as samples. Demo courses and professors are in `demo.json` (named "(demo)") and are refused when `APP_ENV=production`.
- **Integration tests** run against a real Postgres database `<db>_test`, recreated and migrated per run (vitest global setup), with test files run sequentially.
- **Avatar initials use CSS generated content.** A button labelled "Meni naloga X" wrapping DOM text "TS" fails WCAG 2.5.3 (label in name). Generated content is decorative and outside the name computation.
- **Local docker** adds Redis plus serverless-redis-http (Upstash REST protocol), SeaweedFS (S3/R2 stand-in, since MinIO's images are no longer publicly pullable) and the Inngest dev server.

## Phase 3 — Catalog and public pages

- **Search** uses one provider per entity type (`server/services/search.ts`). Each provider ORs three matchers: `search_tsv @@ prefix tsquery`, `search_text % q` (trigram similarity) and `LIKE %q%`, ranked by `ts_rank + similarity + prefix bonus`. Because `search_text` is normalized by the app (`lib/search/normalize`), the `simple` config needs no Postgres `unaccent` wrapper: "cacak", "Čačak" and "Чачак" become identical strings before they reach the DB (integration-tested). Notes, communities and posts register providers in later phases.
- **Highlighting** (`lib/search/highlight`) works on normalized words and tolerates Serbian case endings (a term of 4+ letters may differ in its last 2), so "cacak" highlights "u Čačku".
- **Search UI:** the header has a Cmd/Ctrl+K dialog (desktop), mobile uses `/pretraga` from the bottom nav, and the landing page combines the search with a faculty selector. All share one ARIA combobox (grouped listbox, 200 ms debounce, live region with the result count). `GET /api/search` is rate limited per IP hash. Result pages are `noindex`.
- **Sitemap** is an index (`/sitemap.xml`) plus segment providers at `/sitemaps/<segment>.xml` (pages, faculties, courses; notes and communities later). `robots.txt` blocks everything only on `APP_ENV=preview` and disallows private areas elsewhere.
- **Commission math lives in `lib/money.ts`:** integer basis points, commission floored to whole dinars (seller's favor), property-tested with fast-check. The landing page computes its "800 RSD → 640 RSD" example from the configured commission rather than hardcoding it.
- **Dark-mode highlighter:** the bright lime is unreadable under light text, so `.marker` uses `--marker-stroke`, a muted olive in dark mode (contrast-tested against `--ink`).
- **Lighthouse** (`scripts/lighthouse.mjs`, mobile emulation): SEO = 100 and Accessibility = 100 on `/`, faculty, course and university pages. Best practices is 92, held back only by 404s for the favicon and for legal pages that arrive in Phase 10. Performance is 85–89 locally over HTTP and is the Phase 10 target.
