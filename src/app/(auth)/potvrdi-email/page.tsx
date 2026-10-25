import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ResendVerification } from '@/components/features/auth/resend-verification';
import { getCurrentUser } from '@/server/auth/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.verifyPending');
  return { title: t('title') };
}

export default async function VerifyEmailPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const user = await getCurrentUser();
  const t = await getTranslations('auth.verifyPending');
  const address = user?.email ?? email ?? '';
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-display font-bold">{t('title')}</h1>
      <p className="text-lg">
        {t.rich('body', { email: address, strong: (chunks) => <strong>{chunks}</strong> })}
      </p>
      <p className="text-ink-muted">{t('spam')}</p>
      {user && !user.emailVerified ? <ResendVerification /> : null}
    </div>
  );
}
