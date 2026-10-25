import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { CommentForm } from '@/components/features/forum/comment-controls';
import { PollWidget } from '@/components/features/forum/poll-widget';
import { PostAuthorTools, PostModeration } from '@/components/features/forum/post-moderation';
import { PostThread } from '@/components/features/forum/post-thread';
import { TargetVote } from '@/components/features/forum/post-vote';
import { SortTabs } from '@/components/features/forum/sort-tabs';
import { ReportDialog } from '@/components/features/report-dialog';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { ExternalIcon, LockIcon, PinIcon } from '@/components/ui/icons';
import { Markdown } from '@/components/ui/markdown';
import { NoteCard } from '@/components/ui/note-card';
import { routes } from '@/config/routes';
import { env } from '@/env';
import { formatRelative } from '@/lib/format';
import { getCurrentUser } from '@/server/auth/session';
import { canPostInCommunity } from '@/server/policies/forum';
import { getCommentTree, getPollResults, getPost, type CommentSort } from '@/server/services/forum';
import { publishedNotesBase, toNoteCards } from '@/server/services/note-pages';
import { eq } from 'drizzle-orm';
import { notes } from '@/server/db/schema';

const COMMENT_SORTS = ['best', 'new', 'top'] as const;

export function parsePostParam(param: string): string | null {
  const id = param.slice(0, 36);
  return /^[0-9a-f-]{36}$/.test(id) ? id : null;
}

