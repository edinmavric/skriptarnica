import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { CommunityList } from '@/components/features/forum/community-list';
import { Button } from '@/components/ui/button';
import { PlusIcon } from '@/components/ui/icons';
import { routes } from '@/config/routes';
import { pageMetadata } from '@/lib/seo/metadata';
import { getCurrentUser } from '@/server/auth/session';
import { listCommunitiesForViewer } from '@/server/services/communities';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('forum.list');
  return pageMetadata({
    title: t('title'),
    description: t('metaDescription'),
    path: routes.communities,
  });
}

export default async function CommunitiesPage() {
  const viewer = await getCurrentUser();
  const [t, data] = await Promise.all([
    getTranslations('forum.list'),
    listCommunitiesForViewer(viewer),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display font-bold">{t('title')}</h1>
          <p className="mt-2 max-w-prose text-ink-muted">{t('intro')}</p>
        </div>
        {viewer ? (
          <Button asChild variant="secondary">
            <Link href="/zajednice/nova">
              <PlusIcon /> {t('create')}
            </Link>
          </Button>
        ) : null}
      </div>
      {data.mine.length > 0 ? (
        <section aria-labelledby="mine-heading">
          <h2 id="mine-heading" className="mb-3 text-display-sm font-semibold">
            {t('mine')}
          </h2>
          <CommunityList
            items={data.mine.map((row) => row.community)}
            role={new Map(data.mine.map((row) => [row.community.id, row.role]))}
          />
        </section>
      ) : null}
      {data.suggested.length > 0 ? (
        <section aria-labelledby="suggested-heading">
          <h2 id="suggested-heading" className="mb-3 text-display-sm font-semibold">
            {t('suggested')}
          </h2>
          <CommunityList items={data.suggested} />
        </section>
      ) : null}
      <section aria-labelledby="popular-heading">
        <h2 id="popular-heading" className="mb-3 text-display-sm font-semibold">
          {t('popular')}
        </h2>
        <CommunityList items={data.popular} />
      </section>
    </div>
  );
}
