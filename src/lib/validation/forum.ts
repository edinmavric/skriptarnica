import { z } from 'zod';

export const createCommunitySchema = z.object({
  type: z.enum(['professor', 'exam', 'general']),
  name: z
    .string()
    .trim()
    .min(3, { error: 'validation.communityNameTooShort' })
    .max(60, { error: 'validation.communityNameTooLong' }),
  description: z
    .string()
    .trim()
    .min(10, { error: 'validation.communityDescriptionTooShort' })
    .max(500),
  rules: z.string().trim().max(5000),
  visibility: z.enum(['public', 'faculty_only']),
  professorId: z.uuid().nullable().optional(),
});
export type CreateCommunityInput = z.input<typeof createCommunitySchema>;

export const createPostSchema = z
  .object({
    communityId: z.uuid(),
    type: z.enum(['text', 'link', 'note_share', 'poll']),
    title: z
      .string()
      .trim()
      .min(5, { error: 'validation.postTitleTooShort' })
      .max(200, { error: 'validation.postTitleTooLong' }),
    body: z.string().trim().max(20_000),
    url: z.string().trim().max(2000).optional(),
    noteId: z.uuid().optional(),
    pollOptions: z.array(z.string().trim().max(100)).max(6).optional(),
    flairId: z.uuid().nullable().optional(),
    examPeriodId: z.uuid().nullable().optional(),
    isAnonymous: z.boolean(),
    acknowledgeRules: z.boolean().optional(),
  })
  .refine((value) => value.type !== 'text' || value.body.length >= 1, {
    error: 'validation.postBodyRequired',
    path: ['body'],
  })
  .refine(
    (value) => value.type !== 'link' || Boolean(value.url && /^https?:\/\//i.test(value.url)),
    { error: 'validation.urlRequired', path: ['url'] },
  );
export type CreatePostInput = z.input<typeof createPostSchema>;

export const editPostSchema = z.object({
  postId: z.uuid(),
  title: z.string().trim().min(5, { error: 'validation.postTitleTooShort' }).max(200),
  body: z.string().trim().max(20_000),
});

export const commentSchema = z.object({
  postId: z.uuid(),
  parentId: z.uuid().nullable(),
  body: z
    .string()
    .trim()
    .min(1, { error: 'validation.commentRequired' })
    .max(10_000, { error: 'validation.commentTooLong' }),
  isAnonymous: z.boolean(),
});

export const editCommentSchema = z.object({
  commentId: z.uuid(),
  body: z.string().trim().min(1, { error: 'validation.commentRequired' }).max(10_000),
});

export const voteSchema = z.object({
  targetType: z.enum(['post', 'comment']),
  targetId: z.uuid(),
  value: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
});

export const moderatePostSchema = z.object({
  postId: z.uuid(),
  action: z.enum(['remove', 'restore', 'lock', 'unlock', 'pin', 'unpin']),
  reason: z.string().trim().max(500).nullable(),
});

export const moderateCommentSchema = z.object({
  commentId: z.uuid(),
  action: z.enum(['remove', 'restore']),
  reason: z.string().trim().max(500).nullable(),
});

export const banSchema = z.object({
  communityId: z.uuid(),
  username: z.string().trim().min(3),
  hours: z
    .number()
    .int()
    .positive()
    .max(24 * 365)
    .nullable(),
  reason: z.string().trim().max(500).nullable(),
  lift: z.boolean().default(false),
});
