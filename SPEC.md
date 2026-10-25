# SPEC.md — Study Notes Marketplace & Student Communities

> Working name: **Skriptarnica** (placeholder; replace before launch. The name lives in `src/config/site.ts` and is never hardcoded elsewhere.)
> This document is the single source of truth for building the application. Claude Code: read it in full before taking the first step.
> **Note on language:** this spec is written in English, but the product UI is in **Serbian (Latin script)**. Serbian examples of microcopy, URLs and test strings below are intentional and must stay in Serbian.

---

## 0. How to work (instructions for Claude Code)

1. **Before writing any code**, load the `frontend-design` skill and follow it for all UI work. Section 6 of this document is a binding addition to that skill.
2. Work **phase by phase as defined in section 13**. For each phase: make a plan (plan mode), create a task list, implement, run tests/lint/typecheck, commit. Do not move to the next phase until the acceptance criteria of the current one are met.
3. Before installing packages, check current stable versions (`npm view <pkg> version`) and the documentation. Do not rely on outdated knowledge of APIs (Next.js, Better Auth and Drizzle change quickly).
4. **Never** invent secret keys. All secrets go into `.env.example` with a description; env variables are validated with `zod` in `src/env.ts` (the app must not start with an invalid env).
5. Every user-facing string goes through i18n (section 9). No hardcoded text in components.
6. Money is **always an integer in para** (RSD minor units). Never a float.
7. When you hit a decision not covered by this document that is expensive to change later, stop and ask. For small things, pick a reasonable default and record it in `docs/DECISIONS.md`.
8. Items marked **⚖️ LEGAL** must be implemented technically as described, but also listed in `docs/LEGAL_TODO.md` for review with a lawyer/accountant. Do not state anything legal in UI copy that has not been confirmed.
9. Code must be production quality: strict TypeScript, no `any`, no `// TODO` in main flows, error handling at every boundary (server action, route handler, webhook, job).

---

## 1. Product

### 1.1 Problem
Students learn from study notes ("skripte") made by other students, but these circulate in social media groups with no structure, no ratings and no compensation for the author. Information about courses, professors and exams is scattered.

### 1.2 Solution
One application in which a student:
- signs up and selects **university → faculty → study program (major) → year**,
- gets **recommended study notes** for their courses,
- **buys** notes from other students and **sells** their own, along with a description of how they studied and what grade they achieved,
- participates in **communities** (Reddit-style forums) for a faculty, course, professor, exam period or any topic.

### 1.3 Example user story
A student at ETF (School of Electrical Engineering) passed Fundamentals of Electrical Engineering (OET) with a 9. They upload the notes they made, write how they studied (how many days, which areas were key, what was on the exam in which exam period) and set a price. A first-year student in the same program sees the notes on their home page, previews the first pages, reads the reviews, buys, and downloads a watermarked PDF. The author sees the sale in their dashboard and later requests a payout.

### 1.4 Roles
| Role | Description |
|---|---|
| Guest | Views public note pages (preview) and public communities; cannot buy or post |
| Student | Registered; buys, posts in forums, reviews purchased notes |
| Seller | Student aged 18+ who has entered payout details and accepted the Seller Terms |
| Community moderator | Moderates a specific community (appointed by an admin or the community founder) |
| Admin | Everything: catalog, moderation, payouts, copyright claims, settings |

### 1.5 Non-goals (v1)
- No native mobile app (but the web app is mobile-first and installable as a PWA).
- No real-time chat between users (forum + notifications only).
- No subscriptions, only one-time purchases.
- No ML recommendations; rules + scoring (section 4.5).

---

## 2. Tech stack

| Layer | Choice | Note |
|---|---|---|
| Framework | **Next.js (latest stable), App Router**, React Server Components, Server Actions | TypeScript strict |
| Language | TypeScript 5.x, `strict: true`, `noUncheckedIndexedAccess: true` | |
| Database | **PostgreSQL** (Neon) | extensions: `pg_trgm`, `unaccent`, `citext` |
| ORM | **Drizzle ORM** + drizzle-kit migrations | migrations in the repo, never `push` in production |
| Auth | **Better Auth** (email+password, magic link, Google OAuth, email verification, DB sessions) | 2FA (TOTP) mandatory for admins |
| Validation | **zod** at every boundary | shared client/server schemas |
| Forms | react-hook-form + zod resolver | |
| Styling | **Tailwind CSS** (latest) + CSS variables for tokens | no off-the-shelf UI kits that produce a "default" look; Radix primitives / React Aria allowed for accessibility |
| Storage | **Cloudflare R2** (S3 API) | private bucket for files; public (via CDN) only for preview images and avatars |
| Background jobs | **Inngest** (or Trigger.dev) | PDF processing, emails, payouts, notification digests |
| PDF processing | `mupdf` (WASM) for rendering preview pages and extracting text, `pdf-lib` for watermarking | runs in a job, not in the request |
| Email | **Resend** + React Email templates | |
| Rate limiting / cache | **Upstash Redis** + `@upstash/ratelimit` | |
| Search | Postgres full-text + `pg_trgm` + `unaccent` | see 4.6 |
| Payments | **PaymentProvider adapter** (section 5) | Mock provider for dev; local processor for prod |
| Monitoring | **Sentry** (errors + performance), Vercel Analytics | |
| Product analytics | PostHog (EU host) **only with consent** | |
| Tests | Vitest (unit/integration), Playwright (e2e), axe-core (a11y) | |
| CI | GitHub Actions | lint, typecheck, test, build, e2e on preview deploy |
| Hosting | **Vercel** | preview deploy per PR, Neon branch per PR |

