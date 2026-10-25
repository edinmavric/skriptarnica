import { getTranslations } from 'next-intl/server';

import { stopImpersonationAction } from '@/server/actions/admin-panel';

/** Unmissable while an admin views the site as a user (read-only, SPEC §4.10). */
export async function ImpersonationBanner({ name }: { name: string }) {
  const t = await getTranslations('layout.impersonation');
  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-marker px-4 py-2 text-sm font-medium text-marker-ink"
    >
      <span>{t('text', { name })}</span>
      <form action={stopImpersonationAction}>
        <button
          type="submit"
          className="min-h-9 rounded-md border border-marker-ink px-3 underline-offset-2 hover:underline"
        >
          {t('stop')}
        </button>
      </form>
    </div>
  );
}
