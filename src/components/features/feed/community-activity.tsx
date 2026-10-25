import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { CommunityList } from '@/components/features/forum/community-list';
import { PostList } from '@/components/features/forum/post-list';
import { Button } from '@/components/ui/button';
import { routes } from '@/config/routes';
import type { CurrentUser } from '@/server/auth/session';
import { listCommunitiesForViewer } from '@/server/services/communities';
import { feedPosts } from '@/server/services/forum';

/** Home feed: hot posts from the user's communities; suggestions when they have none (SPEC §4.2). */
export async function CommunityActivity({ user }: { user: CurrentUser }) {
  const t = await getTranslations('feed.communities');
  const [list, communities] = await Promise.all([
    feedPosts(user, 8),
    listCommunitiesForViewer(user),
  ]);
  return (
    <section aria-labelledby="activity-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="activity-heading" className="text-display-sm font-semibold">
          {t('title')}
        </h2>
        <Link href={routes.communities} className="text-sm text-pen underline underline-offset-2">
          {t('all')}
        </Link>
      </div>
      {communities.mine.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-ink-muted">{t('suggest')}</p>
          {communities.suggested.length > 0 ? (
            <CommunityList items={communities.suggested.slice(0, 5)} />
          ) : null}
          <Button asChild variant="secondary" className="self-start">
            <Link href={routes.communities}>{t('browse')}</Link>
          </Button>
        </div>
      ) : (
        <PostList
          initial={list.posts}
          nextCursor={null}
          communityIds={communities.mine.map((m) => m.community.id)}
          sort="hot"
          showCommunity
          signedIn
          emptyTitle={t('emptyTitle')}
          emptyDescription={t('emptyDescription')}
        />
      )}
    </section>
  );
}