### 2.1 Repository structure
```
src/
  app/
    (marketing)/          # landing, about, legal pages, pricing/commission
    (auth)/               # sign in, sign up, reset, verification
    (app)/                # logged-in area: feed, notes, communities, profile, seller dashboard
    admin/                # admin panel (protected by role + 2FA)
    api/                  # route handlers: webhooks, inngest, upload signing, OG images
  components/
    ui/                   # own design system (section 6)
    features/<feature>/   # components by domain
  server/
    db/                   # drizzle schema, client, seed
    services/             # domain logic (notes, orders, wallet, forum, moderation...)
    payments/             # PaymentProvider interface + implementations
    jobs/                 # inngest functions
    auth/                 # better-auth config, guards
    policies/             # authorization (who can do what) — centralized
  lib/                    # utils: money, slug, sanitize, dates, search
  i18n/                   # messages sr-Latn, en (skeleton)
  config/                 # site, feature flags, constants (commission, limits)
  env.ts
docs/
  DECISIONS.md
  LEGAL_TODO.md
  RUNBOOK.md              # deploy, rollback, incidents, key rotation
tests/
  e2e/
  integration/
```

### 2.2 Architectural rules
- **Server-first**: data is read in Server Components; mutations go through Server Actions that call `server/services/*`. Components never talk to the database directly.
- **Centralized authorization** in `server/policies/` (e.g. `canDownloadNote(user, note)`), called in every service. Never rely on hiding a button in the UI.
- Every Server Action: `zod` parse → auth → policy → rate limit → service → `revalidateTag`/`revalidatePath`. Returns a typed `Result<T, AppError>`; never throws raw errors to the client.
- Idempotency for everything that touches money (idempotency key on orders and webhooks).
- Database transactions for all multi-table operations (purchase, ledger, payout).

---

## 3. Data model (Drizzle)

All tables: `id` (uuid v7 or cuid2), `createdAt`, `updatedAt`. Soft delete (`deletedAt`) where noted. Indexes on all FKs and on columns used for filtering/sorting.

### 3.1 Academic catalog
- `universities` — name, short name, city, slug, `emailDomains[]` (for student verification, e.g. `student.etf.bg.ac.rs`).
- `faculties` — `universityId`, name, short name (ETF), slug, city.
- `study_programs` — `facultyId`, name (major/module), level (OAS/MAS/DAS/OSS — Serbian bachelor/master/doctoral/vocational), duration in years, slug.
- `courses` — `facultyId`, name, code (optional), slug, ECTS (optional).
- `program_courses` — `programId`, `courseId`, `year` (1–6), `semester` (1–2), mandatory/elective. The same course can belong to multiple programs.
- `professors` — name, title, `facultyId`, slug. No personal data beyond publicly available info (name, title, faculty).
- `course_professors` — course–professor link.
- `catalog_requests` — users suggest a missing faculty/program/course/professor; an admin approves. Status: pending/approved/rejected.

**Seed**: JSON files in `src/server/db/seed/` that are easy to extend. Include a few real universities and faculties from Serbia with a few programs each as an example, and clearly mark them as "sample" in a comment. **Do not invent** course lists as if they were official; the catalog is filled through the admin panel and `catalog_requests`.

### 3.2 Users
- `users` (Better Auth tables + extensions): email (citext, unique), `emailVerified`, display name, `username` (unique, citext), avatar, `role` (student/admin), `bannedAt`, `banReason`.
- `student_profiles` — `userId`, `universityId`, `facultyId`, `programId`, `year`, `studentVerifiedAt` (verified via faculty email), `bio`, `isAdult` (18+ confirmation, required for selling).
- `seller_profiles` — `userId`, status (none/pending/active/suspended), accepted Seller Terms version + timestamp, payout details (account holder name, account number) **encrypted at the application level** (AES-GCM, key from env, with key versioning), `payoutHoldDays` override.
- `user_course_status` — user marks courses as `enrolled` / `passed` (+ optional grade, exam period). Used for recommendations and for "passed with X" on notes.
- `consents` — type (terms, privacy, marketing_email, analytics_cookies, seller_terms), document version, value, timestamp, IP hash. Keeps history; never overwrites.

### 3.3 Notes (marketplace)
- `notes` — `sellerId`, `courseId`, optional `professorId`, title, slug, short description, **"How I studied"** (markdown, required, min 200 characters), achieved grade (5–10, optional, labeled as self-reported), academic year/exam period when passed, page count, language/script, tags, price (para), status (draft/processing/pending_review/published/rejected/unlisted/removed), `rejectionReason`, `publishedAt`, stats (sales, average rating, review count; denormalized and updated in a transaction or job). Soft delete.
- `note_versions` — every new file version: `noteId`, `fileKey` (R2, private), `sha256`, size, page count, `previewPageKeys[]`, `extractedTextTsv` (for search and duplicate detection), `simhash`, processing status, changelog text. Buyers get access to all future versions.
- `note_previews` — the first N pages (configurable; default 3 or 15% of total, whichever is smaller) rendered as WebP, with the last one blurred.
- `bookmarks` — saved notes.
- `reviews` — buyers only, one per purchase, rating 1–5 + text, optional "I passed using these notes: grade X". The seller can reply publicly once. Reportable.

