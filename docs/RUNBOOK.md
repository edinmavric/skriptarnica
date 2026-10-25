# Runbook

Operational procedures (SPEC §11). Commands assume the repository root.

## Local development

See README.md.

## Deploy

- **Preview:** every pull request deploys to Vercel with its own Neon branch (`APP_ENV=preview`, demo seed allowed, `noindex`). CI runs lint, format, typecheck, unit and integration tests, build and e2e; a red pipeline blocks the merge.
- **Production:** merging to `main` deploys to Vercel production (`APP_ENV=production`). Before merging:
  1. Migrations in the PR are additive (see _Database migrations_); run them against production with `npm run db:migrate` (with the production `DATABASE_URL`) **before** the code that needs them goes live.
  2. Environment variables for new features exist in Vercel (production and preview). `src/env.ts` fails the build on a missing or invalid variable, so a mistake shows up as a failed deploy, not a broken site.
  3. After the deploy: `/api/health` returns `{ ok: true }`, the Inngest dashboard shows the app synced (functions listed), and Sentry has no new error spike.
- **Inngest:** the production app URL `https://<domain>/api/inngest` is registered in Inngest Cloud; `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` come from there.

## Rollback

1. In Vercel, **Promote** the previous production deployment (instant; no rebuild).
2. Database: because migrations are expand-only until the contract step, the previous code works with the newer schema. Never roll back a migration by hand in production. If data was damaged, use _Backup and restore_.
3. Background jobs: Inngest re-syncs with the promoted deployment automatically. Replay failed runs from the dashboard once the cause is fixed (handlers are idempotent).
4. Note the incident (what, when, impact) in the team log; if personal data was affected, follow _Incidents and data breaches_.

## Database migrations

- Migrations live in `drizzle/` and are applied with `npm run db:migrate`. Never use `drizzle-kit push` against shared databases.
- Use expand → migrate → contract. Never make a destructive change in a single step.

## Backup and restore

- **Database:** Neon keeps point-in-time history (set the retention window on the paid plan, at least 7 days). To restore:
  1. In Neon, create a branch from the main branch **at a timestamp** just before the incident.
  2. Check the data on that branch (`DATABASE_URL` of the branch + `npm run db:studio` locally).
  3. Either point production at the restored branch (swap `DATABASE_URL` in Vercel and redeploy) or copy only the damaged rows back.
  4. The ledger and audit log are append-only; restoring rows there means re-inserting them, never updating.
- **Files (R2):** note files and previews are written once under unique keys; enable R2 bucket versioning/lifecycle so overwritten or deleted objects can be recovered. Watermarked copies and data exports are caches and can be regenerated.
- **Restore test:** before launch and then every quarter, restore yesterday's state into a branch and run the integration tests against it (Phase 11 checklist).

## Background jobs (Inngest)

All functions are served at `/api/inngest` (`src/server/jobs/functions`). Every handler is idempotent, so replaying a failed run from the Inngest dashboard is safe.

| Function               | Trigger                         | What it does                                                                                                                         |
| ---------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `process-note-version` | `note/version.uploaded`         | PDF analysis, previews, duplicate check, publish or send to review                                                                   |
| `reconcile-payments`   | every 15 min                    | Asks the provider about orders pending too long                                                                                      |
| `release-funds`        | daily 03:00                     | Moves matured sales from pending to available                                                                                        |
| `notify-*`             | domain events                   | In-app notifications plus email by preference; purchase confirmation                                                                 |
| `build-data-export`    | `user/export.requested`         | Zip in the private bucket, email with the link                                                                                       |
| `send-digests`         | daily 07:00 (weekly on Mondays) | Community activity digest                                                                                                            |
| `account-housekeeping` | daily 03:30                     | Runs deletions whose 14-day grace has ended; expires exports; retention cleanup (sessions, tokens, old notifications, old IP hashes) |

Times are Europe/Belgrade. If `account-housekeeping` fails for one user, the others still run; the failure is logged with the user ID and the job retries the next day.

## Secret rotation

General rule: add the new secret in Vercel (production and preview), redeploy, verify, then remove the old one. Write each rotation in the audit log or team log.

