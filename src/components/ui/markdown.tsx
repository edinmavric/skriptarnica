import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';

import { cn } from '@/lib/cn';
import { markdownToHast } from '@/lib/markdown';

/** Server-rendered, sanitized markdown. Never renders raw HTML. */
export function Markdown({
  source,
  className,
  notebook = false,
}: {
  source: string;
  className?: string;
  /** Notebook paper styling with a red margin line (for "How I studied"). */
  notebook?: boolean;
}) {
  const content = toJsxRuntime(markdownToHast(source), { Fragment, jsx, jsxs });
  return <div className={cn('prose-notes', notebook && 'notebook', className)}>{content}</div>;
}