### 3.4 Money
- `orders` — `buyerId`, status (pending/paid/failed/refunded/disputed), total, `idempotencyKey`, `provider`, `providerRef`, `paidAt`. One item per order in v1 (no cart needed; simpler and fewer bugs).
- `order_items` — `orderId`, `noteId`, `sellerId`, price at time of purchase, platform commission (snapshot of percentage and amount).
- `entitlements` — `userId`, `noteId`, `orderId`, `grantedAt`, `revokedAt`. The **only** source of truth for download rights.
- `ledger_entries` — double-entry bookkeeping: `accountType` (platform_revenue, seller_pending, seller_available, seller_paid_out, provider_clearing, refunds), `accountOwnerId`, amount (+/−), `transactionId` (groups entries that must sum to 0), reference (order/payout/refund/adjustment), description. Wallet balance is **computed from the ledger**, never stored as a mutable number (a materialized view is allowed for speed).
- `payouts` — `sellerId`, amount, status (requested/approved/processing/paid/rejected), approving admin, bank transfer reference, `paidAt`.
- `refunds` — `orderId`, reason, initiated by (buyer/admin), status.
- `download_events` — `userId`, `noteVersionId`, IP hash, user agent, timestamp (for abuse detection, 12-month retention).

### 3.5 Communities (forum)
- `communities` — type (faculty/course/professor/exam/general), optional FK to the related entity, name, slug (`z/oet-etf`), description, rules (markdown), visibility (public/faculty_only), `createdById`, banner/icon, member count.
- `community_members` — role (member/moderator/owner), `joinedAt`, `bannedUntil`.
- `community_flairs` — post labels (in Serbian UI: Pitanje, Rok, Materijal, Iskustvo, Rezultati... — Question, Exam period, Material, Experience, Results).
- `posts` — `communityId`, `authorId`, type (text/link/note_share/poll), title, body (markdown, sanitized), `flairId`, `isAnonymous` (author hidden from users, visible to moderators/admins), `score`, `commentCount`, `hotRank` (computed), `lockedAt`, `pinnedAt`, `removedAt` + reason. Soft delete (shows "[obrisano]" / "[deleted]").
- `poll_options`, `poll_votes`.
- `comments` — `postId`, `parentId` (tree; displayed to depth 6, beyond that "continue thread"), body, `score`, `isAnonymous`, removed/deleted.
- `votes` — polymorphic (`targetType`, `targetId`), `userId`, value +1/−1, unique (user, target).
- `exam_periods` — optional entity for exam periods (Serbian names: januarski, februarski, junski, julski, septembarski, oktobarski) per course and year; posts can be linked to an exam period.

### 3.6 Moderation, notifications, audit
- `reports` — reporter, `targetType` (note/review/post/comment/user/community), reason (spam, abuse, plagiarism/copyright, exam questions that must not be shared, personal data, other), text, status, resolved by, action.
- `copyright_claims` — separate flow for copyright infringement claims (claimant, contact, proof of ownership, content URL, statement under full liability, status, counter-notice).
- `moderation_actions` — who, what, on what, reason, duration.
- `notifications` — `userId`, type, payload (jsonb), `readAt`. Per-type settings (in-app / email / none) in `notification_preferences`.
- `follows` — following a seller or a community.
- `audit_log` — all admin actions and sensitive operations (payout detail changes, payouts, refunds, bans, deletions). Append-only.

---

## 4. Features

### 4.1 Sign-up and onboarding
1. Sign-up: email+password (min 10 characters, checked against compromised passwords via the k-anonymity HIBP API), magic link, or Google.
2. Email verification required before buying, selling and posting.
3. Onboarding (multi-step, skippable and resumable, progress saved):
   - University → Faculty → Program → Year (searchable combobox, diacritics-tolerant: "nis" finds "Niš").
   - If the faculty/program doesn't exist: "Ne vidiš svoj smer?" ("Don't see your program?") → `catalog_request`.
   - Mark courses currently taken and courses passed (suggested based on program and year).
   - Optional: student email verification (if the domain matches `universities.emailDomains`) → "Verified student" badge.
4. Acceptance of Terms of Service and Privacy Policy at sign-up (checkbox, not pre-checked; version stored in `consents`).
5. Minimum age for an account: 15; for selling: 18 (confirmation). ⚖️ LEGAL

### 4.2 Home page (feed) for logged-in users
- "For your courses": recommended notes (4.5).
- Activity from communities the user belongs to (hot sort).
- "Exam period coming up" block if there are exam periods for the user's courses (linked posts and notes).
- Quick access: my courses, saved, purchased.
- Empty states that lead to action (no courses → mark courses; no communities → suggested communities for your faculty).

