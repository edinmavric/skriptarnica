'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import { EmptyState } from '@/components/ui/empty-state';
import { LoadMore } from '@/components/ui/load-more';
import { PostCard } from '@/components/ui/post-card';
import type { TopWindow } from '@/lib/ranking';
import { loadMorePostsAction } from '@/server/actions/forum';
import type { PostSort, PostView } from '@/server/services/forum';

import { toPostCardData } from './mappers';
import { TargetVote } from './post-vote';

/** Post list with cursor pagination ("Učitaj još", auto-loading on scroll). */
export function PostList({
  initial,
  nextCursor,
  communityIds,
  sort,
  window,
  showCommunity = false,
  signedIn,
  emptyTitle,
  emptyDescription,
}: {
  initial: PostView[];
  nextCursor: string | null;
  communityIds: string[];
  sort: PostSort;
  window?: TopWindow | undefined;
  showCommunity?: boolean;
  signedIn: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const t = useTranslations('forum.post');
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [loading, setLoading] = useState(false);
  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    const result = await loadMorePostsAction({
      communityIds,
      sort,
      ...(window ? { window } : {}),
      cursor,
    });
    setLoading(false);
    if (result.ok) {
      setItems((current) => [
        ...current,
        ...result.value.posts.filter((p) => !current.some((c) => c.id === p.id)),
      ]);
      setCursor(result.value.nextCursor);
    }
  }, [cursor, loading, communityIds, sort, window]);

  if (items.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <div>
      <ul>
        {items.map((post) => (
          <li key={post.id}>
            <PostCard
              post={toPostCardData(post)}
              showCommunity={showCommunity}
              vote={
                <TargetVote
                  targetType="post"
                  targetId={post.id}
                  score={post.score}
                  userVote={post.userVote}
                  label={post.title || t('removedTitle')}
                  disabled={!signedIn || post.locked || post.removed}
                />
              }
            />
          </li>
        ))}
      </ul>
      <LoadMore onLoadMore={loadMore} loading={loading} hasMore={Boolean(cursor)} />
    </div>
  );
}
