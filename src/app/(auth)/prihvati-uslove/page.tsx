import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { AcceptTermsForm } from '@/components/features/auth/accept-terms-form';
import { safeNextPath } from '@/lib/validation/auth';
import { hasCurrentConsents, requireUser } from '@/server/auth/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.acceptTerms');
  return { title: t('title') };
}

export default async function AcceptTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next);
  const user = await requireUser();
  if (await hasCurrentConsents(user.id)) redirect(next);
  const t = await getTranslations('auth.acceptTerms');
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display font-bold">{t('title')}</h1>
        <p className="mt-2 text-ink-muted">{t('intro')}</p>
      </div>
      <AcceptTermsForm next={next} />
    </div>
  );
}
