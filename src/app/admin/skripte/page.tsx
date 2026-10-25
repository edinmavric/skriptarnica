import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatRelative } from '@/lib/format';
import { listPendingNotes } from '@/server/services/admin/note-review';

export default async function AdminNotesPage() {
  const t = await getTranslations('admin.notes');
  const pending = await listPendingNotes();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-display font-bold">{t('title')}</h1>
      {pending.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-rule text-ink-muted">
            <tr>
              <th className="py-2 pr-3 font-medium">{t('note')}</th>
              <th className="py-2 pr-3 font-medium">{t('seller')}</th>
              <th className="py-2 pr-3 font-medium">{t('flags')}</th>
              <th className="py-2 font-medium">{t('waiting')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {pending.map((note) => (
              <tr key={note.id}>
                <td className="py-3 pr-3">
                  <Link
                    href={`/admin/skripte/${note.id}`}
                    className="font-medium text-pen underline underline-offset-2"
                  >
                    {note.title}
                  </Link>
                  <div className="text-ink-muted">
                    {note.courseName}, {note.facultyShortName}
                  </div>
                </td>
                <td className="py-3 pr-3">{note.sellerName}</td>
                <td className="py-3 pr-3">
                  <div className="flex flex-wrap gap-1">
                    {note.flags.possibleDuplicate ? (
                      <Badge tone="danger">{t('duplicate')}</Badge>
                    ) : null}
                    {note.flags.preModeration ? (
                      <Badge tone="warning">{t('firstNotes')}</Badge>
                    ) : null}
                    {note.flags.sellerFlagged ? (
                      <Badge tone="danger">{t('sellerFlagged')}</Badge>
                    ) : null}
                  </div>
                </td>
                <td className="py-3">{formatRelative(note.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
