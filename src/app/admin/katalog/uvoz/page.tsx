import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { CatalogImport } from '@/components/features/admin/catalog-import';
import { CSV_COLUMNS } from '@/server/services/admin/catalog-admin';

export default async function AdminCatalogImportPage() {
  const t = await getTranslations('admin.import');
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/katalog" className="text-sm text-pen underline underline-offset-2">
          {t('back')}
        </Link>
        <h1 className="text-display font-bold">{t('title')}</h1>
      </div>
      <div className="max-w-prose text-sm text-ink-muted">
        <p>{t('intro')}</p>
        <p className="mt-2">
          {t('columns')} <code className="font-mono text-ink">{CSV_COLUMNS.join(';')}</code>
        </p>
      </div>
      <CatalogImport />
    </div>
  );
}