/** Shared by the post page and the "continue thread" page. */
export async function PostPage({
  slug,
  postParam,
  sortParam,
  rootCommentId,
}: {
  slug: string;
  postParam: string;
  sortParam?: string | undefined;
  rootCommentId?: string;
}) {
  const postId = parsePostParam(postParam);
  if (!postId) notFound();
  const viewer = await getCurrentUser();
  const data = await getPost(postId, viewer);
  if (!data || data.community.community.slug !== slug) notFound();
  const { post, community } = data;
  const t = await getTranslations('forum.post');
  const tPeriods = await getTranslations('examPeriods');
  const sort: CommentSort = COMMENT_SORTS.includes(sortParam as CommentSort)
    ? (sortParam as CommentSort)
    : 'best';
  const canParticipate = canPostInCommunity(viewer, community.access).allowed;
  const [comments, poll, noteCards] = await Promise.all([
    getCommentTree(post.id, viewer, sort, rootCommentId),
    post.type === 'poll' ? getPollResults(post.id, viewer?.id ?? null) : Promise.resolve(null),
    post.noteId
      ? publishedNotesBase()
          .where(eq(notes.id, post.noteId))
          .then((rows) => toNoteCards(rows))
      : Promise.resolve([]),
  ]);
  const path = routes.post(slug, post.id, post.slug);
  const authorLabel = post.author.deleted
    ? t('deletedAuthor')
    : post.author.name
      ? post.author.name
      : t('anonymous');

  return (
    <article className="flex flex-col gap-6">
      {!post.deleted && !post.removed ? (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'DiscussionForumPosting',
            headline: post.title,
            url: `${env.NEXT_PUBLIC_APP_URL}${path}`,
            datePublished: post.createdAt,
            ...(post.editedAt ? { dateModified: post.editedAt } : {}),
            // Anonymous posts carry no author in structured data either.
            ...(post.author.name && !post.author.anonymous
              ? { author: { '@type': 'Person', name: post.author.username ?? post.author.name } }
              : {}),
            interactionStatistic: [
              {
                '@type': 'InteractionCounter',
                interactionType: 'https://schema.org/CommentAction',
                userInteractionCount: post.commentCount,
              },
              {
                '@type': 'InteractionCounter',
                interactionType: 'https://schema.org/LikeAction',
                userInteractionCount: Math.max(post.score, 0),
              },
            ],
            ...(post.body ? { text: post.body.slice(0, 1000) } : {}),
          }}
        />
      ) : null}
      <Breadcrumbs
        items={[
          { label: t('communities'), href: routes.communities },
          { label: `z/${slug}`, href: routes.community(slug) },
          { label: post.title || t('removedTitle'), href: path },
        ]}
      />
      <div className="flex gap-3">
        <TargetVote
          targetType="post"
          targetId={post.id}
          score={post.score}
          userVote={post.userVote}
          label={post.title}
          disabled={!canParticipate || post.locked || post.removed || post.deleted}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
            <Link href={routes.community(slug)} className="font-medium text-ink hover:underline">
              z/{slug}
            </Link>
            <span>
              {post.author.username && !post.author.deleted ? (
                <Link href={routes.user(post.author.username)} className="hover:underline">
                  {authorLabel}
                </Link>
              ) : (
                authorLabel
              )}
              {post.author.anonymous && post.author.name ? ` (${t('anonymousForOthers')})` : ''}
            </span>
            <time dateTime={post.createdAt} suppressHydrationWarning>
              {formatRelative(post.createdAt)}
            </time>
            {post.editedAt ? <span>{t('edited')}</span> : null}
            {post.flair ? <Badge tone="marker">{post.flair}</Badge> : null}
            {post.examPeriod ? (
              <Badge tone="outline">{`${tPeriods(post.examPeriod.period as 'januarski')} ${post.examPeriod.academicYear}`}</Badge>
            ) : null}
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
          <h1 className="text-display-sm leading-tight font-bold sm:text-display">
            {post.deleted ? t('deletedTitle') : post.title}
          </h1>
          {post.removed ? (
            <p className="rounded-md bg-danger-soft px-3 py-2">
              {post.removedReason
                ? t('removedWithReason', { reason: post.removedReason })
                : t('removedNotice')}
            </p>
          ) : null}
          {post.body ? <Markdown source={post.body} /> : null}
          {post.type === 'link' && post.url ? (
            <a
              href={post.url}
              rel="nofollow ugc noopener noreferrer"
              target="_blank"
              className="flex max-w-xl gap-3 rounded-md border border-rule bg-paper-raised p-3 hover:border-ink"
            >
              {post.linkPreview?.imageUrl ? (
                <Image
                  src={post.linkPreview.imageUrl}
                  alt=""
                  width={96}
                  height={96}
                  className="size-24 shrink-0 rounded-sm object-cover"
                  unoptimized
                />
              ) : null}
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-sm text-ink-muted">
                  <ExternalIcon className="size-4" />{' '}
                  {post.linkPreview?.siteName ?? new URL(post.url).hostname}
                </span>
                <span className="block font-medium">{post.linkPreview?.title ?? post.url}</span>
                {post.linkPreview?.description ? (
                  <span className="line-clamp-2 block text-sm text-ink-muted">
                    {post.linkPreview.description}
                  </span>
                ) : null}
              </span>
            </a>
          ) : null}
          {noteCards[0] ? (
            <div className="max-w-56">
              <NoteCard note={noteCards[0]} />
            </div>
          ) : null}
          {poll ? (
            <PollWidget
              postId={post.id}
              options={poll.options}
              myOptionId={poll.myOptionId}
              canVote={canParticipate && !post.locked}
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {post.isOwn && !post.deleted ? (
              <PostAuthorTools
                postId={post.id}
                title={post.title}
                body={post.body ?? ''}
                editable={!post.removed && !post.locked}
              />
            ) : null}
            {viewer && !post.isOwn && !post.deleted ? (
              <ReportDialog targetType="post" targetId={post.id} compact />
            ) : null}
            {community.isModerator ? (
              <PostModeration
                postId={post.id}
                pinned={post.pinned}
                locked={post.locked}
                removed={post.removed}
              />
            ) : null}
          </div>
        </div>
      </div>

      <section aria-labelledby="comments-heading" className="flex flex-col gap-4">
        <h2 id="comments-heading" className="text-display-sm font-semibold">
          {t('comments', { count: post.commentCount })}
        </h2>
        {rootCommentId ? (
          <Link href={path} className="text-sm text-pen underline underline-offset-2">
            {t('backToThread')}
          </Link>
        ) : post.locked ? (
          <p className="text-ink-muted">{t('lockedNotice')}</p>
        ) : canParticipate ? (
          <CommentForm postId={post.id} parentId={null} />
        ) : viewer ? (
          <p className="text-ink-muted">{t('joinToComment')}</p>
        ) : (
          <p className="text-ink-muted">
            <Link
              href={`${routes.signIn}?next=${encodeURIComponent(path)}`}
              className="text-pen underline underline-offset-2"
            >
              {t('signInToComment')}
            </Link>
          </p>
        )}
        <SortTabs
          base={rootCommentId ? `${path}/k/${rootCommentId}` : path}
          current={sort}
          sorts={COMMENT_SORTS}
          namespace="comments"
        />
        {comments.length === 0 ? (
          <p className="text-ink-muted">{t('noComments')}</p>
        ) : (
          <PostThread
            post={post}
            comments={comments}
            viewer={viewer}
            isModerator={community.isModerator}
            canParticipate={canParticipate}
            basePath={path}
          />
        )}
      </section>
    </article>
  );
}
