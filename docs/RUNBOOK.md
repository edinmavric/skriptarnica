# Runbook

Operational procedures (SPEC §11). Sections are filled in as the corresponding infrastructure is introduced.

## Local development

See README.md.

## Deploy

_Phase 2+: Vercel production deploy from `main`, preview deploy per PR with a Neon branch._

## Rollback

_To be written with the first production deploy._

## Database migrations

- Migrations live in `drizzle/` and are applied with `npm run db:migrate`. Never use `drizzle-kit push` against shared databases.
- Use expand → migrate → contract. Never make a destructive change in a single step.

## Backup and restore

_Neon point-in-time restore; procedure and a restore test before launch (Phase 11)._

## Background jobs (Inngest)

All functions are served at `/api/inngest` (`src/server/jobs/functions`). Every handler is idempotent, so replaying a failed run from the Inngest dashboard is safe.

| Function               | Trigger                         | What it does                                                         |
| ---------------------- | ------------------------------- | -------------------------------------------------------------------- |
| `process-note-version` | `note/version.uploaded`         | PDF analysis, previews, duplicate check, publish or send to review   |
| `reconcile-payments`   | every 15 min                    | Asks the provider about orders pending too long                      |
| `release-funds`        | daily 03:00                     | Moves matured sales from pending to available                        |
| `notify-*`             | domain events                   | In-app notifications plus email by preference; purchase confirmation |
| `build-data-export`    | `user/export.requested`         | Zip in the private bucket, email with the link                       |
| `send-digests`         | daily 07:00 (weekly on Mondays) | Community activity digest                                            |
| `account-housekeeping` | daily 03:30                     | Runs deletions whose 14-day grace has ended; expires exports         |

Times are Europe/Belgrade. If `account-housekeeping` fails for one user, the others still run; the failure is logged with the user ID and the job retries the next day.

## Secret rotation

`BETTER_AUTH_SECRET` also derives the unsubscribe and deletion-confirmation link keys (HKDF). Rotating it invalidates sessions, unsubscribe links in emails already sent, and pending deletion links.

_Including the payout-details encryption key (key versioning), Phase 4/5._

## Email DNS (SPF/DKIM/DMARC)

_With Resend setup._

## Incidents and data breaches ⚖️

_Procedure and notification obligations; see docs/LEGAL_TODO.md #13._
