import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { BookmarkButton } from '@/components/features/notes/bookmark-button';
import { PreviewGallery } from '@/components/features/notes/preview-gallery';
import { PurchasePanel } from '@/components/features/notes/purchase-panel';
import { ReportDialog } from '@/components/features/report-dialog';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { JsonLd } from '@/components/seo/json-ld';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CheckIcon } from '@/components/ui/icons';
import { Markdown } from '@/components/ui/markdown';
import { RatingStars } from '@/components/ui/rating-stars';
import { routes } from '@/config/routes';
import { env } from '@/env';
import { formatDate, formatNumber } from '@/lib/format';
import { pageMetadata } from '@/lib/seo/metadata';
import { getCurrentUser } from '@/server/auth/session';
import { averageRating, getNotePage, recordNoteView } from '@/server/services/note-pages';

import { NoteReviews } from './note-reviews';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getNotePage((await params).slug, await getCurrentUser());
  if (!data) return {};
  const t = await getTranslations('notes.page');
  const base = pageMetadata({
    title: data.note.title,
    description:
      data.note.shortDescription || t('metaFallback', { course: data.course?.name ?? '' }),
    path: routes.note(data.note.slug),
    // The generated card (opengraph-image.tsx) shows title, course and price.
    image: null,
    noIndex: data.note.status !== 'published',
  });
  return base;
}

