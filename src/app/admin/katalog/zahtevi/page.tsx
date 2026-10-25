import { getTranslations } from 'next-intl/server';

import { CatalogRequestActions } from '@/components/features/admin/catalog-request-actions';
import { formatDateTime } from '@/lib/format';
import { catalogOptions, listCatalogRequests } from '@/server/services/admin/catalog-admin';

export default async function AdminCatalogRequestsPage() {
  const t = await getTranslations('admin.requests');
  const tTypes = await getTranslations('admin.catalog.single');
  const [requests, options] = await Promise.all([listCatalogRequests('pending'), catalogOptions()]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      {requests.length === 0 ? (
        <p className="text-ink-muted">{t('none')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {requests.map((request) => {
            const payload = request.payload;
            const initial: Record<string, string> = Object.fromEntries(
              Object.entries(payload).map(([key, value]) => [key, String(value ?? '')]),
            );
            if (request.type === 'program') {
              initial.level ??= 'oas';
              initial.durationYears ??= '4';
            }
            return (
              <li
                key={request.id}
                className="flex flex-col gap-3 rounded-md border border-rule p-4"
              >
                <p>
                  <span className="font-medium">{tTypes(request.type)}:</span> {payload.name}
                  <span className="text-sm text-ink-muted">
                    {' '}
                    ({formatDateTime(request.createdAt)})
                  </span>
                </p>
                {request.note ? (
                  <p className="text-sm">{t('note', { note: request.note })}</p>
                ) : null}
                <CatalogRequestActions
                  requestId={request.id}
                  type={request.type}
                  initial={initial}
                  universities={options.universities}
                  faculties={options.faculties}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
