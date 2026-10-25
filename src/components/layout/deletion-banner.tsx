import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { routes } from '@/config/routes';
import { formatDate } from '@/lib/format';

/** Shown on every page while an account deletion is scheduled (SPEC §7.3 grace period). */
export async function DeletionBanner({ scheduledFor }: { scheduledFor: string | null }) {
  if (!scheduledFor) return null;
  const t = await getTranslations('settings.data.banner');
  return (
    <div role="status" className="bg-danger-soft px-4 py-2 text-center text-sm">
      {t('text', { date: formatDate(scheduledFor) })}{' '}
      <Link href={`${routes.settings}/podaci`} className="font-medium underline underline-offset-2">
        {t('cancel')}
      </Link>
    </div>
  );
}
