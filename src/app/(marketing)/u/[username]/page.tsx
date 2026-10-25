import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { FollowButton } from '@/components/features/profile/follow-button';
import { ReportDialog } from '@/components/features/report-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckIcon } from '@/components/ui/icons';
import { NoteCard } from '@/components/ui/note-card';
import { routes } from '@/config/routes';
import { formatDate, formatNumber, formatRelative } from '@/lib/format';
import { markdownExcerpt } from '@/lib/markdown';
import { pageMetadata } from '@/lib/seo/metadata';
import { getCurrentUser } from '@/server/auth/session';
import { getPublicProfile, profileActivity, profileNotes } from '@/server/services/profiles';

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getPublicProfile((await params).username, null);
  if (!profile) return { robots: { index: false } };
  const t = await getTranslations('profile');
  return pageMetadata({
    title: `${profile.name} (@${profile.username})`,
    description: profile.bio ?? t('metaDescription', { name: profile.name }),
    path: routes.user(profile.username),
    // Only sellers' profiles are worth indexing; students' profiles stay out of search engines.
    noIndex: !profile.isSeller,
  });
}

export default async function ProfilePage({ params }: Props) {
  const viewer = await getCurrentUser();
  const profile = await getPublicProfile((await params).username, viewer);
  if (!profile) notFound();
  const t = await getTranslations('profile');
  const [noteCards, activity] = await Promise.all([
    profile.isSeller ? profileNotes(profile.id) : Promise.resolve([]),
    profile.showActivity
      ? profileActivity(profile.id, viewer)
      : Promise.resolve({ posts: [], comments: [] }),
  ]);
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-start gap-5">
        <Avatar name={profile.name} src={profile.image} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <h1 className="text-display font-bold">{profile.name}</h1>
            <p className="text-ink-muted">@{profile.username}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.verifiedStudent ? (
              <Badge tone="success">
                <CheckIcon /> {t('verified')}
              </Badge>
            ) : null}
            {profile.isSeller ? <Badge tone="pen">{t('seller')}</Badge> : null}
            {profile.soldCount > 0 ? (
              <Badge tone="outline">{t('sold', { count: profile.soldCount })}</Badge>
            ) : null}
          </div>
          {profile.faculty ? (
            <p>
              <Link
                href={routes.faculty(profile.faculty.slug)}
                className="underline underline-offset-2"
              >
                {profile.faculty.name}
              </Link>
              {profile.program ? `, ${profile.program}` : ''}
            </p>
          ) : null}
          {profile.bio ? <p className="max-w-prose">{profile.bio}</p> : null}
          <p className="text-sm text-ink-muted">
            {t('joined', { date: formatDate(profile.joinedAt) })}
            {profile.isSeller
              ? `, ${t('followers', { count: profile.followers, formatted: formatNumber(profile.followers) })}`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {profile.isSelf ? (
            <Button asChild variant="secondary">
              <Link href={routes.settings}>{t('edit')}</Link>
            </Button>
          ) : (
            <>
              {profile.isSeller ? (
                <FollowButton
                  sellerId={profile.id}
                  following={profile.viewerFollows}
                  signedIn={Boolean(viewer)}
                />
              ) : null}
              {viewer ? <ReportDialog targetType="user" targetId={profile.id} compact /> : null}
            </>
          )}
        </div>
      </header>

      {profile.isSeller ? (
        <section aria-labelledby="notes-heading">
          <h2 id="notes-heading" className="mb-3 text-display-sm font-semibold">
            {t('notes')}
          </h2>
          {noteCards.length === 0 ? (
            <p className="text-ink-muted">{t('noNotes')}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {noteCards.map((note) => (
                <li key={note.id}>
                  <NoteCard note={note} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {profile.showActivity ? (
        <div className="grid gap-8 md:grid-cols-2">
          <section aria-labelledby="posts-heading">
            <h2 id="posts-heading" className="mb-3 text-display-sm font-semibold">
              {t('posts')}
            </h2>
            {activity.posts.length === 0 ? (
              <p className="text-ink-muted">{t('noPosts')}</p>
            ) : (
              <ul className="divide-y divide-rule border-y border-rule">
                {activity.posts.map((post) => (
                  <li key={post.id} className="py-2">
                    <Link
                      href={routes.post(post.community, post.id, post.slug)}
                      className="font-medium hover:underline"
                    >
                      {post.title}
                    </Link>
                    <p className="text-sm text-ink-muted">
                      z/{post.community},{' '}
                      {t('postStats', { score: post.score, comments: post.commentCount })},{' '}
                      <time dateTime={post.createdAt.toISOString()} suppressHydrationWarning>
                        {formatRelative(post.createdAt)}
                      </time>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="comments-heading">
            <h2 id="comments-heading" className="mb-3 text-display-sm font-semibold">
              {t('comments')}
            </h2>
            {activity.comments.length === 0 ? (
              <p className="text-ink-muted">{t('noComments')}</p>
            ) : (
              <ul className="divide-y divide-rule border-y border-rule">
                {activity.comments.map((comment) => (
                  <li key={comment.id} className="py-2">
                    <p className="line-clamp-2">{markdownExcerpt(comment.body, 200)}</p>
                    <Link
                      href={`${routes.post(comment.community, comment.postId, comment.postSlug)}#c-${comment.id}`}
                      className="text-sm text-ink-muted hover:underline"
                    >
                      {t('inPost', { title: comment.postTitle })}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <p className="text-ink-muted">{t('activityHidden')}</p>
      )}
    </div>
  );
}
