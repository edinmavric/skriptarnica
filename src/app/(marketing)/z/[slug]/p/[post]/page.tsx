import type { Metadata } from 'next';

import { routes } from '@/config/routes';
import { markdownExcerpt } from '@/lib/markdown';
import { pageMetadata } from '@/lib/seo/metadata';
import { getCurrentUser } from '@/server/auth/session';
import { getPost } from '@/server/services/forum';

import { parsePostParam, PostPage } from './post-page';

type Props = {
  params: Promise<{ slug: string; post: string }>;
  searchParams: Promise<{ sort?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, post: param } = await params;
  const id = parsePostParam(param);
  if (!id) return {};
  const data = await getPost(id, await getCurrentUser());
  if (!data || data.post.deleted) return { robots: { index: false } };
  return pageMetadata({
    image: null,
    title: data.post.title || `z/${slug}`,
    description: data.post.body ? markdownExcerpt(data.post.body, 160) : data.post.title,
    path: routes.post(slug, data.post.id, data.post.slug),
    type: 'article',
    noIndex: data.post.removed || data.community.community.visibility === 'faculty_only',
  });
}

export default async function PostRoute({ params, searchParams }: Props) {
  const { slug, post } = await params;
  return <PostPage slug={slug} postParam={post} sortParam={(await searchParams).sort} />;
}
