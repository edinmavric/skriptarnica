import 'dotenv/config';

import { and, eq, inArray, like } from 'drizzle-orm';

import { companyIsPlaceholder } from '@/config/company';
import { env } from '@/env';
import { db } from '@/server/db/client';
import { courses, users } from '@/server/db/schema';
import messages from '@/i18n/messages/sr-Latn.json';

/**
 * Pre-launch checks that code can verify (SPEC Phase 11; see docs/LAUNCH_CHECKLIST.md). Run with
 * the production environment: `npm run preflight`. Exits 1 if anything blocks launch.
 */
type Check = { item: string; ok: boolean; detail: string };

async function main() {
  const checks: Check[] = [];
  const add = (item: string, ok: boolean, detail: string) => checks.push({ item, ok, detail });

  add('APP_ENV is production', env.APP_ENV === 'production', `APP_ENV=${env.APP_ENV}`);
  add(
    'real payment provider',
    env.PAYMENT_PROVIDER !== 'mock',
    `PAYMENT_PROVIDER=${env.PAYMENT_PROVIDER}`,
  );
  add('HTTPS app URL', env.NEXT_PUBLIC_APP_URL.startsWith('https://'), env.NEXT_PUBLIC_APP_URL);
  add('company details filled in', !companyIsPlaceholder, 'src/config/company.ts');
  const legal = messages.legal as { draftNotice?: string };
  add(
    'legal texts approved (draft notice removed)',
    !legal.draftNotice,
    'messages legal.draftNotice',
  );
  add(
    'no open [PRAVNIK] markers',
    !JSON.stringify(messages.legal).includes('[PRAVNIK'),
    'messages legal.*',
  );
  add('Sentry configured', Boolean(env.NEXT_PUBLIC_SENTRY_DSN), 'NEXT_PUBLIC_SENTRY_DSN');
  add('ops alerts configured', Boolean(env.ALERT_EMAIL), 'ALERT_EMAIL');
  add(
    'real analytics host',
    !(env.NEXT_PUBLIC_POSTHOG_HOST ?? '').includes('/api/dev/'),
    `NEXT_PUBLIC_POSTHOG_HOST=${env.NEXT_PUBLIC_POSTHOG_HOST ?? ''}`,
  );

  const admins = await db
    .select({ email: users.email, twoFactor: users.twoFactorEnabled })
    .from(users)
    .where(eq(users.role, 'admin'));
  add('at least one admin', admins.length > 0, `${admins.length} admin(s)`);
  const without2fa = admins.filter((admin) => !admin.twoFactor);
  add(
    'every admin has 2FA',
    without2fa.length === 0,
    without2fa.length === 0
      ? 'all enrolled'
      : `${without2fa.length} without 2FA, e.g. ${without2fa
          .slice(0, 5)
          .map((a) => a.email)
          .join(', ')}`,
  );
  const demo = await db
    .select({ email: users.email })
    .from(users)
    .where(and(like(users.email, '%.demo@example.com'), inArray(users.role, ['student', 'admin'])));
  add('no demo accounts', demo.length === 0, `${demo.length} demo account(s)`);
  const [courseCount] = await db.$count(courses).then((n) => [n]);
  add('catalog seeded', (courseCount ?? 0) > 0, `${courseCount ?? 0} course(s)`);

  for (const check of checks)
    console.log(`${check.ok ? '✓' : '✗'} ${check.item}  (${check.detail})`);
  const failed = checks.filter((check) => !check.ok).length;
  console.log(
    failed
      ? `\n${failed} blocking item(s).`
      : '\nAll automated checks pass. Finish the manual items in docs/LAUNCH_CHECKLIST.md.',
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
