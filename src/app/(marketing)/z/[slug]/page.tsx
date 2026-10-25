import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { JoinButton } from '@/components/features/forum/join-button';
import { PostList } from '@/components/features/forum/post-list';
import { SortTabs } from '@/components/features/forum/sort-tabs';
import { ReportDialog } from '@/components/features/report-dialog';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Markdown } from '@/components/ui/markdown';
import { PlusIcon, ShieldIcon } from '@/components/ui/icons';
import { routes } from '@/config/routes';
import { formatNumber } from '@/lib/format';
import { TOP_WINDOWS, type TopWindow } from '@/lib/ranking';
import { pageMetadata } from '@/lib/seo/metadata';
import { getCurrentUser } from '@/server/auth/session';
import { canReadCommunity } from '@/server/policies/forum';
import { listModerators, loadCommunity } from '@/server/services/communities';
import { listPosts, type PostSort } from '@/server/services/forum';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string; period?: string }>;
};

const SORTS = ['hot', 'new', 'top', 'controversial'] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const loaded = await loadCommunity((await params).slug, null);
  if (!loaded) return {};
  return pageMetadata({
    image: null,
    title: loaded.community.name,
    description: loaded.community.description || loaded.community.name,
    path: routes.community(loaded.community.slug),
    noIndex: loaded.community.visibility === 'faculty_only',
  });
}

export default async function CommunityPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const viewer = await getCurrentUser();
  const loaded = await loadCommunity(slug, viewer);
  if (!loaded) notFound();
  const { community, access, isModerator } = loaded;
  const t = await getTranslations('forum.community');
  const tList = await getTranslations('forum.post');
  const base = routes.community(community.slug);
  const readable = canReadCommunity(viewer, access);
  const banned = Boolean(
    access.membership?.bannedUntil && access.membership.bannedUntil > new Date(),
  );

  const header = (
    <>
      <Breadcrumbs
        items={[
          { label: t('home'), href: routes.home },
          { label: t('all'), href: routes.communities },
          { label: community.name, href: base },
        ]}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-display font-bold">{community.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <Badge tone="outline">{t(`types.${community.type}`)}</Badge>
            {community.visibility === 'faculty_only' ? (
              <Badge tone="warning">{t('facultyOnly')}</Badge>
            ) : null}
            <span className="tabular">
              {t('stats', {
                members: formatNumber(community.memberCount),
                posts: formatNumber(community.postCount),
              })}
            </span>
          </div>
        </div>
        {readable.allowed ? (
          <div className="flex flex-wrap gap-2">
            {access.membership && !banned ? (
              <Button asChild>
                <Link href={`${base}/nova-objava`}>
                  <PlusIcon /> {t('newPost')}
                </Link>
              </Button>
            ) : null}
            <JoinButton
              slug={community.slug}
              joined={Boolean(access.membership)}
              signedIn={Boolean(viewer)}
              canLeave={access.membership?.role !== 'owner'}
            />
            {isModerator ? (
              <Button asChild variant="secondary">
                <Link href={`${base}/moderacija`}>
                  <ShieldIcon /> {t('moderation')}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );

  if (!readable.allowed) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState
          title={t('closedTitle')}
          description={
            readable.reason === 'unauthenticated' ? t('closedSignIn') : t('closedFaculty')
          }
        />
      </div>
    );
  }

  const sort: PostSort = SORTS.includes(query.sort as PostSort) ? (query.sort as PostSort) : 'hot';
  const window: TopWindow | undefined =
    sort === 'top'
      ? ((query.period && query.period in TOP_WINDOWS ? query.period : 'nedelja') as TopWindow)
      : undefined;
  const [list, moderators] = await Promise.all([
    listPosts({
      viewer,
      communityIds: [community.id],
      sort,
      ...(window ? { window } : {}),
      pinnedFirst: sort === 'hot',
    }),
    listModerators(community.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {header}
      {banned ? <p className="rounded-md bg-danger-soft px-3 py-2">{t('bannedNotice')}</p> : null}
      <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          <SortTabs base={base} current={sort} window={window} sorts={SORTS} namespace="posts" />
          <PostList
            key={`${sort}-${window ?? ''}`}
            initial={list.posts}
            nextCursor={list.nextCursor}
            communityIds={[community.id]}
            sort={sort}
            window={window}
            signedIn={Boolean(viewer)}
            emptyTitle={tList('emptyTitle')}
            emptyDescription={access.membership ? tList('emptyMember') : tList('emptyJoin')}
          />
        </div>
        <aside className="flex flex-col gap-5 text-sm" aria-label={t('about')}>
          {community.description ? <p>{community.description}</p> : null}
          {community.rules ? (
            <section aria-labelledby="rules-heading">
              <h2 id="rules-heading" className="mb-2 font-sans text-base font-semibold">
                {t('rules')}
              </h2>
              <Markdown source={community.rules} className="text-sm" />
            </section>
          ) : null}
          {moderators.length > 0 ? (
            <section aria-labelledby="mods-heading">
              <h2 id="mods-heading" className="mb-2 font-sans text-base font-semibold">
                {t('moderators')}
              </h2>
              <ul>
                {moderators.map((moderator) => (
                  <li key={moderator.userId}>
                    {moderator.username ? (
                      <Link
                        href={routes.user(moderator.username)}
                        className="underline underline-offset-2"
                      >
                        {moderator.username}
                      </Link>
                    ) : (
                      moderator.name
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="text-ink-muted">{t('systemCommunity')}</p>
          )}
          {viewer ? <ReportDialog targetType="community" targetId={community.id} compact /> : null}
        </aside>
      </div>
    </div>
  );
}
