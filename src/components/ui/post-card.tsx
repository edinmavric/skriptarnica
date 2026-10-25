import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';

import { Badge } from './badge';
import { LockIcon, MessageIcon, PinIcon } from './icons';

export interface PostCardData {
  href: string;
  title: string;
  excerpt: string | null;
  communityName: string;
  communityHref: string;
  /** null when the post is anonymous (the name is never sent to regular users). */
  authorName: string | null;
  authorHref: string | null;
  flair: string | null;
  commentCount: number;
  createdAt: string;
  pinned?: boolean;
  locked?: boolean;
  removed?: boolean;
}

/** Forum post in a list. `vote` slot receives a <VoteControl/> (client) rendered by the caller. */
export function PostCard({
  post,
  vote,
  showCommunity = true,
}: {
  post: PostCardData;
  vote?: ReactNode;
  showCommunity?: boolean;
}) {
  const t = useTranslations('forum.post');
  return (
    <article className="flex gap-2 border-b border-rule py-3 sm:gap-3">
      {vote ? <div className="shrink-0">{vote}</div> : null}
      <div className="min-w-0 flex-1 py-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
          {showCommunity ? (
            <Link href={post.communityHref} className="font-medium text-ink hover:underline">
              {post.communityName}
            </Link>
          ) : null}
          <span>
            {post.authorName && post.authorHref ? (
              <Link href={post.authorHref} className="hover:underline">
                {post.authorName}
              </Link>
            ) : (
              t('anonymous')
            )}
          </span>
          <time dateTime={post.createdAt} suppressHydrationWarning>
            {formatRelative(post.createdAt)}
          </time>
          {post.pinned ? (
            <Badge tone="pen">
              <PinIcon /> {t('pinned')}
            </Badge>
          ) : null}
          {post.locked ? (
            <Badge tone="warning">
              <LockIcon /> {t('locked')}
            </Badge>
          ) : null}
        </p>
        <h3
          className={cn(
            'mt-1 text-[1.1rem] leading-snug font-semibold',
            post.removed && 'text-ink-muted italic',
          )}
        >
          <Link href={post.href} className="hover:underline">
            {post.removed ? t('removedTitle') : post.title}
          </Link>
          {post.flair ? (
            <Badge tone="marker" className="ml-2 align-middle">
              {post.flair}
            </Badge>
          ) : null}
        </h3>
        {post.excerpt && !post.removed ? (
          <p className="mt-1 line-clamp-2 text-ink-muted">{post.excerpt}</p>
        ) : null}
        <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-muted">
          <MessageIcon className="size-4" />
          <Link href={post.href} className="hover:underline">
            {t('comments', { count: post.commentCount })}
          </Link>
        </p>
      </div>
    </article>
  );
}
