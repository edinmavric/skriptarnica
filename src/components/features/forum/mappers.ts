import type { PostCardData } from '@/components/ui/post-card';
import { routes } from '@/config/routes';
import type { PostView } from '@/server/services/forum';

export function postHref(post: Pick<PostView, 'communitySlug' | 'id' | 'slug'>): string {
  return routes.post(post.communitySlug, post.id, post.slug);
}

/** PostView → card props. Anonymous authors arrive without a name, so nothing leaks here. */
export function toPostCardData(post: PostView): PostCardData {
  return {
    href: postHref(post),
    title: post.deleted ? '' : post.title,
    excerpt: post.excerpt,
    communityName: `z/${post.communitySlug}`,
    communityHref: routes.community(post.communitySlug),
    authorName: post.author.deleted ? null : post.author.name,
    authorHref: post.author.username ? routes.user(post.author.username) : null,
    flair: post.flair,
    commentCount: post.commentCount,
    createdAt: post.createdAt,
    pinned: post.pinned,
    locked: post.locked,
    removed: post.removed || post.deleted,
  };
}
