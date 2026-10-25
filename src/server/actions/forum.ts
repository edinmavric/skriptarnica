'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ok } from '@/lib/result';
import {
  banSchema,
  commentSchema,
  createCommunitySchema,
  createPostSchema,
  editCommentSchema,
  editPostSchema,
  moderateCommentSchema,
  moderatePostSchema,
  voteSchema,
} from '@/lib/validation/forum';

import { createCommunity, joinCommunity, leaveCommunity } from '../services/communities';
import {
  createComment,
  createPost,
  deleteComment,
  deletePost,
  editComment,
  editPost,
  listPosts,
  moderateComment,
  moderatePost,
  resolveCommunityReport,
  setMemberBan,
  setModerator,
  vote,
  votePoll,
  type PostSort,
} from '../services/forum';

import { createAction } from './safe-action';

export const joinCommunityAction = createAction(
  {
    schema: z.object({ slug: z.string().min(1).max(80) }),
    auth: 'user',
    rateLimit: { name: 'generic', by: 'user' },
  },
  async (input, { user }) => {
    const result = await joinCommunity(user, input.slug);
    if (result.ok) revalidatePath(`/z/${input.slug}`);
    return result;
  },
);

export const leaveCommunityAction = createAction(
  { schema: z.object({ slug: z.string().min(1).max(80) }), auth: 'user' },
  async (input, { user }) => {
    const result = await leaveCommunity(user, input.slug);
    if (result.ok) revalidatePath(`/z/${input.slug}`);
    return result;
  },
);

export const createCommunityAction = createAction(
  { schema: createCommunitySchema, auth: 'participant', rateLimit: { name: 'post', by: 'user' } },
  async (input, { user }) => createCommunity(user, { ...input, rules: input.rules ?? '' }),
);

export const createPostAction = createAction(
  { schema: createPostSchema, auth: 'participant', rateLimit: { name: 'post', by: 'user' } },
  async (input, { user }) => {
    // Link previews are fetched server-side with their own limit (SSRF-safe fetcher).
    if (input.type === 'link') {
      const { rateLimit } = await import('../rate-limit');
      const limited = await rateLimit('linkPreview', `u:${user.id}`);
      if (!limited.ok) return limited;
    }
    return createPost(user, input);
  },
);

export const editPostAction = createAction(
  { schema: editPostSchema, auth: 'participant', rateLimit: { name: 'comment', by: 'user' } },
  async (input, { user }) => editPost(user, input.postId, input),
);

export const deletePostAction = createAction(
  { schema: z.object({ postId: z.uuid() }), auth: 'user' },
  async (input, { user }) => deletePost(user, input.postId),
);

export const voteAction = createAction(
  { schema: voteSchema, auth: 'participant', rateLimit: { name: 'vote', by: 'user' } },
  async (input, { user }) => vote(user, input),
);

export const votePollAction = createAction(
  {
    schema: z.object({ postId: z.uuid(), optionId: z.uuid() }),
    auth: 'participant',
    rateLimit: { name: 'vote', by: 'user' },
  },
  async (input, { user }) => votePoll(user, input.postId, input.optionId),
);

export const createCommentAction = createAction(
  { schema: commentSchema, auth: 'participant', rateLimit: { name: 'comment', by: 'user' } },
  async (input, { user }) => createComment(user, input),
);

export const editCommentAction = createAction(
  { schema: editCommentSchema, auth: 'participant', rateLimit: { name: 'comment', by: 'user' } },
  async (input, { user }) => editComment(user, input.commentId, input.body),
);

export const deleteCommentAction = createAction(
  { schema: z.object({ commentId: z.uuid() }), auth: 'user' },
  async (input, { user }) => deleteComment(user, input.commentId),
);

export const moderatePostAction = createAction(
  { schema: moderatePostSchema, auth: 'participant' },
  async (input, { user }) => moderatePost(user, input.postId, input.action, input.reason),
);

export const moderateCommentAction = createAction(
  { schema: moderateCommentSchema, auth: 'participant' },
  async (input, { user }) => moderateComment(user, input.commentId, input.action, input.reason),
);

export const banMemberAction = createAction(
  { schema: banSchema, auth: 'participant' },
  async (input, { user }) =>
    setMemberBan(user, input.communityId, input.username, input.hours, input.reason, input.lift),
);

export const setModeratorAction = createAction(
  {
    schema: z.object({
      communityId: z.uuid(),
      username: z.string().min(3),
      makeModerator: z.boolean(),
    }),
    auth: 'participant',
  },
  async (input, { user }) =>
    setModerator(user, input.communityId, input.username, input.makeModerator),
);

export const resolveReportAction = createAction(
  {
    schema: z.object({
      reportId: z.uuid(),
      resolution: z.enum(['resolved', 'dismissed']),
      note: z.string().trim().max(500).nullable(),
    }),
    auth: 'participant',
  },
  async (input, { user }) =>
    resolveCommunityReport(user, input.reportId, input.resolution, input.note),
);

export const loadMorePostsAction = createAction(
  {
    schema: z.object({
      communityIds: z.array(z.uuid()).min(1).max(200),
      sort: z.enum(['hot', 'new', 'top', 'controversial']),
      window: z.enum(['dan', 'nedelja', 'mesec', 'godina', 'sve']).optional(),
      cursor: z.string().max(200),
    }),
    auth: 'none',
    rateLimit: { name: 'search', by: 'ip' },
  },
  async (input, { user }) => {
    const { loadCommunityById } = await import('../services/communities');
    const { canReadCommunity } = await import('../policies/forum');
    // Only communities the viewer may read.
    const readable: string[] = [];
    for (const id of input.communityIds) {
      const loaded = await loadCommunityById(id, user);
      if (loaded && canReadCommunity(user, loaded.access).allowed) readable.push(id);
    }
    return ok(
      await listPosts({
        viewer: user,
        communityIds: readable,
        sort: input.sort as PostSort,
        ...(input.window ? { window: input.window } : {}),
        cursor: input.cursor,
      }),
    );
  },
);
