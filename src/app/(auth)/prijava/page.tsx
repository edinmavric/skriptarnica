import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { SignInForm } from '@/components/features/auth/sign-in-form';
import { routes } from '@/config/routes';
import { env } from '@/env';
import { safeNextPath } from '@/lib/validation/auth';
import { getCurrentUser } from '@/server/auth/session';
import { getNonce } from '@/server/nonce';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signIn');
  return { title: t('title') };
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  const t = await getTranslations('auth.signIn');
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display font-bold">{t('title')}</h1>
        <p className="mt-2 text-ink-muted">{t('intro')}</p>
      </div>
      <SignInForm
        next={next}
        googleEnabled={Boolean(env.GOOGLE_CLIENT_ID)}
        siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        nonce={await getNonce()}
      />
      <p className="text-ink-muted">
        {t('noAccount')}{' '}
        <Link href={routes.signUp} className="text-pen underline underline-offset-4">
          {t('signUpLink')}
        </Link>
      </p>
    </div>
  );
}
