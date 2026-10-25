import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

import { routes } from '@/config/routes';
import { env } from '@/env';
import { formatPrice } from '@/lib/format';
import { extractMentions } from '@/lib/mentions';

import { db } from '../db/client';
import {
  catalogRequests,
  comments,
  communities,
  entitlements,
  notes,
  orderItems,
  orders,
  payouts,
  posts,
  reviews,
  studentProfiles,
  users,
} from '../db/schema';
import { sendActionEmail } from '../email/send';
import type { EventData } from '../jobs/client';
import { notify } from './notifications';
import { getSettings } from './settings';

/**
 * Event → notification handlers (SPEC §4.9). Plain functions so integration tests can call
 * them directly; the Inngest functions only wrap them. Every notify() is idempotent.
 */

async function noteTitle(noteId: string) {
  const [row] = await db
    .select({ title: notes.title, slug: notes.slug, sellerId: notes.sellerId })
    .from(notes)
    .where(eq(notes.id, noteId));
  return row ?? null;
}

export async function onOrderPaid({ orderId }: EventData<'order/paid'>): Promise<void> {
  const [order] = await db
    .select({
      buyerId: orders.buyerId,
      status: orders.status,
      totalPara: orders.totalPara,
      email: users.email,
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.buyerId))
    .where(eq(orders.id, orderId));
  if (!order || order.status !== 'paid') return;
  const items = await db
    .select({
      noteId: orderItems.noteId,
      sellerId: orderItems.sellerId,
      sellerPara: orderItems.sellerPara,
      title: notes.title,
    })
    .from(orderItems)
    .innerJoin(notes, eq(notes.id, orderItems.noteId))
    .where(eq(orderItems.orderId, orderId));
  for (const item of items) {
    await notify({
      userId: item.sellerId,
      type: 'sale',
      dedupeKey: `sale:${orderId}:${item.noteId}`,
      payload: { href: routes.sell, noteTitle: item.title, amount: formatPrice(item.sellerPara) },
    });
  }
  // Purchase confirmation for the buyer (transactional; free notes are not orders). Claimed
  // atomically so a retried job never sends it twice.
  const claimed = await db
    .update(orders)
    .set({ confirmationSentAt: new Date() })
    .where(and(eq(orders.id, orderId), isNull(orders.confirmationSentAt)))
    .returning({ id: orders.id });
  if (claimed.length === 0) return;
  const settings = await getSettings();
  await sendActionEmail('purchase', order.email, `${env.NEXT_PUBLIC_APP_URL}${routes.library}`, {
    title: items.map((item) => item.title).join(', '),
    amount: formatPrice(order.totalPara),
    days: settings.purchaseProblemWindowDays,
  });
}

export async function onReviewCreated({ reviewId }: EventData<'review/created'>): Promise<void> {
  const [review] = await db
    .select({ noteId: reviews.noteId, rating: reviews.rating })
    .from(reviews)
    .where(eq(reviews.id, reviewId));
  if (!review) return;
  const note = await noteTitle(review.noteId);
  if (!note) return;
  await notify({
    userId: note.sellerId,
    type: 'review_new',
    dedupeKey: `review:${reviewId}`,
    payload: {
      href: `${routes.note(note.slug)}#ocene`,
      noteTitle: note.title,
      rating: review.rating,
    },
  });
}

export async function onReviewReplied({ reviewId }: EventData<'review/replied'>): Promise<void> {
  const [review] = await db
    .select({ noteId: reviews.noteId, userId: reviews.userId })
    .from(reviews)
    .where(eq(reviews.id, reviewId));
  if (!review) return;
  const note = await noteTitle(review.noteId);
  if (!note) return;
  await notify({
    userId: review.userId,
    type: 'review_reply',
    dedupeKey: `review-reply:${reviewId}`,
    payload: { href: `${routes.note(note.slug)}#ocene`, noteTitle: note.title },
  });
}

/** Buyers with active access hear about every published version after the first. */
export async function onVersionPublished({
  noteId,
  versionId,
  versionNumber,
}: EventData<'note/version.published'>): Promise<void> {
  if (versionNumber <= 1) return;
  const note = await noteTitle(noteId);
  if (!note) return;
  const holders = await db
    .selectDistinct({ userId: entitlements.userId })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.noteId, noteId),
        isNull(entitlements.revokedAt),
        ne(entitlements.userId, note.sellerId),
      ),
    );
  for (const holder of holders) {
    await notify({
      userId: holder.userId,
      type: 'note_version',
      dedupeKey: `version:${versionId}`,
      payload: { href: routes.library, noteTitle: note.title, version: versionNumber },
    });
  }
}

