import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { ResetPasswordForm } from '@/components/features/auth/password-reset-forms';
import { FormAlert } from '@/components/forms/form-alert';
import { routes } from '@/config/routes';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.reset');
  return { title: t('title') };
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  const t = await getTranslations('auth.reset');
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      {token && !error ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="flex flex-col gap-4">
          <FormAlert message={t('invalidLink')} />
          <Link href={routes.forgotPassword} className="text-pen hover:underline">
            {t('requestNew')}
          </Link>
        </div>
      )}
    </div>
  );
}
