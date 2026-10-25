import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { CommentTree, type CommentNode } from '@/components/ui/comment-tree';
import { Markdown } from '@/components/ui/markdown';
import { routes } from '@/config/routes';
import type { CurrentUser } from '@/server/auth/session';
import type { CommentView, PostView } from '@/server/services/forum';

import { CommentActions } from './comment-controls';
import { TargetVote } from './post-vote';

function toNodes(views: CommentView[], deletedLabel: string): CommentNode[] {
  return views.map((view) => ({
    id: view.id,
    authorName: view.author.deleted ? null : view.author.name,
    authorHref: view.author.username ? routes.user(view.author.username) : null,
    body: view.body ? <Markdown source={view.body} className="text-[0.95rem]" /> : deletedLabel,
    createdAt: view.createdAt,
    editedAt: view.editedAt,
    deleted: view.deleted || view.author.deleted,
    removed: view.removed,
    isOp: view.isOp,
    children: toNodes(view.children, deletedLabel),
  }));
}

function index(
  views: CommentView[],
  into = new Map<string, CommentView>(),
): Map<string, CommentView> {
  for (const view of views) {
    into.set(view.id, view);
    index(view.children, into);
  }
  return into;
}

/** Comment tree with server-rendered bodies and client controls (vote, reply, quote, edit, report, moderate). */
export async function PostThread({
  post,
  comments,
  viewer,
  isModerator,
  canParticipate,
  basePath,
}: {
  post: PostView;
  comments: CommentView[];
  viewer: CurrentUser | null;
  isModerator: boolean;
  canParticipate: boolean;
  basePath: string;
}) {
  const t = await getTranslations('forum.comment');
  const byId = index(comments);
  return (
    <CommentTree
      comments={toNodes(comments, t('deleted'))}
      continueHref={(comment) => `${basePath}/k/${comment.id}`}
      renderVote={(comment) => {
        const view = byId.get(comment.id);
        return view ? (
          <TargetVote
            targetType="comment"
            targetId={view.id}
            score={view.score}
            userVote={view.userVote}
            label={t('voteLabel')}
            orientation="horizontal"
            disabled={!canParticipate || post.locked}
          />
        ) : null;
      }}
      renderActions={(comment) => {
        const view = byId.get(comment.id);
        if (!view) return null;
        return (
          <CommentActions
            postId={post.id}
            commentId={view.id}
            body={view.body}
            isOwn={view.isOwn}
            canReply={canParticipate && !post.locked && !view.deleted && !view.removed}
            isModerator={isModerator}
            removed={view.removed}
            signedIn={Boolean(viewer)}
          />
        );
      }}
    />
  );
}

export function postLinkFor(slug: string, post: { id: string; slug: string }) {
  return routes.post(slug, post.id, post.slug);
}

export { Link };
