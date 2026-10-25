import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { listPendingNotes } from '@/server/services/admin/note-review';

export default async function AdminDashboardPage() {
  const t = await getTranslations('admin.dashboard');
  const pending = await listPendingNotes();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-rule p-4">
          <dt className="text-sm text-ink-muted">{t('reviewQueue')}</dt>
          <dd className="tabular mt-1 text-2xl font-semibold">
            <Link href="/admin/skripte" className="hover:underline">
              {pending.length}
            </Link>
          </dd>
        </div>
      </dl>
    </div>
  );
}
