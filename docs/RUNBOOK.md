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

## Secret rotation

_Including the payout-details encryption key (key versioning), Phase 4/5._

## Email DNS (SPF/DKIM/DMARC)

_With Resend setup._

## Incidents and data breaches ⚖️

_Procedure and notification obligations; see docs/LEGAL_TODO.md #13._
