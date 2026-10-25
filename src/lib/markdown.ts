import type { Root } from 'hast';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

/**
 * Markdown → sanitized HAST (SPEC §7.1): no raw HTML, strict allowlist,
 * links get rel="nofollow ugc noopener noreferrer".
 */
const schema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    'p',
    'br',
    'strong',
    'em',
    'del',
    'a',
    'ul',
    'ol',
    'li',
    'blockquote',
    'code',
    'pre',
    'h2',
    'h3',
    'h4',
    'hr',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'input',
    'sup',
    'sub',
  ],
  attributes: {
    a: ['href', 'title', 'rel'],
    code: [['className', /^language-[a-z0-9-]+$/]],
    input: [['type', 'checkbox'], ['disabled', true], 'checked'],
    th: [['align', 'left', 'center', 'right']],
    td: [['align', 'left', 'center', 'right']],
    li: [['className', 'task-list-item']],
  },
  protocols: { href: ['http', 'https', 'mailto'] },
  clobberPrefix: 'md-',
  strip: ['script', 'style'],
};

/** Headings in user content are demoted so the page keeps one h1 and a logical order. */
function demoteHeadings(tree: Root): Root {
  const visit = (node: Root | Root['children'][number]) => {
    if (node.type === 'element' && /^h[1-6]$/.test(node.tagName)) {
      const level = Math.min(Math.max(Number(node.tagName[1]) + 1, 2), 4);
      node.tagName = `h${level}`;
    }
    if ('children' in node)
      node.children.forEach((child) => visit(child as Root['children'][number]));
  };
  visit(tree);
  return tree;
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  // Raw HTML in markdown is dropped entirely (allowDangerousHtml stays false).
  .use(remarkRehype)
  .use(() => demoteHeadings)
  .use(rehypeSanitize, schema)
  .use(rehypeExternalLinks, { rel: ['nofollow', 'ugc', 'noopener', 'noreferrer'] })
  .freeze();

export function markdownToHast(markdown: string): Root {
  const mdast = processor.parse(markdown);
  return processor.runSync(mdast) as Root;
}

/** Plain-text excerpt for cards and meta descriptions. */
export function markdownExcerpt(markdown: string, maxLength = 180): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), maxLength - 20))}…`;
}
