import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';

import { appError, err, ok, type Result } from '@/lib/result';

import type { CurrentUser } from '../../auth/session';
import { db } from '../../db/client';
import { comments, copyrightClaims, notes, posts, reports, reviews, users } from '../../db/schema';
import { trySendEvent } from '../../jobs/client';
import { moderateComment, moderatePost } from '../forum';
import { invalidateNoteListings } from '../note-pages';
import { removeReview } from '../reviews';
import { audit } from './audit';
import { banUser } from './users';

export const REPORT_SLA_HOURS = 72;

export type ReportFilter = 'open' | 'resolved' | 'dismissed';

/** Admin queue: every report (community moderators only see their community's). */
export async function listReports(status: ReportFilter = 'open', limit = 100) {
  const rows = await db
    .select({ report: reports, reporterName: users.username })
    .from(reports)
    .leftJoin(users, eq(users.id, reports.reporterId))
    .where(eq(reports.status, status))
    .orderBy(status === 'open' ? asc(reports.createdAt) : desc(reports.resolvedAt))
    .limit(limit);
  // SLA (SPEC §7.5): reports are handled within 72 hours; older open ones are flagged.
  const cutoff = Date.now() - REPORT_SLA_HOURS * 60 * 60 * 1000;
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      overdue: row.report.status === 'open' && row.report.createdAt.getTime() < cutoff,
      target: await describeTarget(row.report.targetType, row.report.targetId),
    })),
  );
}

export interface ReportTarget {
  label: string;
  href: string | null;
  excerpt: string | null;
  ownerId: string | null;
}

async function describeTarget(type: string, id: string): Promise<ReportTarget | null> {
  if (type === 'note') {
    const [note] = await db
      .select({ title: notes.title, slug: notes.slug, sellerId: notes.sellerId })
      .from(notes)
      .where(eq(notes.id, id));
    return note
      ? { label: note.title, href: `/skripta/${note.slug}`, excerpt: null, ownerId: note.sellerId }
      : null;
  }
  if (type === 'review') {
    const [review] = await db
      .select({ text: reviews.text, slug: notes.slug, userId: reviews.userId })
      .from(reviews)
      .innerJoin(notes, eq(notes.id, reviews.noteId))
      .where(eq(reviews.id, id));
    return review
      ? {
          label: review.slug,
          href: `/skripta/${review.slug}#ocene`,
          excerpt: review.text.slice(0, 300),
          ownerId: review.userId,
        }
      : null;
  }
  if (type === 'post') {
    const [post] = await db
      .select({
        title: posts.title,
        slug: posts.slug,
        body: posts.body,
        authorId: posts.authorId,
        communityId: posts.communityId,
      })
      .from(posts)
      .where(eq(posts.id, id));
    if (!post) return null;
    const { communities } = await import('../../db/schema');
    const [community] = await db
      .select({ slug: communities.slug })
      .from(communities)
      .where(eq(communities.id, post.communityId));
    return {
      label: post.title,
      href: community ? `/z/${community.slug}/p/${id}-${post.slug}` : null,
      excerpt: post.body.slice(0, 300),
      ownerId: post.authorId,
    };
  }
  if (type === 'comment') {
    const [comment] = await db
      .select({ body: comments.body, authorId: comments.authorId, postId: comments.postId })
      .from(comments)
      .where(eq(comments.id, id));
    return comment
      ? {
          label: comment.body.slice(0, 80),
          href: null,
          excerpt: comment.body.slice(0, 300),
          ownerId: comment.authorId,
        }
      : null;
  }
  if (type === 'user') {
    const [user] = await db
      .select({ username: users.username, name: users.name })
      .from(users)
      .where(eq(users.id, id));
    return user
      ? {
          label: user.username ?? user.name,
          href: `/admin/korisnici/${id}`,
          excerpt: null,
          ownerId: id,
        }
      : null;
  }
  return { label: type, href: null, excerpt: null, ownerId: null };
}

export async function openReportCount(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(reports).where(eq(reports.status, 'open'));
  return row?.value ?? 0;
}

/** Removes a note from sale (admin decision, e.g. plagiarism or copyright). Buyers keep access. */
export async function removeNote(
  adminId: string,
  noteId: string,
  reason: string,
  ipHash: string,
): Promise<Result<void>> {
  const [note] = await db.select().from(notes).where(eq(notes.id, noteId));
  if (!note) return err(appError('NOT_FOUND', 'errors.notFound'));
  if (note.status === 'removed') return ok(undefined);
  await db.transaction(async (tx) => {
    await tx
      .update(notes)
      .set({ status: 'removed', rejectionReason: reason })
      .where(eq(notes.id, noteId));
    await audit(tx, {
      actorId: adminId,
      action: 'note.removed',
      targetType: 'note',
      targetId: noteId,
      details: { reason },
      ipHash,
    });
  });
  invalidateNoteListings();
  await trySendEvent(
    'moderation/decision',
    { userId: note.sellerId, targetType: 'note', action: 'removed', reason },
    `note-removed-${noteId}`,
  );
  return ok(undefined);
}

/**
 * Resolves or dismisses a report; resolving can act on the content in the same step. Every
 * outcome is audited (and community-scoped targets also land in the community mod log).
 */
