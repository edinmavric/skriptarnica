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

## Phase 4 — Notes: upload and processing

- **Uploads:** the browser PUTs directly to the private bucket with a presigned URL that signs `Content-Type` and `Content-Length`. A different size or type is refused by storage (integration-tested). Each upload is an `uploads` row binding key, user, note, size and a 15-minute expiry. Confirmation checks ownership, the object's size and the first 5 bytes (`%PDF-`). Non-PDFs are deleted immediately.
- **Processing** runs as an Inngest function (`process-note-version`) with retry-safe steps: analyze+render → duplicate check → finalize. The logic lives in `services/note-processing.ts`, so integration tests drive it without Inngest.
  - Encrypted files, files with JavaScript/Launch/ImportData actions, and corrupt or empty PDFs are **rejected and deleted, not sanitized**. Stripping actions safely is harder than asking the seller to re-save, and the error message says how.
  - Failures after retries mark the version failed and email `ALERT_EMAIL`.
- **Previews:** `max(1, min(3, ⌊15% × pages⌋))` pages at about 1000 px wide, WebP via sharp. The last one is blurred, and they are stored in the public bucket under immutable keys. A `note_previews` table holds them instead of the `previewPageKeys[]` array from SPEC §3.3; one source of truth.
- **Duplicates:** SHA-256 equality or a 64-bit SimHash of 3-word shingles within Hamming distance ≤ 6 (`bit_count` in Postgres) against **earlier** uploads by **other** sellers. The original author is never flagged by a later copy, and re-uploading one's own file isn't flagged. A flagged draft goes to `pending_review`; a flagged new version of a published note sends the note back to review.
- **Pre-moderation:** the first 3 approved notes (setting), flagged sellers and possible duplicates go to `pending_review`.
- **Slugs** are assigned at first publication from the title and never change afterwards (drafts use `nacrt-<id>`).
- **Bayesian rating** for sorting: (Σ + 5·4.0)/(n + 5). Notes store `ratingSum`/`reviewCount` integers, never float averages.
- **Listing cache:** marketplace writes call `revalidateTag('notes', { expire: 0 })`, not `'max'`. Next 16's `'max'` serves stale data first, which could show an unlisted note or an old price. Found by the flow-2 e2e.
- **Payout details:** AES-256-GCM with versioned keys and AAD `userId:field`, so ciphertexts can't be swapped between users or fields. Only the last 4 digits are stored in clear. Bank accounts are validated with the Serbian MOD 97-10 control number.
- **`audit_log` is append-only at the DB level** (a trigger rejects UPDATE/DELETE). Users are never hard-deleted, so `actor_id` FKs never need an update.
- **Admin access** requires `role=admin` and 2FA: non-admins get 404, and admins without 2FA are redirected to enable it. Admins are created with `npm run admin:grant -- <email>` (audited). Admins can't disable 2FA.
- **Settings** live in `app_settings` (JSON, validated with zod on read, cached in Redis for 5 minutes), with defaults from `config/constants.ts`. The tax and invoicing flags default to off ⚖️.
- **Reports** are a generic table plus a dialog. Community-scoped targets are routed by registered resolvers (Phase 7).
- **Local Inngest uses host networking** so `localhost:3000` means the app in both directions.

## Phase 5 — Payments, library, wallet

- **The ledger is enforced by the database.** A deferred constraint trigger rejects any transaction whose entries don't sum to zero at COMMIT, and entries are immutable (UPDATE/DELETE blocked), so corrections are new transactions. The app checks the sum before inserting too. Balances are always `SUM()` over entries, never stored.
- **Ledger postings:**
  - Sale: `provider_clearing −P / seller_pending +S / platform_revenue +C`.
  - Release: `seller_pending −S / seller_available +S`.
  - Refund: `seller_pending|seller_available −S / platform_revenue −C / refunds +P`. The seller account is `seller_available` when the funds were already released, which may go negative (SPEC §5.4); later releases cover it first.
  - Payout request: `seller_available −A / seller_paid_out +A` (reserved immediately); a rejection reverses it.
- **Orders:**
  - The idempotency key is unique per buyer: a retried submit resumes the same order, and the provider checkout is idempotent on the order ID.
  - Fulfilment locks the order row (`FOR UPDATE`), so webhook and reconciliation can't double-fulfil.
  - Amount mismatches throw and alert ops.
  - Free notes go through the same order/entitlement/ledger path with zero amounts.