### 4.3 Notes: buyer
- **Course page** (`/f/etf-bg/predmet/osnovi-elektrotehnike`): notes for that course, filters (professor, price, rating, year passed, free), sorting (recommended, top rated, best selling, newest, price), plus the linked community.
- **Note page**: title, author (with seller stats), course/professor, author's achieved grade (labeled "self-reported", with a badge if the author marked the course as passed), "How I studied", preview pages (gallery with zoom, swipe on mobile), page count, last updated + changelog, reviews, price, buy button, "Save", "Report".
- **Purchase**: click → (if not logged in, sign in and return) → order review → **required checkbox** confirming the buyer requests immediately available digital content and understands the consequences for the right of withdrawal ⚖️ LEGAL → redirect to the provider's hosted payment page → return → "Processing payment" state until the webhook confirms → access.
- **Library** (`/biblioteka`): all purchased notes, new versions flagged, download, leave a review.
- **Download**: the server checks the `entitlement`, generates a watermarked PDF (buyer's name/username, partially masked email, order ID, date — in the footer of every page + a subtle diagonal mark), cached per (user, version) in R2, delivered via a presigned URL with a 60-second TTL. Logs a `download_event`. **There is no limit on the number of downloads per note per day.**
- **Refund**: the buyer can report a problem within 7 days (file doesn't match the description, corrupted, empty, plagiarism). An admin decides. A refund revokes the entitlement and creates ledger entries.
- Free notes (price 0) go through the same flow without payment (entitlement granted immediately).

### 4.4 Notes: seller
- **Become a seller**: 18+ confirmation, acceptance of Seller Terms, payout details. Status becomes `active` immediately; the first 3 notes go through manual review (pre-moderation), after that post-moderation, unless the account is flagged.
- **New note** (multi-step wizard, autosaved as draft):
  1. Course (and optionally professor) — search in the catalog.
  2. PDF upload: direct browser upload to R2 via presigned PUT, max 50 MB, `application/pdf` only (magic bytes checked on the server, not just the extension), progress bar, cancellable.
  3. Background processing (job): PDF validation, page count, text extraction, preview page rendering, SHA-256 and simhash, **duplicate check** (same hash or simhash close to an existing note from another seller → status `pending_review` + flag "possible duplicate/resale"). The UI shows processing status live (polling or SSE).
  4. Description: title, short description, "How I studied" (editor with a guide: how much time, in what order, what was on the exam, what they'd do differently), achieved grade, exam period, tags.
  5. Price: min 0, configurable max (default 3,000 RSD), suggested price based on the median for the course, clear display of "You get X RSD" after commission.
  6. Declaration (required checkbox): the author created the material or has the right to share it; it does not contain copyrighted textbooks, other people's notes, personal data, or exam problems the faculty prohibits sharing. ⚖️ LEGAL
  7. Review → Publish.
- **New version**: upload a new file + changelog; buyers are notified.
- **Seller dashboard** (`/prodaja`): sales per day (chart), revenue (pending / available / paid out), notes with conversion (views → purchases), reviews, payout requests.
- **Payouts**: money moves from `seller_pending` to `seller_available` after the hold period (default 14 days, because of refunds). Minimum payout amount (default 1,000 RSD). Request → admin approves → manual bank transfer (v1) → admin enters the reference → `paid`. Email notifications at every step.
- ⚖️ LEGAL: tax obligations of individual sellers and how the platform pays out (whether the platform withholds tax, seller contract, reporting). Implement the fields and reports (annual income statement per seller, CSV), but keep the calculation logic behind a feature flag until an accountant confirms it.

### 4.5 Recommendations (rules + scoring)
For a user, compute candidates from courses in their program and year (`enrolled` has the highest weight, then the current year's courses in the program, then the next year's). Score per note:
```
score = w1*course_relevance
      + w2*bayesian_rating      (Bayesian average, so 1 review of 5 doesn't beat 40 reviews averaging 4.7)
      + w3*log(1+sales_30d)
      + w4*freshness            (exponential decay by update date)
      + w5*same_professor       (if the user has the same professor)
      - penalty_already_owned   (exclude)
```
Weights in `src/config/recommendations.ts`. Cache per user (Redis, 15 min), invalidate when the user's courses change. Limit to max 2 notes from the same seller in the top 10 results (diversity).

### 4.6 Search
- Global search (Cmd/Ctrl+K and a field in the header): notes, courses, professors, communities, posts. Grouped results.
- Postgres: `tsvector` columns with `unaccent` + the `simple` configuration (Postgres has no built-in Serbian stemmer; do not use `english`), plus `pg_trgm` for fuzzy and prefix matching. It must work **with and without diacritics** ("cacak" = "Čačak", "dj" = "đ") and with Cyrillic if it is ever entered (normalize Cyrillic to Latin before indexing and before querying; util `lib/search/normalize.ts` with tests).
- 200 ms debounce, results as a combobox (ARIA), keyboard navigation.

### 4.7 Communities (Reddit model)
- **Automatic communities**: when a faculty or course is added to the catalog, a faculty community and a course community are created (owner = system; moderators appointed by an admin or chosen from active members).
- **User-created communities**: a verified account at least 7 days old can create a community (type: professor/exam/general), with name, description, rules, visibility. Limit: 3 communities per user.
- `faculty_only` visibility: reading and posting only for users from that faculty.
- **Posts**: text (markdown with preview), link (with an OG preview fetched on the server, with SSRF protection: http/https only, block private IP ranges, timeout, max size), note share (note card), poll. Flair, optional link to an exam period, "anonymous" option.
- **Comments**: tree, voting, "reply", editing (with an "edited" label), deletion, quoting.
- **Voting**: optimistic UI, server is the source of truth, rate limited.
- **Sorting**: Hot (Reddit's hot algorithm with log(score) and time), New, Top (day/week/month/year/all), Controversial. Comments: Best (Wilson score lower bound), New, Top.
- **Community moderation**: remove post/comment with a reason, lock, pin (max 2), ban member (temporary/permanent), reports queue, mod log visible to moderators.
- **Content rules about professors**: experiences and opinions about the course and examination style are allowed; insults, personal attacks, private life and false claims are prohibited. On a user's first post in a "professor" community, show a short reminder of the rules. ⚖️ LEGAL (defamation risk)

### 4.8 Profile
- Public profile (`/u/username`): avatar, faculty and program (user chooses what is public), badges (verified student, seller, number sold), notes, posts and comments (anonymous ones are not shown), join date.
- Settings: account, privacy (what is public), notifications, sessions (list of active sessions, sign out other devices), 2FA, linked accounts, **data export** (JSON+zip, generated by a job, link sent by email), **account deletion** (section 7.3).

### 4.9 Notifications
In-app (bell with count, notifications page) + email by preference. Types: sale, new review, reply to review, new version of a purchased note, reply to post/comment, mention (@username), payout status, moderation decision, note approved/rejected, catalog request approved. Email digest (daily/weekly) for community activity instead of individual emails. Every marketing/digest email has a one-click unsubscribe link (`List-Unsubscribe` header).

### 4.10 Admin panel (`/admin`)
- Access only for `role=admin` + mandatory 2FA + re-authentication for sensitive actions.
- Dashboard: users, GMV, platform revenue, sales per day, review queue, open reports, pending payouts.
- Catalog: CRUD for universities/faculties/programs/courses/professors, bulk CSV import, handling `catalog_requests`.
- Note review: preview, duplicate check (similar note shown side by side), approve/reject with a reason.
- Reports and `copyright_claims`: queue, actions, response templates.
- Users: search, details, ban/unban, reset 2FA, **read-only** impersonation with audit log and a clear banner.
- Money: orders, refunds, payouts (approve, mark as paid with reference), manual ledger adjustments (reason required, double confirmation), reports (CSV).
- Settings: commission (%), hold period, min payout, max price, number of preview pages, feature flags. Changes go to `audit_log`.
- The admin UI can be simpler than the public area but must use the same design system.

### 4.11 Public/marketing pages
- Landing for guests (section 6.5), "How it works" (for buyers and sellers), "Commission and payouts" (transparent: how much the platform takes and why), FAQ, contact, legal pages (section 7.4).
- Public faculty, course and note pages are indexable (SEO, section 8.3).

---

## 5. Payments

### 5.1 Model
The platform charges the buyer the full price, keeps a commission (default **20%**, configurable in admin, snapshotted per order), and credits the rest to the seller as `seller_pending`. After the hold period it moves to `seller_available`, and the seller requests a payout.

### 5.2 Adapter
```ts
interface PaymentProvider {
  id: 'mock' | string;
  createCheckout(input: {
    orderId: string; amount: number /* para */; currency: 'RSD';
    description: string; customerEmail: string;
    successUrl: string; cancelUrl: string; idempotencyKey: string;
  }): Promise<{ redirectUrl: string; providerRef: string }>;
  verifyAndParseWebhook(req: Request): Promise<PaymentEvent>; // verifies signature
  refund(input: { providerRef: string; amount: number; reason: string }): Promise<RefundResult>;
  getStatus(providerRef: string): Promise<PaymentStatus>;     // for reconciliation
}
```
- **MockProvider** for dev/test: a fake hosted page inside the app (`/dev/mock-checkout`, available only when `NODE_ENV !== 'production'`) with "Success / Failure / Cancelled" buttons that send a signed webhook. The entire e2e flow is tested with it.
- **Production provider**: a local card payment processor that works with companies registered in Serbia and supports RSD and a hosted payment page (the specific choice to be confirmed with the bank/processor; implemented as a new adapter class). ⚖️ LEGAL
- **Never** collect card data in the application; hosted page/redirect from the provider only.
- On the payment page and in the footer: card logos and notices required by the processor/bank (usually: card logos, payment data protection statement, company contact details, refund policy). Exact requirements to be confirmed with the processor. ⚖️ LEGAL

### 5.3 Flow and reliability
1. `createOrder` (transaction, idempotency key from the client) → status `pending`.
2. `createCheckout` → redirect.
3. Webhook: signature verification → idempotent (table `processed_webhook_events` keyed by event ID) → transaction: `orders.paid`, `entitlements`, ledger entries (provider_clearing −, seller_pending +, platform_revenue +; sum 0) → enqueue notifications.
4. Returning to `successUrl` does not grant access by itself; it shows "awaiting confirmation" and polls the status.
5. **Reconciliation job** every 15 min: `pending` orders older than 10 min → `getStatus` at the provider → update.
6. Funds release job: daily, moves matured amounts from `pending` to `available`.
7. ⚖️ LEGAL: e-fiscalization (Serbian eFiskalizacija) and invoicing for commission/sales. Leave an `InvoiceService` interface and a hook after successful payment, with a no-op implementation behind a feature flag.

### 5.4 Money tests (mandatory)
- Ledger: every transaction sums to 0 (property-based test with `fast-check`).
- A duplicate webhook does not create a duplicate entitlement or duplicate ledger entries.
- A refund after funds are released makes `seller_available` go negative (allowed, shown to the seller; subsequent sales cover the debt first).
- Commission rounding: defined rule (commission is rounded to whole dinars in the seller's favor), with tests for edge cases.

---

## 6. Design (binding)

> Load the `frontend-design` skill before any UI work. Goal: the app looks like it was made by people who studied here, not like a generic SaaS template.

### 6.1 Direction
**"Notebook and highlighter."** Warm, paper-like, editorial aesthetic: study notes, margins, underlines, marker. Serious but not corporate. Student-like but not childish.

- **Palette** (defined as CSS tokens, light + dark theme):
  - background: warm white/paper (not pure `#fff`); dark theme: deep graphite (not pure black), with a slight warm tone
  - text: near-black "ink"
  - **one** strong accent: highlighter color (yellow/lime for "highlighting"), used sparingly for emphasis, active states, highlights in search
  - secondary accent for links/actions: deep "ballpoint pen" blue
  - semantic colors (success/error/warning) muted, aligned with the palette
  - check WCAG AA contrast for every combination, in both themes
- **Typography**:
  - Display: a characterful serif for headings (choose according to the frontend-design skill)
  - UI/body: a readable sans with good numerals (tabular nums for prices and stats)
  - Optional mono for course codes and metadata
  - **Mandatory**: fonts must have full Latin Extended (č ć đ š ž, Č Ć Đ Š Ž) **and Cyrillic** (for future support). Test with the string "Đorđe Čačak Šabac Žabalj Ćuprija — Ђорђе Чачак". Self-host via `next/font`, `display: swap`, subset.
- **Details that give a human character** (in moderation, not all at once):
  - "highlighter" effect behind key words in headings (SVG/CSS, not an image), slightly irregular
  - note cards look like paper with a subtle shadow and fold, with the first page preview as a "cover"
  - margins and thin lines like a notebook in the "How I studied" sections
  - illustrations: simple, line-based, as if sketched with a pen; or no illustrations. Never generic 3D/blob/stock.
- **Density**: medium. Students scan, they don't read marketing. Content (notes, posts) is the star, not decoration.

### 6.2 Forbidden (signs of an "AI template")
- purple-blue gradients, glassmorphism, neon glow
- hero with a large centered heading + two buttons + a mockup on a gradient
- a row of three cards with icon, title and description as the main section
- emoji as UI icons
- empty phrases (in Serbian copy): "Revolucionišite", "Otključajte svoj potencijal", "Sve na jednom mestu", "Bez muke" (equivalents of "Revolutionize", "Unlock your potential", "All in one place", "Effortless")
- generic initial avatars in pastel circles everywhere (use them, but with the app's palette)
- excessive animations; every animation must have a purpose and respect `prefers-reduced-motion`
- lorem ipsum or invented stats ("10,000+ students") on the landing page

### 6.3 Microcopy
- Serbian, Latin script, natural student tone: informal "ti", short, concrete, never feeling translated (e.g. "Položio si? Pomozi mlađima i zaradi" rather than "Monetizujte svoj sadržaj").
- Errors say what happened and what the user should do (e.g. "Fajl je veći od 50 MB. Smanji ga ili podeli na dva dela." — "The file is larger than 50 MB. Shrink it or split it into two parts.").
- Empty states have one clear action.
- Numbers and dates in Serbian format (`1.250 RSD`, `25. okt 2026.`, relative "pre 3 sata"), via the `Intl` API.
- Correct Serbian plurals (1 skripta, 2 skripte, 5 skripti) via ICU plural rules in i18n messages.

### 6.4 Components and patterns
- Own design system in `components/ui/`: Button (variants: primary, secondary, ghost, danger; loading/disabled states), Input, Textarea, Select/Combobox (search + keyboard), Checkbox, Radio, Switch, Dialog, Sheet (mobile bottom sheet), Dropdown, Tabs, Tooltip, Toast, Badge, Avatar, Skeleton, Pagination/infinite scroll, EmptyState, Markdown renderer, PriceTag, RatingStars (accessible), NoteCard, PostCard, CommentTree, VoteControl, FileDropzone with progress.
- Build a `/dev/ui` page (non-production only) with all components and states in both themes, as an internal catalog.
- **Mobile-first**: most students use phones. Bottom navigation on mobile (Home, Search, Communities, Library, Profile), header on desktop. Touch targets min 44px.
- Skeletons match the shape of real content; no full-page spinners.
- Optimistic UI for voting, bookmarks, following.
- Dark theme: follows the system, with a manual toggle; no flash on load.

### 6.5 Guest landing page
- The first thing visible: search "Nađi skriptu za svoj predmet" ("Find notes for your course") with a faculty selector, and immediately below it **real content** (best-selling notes, active communities) once it exists; until then, a short explanation in two paths (I'm buying / I'm selling) with a concrete example like in 1.3.
- A section for sellers with honest math ("Prodaš skriptu za 800 RSD → dobijaš 640 RSD" — "Sell notes for 800 RSD → you get 640 RSD").
- No invented testimonials or numbers. A slot for real ones when they exist.

---

## 7. Security, privacy and compliance

### 7.1 Security (OWASP ASVS L2 as a guide)
- Security headers via middleware/`next.config`: strict **CSP** with a nonce, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `frame-ancestors 'none'`.
- CSRF: Server Actions have built-in origin-based protection; state-changing route handlers check the origin.
- Rate limiting (Upstash) on: sign-in, sign-up, password reset, sending email, creating posts/comments, voting, upload, search, webhook (per IP). Progressive lockout on sign-in. **Downloads are not rate limited** (they are logged in `download_events` for abuse detection).
- Markdown: rendered on the server with `rehype-sanitize` (allowlist), links with `rel="nofollow ugc noopener"`, no raw HTML.
- Upload: presigned URL bound to the user, type and max size; magic bytes check; PDFs are never served from the app's public domain; reject encrypted PDFs and PDFs with JavaScript actions (or strip them during processing).
- Files in R2 are private; every access goes through short-lived presigned URLs after an entitlement check.
- Secrets only in env; payout data encryption with a key rotation plan in `RUNBOOK.md`.
- IDOR: every query for other users' resources goes through a policy. Write integration tests that attempt to access another user's notes, account, and payout.
- Dependencies: Dependabot/Renovate, `npm audit` in CI.
- Admin: 2FA, re-auth for sensitive actions, audit log.
- Bot protection on sign-up: Cloudflare Turnstile.

### 7.2 Privacy (⚖️ Serbian Law on Personal Data Protection, aligned with GDPR principles)
- Minimization: don't collect anything you don't use. Date of birth is not needed; age confirmation is enough.
- **Cookie banner** with a real choice: necessary (always), analytics (opt-in), no marketing cookies. "Accept all" and "Reject" buttons of equal weight. Analytics does not load before consent. Change of choice in the footer ("Cookie settings").
- IP addresses are stored as salted hashes wherever possible; retention policy per table (document it in the Privacy Policy and implement a cleanup job).
- User rights: access and export (4.8), rectification, erasure, withdrawal of consent.
- List of processors (Vercel, Neon, Cloudflare, Resend, Upstash, Sentry, PostHog, payment processor) in the Privacy Policy, with processing location. ⚖️ LEGAL (data transfers outside Serbia)
- Sentry: strip PII (`sendDefaultPii: false`, scrub email/IP).

### 7.3 Account deletion
- User initiates deletion → confirmation by password/email → 14-day grace period (can cancel) → job:
  - personal data is deleted/anonymized,
  - posts and comments remain as "[obrisan korisnik]" ("[deleted user]") so threads don't break, or are deleted if the user chooses,
  - the seller's notes are taken off sale; **buyers keep access to purchased files**,
  - financial records (orders, ledger, payouts) are retained as long as the law requires for accounting, pseudonymized. ⚖️ LEGAL (retention period)
- An account with an unpaid balance cannot be deleted until the payout is settled or the user explicitly waives it.

### 7.4 Legal pages (⚖️ texts must be reviewed by a lawyer)
Create pages with structure and clearly marked placeholders, versioned (version change → user must re-accept on next sign-in). Page content is in Serbian:
- **Terms of Service** (Uslovi korišćenja)
- **Privacy Policy** (Politika privatnosti)
- **Cookie Policy** (Politika kolačića)
- **Community Guidelines** (Pravila zajednice) — conduct, professors, exam materials, spam
- **Seller Terms** (Pravila za prodavce) — originality, prohibited content, commission, payouts, refunds, taxes are the seller's responsibility unless the platform decides otherwise
- **Copyright Infringement Report** (Prijava povrede autorskih prava) — form that fills `copyright_claims`, response deadline, counter-notice
- **Refunds and Complaints** (Povraćaj i reklamacije) — for digital content
- **Service Provider Information / Imprint** (Podaci o pružaocu usluge): business name, registered address, company registration number, tax ID (PIB), contact email and phone, ⚖️ per the Serbian Law on Electronic Commerce. Data is read from `src/config/company.ts`.
- The footer on every page links to all of the above.

### 7.5 Content and academic integrity
- Prohibited: selling other people's notes, scanned textbooks, solutions to current exam problems if the faculty prohibits it, personal data, answers to graded assignments (homework, projects). This is in the Seller Terms and in the upload declaration.
- Duplicate detection (hash + simhash) and detection of resale of purchased files (the watermark allows tracing the source).
- Reports are handled within an SLA (in admin: flag reports older than 72h).

---

## 8. Quality: accessibility, performance, SEO

### 8.1 Accessibility (WCAG 2.2 AA)
- Semantic HTML, landmark regions, one `h1` per page, logical heading order.
- Everything interactive is keyboard accessible, visible focus (styled, not removed), "Skip to content" link.
- Combobox, dialog, tabs, menu follow the ARIA Authoring Practices (Radix/React Aria help).
- Forms: label for every field, errors linked via `aria-describedby`, focus on the first error after submit.
- Alt text for preview pages ("Strana 1 skripte X" — "Page 1 of notes X"), decorative images `alt=""`.
- `lang="sr-Latn"` on `<html>`.
- axe checks in Playwright tests for key pages, with no critical or serious violations.

### 8.2 Performance
- Budget: LCP < 2.5 s and INP < 200 ms on a mid-range Android phone (4G); JS per route < 170 KB gzip for public pages.
- RSC by default, `"use client"` only where needed; dynamic import for heavy parts (editor, charts, gallery).
- `next/image` for all images, preview pages in WebP/AVIF, `sizes` attribute.
- Caching: tagged fetch/`unstable_cache` or the current Next.js cache API for the catalog and public pages; ISR for public note and course pages.
- Database: covering indexes, no N+1 (check queries in the dev log), cursor pagination for feed and comments.

### 8.3 SEO
- `generateMetadata` for every page: title, description, canonical, Open Graph, Twitter.
- Dynamic OG images (`next/og`) for notes, courses, communities and posts, in the app's design (paper/marker), fonts with diacritics.
- `sitemap.xml` (segmented: faculties, courses, notes, communities) and `robots.txt`; private routes, library, admin, settings are `noindex`.
- JSON-LD: `Product` + `Offer` + `AggregateRating` for notes (only when real reviews exist), `BreadcrumbList`, `DiscussionForumPosting` for posts, `Organization` on the home page.
- Clean URLs with slugs (Serbian path segments): `/f/{faculty}/predmet/{course}`, `/skripta/{slug}`, `/z/{community}`, `/z/{community}/p/{id}-{slug}`, `/u/{username}`.
- Slugs without diacritics (č→c, ć→c, đ→dj, š→s, ž→z), stable (a title change doesn't change the URL, or issues a 301).

### 8.4 PWA
- Web manifest, icons, theme color for both themes, installable. No offline caching of paid files.

---

## 9. Internationalization
- **next-intl** (or an equivalent compatible with the current App Router).
- Default and only active language in v1: `sr-Latn`. Prepare an `en` skeleton (same keys), with no UI switcher until it's translated.
- Keys by domain (`notes.purchase.cta`, `forum.post.anonymousHint`...), ICU messages with correct Serbian plurals.
- Currency RSD, formatted via `Intl.NumberFormat('sr-Latn-RS', { style: 'currency', currency: 'RSD' })` (check the output and build a custom formatter for "1.250 RSD" if needed).
- Dates via `Intl.DateTimeFormat('sr-Latn-RS')`, time zone `Europe/Belgrade` for displaying exam periods and calculations.

---

## 10. Emails
React Email templates in the app's design (light, readable in dark-mode clients), all in Serbian: verification, magic link, password reset, welcome, purchase confirmation (with a link to the library, not a direct file), new sale, new review, new note version, note decision, payout status, moderation decision, account deletion warning, data export ready, digest. SPF/DKIM/DMARC configuration described in `RUNBOOK.md`.

---

## 11. Observability and operations
- Sentry for server and client, with release tracking and source maps.
- Structured logs (pino), no PII, with request ID.
- Health endpoint `/api/health` (database, Redis, R2).
- Inngest dashboard for jobs; retry with backoff, dead-letter notification to the admin by email.
- Alerts: payment webhook errors, failed reconciliation, review queue > X items.
- `RUNBOOK.md`: deploy, rollback, migrations (expand → migrate → contract, never destructive in a single step), database backup and restore (Neon point-in-time), secret rotation, data breach procedure. ⚖️ LEGAL (breach notification obligation)

---

## 12. Testing and CI
- **Unit**: lib utils (money, slug, search normalization, hot/Wilson algorithms, recommendations, plurals), policies.
- **Integration** (real test database, e.g. Testcontainers or a Neon branch): services for purchase, ledger, refund, payout, moderation, entitlement, IDOR tests.
- **E2E (Playwright)**, critical flows:
  1. sign-up → verification → onboarding → recommendations visible
  2. become a seller → upload → processing → publish (after admin approval)
  3. purchase with mock provider → library → watermarked download
  4. failed payment and cancellation
  5. post, comment, vote, report, moderator removal
  6. refund through admin
  7. account deletion (grace period)
  8. cookie banner: analytics doesn't load without consent
- axe checks in e2e for: landing, course, note, community, post, checkout, settings.
- **CI** (GitHub Actions): install → lint (ESLint + Prettier) → typecheck → unit/integration → build → e2e on the Vercel preview URL. A PR cannot be merged if anything fails.
- A seed script creates realistic demo content for dev and preview environments (never for production).

---

## 13. Build phases (order for Claude Code)

Each phase has acceptance criteria. Commit after each phase; update `docs/DECISIONS.md`.

**Phase 0 — Foundation**
Repo, Next.js, TS strict, Tailwind, ESLint/Prettier, `env.ts`, Drizzle + Neon, folder structure, Sentry, CI pipeline, `.env.example`, `README.md` with local setup.
✅ `npm run dev`, `lint`, `typecheck`, `test`, `build` pass; CI green.

**Phase 1 — Design system**
Load the `frontend-design` skill. Tokens (colors, typography, spacing, radius, shadows) for both themes, fonts with diacritics and Cyrillic, all components from 6.4, `/dev/ui` catalog, layout (header, mobile bottom nav, footer with legal links).
✅ `/dev/ui` shows all components in all states, both themes; axe with no critical errors; none of the patterns from 6.2.

**Phase 2 — Auth and onboarding**
Better Auth (email/password, magic link, Google, verification, reset, sessions, 2FA), Turnstile, rate limiting, catalog schema + seed, onboarding flow, `catalog_requests`, student email verification, consents.
✅ E2E flow 1 passes (without recommendations).

**Phase 3 — Catalog and public pages**
University, faculty, course, professor pages; search (4.6) with normalization tests; SEO basics, sitemap, robots.
✅ Searching "cacak", "Čačak" and "Чачак" returns the same result; Lighthouse SEO and a11y ≥ 95 on public pages.

**Phase 4 — Notes: upload and processing**
Become a seller, new note wizard, presigned upload, Inngest job (validation, preview, text, hash, simhash, duplicates), note page, versions, admin review (minimal admin for this phase).
✅ E2E flow 2 passes; an encrypted PDF and a non-PDF file are rejected with a clear message.

**Phase 5 — Payments, library, wallet**
Orders, PaymentProvider + MockProvider, webhook, reconciliation, entitlements, ledger, library, watermarked download (no daily download limit), reviews, refund, seller dashboard, payouts, funds release job.
✅ E2E flows 3, 4, 6; all tests from 5.4 pass.

**Phase 6 — Recommendations and feed**
Algorithm 4.5, cache, home page for logged-in users, empty states.
✅ A new user with ETF/year 1 sees only relevant notes; scoring tests.

**Phase 7 — Communities**
Automatic and user-created communities, posts (all types), comments (tree), voting, sorting, flair, polls, anonymity, exam periods, community moderation, link preview with SSRF protection.
✅ E2E flow 5; hot/Wilson tests; an anonymous author is not visible in the HTML or in API responses for regular users.

**Phase 8 — Notifications, profile, settings**
In-app and email notifications, preferences, digest, public profile, settings, sessions, data export, account deletion.
✅ E2E flow 7; the export contains all of the user's data and nothing belonging to others.

**Phase 9 — Complete admin panel**
Everything from 4.10, audit log, read-only impersonation, reports.
✅ Every admin action appears in the audit log; an admin without 2FA cannot get in.

**Phase 10 — Compliance and polish**
Cookie banner and consent-gated analytics, all legal pages with placeholders, Imprint from config, copyright claim flow, OG images, JSON-LD, PWA, email templates, performance budget, final a11y pass, `RUNBOOK.md`, `LEGAL_TODO.md`.
✅ E2E flow 8; all e2e tests green; Lighthouse ≥ 90 performance (mobile) and ≥ 95 for a11y, best practices, SEO on key public pages; `LEGAL_TODO.md` contains all ⚖️ items.

**Phase 11 — Pre-launch (checklist)**
- [ ] Production payment adapter implemented and tested in the processor's sandbox
- [ ] Legal texts reviewed and entered; versions updated
- [ ] Company details in `company.ts`
- [ ] Domain, email DNS (SPF/DKIM/DMARC), Resend verified
- [ ] Backup/restore test performed
- [ ] Secrets rotated, production env separated from preview
- [ ] Admin accounts with 2FA
- [ ] Real catalog seeded for the launch faculties
- [ ] `/dev/*` routes unavailable in production (tested)

---

## 14. Configuration (defaults, changeable in admin)
| Key | Default |
|---|---|
| Platform commission | 20% |
| Funds hold period | 14 days |
| Minimum payout | 1,000 RSD |
| Maximum note price | 3,000 RSD |
| Max PDF size | 50 MB |
| Preview pages | min(3, 15% of total) |
| Purchase problem report window | 7 days |
| Pre-moderation of first N notes | 3 |
| Max communities per user | 3 |
| Account age to create a community | 7 days |
| Downloads per note per day | Unlimited |
