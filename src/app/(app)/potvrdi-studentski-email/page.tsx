import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { FormAlert } from '@/components/forms/form-alert';

import { ConfirmStudentEmail } from './confirm-button';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding.verify');
  return { title: t('confirmTitle') };
}

export default async function ConfirmStudentEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const t = await getTranslations('onboarding.verify');
  return (
    <div className="flex max-w-md flex-col gap-4">
      <h1 className="text-display font-bold">{t('confirmTitle')}</h1>
      {token ? <ConfirmStudentEmail token={token} /> : <FormAlert message={t('missingToken')} />}
    </div>
  );
}
