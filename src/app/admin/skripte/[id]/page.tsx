import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { NoteDecision } from '@/components/features/admin/note-decision';
import { Badge } from '@/components/ui/badge';
import { Markdown } from '@/components/ui/markdown';
import { PriceTag } from '@/components/ui/price-tag';
import { getReviewNote } from '@/server/services/admin/note-review';

type Loaded = NonNullable<Awaited<ReturnType<typeof getReviewNote>>>['subject'];

async function NoteColumn({ data, heading }: { data: Loaded; heading: string }) {
  const t = await getTranslations('admin.review');
  const tStatus = await getTranslations('seller.dashboard.status');
  return (
    <section aria-label={heading} className="flex min-w-0 flex-col gap-3">
      <h2 className="text-display-sm font-semibold">{heading}</h2>
      <p className="font-medium">{data.note.title}</p>
      <p className="text-sm text-ink-muted">
        {data.courseName}, {t('by', { name: data.seller.name })}, {tStatus(data.note.status)}
      </p>
      <p className="text-sm">
        <PriceTag para={data.note.pricePara} size="sm" />,{' '}
        {t('pages', { count: data.latest?.pageCount ?? 0 })}
      </p>
      {data.latest?.sha256 ? (
        <p className="font-mono text-xs break-all text-ink-muted">sha256 {data.latest.sha256}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {data.previews.map((preview) => (
          <Image
            key={preview.pageNumber}
            src={preview.url}
            alt={t('pageAlt', { page: preview.pageNumber })}
            width={preview.width}
            height={preview.height}
            className="h-auto w-full rounded-sm border border-rule"
            sizes="300px"
          />
        ))}
      </div>
      <details>
        <summary className="cursor-pointer text-sm">{t('howIStudied')}</summary>
        <Markdown source={data.note.howIStudied} className="mt-2 text-sm" />
      </details>
    </section>
  );
}

export default async function AdminReviewNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await getReviewNote(id);
  if (!data) notFound();
  const t = await getTranslations('admin.review');
  const tStatus = await getTranslations('seller.dashboard.status');
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      {data.match ? (
        <p role="status" className="rounded-md bg-danger-soft px-3 py-2">
          <Badge tone="danger">{t('duplicate')}</Badge>{' '}
          {data.match.reason === 'same_hash'
            ? t('sameHash')
            : t('similarText', { distance: data.match.distance ?? 0 })}
        </p>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr_16rem]">
        <NoteColumn data={data.subject} heading={t('subject')} />
        {data.matched ? <NoteColumn data={data.matched} heading={t('matched')} /> : <div />}
        <div className="xl:order-none">
          {data.subject.note.status === 'pending_review' ? (
            <NoteDecision noteId={id} />
          ) : (
            <p>{t('alreadyDecided', { status: tStatus(data.subject.note.status) })}</p>
          )}
        </div>
      </div>
    </div>
  );
}
