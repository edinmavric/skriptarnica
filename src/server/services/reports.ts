import { and, eq } from 'drizzle-orm';

import { appError, err, ok, type Result } from '@/lib/result';
import type { ReportInput } from '@/lib/validation/reports';

import { db } from '../db/client';
import { reports } from '../db/schema';

/** Resolves the community a reported target belongs to, so community moderators see it. */
type CommunityResolver = (targetType: string, targetId: string) => Promise<string | null>;
const resolvers: CommunityResolver[] = [];
export function registerReportCommunityResolver(resolver: CommunityResolver): void {
  resolvers.push(resolver);
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
  let communityId: string | null = null;
  for (const resolve of resolvers) {
    communityId = await resolve(input.targetType, input.targetId);
    if (communityId) break;
  }
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
