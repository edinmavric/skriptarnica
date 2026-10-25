import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/cn';

import { Badge } from './badge';
import { CheckIcon } from './icons';
import { PriceTag } from './price-tag';
import { RatingStars } from './rating-stars';

export interface NoteCardData {
  slug: string;
  title: string;
  courseName: string;
  facultyShortName: string;
  coverUrl: string | null;
  sellerName: string;
  averageRating: number | null;
  reviewCount: number;
  pricePara: number;
  /** Self-reported grade (5–10). */
  grade: number | null;
  /** The seller marked the course as passed in their profile. */
  gradeVerifiedByCourseStatus?: boolean;
  pageCount: number;
  owned?: boolean;
}

/** A note as a sheet of paper: first page as the cover, folded corner (SPEC §6.1). */
export function NoteCard({
  note,
  priority,
  className,
}: {
  note: NoteCardData;
  priority?: boolean;
  className?: string;
}) {
  const t = useTranslations('notes.card');
  return (
    <article className={cn('group relative flex flex-col', className)}>
      <div className="paper-sheet aspect-[3/4] overflow-hidden rounded-sm">
        {note.coverUrl ? (
          <Image
            src={note.coverUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 240px, (min-width: 640px) 33vw, 50vw"
            className="object-cover object-top"
            priority={priority}
          />
        ) : (
          <div className="notebook flex h-full flex-col justify-end p-3 pl-9">
            <span className="font-display text-lg leading-tight font-semibold break-words">
              {note.title}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 pt-3">
        <h3 className="font-display text-[1.05rem] leading-snug font-semibold">
          <Link
            href={`/skripta/${note.slug}`}
            className="group-focus-within:underline after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {note.title}
          </Link>
        </h3>
        <p className="text-sm text-ink-muted">
          {note.courseName}, {note.facultyShortName}
        </p>
        <p className="text-sm text-ink-muted">{t('by', { name: note.sellerName })}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {note.grade !== null ? (
            <Badge tone={note.gradeVerifiedByCourseStatus ? 'marker' : 'neutral'}>
              {note.gradeVerifiedByCourseStatus ? <CheckIcon /> : null}
              {t('grade', { grade: note.grade })}
            </Badge>
          ) : null}
          <Badge tone="outline">{t('pages', { count: note.pageCount })}</Badge>
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-2">
          <RatingStars value={note.averageRating} count={note.reviewCount} compact />
          {note.owned ? (
            <Badge tone="success">{t('owned')}</Badge>
          ) : (
            <PriceTag para={note.pricePara} />
          )}
        </div>
      </div>
    </article>
  );
}