- **`BETTER_AUTH_SECRET`:** rotating signs everyone out. It also derives the unsubscribe and deletion-confirmation link keys (HKDF), so unsubscribe links in emails already sent and pending deletion links stop working (users can still unsubscribe in settings).
- **Payout details key (`PAYOUT_ENCRYPTION_KEYS`, key versioning):**
  1. Generate a key: `openssl rand -base64 32`.
  2. Append it as the next version: `PAYOUT_ENCRYPTION_KEYS=v1:<old>,v2:<new>` and set `PAYOUT_ENCRYPTION_ACTIVE_VERSION=v2`. Deploy. New details are written with v2; old ones still decrypt with v1.
  3. Run `npm run payout-keys:rotate` against production (prints how many sellers were re-encrypted; idempotent; audited).
  4. When a second run reports 0 re-encrypted, remove `v1` from the ring and deploy.
- **`IP_HASH_SALT`:** rotating makes old IP hashes incomparable with new ones (abuse correlation resets); no data needs migrating.
- **Third-party keys** (Resend, Upstash, R2, Turnstile, payment processor, Sentry, PostHog): create the new key in the provider, update Vercel, redeploy, revoke the old key.
- **Admins:** grant with `npm run admin:grant -- <email>` (audited); the account must enable 2FA before `/admin` opens. Remove admin rights by setting the role back to `student` (audit it).

## Email DNS (SPF/DKIM/DMARC)

Email goes through Resend from `EMAIL_FROM` on our domain.

1. In Resend, add the sending domain (e.g. `mail.<domain>` or the apex) and create the DNS records it shows:
   - **SPF:** `TXT` on the sending domain including Resend's SPF (`include:` value from the Resend dashboard). Keep a single SPF record per name.
   - **DKIM:** the `CNAME`/`TXT` records Resend generates (`resend._domainkey`).
   - **Return-path/MX** record for bounces, if Resend shows one.
2. **DMARC:** `TXT` at `_dmarc.<domain>`: start with `v=DMARC1; p=none; rua=mailto:dmarc@<domain>`; after two weeks of clean reports move to `p=quarantine`, then `p=reject`.
3. Verify the domain in Resend; send a test (sign-up verification) to Gmail and Outlook and check "SPF/DKIM/DMARC: PASS" in the headers.
4. Digest and notification emails carry `List-Unsubscribe` and `List-Unsubscribe-Post` (one-click, RFC 8058); keep this when changing templates (required by Gmail/Yahoo bulk-sender rules).

## Incidents and data breaches ⚖️

⚖️ Deadlines and wording must be confirmed by a lawyer (LEGAL_TODO #13). Working procedure:

1. **Contain:** revoke leaked keys (see _Secret rotation_), block abusive accounts (admin → Korisnici → Blokiraj), take affected features offline if needed (Vercel rollback).
2. **Assess** within hours: which data (accounts, emails, payout details, files), how many users, since when. Sources: Sentry, Vercel logs, `audit_log`, database queries. Payout details are encrypted at the application level; a database-only leak doesn't expose them unless the key leaked too.
3. **Notify the Commissioner** (Poverenik za informacije od javnog značaja i zaštitu podataka o ličnosti) when the breach is likely to put people's rights at risk, without undue delay, per the Law on Personal Data Protection (the GDPR benchmark is 72 hours). ⚖️
4. **Notify affected users** when the risk is high: plain language, what happened, what we did, what they should do (change password, watch for phishing).
5. **Record** every breach (even unreported ones) with facts, impact and remedial actions, and keep the record.
6. **Follow up:** post-mortem, fix, and a test or check so it can't recur.

## Monitoring and alerts

- **Errors:** Sentry (server always; browser after page load, without personal data; `beforeSend` scrubs email and IP).
- **Ops alerts:** `alertOps()` sends to `ALERT_EMAIL` for dead jobs, webhook failures and queue backlogs.
- **Health:** `/api/health` checks the database. Point an uptime monitor at it (1-minute interval).
- **Jobs:** the Inngest dashboard shows failed runs; replay after fixing (handlers are idempotent).
- **Quality gates:** `npm run lighthouse -- http://localhost:3000 --perf` (median of 3 runs per page; performance ≥ 0.9, others ≥ 0.95) against a production build before a release with UI changes.