export async function resolveReport(
  admin: CurrentUser,
  input: {
    reportId: string;
    resolution: 'resolved' | 'dismissed';
    action: 'none' | 'remove_content' | 'ban_user';
    note: string | null;
  },
  ipHash: string,
): Promise<Result<void>> {
  const [report] = await db.select().from(reports).where(eq(reports.id, input.reportId));
  if (!report) return err(appError('NOT_FOUND', 'errors.notFound'));
  if (report.status !== 'open') return err(appError('CONFLICT', 'errors.admin.reportDecided'));
  const reason = input.note ?? report.reason;
  if (input.resolution === 'resolved' && input.action === 'remove_content') {
    const outcome =
      report.targetType === 'note'
        ? await removeNote(admin.id, report.targetId, reason, ipHash)
        : report.targetType === 'review'
          ? await removeReview(report.targetId, reason)
          : report.targetType === 'post'
            ? await moderatePost(admin, report.targetId, 'remove', reason)
            : report.targetType === 'comment'
              ? await moderateComment(admin, report.targetId, 'remove', reason)
              : err(appError('VALIDATION', 'errors.admin.cannotRemoveTarget'));
    if (!outcome.ok) return outcome;
  }
  if (input.resolution === 'resolved' && input.action === 'ban_user') {
    const target = await describeTarget(report.targetType, report.targetId);
    if (!target?.ownerId) return err(appError('VALIDATION', 'errors.admin.noOwner'));
    const banned = await banUser(admin.id, target.ownerId, reason, ipHash);
    if (!banned.ok) return banned;
  }
  await db.transaction(async (tx) => {
    await tx
      .update(reports)
      .set({
        status: input.resolution,
        resolvedById: admin.id,
        resolvedAt: new Date(),
        action:
          input.action === 'none'
            ? input.note
            : `${input.action}${input.note ? `: ${input.note}` : ''}`,
      })
      .where(eq(reports.id, input.reportId));
    await audit(tx, {
      actorId: admin.id,
      action: `report.${input.resolution}`,
      targetType: 'report',
      targetId: input.reportId,
      details: {
        action: input.action,
        note: input.note,
        target: `${report.targetType}:${report.targetId}`,
      },
      ipHash,
    });
  });
  return ok(undefined);
}

// --- Copyright claims ----------------------------------------------------------------------

export async function listCopyrightClaims(
  statuses: ('open' | 'accepted' | 'rejected' | 'countered')[] = ['open', 'countered'],
) {
  return db
    .select({
      claim: copyrightClaims,
      noteTitle: notes.title,
      noteSlug: notes.slug,
      noteStatus: notes.status,
    })
    .from(copyrightClaims)
    .leftJoin(notes, eq(notes.id, copyrightClaims.noteId))
    .where(inArray(copyrightClaims.status, statuses))
    .orderBy(asc(copyrightClaims.createdAt))
    .limit(200);
}

export async function openClaimCount(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(copyrightClaims)
    .where(inArray(copyrightClaims.status, ['open', 'countered']));
  return row?.value ?? 0;
}

/** Accepting removes the note from sale; rejecting keeps it. Either way the decision is recorded. */
export async function decideCopyrightClaim(
  adminId: string,
  input: { claimId: string; decision: 'accepted' | 'rejected'; note: string },
  ipHash: string,
): Promise<Result<void>> {
  const [claim] = await db
    .select()
    .from(copyrightClaims)
    .where(eq(copyrightClaims.id, input.claimId));
  if (!claim) return err(appError('NOT_FOUND', 'errors.notFound'));
  if (claim.status === 'accepted' || claim.status === 'rejected')
    return err(appError('CONFLICT', 'errors.admin.claimDecided'));
  if (input.decision === 'accepted') {
    if (!claim.noteId) return err(appError('VALIDATION', 'errors.admin.claimNoNote'));
    const removed = await removeNote(adminId, claim.noteId, input.note, ipHash);
    if (!removed.ok) return removed;
  }
  await db.transaction(async (tx) => {
    await tx
      .update(copyrightClaims)
      .set({
        status: input.decision,
        decidedById: adminId,
        decidedAt: new Date(),
        decisionNote: input.note,
      })
      .where(eq(copyrightClaims.id, input.claimId));
    await audit(tx, {
      actorId: adminId,
      action: `copyright.${input.decision}`,
      targetType: 'copyright_claim',
      targetId: input.claimId,
      details: { noteId: claim.noteId, note: input.note },
      ipHash,
    });
  });
  return ok(undefined);
}

export async function linkClaimToNote(
  adminId: string,
  claimId: string,
  noteId: string,
  ipHash: string,
): Promise<Result<void>> {
  const [note] = await db.select({ id: notes.id }).from(notes).where(eq(notes.id, noteId));
  if (!note) return err(appError('NOT_FOUND', 'errors.notFound'));
  await db.transaction(async (tx) => {
    await tx
      .update(copyrightClaims)
      .set({ noteId })
      .where(and(eq(copyrightClaims.id, claimId)));
    await audit(tx, {
      actorId: adminId,
      action: 'copyright.note_linked',
      targetType: 'copyright_claim',
      targetId: claimId,
      details: { noteId },
      ipHash,
    });
  });
  return ok(undefined);
}