- **Webhooks:** a `processed_webhook_events (provider, event_id)` row is inserted in the same transaction as the state change, so duplicates are no-ops. Statuses: 400 for bad signatures, 422 for amount mismatches, 500 (provider retries) for our failures.
- **Mock provider:** HMAC-SHA256 `t=…,v1=…` signatures with a 5-minute tolerance and Redis-backed sessions. Its hosted page is `/dev/mock-checkout`. A failed webhook delivery is logged, not thrown, because that is exactly the case reconciliation handles (integration-tested).
- **Reconciliation** runs every 15 minutes (Inngest cron, Europe/Belgrade), and **funds release** daily at 03:00. Each release is its own transaction, guarded by `order_items.released_at`.
- **Commission and hold days are snapshotted per order item;** `seller_profiles.payout_hold_days` overrides the default hold.
- **Watermark:** a footer on every page plus a faint diagonal mark, transliterated to ASCII (standard PDF fonts lack č/ć/đ/š/ž; embedding a font per download would bloat files). Copies are cached per (user, version) in the private bucket. Downloads redirect to a 60-second presigned URL and are logged in `download_events`, with no rate limit or daily cap (SPEC §4.3). PDFs pdf-lib can't parse are repaired with mupdf first.
- **Refunds:** buyers request within the window (7 days, a setting); an admin approves (the provider refund comes first, then one DB transaction) or rejects. Refunded entitlements are revoked; buyers who keep a file after a refund are traceable through the watermark.
- **Payouts:** the minimum is enforced, one open request per seller (advisory lock), and requested → approved → paid needs a bank reference. Admins see decrypted account details only on an explicit click, and every view is audited.
- **Counters don't bump `updated_at`.** View, sales and rating counters use raw SQL so `updated_at` keeps meaning "content changed" (seller list, sitemap `lastmod`). Found in the dashboard screenshot.
- **Chart:** a single series in `--chart-1`, a mid-lightness step of the pen hue checked with the dataviz validator: light `#4a67d0`, dark `#6a82e0`, ≥ 3:1 on all surfaces (contrast test). There's no legend (the heading names the series), a value label on the peak only, tooltips on hover and keyboard (arrow keys), and a table view.
- **`InvoiceService` ⚖️** is a no-op behind the `invoicing` flag, with hooks after payment and after refund.
- **Demo seed:** two demo sellers and four real notes (generated PDFs through the real pipeline), demo password `demo-skripta-2026`. Refused when `APP_ENV=production`.

## Phase 6 — Recommendations and feed

- **Scoring is a pure function** (`lib/recommendations.ts`) with weights in `config/recommendations.ts`: `3·relevance + 2·bayes/5 + 0.6·ln(1+sales30d) + 0.8·freshness + 1·sameProfessor`.
  - Relevance: enrolled 1.0, the program's current year 0.7, next year 0.4. Passed courses are never candidates.
  - Freshness has a 120-day half-life, measured from the current version's publication.
  - Owned and own notes are excluded.
  - Diversity: at most 2 notes per seller in the top 10; the overflow moves down rather than disappearing.
- **Cache:** the ranked note IDs (not rendered cards) live in Redis for 15 minutes. Cards are hydrated per request, so a note unpublished in the meantime simply drops out. Saving the program step or course marks invalidates the cache.
- **"Same professor"** needs to know the user's professor per course, so `user_course_status.professor_id` was added and can be set on `/moji-predmeti`.
- **`exam_periods`** (SPEC §3.5) arrives here rather than in Phase 7 because the feed's "exam period coming up" block needs it. Dates are Belgrade calendar days, and the block shows the next 21 days for the user's candidate courses. Admin CRUD comes in Phase 9; the demo seed creates upcoming periods relative to the seed date.
- **`/` serves two pages:** the landing for guests and the feed for signed-in users (after the consent gate). The community activity slot is filled in Phase 7.

## Phase 7 — Communities

- **Automatic communities:** every faculty and course gets a system community (`etf-bg`, `oet1-etf-bg`) when the catalog upserts it, so the catalog seed, admin CRUD and the CSV import all go through one path. System communities have no owner; admins moderate them until moderators are appointed.
- **Ranking** (`lib/ranking.ts`): hot uses Reddit's formula (log10 of the score plus age divided by 45,000 seconds), stored in `posts.hot_rank` and updated on every vote. Controversial is the volume raised to the balance ratio. "Best" for comments is the Wilson lower bound at 80% confidence. Top has windows for day, week, month, year and all time; the URL value is in Serbian.
- **Pagination** uses an offset cursor. Hot ranks shift between requests, so keyset pagination wouldn't be stable anyway, and the lists are short (pages of 20 with "load more").
- **Anonymity is enforced in the read model** (`PostView`/`CommentView` authors). An anonymous author's name and username never reach the HTML or the RSC payload for other users or guests; moderators and admins see them. An e2e test checks the raw HTML of the post page, the community page and search.
- **Votes:** one row per (user, target). Counters are updated in the same transaction without touching `updated_at`, and authors upvote their own post when they create it (a real vote row, so the score starts at 1). The UI is optimistic and keeps the server-confirmed result. `aria-busy` marks a vote in flight.
- **Link previews go through SSRF protection** (`server/net`): http(s) only, ports 80 and 443 only, a DNS lookup rejecting private, loopback, link-local, CGNAT and IPv4-mapped addresses (checked again on connect through a custom undici lookup), up to 3 redirects each re-validated, a 5-second timeout, 512 KB, and HTML only. A failed preview doesn't block the post.
- **Professor communities** show the conduct rules before a member's first post there. The acknowledgement is stored on `community_members.rules_acknowledged_at`.
- **Moderation:** at most 2 pinned posts. Removing a post or comment needs a reason, which is shown to the author. Bans can last 24 hours, 7 days, 30 days or be permanent (stored as the year 9999). Only admins can ban moderators. Every action goes into `moderation_actions`, which is the community's mod log, readable by its moderators.
- **Search and sitemap** include public communities and posts. Faculty-only communities show up in search only for students of that faculty, and are noindexed and left out of the sitemap.
