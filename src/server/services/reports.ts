import { and, eq } from 'drizzle-orm';

import { appError, err, ok, type Result } from '@/lib/result';
import type { ReportInput } from '@/lib/validation/reports';

import { db } from '../db/client';
import { comments, posts, reports } from '../db/schema';

/** The community a reported target belongs to, so its moderators see the report. */
async function communityOf(
  targetType: ReportInput['targetType'],
  targetId: string,
): Promise<string | null> {
  if (targetType === 'community') return targetId;
  if (targetType === 'post') {
    const [row] = await db
      .select({ communityId: posts.communityId })
      .from(posts)
      .where(eq(posts.id, targetId));
    return row?.communityId ?? null;
  }
  if (targetType === 'comment') {
    const [row] = await db
      .select({ communityId: posts.communityId })
      .from(comments)
      .innerJoin(posts, eq(posts.id, comments.postId))
      .where(eq(comments.id, targetId));
    return row?.communityId ?? null;
  }
  return null;
}

/** One open report per reporter and target; repeats are accepted silently. */
export async function createReport(
  reporterId: string,
  input: ReportInput,
): Promise<Result<{ id: string }>> {
  const [existing] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.reporterId, reporterId),
        eq(reports.targetType, input.targetType),
        eq(reports.targetId, input.targetId),
        eq(reports.status, 'open'),
      ),
    );
  if (existing) return ok({ id: existing.id });
  const communityId = await communityOf(input.targetType, input.targetId);
  const [row] = await db
    .insert(reports)
    .values({
      reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      text: input.text ?? null,
      communityId,
    })
    .returning({ id: reports.id });
  if (!row) return err(appError('INTERNAL', 'errors.internal'));
  return ok({ id: row.id });
}
