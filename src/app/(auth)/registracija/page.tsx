import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { SignUpForm } from '@/components/features/auth/sign-up-form';
import { routes } from '@/config/routes';
import { env } from '@/env';
import { getCurrentUser } from '@/server/auth/session';
import { getNonce } from '@/server/nonce';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signUp');
  return { title: t('title') };
}

export default async function SignUpPage() {
  if (await getCurrentUser()) redirect(routes.home);
  const t = await getTranslations('auth.signUp');
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display font-bold">{t('title')}</h1>
        <p className="mt-2 text-ink-muted">{t('intro')}</p>
      </div>
      <SignUpForm siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} nonce={await getNonce()} />
      <p className="text-ink-muted">
        {t('haveAccount')}{' '}
        <Link href={routes.signIn} className="text-pen underline underline-offset-4">
          {t('signInLink')}
        </Link>
      </p>
    </div>
  );
}