export default async function NotePage({ params }: Props) {
  const { slug } = await params;
  const viewer = await getCurrentUser();
  const data = await getNotePage(slug, viewer);
  if (!data) notFound();
  const t = await getTranslations('notes.page');
  const tPeriods = await getTranslations('examPeriods');
  const { note } = data;
  if (note.status === 'published') await recordNoteView(note.id, viewer?.id ?? null, note.sellerId);
  const average = averageRating(note.ratingSum, note.reviewCount);
  const path = routes.note(note.slug);

  return (
    <div className="flex flex-col gap-8">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: note.title,
          description: note.shortDescription,
          ...(data.previews[0] ? { image: data.previews[0].url } : {}),
          brand: { '@type': 'Person', name: data.seller.name },
          offers: {
            '@type': 'Offer',
            price: (note.pricePara / 100).toFixed(2),
            priceCurrency: 'RSD',
            availability: 'https://schema.org/InStock',
            url: `${env.NEXT_PUBLIC_APP_URL}${path}`,
          },
          // AggregateRating only with real reviews (SPEC §8.3).
          ...(note.reviewCount > 0 && average !== null
            ? {
                aggregateRating: {
                  '@type': 'AggregateRating',
                  ratingValue: average,
                  reviewCount: note.reviewCount,
                  bestRating: 5,
                  worstRating: 1,
                },
              }
            : {}),
        }}
      />
      {data.faculty && data.course ? (
        <Breadcrumbs
          items={[
            { label: t('home'), href: routes.home },
            { label: data.faculty.shortName, href: routes.faculty(data.faculty.slug) },
            { label: data.course.name, href: routes.course(data.faculty.slug, data.course.slug) },
            { label: note.title, href: path },
          ]}
        />
      ) : null}

      {note.status !== 'published' ? (
        <p role="status" className="rounded-md bg-warning-soft px-3 py-2 text-sm">
          {t(
            `statusNotice.${note.status === 'unlisted' ? 'unlisted' : note.status === 'pending_review' ? 'pending' : 'other'}`,
          )}
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <header className="flex flex-col gap-2">
            <h1 className="text-display font-bold">{note.title}</h1>
            <p className="text-ink-muted">
              {data.course && data.faculty ? (
                <Link
                  href={routes.course(data.faculty.slug, data.course.slug)}
                  className="underline underline-offset-2"
                >
                  {data.course.name}
                </Link>
              ) : null}
              {data.faculty ? `, ${data.faculty.name}` : ''}
              {data.professor && data.faculty ? (
                <>
                  {', '}
                  {t('professor')}{' '}
                  <Link
                    href={routes.professor(data.faculty.slug, data.professor.slug)}
                    className="underline underline-offset-2"
                  >
                    {data.professor.title ? `${data.professor.title} ` : ''}
                    {data.professor.name}
                  </Link>
                </>
              ) : null}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <RatingStars value={average} count={note.reviewCount} />
              {note.grade !== null ? (
                <Badge
                  tone={data.gradeVerified ? 'marker' : 'neutral'}
                  title={t('gradeSelfReported')}
                >
                  {data.gradeVerified ? <CheckIcon /> : null}
                  {t('grade', { grade: note.grade })}
                </Badge>
              ) : null}
              <Badge tone="outline">{t('pages', { count: note.pageCount })}</Badge>
              {note.examPeriod ? (
                <Badge tone="outline">
                  {t('examPeriod', {
                    period: tPeriods(note.examPeriod as 'januarski'),
                    year: note.academicYear ?? '',
                  })}
                </Badge>
              ) : null}
            </div>
            {note.grade !== null ? (
              <p className="text-sm text-ink-muted">
                {data.gradeVerified ? t('gradeVerifiedNote') : t('gradeSelfReported')}
              </p>
            ) : null}
          </header>

          <PreviewGallery previews={data.previews} title={note.title} totalPages={note.pageCount} />

          <p className="max-w-prose text-lg">{note.shortDescription}</p>

          <section aria-labelledby="how-heading">
            <h2 id="how-heading" className="mb-3 text-display-sm font-semibold">
              {t('howIStudied')}
            </h2>
            <Markdown source={note.howIStudied} notebook />
          </section>

          {data.versions.length > 0 ? (
            <section aria-labelledby="versions-heading">
              <h2 id="versions-heading" className="mb-2 font-sans text-base font-semibold">
                {t('versions')}
              </h2>
              <ol className="flex flex-col gap-2 text-sm">
                {data.versions.map((version) => (
                  <li key={version.versionNumber}>
                    <span className="font-medium">
                      {t('version', { number: version.versionNumber })}
                    </span>
                    {version.publishedAt ? (
                      <span className="text-ink-muted">, {formatDate(version.publishedAt)}</span>
                    ) : null}
                    {version.changelog ? (
                      <p className="text-ink-muted">{version.changelog}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <NoteReviews noteId={note.id} isOwner={data.viewer.isOwner} signedIn={Boolean(viewer)} />
        </div>

        <aside
          className="flex flex-col gap-5 lg:sticky lg:top-20 lg:self-start"
          aria-label={t('sidebar')}
        >
          <div className="rounded-lg border border-rule bg-paper-raised p-4">
            <PurchasePanel
              noteId={note.id}
              slug={note.slug}
              pricePara={note.pricePara}
              owned={data.viewer.owned}
              isOwner={data.viewer.isOwner}
              available={note.status === 'published' || note.status === 'unlisted'}
            />
            {data.lastUpdated ? (
              <p className="mt-3 text-sm text-ink-muted">
                {t('lastUpdated', { date: formatDate(data.lastUpdated) })}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {!data.viewer.isOwner ? (
                <BookmarkButton
                  noteId={note.id}
                  saved={data.viewer.bookmarked}
                  signedIn={Boolean(viewer)}
                  returnTo={path}
                />
              ) : null}
              {viewer && !data.viewer.isOwner ? (
                <ReportDialog targetType="note" targetId={note.id} />
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-rule p-4">
            <Avatar name={data.seller.name} src={data.seller.image} />
            <div className="min-w-0">
              {data.seller.username ? (
                <Link
                  href={routes.user(data.seller.username)}
                  className="font-medium hover:underline"
                >
                  {data.seller.name}
                </Link>
              ) : (
                <span className="font-medium">{data.seller.name}</span>
              )}
              <p className="tabular text-sm text-ink-muted">
                {t('sellerStats', {
                  notes: data.seller.publishedNotes,
                  sales: formatNumber(data.seller.totalSales),
                })}
              </p>
              {data.seller.averageRating !== null ? (
                <RatingStars value={data.seller.averageRating} />
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
