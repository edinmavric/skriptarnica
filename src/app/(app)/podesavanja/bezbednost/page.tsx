import { and, desc, eq, gt } from 'drizzle-orm';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PasswordForm } from '@/components/features/settings/password-form';
import {
  GoogleLinkButton,
  RevokeOthersButton,
  RevokeSessionButton,
} from '@/components/features/settings/session-controls';
import { TwoFactorSettings } from '@/components/features/settings/two-factor-settings';
import { Badge } from '@/components/ui/badge';
import { env } from '@/env';
import { formatDateTime } from '@/lib/format';
import { describeUserAgent } from '@/lib/user-agent';
import { requireAppUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { accounts, sessions } from '@/server/db/schema';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.security');
  return { title: t('title') };
}

export default async function SecuritySettingsPage() {
  const user = await requireAppUser();
  const t = await getTranslations('settings.security');
  const tPassword = await getTranslations('settings.password');
  const tSessions = await getTranslations('settings.sessions');
  const tLinked = await getTranslations('settings.linked');
  const [linked, active] = await Promise.all([
    db
      .select({ providerId: accounts.providerId })
      .from(accounts)
      .where(eq(accounts.userId, user.id)),
    db
      .select({
        id: sessions.id,
        userAgent: sessions.userAgent,
        createdAt: sessions.createdAt,
        updatedAt: sessions.updatedAt,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.updatedAt)),
  ]);
  const hasPassword = linked.some((row) => row.providerId === 'credential');
  const hasGoogle = linked.some((row) => row.providerId === 'google');
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-display font-bold">{t('title')}</h1>

      {hasPassword ? (
        <section aria-labelledby="password-heading" className="flex flex-col gap-3">
          <h2 id="password-heading" className="text-display-sm font-semibold">
            {tPassword('title')}
          </h2>
          <p className="max-w-prose text-ink-muted">{tPassword('intro')}</p>
          <PasswordForm />
        </section>
      ) : null}

      <section aria-labelledby="twofa-heading" className="flex flex-col gap-3">
        <h2 id="twofa-heading" className="text-display-sm font-semibold">
          {t('twoFactor')}
        </h2>
        <p className="max-w-prose text-ink-muted">{t('twoFactorIntro')}</p>
        <TwoFactorSettings
          enabled={user.twoFactorEnabled}
          isAdmin={user.role === 'admin'}
          hasPassword={hasPassword}
        />
      </section>

      <section aria-labelledby="sessions-heading" className="flex flex-col gap-3">
        <h2 id="sessions-heading" className="text-display-sm font-semibold">
          {tSessions('title')}
        </h2>
        <ul className="divide-y divide-rule border-y border-rule">
          {active.map((session) => {
            const { browser, os } = describeUserAgent(session.userAgent);
            const label =
              browser && os
                ? tSessions('device', { browser, os })
                : (browser ?? os ?? tSessions('unknownDevice'));
            const current = session.id === user.sessionId;
            return (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    {label} {current ? <Badge tone="success">{tSessions('current')}</Badge> : null}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {tSessions('lastActive', { date: formatDateTime(session.updatedAt) })},{' '}
                    {tSessions('since', { date: formatDateTime(session.createdAt) })}
                  </p>
                </div>
                {current ? null : <RevokeSessionButton sessionId={session.id} label={label} />}
              </li>
            );
          })}
        </ul>
        {active.length > 1 ? <RevokeOthersButton /> : null}
      </section>

      <section aria-labelledby="linked-heading" className="flex flex-col gap-3">
        <h2 id="linked-heading" className="text-display-sm font-semibold">
          {tLinked('title')}
        </h2>
        <ul className="divide-y divide-rule border-y border-rule">
          <li className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span>{tLinked('password')}</span>
            <Badge tone={hasPassword ? 'success' : 'outline'}>
              {hasPassword ? tLinked('on') : tLinked('off')}
            </Badge>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span>{tLinked('magicLink')}</span>
            <Badge tone="success">{tLinked('on')}</Badge>
          </li>
          {googleEnabled || hasGoogle ? (
            <li className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>Google</span>
              {googleEnabled ? (
                <GoogleLinkButton linked={hasGoogle} />
              ) : (
                <Badge tone="success">{tLinked('on')}</Badge>
              )}
            </li>
          ) : null}
        </ul>
        {!hasPassword ? (
          <p className="max-w-prose text-sm text-ink-muted">{tLinked('setPassword')}</p>
        ) : null}
      </section>
    </div>
  );
}
