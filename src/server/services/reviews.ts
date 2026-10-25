import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { appError, err, ok, type Result } from '@/lib/result';
import type { ReviewInput } from '@/lib/validation/reviews';

import { db } from '../db/client';
import { entitlements, notes, orderItems, orders, reviews, users } from '../db/schema';
import { trySendEvent } from '../jobs/client';

/** Reviews: buyers only, one per purchase (SPEC §3.3). Note stats change in the same transaction. */
export async function createReview(
  userId: string,
  input: ReviewInput & { passedGrade: number | null },
): Promise<Result<{ id: string }>> {
  const [row] = await db
    .select({ order: orders, noteId: orderItems.noteId, sellerId: orderItems.sellerId })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(and(eq(orders.id, input.orderId), eq(orders.buyerId, userId)));
  if (!row || row.order.status !== 'paid')
    return err(appError('FORBIDDEN', 'errors.review.notBuyer'));
  const [entitled] = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(and(eq(entitlements.orderId, row.order.id), isNull(entitlements.revokedAt)));
  if (!entitled) return err(appError('FORBIDDEN', 'errors.review.notBuyer'));
  const result = await db.transaction(async (tx) => {
    const [review] = await tx
      .insert(reviews)
      .values({
        orderId: row.order.id,
        noteId: row.noteId,
        userId,
        rating: input.rating,
        text: input.text,
        passedGrade: input.passedGrade,
      })
      .onConflictDoNothing()
      .returning({ id: reviews.id });
    if (!review) return null;
    await tx.execute(
      sql`UPDATE notes SET rating_sum = rating_sum + ${input.rating}, review_count = review_count + 1 WHERE id = ${row.noteId}`,
    );
    return review;
  });
  if (!result) return err(appError('CONFLICT', 'errors.review.alreadyReviewed'));
  await trySendEvent('review/created', { reviewId: result.id }, `review-created-${result.id}`);
  return ok(result);
}

/** The seller replies once, publicly. */
export async function replyToReview(
  sellerId: string,
  reviewId: string,
  text: string,
): Promise<Result<void>> {
  const [row] = await db
    .select({ review: reviews, sellerId: notes.sellerId })
    .from(reviews)
    .innerJoin(notes, eq(notes.id, reviews.noteId))
    .where(eq(reviews.id, reviewId));
  if (!row || row.sellerId !== sellerId) return err(appError('NOT_FOUND', 'errors.notFound'));
  if (row.review.sellerReply) return err(appError('CONFLICT', 'errors.review.alreadyReplied'));
  await db
    .update(reviews)
    .set({ sellerReply: text, sellerRepliedAt: new Date() })
    .where(and(eq(reviews.id, reviewId), isNull(reviews.sellerReply)));
  await trySendEvent('review/replied', { reviewId }, `review-replied-${reviewId}`);
  return ok(undefined);
}

/** Moderation removal keeps the row but takes it out of the stats. */
export async function removeReview(reviewId: string, reason: string): Promise<Result<void>> {
  await db.transaction(async (tx) => {
    const [review] = await tx
      .select()
      .from(reviews)
      .where(and(eq(reviews.id, reviewId), isNull(reviews.removedAt)));
    if (!review) return;
    await tx
      .update(reviews)
      .set({ removedAt: new Date(), removedReason: reason })
      .where(eq(reviews.id, reviewId));
    await tx.execute(
      sql`UPDATE notes SET rating_sum = greatest(rating_sum - ${review.rating}, 0), review_count = greatest(review_count - 1, 0) WHERE id = ${review.noteId}`,
    );
  });
  return ok(undefined);
}

export async function listNoteReviews(noteId: string, limit = 30) {
  return db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      text: reviews.text,
      passedGrade: reviews.passedGrade,
      sellerReply: reviews.sellerReply,
      sellerRepliedAt: reviews.sellerRepliedAt,
      createdAt: reviews.createdAt,
      authorName: users.name,
      authorUsername: users.username,
      authorDeleted: users.deletedAt,
    })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.userId))
    .where(and(eq(reviews.noteId, noteId), isNull(reviews.removedAt)))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
}
