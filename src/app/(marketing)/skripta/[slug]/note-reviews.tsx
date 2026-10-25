import { getTranslations } from 'next-intl/server';

import { ReviewReply } from '@/components/features/notes/review-reply';
import { ReportDialog } from '@/components/features/report-dialog';
import { Badge } from '@/components/ui/badge';
import { RatingStars } from '@/components/ui/rating-stars';
import { formatDate } from '@/lib/format';
import { listNoteReviews } from '@/server/services/reviews';

/** Buyer reviews with the seller's single public reply (SPEC §3.3). */
export async function NoteReviews({
  noteId,
  isOwner,
  signedIn,
}: {
  noteId: string;
  isOwner: boolean;
  signedIn: boolean;
}) {
  const t = await getTranslations('notes.reviews');
  const items = await listNoteReviews(noteId);
  return (
    <section id="ocene" aria-labelledby="reviews-heading" className="scroll-mt-20">
      <h2 id="reviews-heading" className="mb-3 text-display-sm font-semibold">
        {t('title')}
      </h2>
      {items.length === 0 ? (
        <p className="text-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule">
          {items.map((review) => (
            <li key={review.id} className="py-4">
              <article
                aria-label={t('label', {
                  name: review.authorDeleted ? t('deletedUser') : review.authorName,
                })}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <RatingStars value={review.rating} />
                  <span className="text-sm font-medium">
                    {review.authorDeleted ? t('deletedUser') : review.authorName}
                  </span>
                  <span className="text-sm text-ink-muted">{formatDate(review.createdAt)}</span>
                  {review.passedGrade ? (
                    <Badge tone="marker">{t('passedWith', { grade: review.passedGrade })}</Badge>
                  ) : null}
                  <Badge tone="outline">{t('verifiedPurchase')}</Badge>
                </div>
                <p className="mt-2 max-w-prose whitespace-pre-line">{review.text}</p>
                {review.sellerReply ? (
                  <div className="mt-3 ml-4 border-l-[1.5px] border-rule pl-3">
                    <p className="text-sm font-medium">{t('sellerReply')}</p>
                    <p className="max-w-prose text-sm whitespace-pre-line">{review.sellerReply}</p>
                  </div>
                ) : isOwner ? (
                  <ReviewReply reviewId={review.id} />
                ) : null}
                {signedIn && !isOwner ? (
                  <div className="mt-1">
                    <ReportDialog targetType="review" targetId={review.id} compact />
                  </div>
                ) : null}
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
