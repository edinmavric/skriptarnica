import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';

export const MAX_VISIBLE_DEPTH = 6;

export interface CommentNode {
  id: string;
  authorName: string | null;
  authorHref: string | null;
  /** Pre-rendered (sanitized) body. */
  body: ReactNode;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  removed: boolean;
  isOp?: boolean;
  children: CommentNode[];
}

interface CommentTreeProps {
  comments: CommentNode[];
  /** Vote control and action buttons per comment, rendered by the caller (client parts). */
  renderVote?: (comment: CommentNode) => ReactNode;
  renderActions?: (comment: CommentNode) => ReactNode;
  continueHref?: (comment: CommentNode) => string;
  depth?: number;
}

/** Threaded comments: shown to depth 6, deeper threads continue on their own page. */
export function CommentTree({
  comments,
  renderVote,
  renderActions,
  continueHref,
  depth = 1,
}: CommentTreeProps) {
  const t = useTranslations('forum.comment');
  return (
    <ul
      className={cn('flex flex-col', depth > 1 && 'mt-1 border-l-[1.5px] border-rule pl-3 sm:pl-4')}
    >
      {comments.map((comment) => (
        <li key={comment.id} id={`c-${comment.id}`} className="pt-3">
          <article aria-label={t('label', { name: comment.authorName ?? t('anonymous') })}>
            <header className="flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
              <span
                className={cn(
                  'font-medium',
                  comment.deleted || comment.removed ? 'italic' : 'text-ink',
                )}
              >
                {comment.deleted || comment.removed ? (
                  t('deletedAuthor')
                ) : comment.authorName && comment.authorHref ? (
                  <Link href={comment.authorHref} className="hover:underline">
                    {comment.authorName}
                  </Link>
                ) : (
                  t('anonymous')
                )}
              </span>
              {comment.isOp ? <span className="text-pen">{t('op')}</span> : null}
              <time dateTime={comment.createdAt} suppressHydrationWarning>
                {formatRelative(comment.createdAt)}
              </time>
              {comment.editedAt ? <span>{t('edited')}</span> : null}
            </header>
            <div className="mt-1">
              {comment.removed ? (
                <p className="text-ink-muted italic">{t('removed')}</p>
              ) : comment.deleted ? (
                <p className="text-ink-muted italic">{t('deleted')}</p>
              ) : (
                comment.body
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1">
              {renderVote && !comment.deleted && !comment.removed ? renderVote(comment) : null}
              {renderActions ? renderActions(comment) : null}
            </div>
          </article>
          {comment.children.length > 0 ? (
            depth >= MAX_VISIBLE_DEPTH ? (
              continueHref ? (
                <Link
                  href={continueHref(comment)}
                  className="mt-2 inline-block text-sm text-pen hover:underline"
                >
                  {t('continueThread', { count: comment.children.length })}
                </Link>
              ) : null
            ) : (
              <CommentTree
                comments={comment.children}
                depth={depth + 1}
                {...(renderVote ? { renderVote } : {})}
                {...(renderActions ? { renderActions } : {})}
                {...(continueHref ? { continueHref } : {})}
              />
            )
          ) : null}
        </li>
      ))}
    </ul>
  );
}
