# Deployment guide

Step by step, from a fresh set of accounts to a live site. Work top to bottom and tick items off.
Operational procedures after launch (rollback, rotation, incidents) are in
[RUNBOOK.md](RUNBOOK.md); the launch sign-off list is [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).

**No custom domain for now.** The site runs on Vercel's free address
`https://<project>.vercel.app`, files are served from R2's `r2.dev` address, and email goes out
through a Gmail account over SMTP. Nothing needs DNS. When you buy a domain, follow
[_Moving to your own domain_](#moving-to-your-own-domain) at the end.

**Two stages.** The app refuses to start with `APP_ENV=production` while `PAYMENT_PROVIDER=mock`,
and the real payment adapter doesn't exist until a processor is chosen. So:

- **Stage A (steps 1–12): pre-launch.** Everything real except payments: `APP_ENV=preview`, mock
  checkout, and robots.txt blocks search engines. Use it to test with a few real people.
- **Stage B (steps 13–17): launch.** Once the payment adapter, legal texts and company data are in,
  switch to `APP_ENV=production`, clean the database and open the doors.

Throughout, `<project>` is the Vercel project name you choose in step 1 (e.g. `skriptarnica`), so
the app's address is `https://<project>.vercel.app`.

---

## Stage A: pre-launch

### 1. Pick the address

Decide the Vercel project name now: it becomes the address, and several services below need it.
Check that `https://<project>.vercel.app` isn't taken (open it; a 404 "deployment not found"
page means it's free). If it's taken, Vercel appends a suffix; use whatever address Vercel shows
after the first deploy and update the values that contain it.

### 2. Generate the app's own secrets

Run these once and store the output in a password manager. Never reuse dev values, and use
different values again for production later (step 14).

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -hex 32      # IP_HASH_SALT
openssl rand -hex 32      # MOCK_PAYMENT_WEBHOOK_SECRET (stage A only)
openssl rand -base64 32   # payout key → PAYOUT_ENCRYPTION_KEYS=v1:<this value>
```

### 3. Database (Neon)

1. Create a Neon project in an **EU region** (Frankfurt), Postgres 17.
2. Copy two connection strings from _Connect_:
   - **Pooled** (host contains `-pooler`), with `?sslmode=require` → this is `DATABASE_URL` in
     Vercel. The client already sets `prepare: false` for the pooler.
   - **Direct** (no `-pooler`) → use it only from your machine for migrations and scripts.
3. On a paid plan, set the history retention to at least 7 days (needed for restore).
4. From your machine, apply the schema:

   ```bash
   DATABASE_URL='<direct url>' npm run db:migrate
   ```

   It creates the `pg_trgm`, `unaccent` and `citext` extensions and every table.

### 4. File storage (Cloudflare R2)

1. Create a Cloudflare account (free) → R2 → create two buckets with an EU location hint:
   `skripta-private` and `skripta-public`.
2. **Public bucket** → Settings → _Public Development URL_ → **Enable**. Cloudflare shows an
   address like `https://pub-<id>.r2.dev`; that's `NEXT_PUBLIC_STORAGE_PUBLIC_URL`. (Cloudflare
   rate-limits `r2.dev` and recommends a custom domain for production; fine for a start, switch
   when you have a domain.)
3. **Private bucket:** keep public access off. Settings → CORS policy:

   ```json
   [
     {
       "AllowedOrigins": ["https://<project>.vercel.app"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type", "content-length"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

4. R2 → Manage API tokens → create a token with **Object Read & Write** scoped to those two
   buckets. Note the access key ID, secret, and your account ID.
5. Values:

   ```
   S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_FORCE_PATH_STYLE=false
   S3_PRIVATE_BUCKET=skripta-private
   S3_PUBLIC_BUCKET=skripta-public
   NEXT_PUBLIC_STORAGE_PUBLIC_URL=https://pub-<id>.r2.dev
   NEXT_PUBLIC_STORAGE_UPLOAD_ORIGIN=https://skripta-private.<account-id>.r2.cloudflarestorage.com
   ```

   (The upload origin is where browsers PUT files with presigned URLs; it goes into the CSP.)

### 5. Redis (Upstash)

1. Create an Upstash Redis database in an EU region (Frankfurt). The free tier is enough to start.
2. Copy the **REST** URL and token → `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
   Leave `RATE_LIMIT_MULTIPLIER=1` (anything else is refused outside development).

### 6. Bot protection (Cloudflare Turnstile)

