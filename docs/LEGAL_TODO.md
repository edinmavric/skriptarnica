# Legal / accounting review list

Every ⚖️ item from SPEC.md. Each one is implemented technically as specified, but must be reviewed by a lawyer or accountant before launch. UI copy states nothing legal that hasn't been confirmed.

| #   | SPEC   | Item                                                                                                                           | Question for review                                                                                                  | Status |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | §4.1.5 | Minimum age: 15 for an account, 18 for selling (self-confirmation)                                                             | Are the age thresholds and self-confirmation sufficient under Serbian law for minors' contracts and data processing? | open   |
| 2   | §4.3   | Purchase checkbox: buyer requests immediately available digital content and acknowledges the effect on the right of withdrawal | Exact wording under the Serbian Consumer Protection Law                                                              | open   |
| 3   | §4.4.6 | Seller upload declaration (own work, no copyrighted textbooks, no personal data, no prohibited exam material)                  | Wording, and liability split between seller and platform                                                             | open   |
| 4   | §4.4   | Seller taxes: whether the platform withholds tax, seller contract, reporting. Calculation behind a feature flag                | Tax treatment of individual sellers' income and the platform's obligations                                           | open   |
| 5   | §4.7   | Content rules about professors (defamation risk); reminder on first post in a professor community                              | Rules wording; notice-and-takedown process                                                                           | open   |
| 6   | §5.2   | Production payment processor (local, RSD, hosted page)                                                                         | Contract with the bank/processor                                                                                     | open   |
| 7   | §5.2   | Card logos and required notices on the payment page and in the footer                                                          | Exact processor/bank requirements                                                                                    | open   |
| 8   | §5.3.7 | E-fiscalization (eFiskalizacija) and invoicing for commission/sales; `InvoiceService` no-op behind a flag                      | Is the platform obliged to fiscalize, and for which amounts (full sale vs commission)?                               | open   |
| 9   | §7.2   | Personal Data Protection Law (ZZPL) compliance; processor list; data transfers outside Serbia                                  | Transfer mechanisms for Vercel, Neon, Cloudflare, Resend, Upstash, Sentry, PostHog, payment processor                | open   |
| 10  | §7.3   | Retention period for pseudonymized financial records after account deletion                                                    | Statutory accounting retention period                                                                                | open   |
| 11  | §7.4   | All legal page texts (Terms, Privacy, Cookies, Community Guidelines, Seller Terms, Copyright report, Refunds)                  | Full text drafting and review                                                                                        | open   |
| 12  | §7.4   | Service provider information / imprint per the Law on Electronic Commerce (`src/config/company.ts`)                            | Required fields and company details                                                                                  | open   |
| 13  | §11    | Data breach procedure in RUNBOOK.md                                                                                            | Notification obligations and deadlines (Commissioner, affected users)                                                | open   |

## Added in Phase 8

- ⚖️ **Retention of pseudonymized financial records after account deletion** (orders, ledger, payouts, consents): how long the law requires us to keep them (accounting law), to be stated in the Privacy Policy. Code keeps them indefinitely until this is decided.
- ⚖️ **Balance waiver on account deletion:** whether a seller may waive an unpaid balance, and what happens to the waived amount for accounting. The UI asks for an explicit waiver and the audit log records the amount.
- ⚖️ **Data export scope** (right of access): confirm that excluding the 2FA secret, password hash and full payout account number is acceptable. They're excluded for security; the payout account appears as its last 4 digits.

## Added in Phases 9–10

- ⚖️ **Legal page drafts** (`src/i18n/messages/sr-Latn.json` → `legal.*`): every `[PRAVNIK: …]` marker is an open question. Live values (commission, hold period, deadlines, company data) are filled in from settings and `src/config/company.ts`, so they can't drift from the code. Each page shows a "draft" notice until the texts are approved; remove the notice (`legal.draftNotice`) when they are, and bump the versions in `src/config/legal.ts` so users re-accept.
- ⚖️ **Imprint** (`src/config/company.ts`): every `PLACEHOLDER:` value must be replaced. The page warns while any placeholder is left.
- ⚖️ **Copyright notice-and-takedown** (Law on Electronic Commerce, intermediary liability): response deadline (now 7 days, `company.copyrightResponseDays`), what happens to buyers who already bought a removed note (they keep access now), counter-notice handling, and how long claims are kept.
- ⚖️ **Cookie consent:** the banner design (equal-weight "Prihvati sve" and "Odbij", nothing pre-ticked), the cookie list in the Cookie Policy, and recording anonymous visitors' choices under a random ID in a necessary cookie (`skr_anon`).
- ⚖️ **Analytics (PostHog EU):** data processing agreement; pageviews only, no session recording; loaded only after consent.
- ⚖️ **Admin impersonation:** read-only "view as user" sessions are audited; confirm this is acceptable under the Privacy Policy and mention it there.
- ⚖️ **Report SLA:** reports are flagged after 72 hours (SPEC §7.5); confirm whether a legal deadline applies to illegal-content notices.