export async function onNoteDecided({
  noteId,
  decision,
  reason,
}: EventData<'note/decided'>): Promise<void> {
  const [note] = await db
    .select({
      title: notes.title,
      slug: notes.slug,
      sellerId: notes.sellerId,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(eq(notes.id, noteId));
  if (!note) return;
  await notify({
    userId: note.sellerId,
    type: 'note_decision',
    dedupeKey: `note-decision:${noteId}:${decision}:${note.updatedAt.getTime()}`,
    payload: {
      href: decision === 'approved' ? routes.note(note.slug) : `${routes.sell}/skripta/${noteId}`,
      noteTitle: note.title,
      decision,
      reason: reason ?? '—',
    },
  });
}

export async function onPayoutStatusChanged({
  payoutId,
}: EventData<'payout/status.changed'>): Promise<void> {
  const [payout] = await db.select().from(payouts).where(eq(payouts.id, payoutId));
  if (!payout) return;
  await notify({
    userId: payout.sellerId,
    type: 'payout_status',
    dedupeKey: `payout:${payoutId}:${payout.status}`,
    payload: {
      href: routes.sell,
      amount: formatPrice(payout.amountPara),
      status: payout.status,
      reason: payout.rejectionReason ?? '—',
    },
  });
}

export async function onModerationDecision(
  data: EventData<'moderation/decision'>,
  eventId: string,
): Promise<void> {
  const [community] = data.communityId
    ? await db
        .select({ slug: communities.slug })
        .from(communities)
        .where(eq(communities.id, data.communityId))
    : [];
  await notify({
    userId: data.userId,
    type: 'moderation',
    dedupeKey: `moderation:${eventId}`,
    payload: {
      href: community ? routes.community(community.slug) : routes.legal.community,
      target: data.targetType,
      action: data.action,
      community: community ? `z/${community.slug}` : '',
      reason: data.reason ?? '—',
    },
  });
}

/** Users mentioned in a post/comment who exist, aren't the author and can read the community. */
async function mentionRecipients(
  text: string,
  authorId: string,
  communityId: string,
): Promise<string[]> {
  const usernames = extractMentions(text);
  if (usernames.length === 0) return [];
  const [community] = await db
    .select({ visibility: communities.visibility, facultyId: communities.facultyId })
    .from(communities)
    .where(eq(communities.id, communityId));
  if (!community) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .where(
      and(
        inArray(sql`lower(${users.username})`, usernames),
        ne(users.id, authorId),
        isNull(users.deletedAt),
        community.visibility === 'public'
          ? undefined
          : community.facultyId
            ? eq(studentProfiles.facultyId, community.facultyId)
            : sql`false`,
      ),
    );
  return rows.map((row) => row.id);
}

export async function onForumReply({ kind, id }: EventData<'forum/reply.created'>): Promise<void> {
  if (kind === 'post') {
    const [row] = await db
      .select({ post: posts, communitySlug: communities.slug, actor: users.username })
      .from(posts)
      .innerJoin(communities, eq(communities.id, posts.communityId))
      .innerJoin(users, eq(users.id, posts.authorId))
      .where(eq(posts.id, id));
    if (!row || row.post.removedAt || row.post.deletedAt) return;
    const href = routes.post(row.communitySlug, row.post.id, row.post.slug);
    const actor = row.post.isAnonymous ? null : row.actor;
    for (const userId of await mentionRecipients(
      `${row.post.title} ${row.post.body}`,
      row.post.authorId,
      row.post.communityId,
    )) {
      await notify({
        userId,
        type: 'mention',
        dedupeKey: `mention:post:${id}`,
        payload: { href, actor, postTitle: row.post.title },
      });
    }
    return;
  }
  const [row] = await db
    .select({
      comment: comments,
      post: posts,
      communitySlug: communities.slug,
      actor: users.username,
    })
    .from(comments)
    .innerJoin(posts, eq(posts.id, comments.postId))
    .innerJoin(communities, eq(communities.id, posts.communityId))
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.id, id));
  if (!row || row.comment.removedAt || row.comment.deletedAt) return;
  const href = `${routes.post(row.communitySlug, row.post.id, row.post.slug)}#c-${id}`;
  const actor = row.comment.isAnonymous ? null : row.actor;
  const [parent] = row.comment.parentId
    ? await db
        .select({ authorId: comments.authorId, deletedAt: comments.deletedAt })
        .from(comments)
        .where(eq(comments.id, row.comment.parentId))
    : [{ authorId: row.post.authorId, deletedAt: row.post.deletedAt }];
  const notified = new Set<string>();
  if (parent && !parent.deletedAt && parent.authorId !== row.comment.authorId) {
    notified.add(parent.authorId);
    await notify({
      userId: parent.authorId,
      type: 'forum_reply',
      dedupeKey: `reply:${id}`,
      payload: {
        href,
        actor,
        postTitle: row.post.title,
        kind: row.comment.parentId ? 'comment' : 'post',
      },
    });
  }
  for (const userId of await mentionRecipients(
    row.comment.body,
    row.comment.authorId,
    row.post.communityId,
  )) {
    if (notified.has(userId)) continue;
    await notify({
      userId,
      type: 'mention',
      dedupeKey: `mention:comment:${id}`,
      payload: { href, actor, postTitle: row.post.title },
    });
  }
}

export async function onCatalogRequestDecided({
  requestId,
}: EventData<'catalog/request.decided'>): Promise<void> {
  const [request] = await db
    .select()
    .from(catalogRequests)
    .where(eq(catalogRequests.id, requestId));
  if (!request?.userId || request.status === 'pending') return;
  await notify({
    userId: request.userId,
    type: 'catalog_request',
    dedupeKey: `catalog-request:${requestId}`,
    payload: {
      href: routes.onboarding,
      name: request.payload.name,
      decision: request.status,
      reason: request.rejectionReason ?? '—',
    },
  });
}