Cloudflare → Turnstile → add a widget, hostname `<project>.vercel.app`, mode _Managed_ →
`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`. Keep `HIBP_ENABLED=true`.

### 7. Email (Gmail over SMTP)

Without your own domain, Resend can only email you, so the app sends through Gmail instead
(the `SMTP_*` variables). Google signs the mail, so it lands in inboxes reasonably well.

1. Create a **separate Gmail account** for the app (e.g. `skriptarnica.app@gmail.com`), not your
   personal one: its address is visible to every user.
2. In that account: Google Account → Security → turn on **2-Step Verification** (app passwords
   require it).
3. Go to <https://myaccount.google.com/apppasswords>, create an app password named
   "Skriptarnica". Google shows 16 characters once; copy them (spaces don't matter).
4. Values:

   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=skriptarnica.app@gmail.com
   SMTP_PASSWORD=<the app password>
   EMAIL_FROM=Skriptarnica <skriptarnica.app@gmail.com>
   ALERT_EMAIL=<your own inbox for ops alerts>
   ```

   Leave `RESEND_API_KEY` empty: the app refuses to start with both set. `EMAIL_FROM` must be
   the same Gmail address, or Gmail rewrites it.

Limits: Gmail allows roughly 500 recipients a day. Every sign-up, password reset, purchase and
digest counts. If you get close, turn digests off for now or move to Resend with a domain. If
mail doesn't arrive, admins can confirm a user's email by hand (Admin → Korisnici → _Potvrdi
email_). Tell early testers to check spam.

### 8. Background jobs (Inngest)

1. Create an Inngest account. The free tier is enough to start.
2. Manage → Keys (production environment) → `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`. Do
   **not** set `INNGEST_DEV`.
3. The app gets registered after the first deploy (step 11).

### 9. Error tracking and analytics

- **Sentry:** create a Next.js project (EU data region) → `SENTRY_DSN` and
  `NEXT_PUBLIC_SENTRY_DSN` (same DSN), plus an org auth token with `project:releases` →
  `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (source maps upload at build time).
- **PostHog:** create a project in the **EU cloud** → `NEXT_PUBLIC_POSTHOG_KEY`,
  `NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com`. Turn off session recording in the project
  settings, and sign PostHog's DPA (LEGAL_TODO).

### 10. Vercel project

1. Vercel → Add New → Project → import `edinmavric/skriptarnica`, named `<project>`. Framework:
   Next.js. Leave the build command (`next build`) and Node version (22, from
   `.nvmrc`/`engines`) as they are.
   Use a **Pro** team: Vercel's Hobby plan is for non-commercial use, and the job endpoint wants
   up to 300 s per call.
2. Settings → Functions → region **Frankfurt (fra1)**, next to the database.
3. Settings → Environment Variables → **Production** scope, add everything below. During stage A,
   `APP_ENV` is `preview` even though it's Vercel's production environment.

   | Variable                                                                      | Stage A value                  |
   | ----------------------------------------------------------------------------- | ------------------------------ |
   | `APP_ENV`                                                                     | `preview`                      |
   | `NEXT_PUBLIC_APP_URL`                                                         | `https://<project>.vercel.app` |
   | `DATABASE_URL`                                                                | Neon **pooled** URL            |
   | `LOG_LEVEL`                                                                   | `info`                         |
   | `BETTER_AUTH_SECRET`, `IP_HASH_SALT`                                          | step 2                         |
   | `PAYOUT_ENCRYPTION_KEYS` / `PAYOUT_ENCRYPTION_ACTIVE_VERSION`                 | `v1:<key>` / `v1`              |
   | `PAYMENT_PROVIDER` / `MOCK_PAYMENT_WEBHOOK_SECRET`                            | `mock` / step 2                |
   | `S3_*`, `NEXT_PUBLIC_STORAGE_*`                                               | step 4                         |
   | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RATE_LIMIT_MULTIPLIER` | step 5, `1`                    |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `HIBP_ENABLED`      | step 6, `true`                 |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`          | step 7                         |
   | `ALERT_EMAIL`                                                                 | step 7                         |
   | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`                                    | step 8                         |
   | `SENTRY_*`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_*`                 | step 9                         |

   `NEXT_PUBLIC_*` values are baked in at build time: after changing one, redeploy.
   Leave `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` out for now: publishing a Google sign-in app
   needs a domain you own for the consent screen. The Google button stays hidden without them.

4. Deploy. If a variable is missing or invalid, the build fails with the variable's name: fix
   it and redeploy. Pull-request previews get other `*.vercel.app` addresses; they fail the
   build until you give the **Preview** scope its own values (step 14), which is fine for now.

### 11. Wire up and smoke-test

The scripts below run on your machine against the Neon database: pass Neon's **direct** URL as
`DATABASE_URL` on the command line. It overrides the one in your dev `.env`; the other dev values
only satisfy env validation (`APP_ENV` stays `development`, which the catalog seed and
`admin:grant` don't care about). Your shell history keeps the URL, so clear it afterwards or
prefix the command with a space (with `HISTCONTROL=ignorespace`).

1. `https://<project>.vercel.app/api/health` → `{ "ok": true }`.
2. Inngest → Apps → **Sync new app** → `https://<project>.vercel.app/api/inngest`. All functions
   should be listed (process-note-version, reconcile-payments, release-funds, notify-\*,
   send-digests, account-housekeeping, build-data-export). Vercel's Inngest integration can do
   this automatically on each deploy instead.
3. Load the catalog (direct URL):

   ```bash
   DATABASE_URL='<direct url>' npm run db:seed -- catalog
   ```

   Do **not** run the `demo` or `all` seed against this database.

4. Sign up on the site with an address that isn't the app's Gmail. Check: the Turnstile widget
   shows, the verification email arrives (look in spam too), the link opens the site.
5. Make yourself admin and enroll 2FA:

   ```bash
   DATABASE_URL='<direct url>' npm run admin:grant -- you@example.com
   ```

   Then Podešavanja → Bezbednost → turn on 2FA; `/admin` stays closed until you do.

6. Add course lists: Admin → Katalog → _Uvoz iz CSV-a_, at least for the faculties you start
   with (the catalog has universities, faculties and programs, not courses).
7. End-to-end check by hand: upload a PDF as a seller (it gets processed within a minute;
   previews load from `pub-<id>.r2.dev`), buy it with a second account through the mock checkout,
   download it, leave a review, post in a community.
8. Sentry: trigger a test error (Sentry's docs show how) and confirm it arrives.

### 12. Monitoring

- Uptime monitor (UptimeRobot, Better Stack, or similar) on
  `https://<project>.vercel.app/api/health`, 1-minute interval, alerting to `ALERT_EMAIL`.
- Sentry alert rule for new issues and error spikes.
- Lighthouse against the live site: `npm run lighthouse -- https://<project>.vercel.app --perf`.
- Backup restore test (RUNBOOK → _Backup and restore_): restore a Neon branch to a timestamp,
  run `npm test` against it, write the date in LAUNCH_CHECKLIST.

Stage A is done: the site runs on the real stack with mock payments. Invite testers.

---

## Stage B: launch

### 13. Blockers that need people

- [ ] **Payment processor** chosen, contract signed, sandbox credentials in hand. Processors
      usually approve a merchant for a specific website, often on its own domain; ask them whether
      `*.vercel.app` is accepted, otherwise do [_Moving to your own domain_](#moving-to-your-own-domain)
      first. The adapter is written (`src/server/payments/`, next to `mock.ts`), added to
      `PAYMENT_PROVIDER` in `src/env.ts`, and buying works end to end against the sandbox. The
      processor's webhook points to `https://<address>/api/webhooks/payments/<provider>`. Required
      card logos and notices are on the payment page and in the footer.
- [ ] **Legal texts** reviewed by a lawyer (LEGAL_TODO), entered in `legal.*` in `sr-Latn.json`,
      every `[PRAVNIK: …]` marker gone, `legal.draftNotice` deleted, version bumped in
      `src/config/legal.ts`.
- [ ] **Company details**: every `PLACEHOLDER:` in `src/config/company.ts` replaced.
- [ ] Accountant has answered the tax, e-fiscalization and retention questions (LEGAL_TODO #4,
      #8, #10).

These are code changes: commit, let CI pass, merge to `main`.

### 14. Fresh production secrets

Testers in stage A had access with the stage A secrets, so rotate before launch:

1. Generate new `BETTER_AUTH_SECRET`, `IP_HASH_SALT` and a payout key (step 2 commands).
2. In Vercel, **Production** scope:
   - `APP_ENV=production`
   - `PAYMENT_PROVIDER=<processor>` plus the processor's keys and webhook secret
   - remove `MOCK_PAYMENT_WEBHOOK_SECRET`
   - the new `BETTER_AUTH_SECRET`, `IP_HASH_SALT`
   - `PAYOUT_ENCRYPTION_KEYS=v1:<new key>` (fine to replace outright while no real seller has
     saved payout details; otherwise follow RUNBOOK → _Secret rotation_)
3. If you want working Vercel previews for pull requests, give the **Preview** scope its own
   values: a separate Neon branch, separate R2 buckets, `APP_ENV=preview`, mock payments, and
   secrets that differ from production. Previews email through the dev outbox only if no
   `SMTP_*`/`RESEND_API_KEY` is set, which env validation refuses on preview, so give them SMTP
   too (another Gmail account, so previews can't use up production's daily quota).

### 15. Clean the database

Pick one:

- **Keep stage A users** (real testers): remove any test notes and orders by hand in Admin, keep
  the catalog.
- **Start empty** (cleaner): in Neon, create a new branch or reset the main branch, then
  `npm run db:migrate`, `npm run db:seed -- catalog`, re-import the course CSVs, and
  `npm run admin:grant` + 2FA again.

### 16. Deploy and preflight

1. Redeploy production in Vercel (or merge to `main`).
2. From your machine with the **production** environment loaded:

   ```bash
   npm run preflight
   ```

   Every line must be ✓: production env, real payment provider, HTTPS URL, company details,
   legal texts approved, Sentry, alert email, real analytics host, admins with 2FA, no demo
   accounts, courses in the catalog.

3. Repeat the step 11 smoke test, this time with a **real small payment** (e.g. a 100 RSD note),
   then refund it through the processor and check the order and seller balance in Admin.

### 17. Go live

- Search engines can index now (with `APP_ENV=production`, robots.txt allows the public pages).
  In Google Search Console add a _URL prefix_ property for `https://<project>.vercel.app`,
  verify it with the HTML tag method, and submit `/sitemap.xml`.
- Tick the remaining items in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).

---

## Moving to your own domain

Do this whenever you buy a domain; best before launch, because search rankings, links in sent
emails and users' sign-ins are tied to the address.

1. Buy the domain and move its DNS to Cloudflare (add the site, set the registrar's nameservers
   to Cloudflare's).
2. **Vercel** → Settings → Domains → add `<domain>` and `www.<domain>` (redirect www → apex).
   Create the records Vercel shows in Cloudflare with the proxy **off** (grey cloud). Then add a
   redirect from `<project>.vercel.app` to `<domain>` (Domains → edit → redirect), so old links
   keep working.
3. **R2:** public bucket → Settings → Custom domain → `cdn.<domain>`, then disable the `r2.dev`
   URL. Private bucket CORS → add `https://<domain>` to `AllowedOrigins`.
4. **Turnstile:** add `<domain>` to the widget's hostnames.
5. **Email → Resend:** add the domain in Resend, create its SPF, DKIM and bounce records in
   Cloudflare (proxy off), add DMARC `TXT _dmarc.<domain>` =
   `v=DMARC1; p=none; rua=mailto:dmarc@<domain>`, wait for "verified", create an API key. In
   Vercel set `RESEND_API_KEY` and `EMAIL_FROM=Skriptarnica <noreply@<domain>>`, and **delete**
   the `SMTP_*` variables (both at once is refused). RUNBOOK → _Email DNS_ has the details,
   including when to tighten DMARC.
6. **Vercel env:** `NEXT_PUBLIC_APP_URL=https://<domain>`,
   `NEXT_PUBLIC_STORAGE_PUBLIC_URL=https://cdn.<domain>`, then redeploy (these are baked in at
   build time). Everyone has to sign in again once, because sessions belong to the old address.
7. **Inngest:** sync the app again at `https://<domain>/api/inngest` and remove the old URL.
8. **Uptime monitor, Search Console, payment processor webhook:** point them at the new address.
9. Optional: Google sign-in (Google Cloud Console → OAuth consent screen with the domain's
   privacy and terms URLs → OAuth client, redirect URI
   `https://<domain>/api/auth/callback/google` → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

---

## Every release after launch

Releases with a new file in `drizzle/` need the migration on Neon (same as step 3). For example
0010 adds indexes the app relies on for speed:

```bash
DATABASE_URL='<direct url>' npm run db:migrate
```

1. Open a PR; CI must be green.
2. If the PR has a migration: run `npm run db:migrate` against production (direct URL)
   **before** merging. Migrations are additive, so the old code keeps working.
3. If the PR needs new variables: add them in Vercel first.
4. Merge → Vercel deploys → check `/api/health`, the Inngest sync and Sentry.
5. Something wrong: Vercel → Deployments → previous one → **Promote** (RUNBOOK → _Rollback_).
