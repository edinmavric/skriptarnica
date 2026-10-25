import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PostPage } from '../../post-page';

export const metadata: Metadata = { robots: { index: false, follow: true } };

/** "Continue thread" beyond depth 6 (SPEC §3.5). */
export default async function ContinueThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; post: string; comment: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { slug, post, comment } = await params;
  if (!/^[0-9a-f-]{36}$/.test(comment)) notFound();
  return (
    <PostPage
      slug={slug}
      postParam={post}
      sortParam={(await searchParams).sort}
      rootCommentId={comment}
    />
  );
}
