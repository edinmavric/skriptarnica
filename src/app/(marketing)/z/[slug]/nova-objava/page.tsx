import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { PostComposer } from '@/components/features/forum/post-composer';
import { FormAlert } from '@/components/forms/form-alert';
import { routes } from '@/config/routes';
import { requireAppUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { communityMembers, examPeriods, notes } from '@/server/db/schema';
import { canPostInCommunity } from '@/server/policies/forum';
import { listFlairs, loadCommunity } from '@/server/services/communities';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function NewPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireAppUser();
  const { slug } = await params;
  const loaded = await loadCommunity(slug, user);
  if (!loaded) notFound();
  const t = await getTranslations('forum.composer');
  const tPeriods = await getTranslations('examPeriods');
  const check = canPostInCommunity(user, loaded.access);
  const { community } = loaded;
  if (!check.allowed) {
    const tErrors = await getTranslations('errors.policy');
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <h1 className="text-display font-bold">{t('title', { community: community.slug })}</h1>
        <FormAlert message={tErrors(check.reason as 'not_member')} />
        <Link href={routes.community(slug)} className="text-pen underline underline-offset-2">
          {t('backToCommunity')}
        </Link>
      </div>
    );
  }
  const [flairs, periods, ownNotes, [member]] = await Promise.all([
    listFlairs(community.id),
    community.courseId
      ? db
          .select()
          .from(examPeriods)
          .where(eq(examPeriods.courseId, community.courseId))
          .orderBy(desc(examPeriods.startsOn))
          .limit(12)
      : Promise.resolve([]),
    db
      .select({ id: notes.id, title: notes.title })
      .from(notes)
      .where(
        and(eq(notes.sellerId, user.id), eq(notes.status, 'published'), isNull(notes.deletedAt)),
      )
      .orderBy(asc(notes.title)),
    db
      .select({ ack: communityMembers.rulesAcknowledgedAt })
      .from(communityMembers)
      .where(
        and(eq(communityMembers.communityId, community.id), eq(communityMembers.userId, user.id)),
      ),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('title', { community: community.slug })}</h1>
      <PostComposer
        communityId={community.id}
        communitySlug={community.slug}
        flairs={flairs.map((f) => ({ id: f.id, name: f.name }))}
        examPeriods={periods.map((p) => ({
          id: p.id,
          label: `${tPeriods(p.period)} ${p.academicYear}`,
        }))}
        needsRulesAck={community.type === 'professor' && !member?.ack}
        rules={community.rules}
        ownNotes={ownNotes}
      />
    </div>
  );
}
