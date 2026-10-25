import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { TwoFactorForm } from '@/components/features/auth/two-factor-form';
import { safeNextPath } from '@/lib/validation/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.twoFactor');
  return { title: t('title') };
}

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next);
  const t = await getTranslations('auth.twoFactor');
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display font-bold">{t('title')}</h1>
        <p className="mt-2 text-ink-muted">{t('intro')}</p>
      </div>
      <TwoFactorForm next={next} />
    </div>
  );
}
