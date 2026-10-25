'use server';

import { toHtml } from 'hast-util-to-html';
import { z } from 'zod';

import { markdownToHast } from '@/lib/markdown';
import { ok } from '@/lib/result';

import { listCourseProfessors } from '../services/catalog';

import { createAction } from './safe-action';

/** Live preview for markdown editors: same sanitizing pipeline as the published page. */
export const renderMarkdownAction = createAction(
  {
    schema: z.object({ markdown: z.string().max(20_000) }),
    auth: 'user',
    rateLimit: { name: 'generic', by: 'user' },
  },
  async (input) => ok({ html: toHtml(markdownToHast(input.markdown)) }),
);

export const listCourseProfessorsAction = createAction(
  { schema: z.object({ courseId: z.uuid() }), auth: 'user' },
  async (input) => ok(await listCourseProfessors(input.courseId)),
);
