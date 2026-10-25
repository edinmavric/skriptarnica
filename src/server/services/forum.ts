import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { markdownExcerpt } from '@/lib/markdown';
import { hotRank, TOP_WINDOWS, wilsonLowerBound, type TopWindow } from '@/lib/ranking';
import { appError, err, ok, type Result } from '@/lib/result';
import { normalizeForSearch } from '@/lib/search/normalize';
import { slugify } from '@/lib/slug';

import type { CurrentUser } from '../auth/session';
import { db } from '../db/client';
import {
  comments,
  communities,
  communityFlairs,
  communityMembers,
  examPeriods,
  moderationActions,
  notes,
  pollOptions,
  pollVotes,
  posts,
  reports,
  users,
  votes,
  type LinkPreview,
} from '../db/schema';
import type { Tx } from '../db/types';
import { trySendEvent } from '../jobs/client';
import { logger } from '../logger';
import { fetchLinkPreview, UnsafeUrlError } from '../net/link-preview';
import {
  canModerate,
  canPostInCommunity,
  canReadCommunity,
  type CommunityAccess,
} from '../policies/forum';

import { loadCommunityById, type LoadedCommunity } from './communities';

export type PostSort = 'hot' | 'new' | 'top' | 'controversial';
export type CommentSort = 'best' | 'new' | 'top';
export const MAX_PINNED = 2;
export const PERMANENT_BAN = new Date('9999-12-31T00:00:00Z');

const policyError = (reason: string) =>
  err(
    appError(
      reason === 'unauthenticated' ? 'UNAUTHENTICATED' : 'FORBIDDEN',
      `errors.policy.${reason}`,
    ),
  );

// --- View models -------------------------------------------------------------------------

/** What leaves the server about an author. For anonymous content seen by regular users: nothing. */
export interface AuthorView {
  name: string | null;
  username: string | null;
  anonymous: boolean;
  deleted: boolean;
}

function authorView(
  row: { name: string; username: string | null; deletedAt: Date | null },
  anonymous: boolean,
  revealAnonymous: boolean,
): AuthorView {
  if (row.deletedAt) return { name: null, username: null, anonymous, deleted: true };
  if (anonymous && !revealAnonymous)
    return { name: null, username: null, anonymous: true, deleted: false };
  return { name: row.name, username: row.username, anonymous, deleted: false };
}

export interface PostView {
  id: string;
  slug: string;
  communityId: string;
  communitySlug: string;
  communityName: string;
  type: 'text' | 'link' | 'note_share' | 'poll';
  title: string;
  excerpt: string | null;
  body: string | null;
  url: string | null;
  linkPreview: LinkPreview | null;
  author: AuthorView;
  flair: string | null;
  score: number;
  userVote: -1 | 0 | 1;
  commentCount: number;
  createdAt: string;
  editedAt: string | null;
  pinned: boolean;
  locked: boolean;
  removed: boolean;
  removedReason: string | null;
  deleted: boolean;
  isOwn: boolean;
  noteId: string | null;
  examPeriod: { period: string; academicYear: string } | null;
}

const postColumns = {
  post: posts,
  communitySlug: communities.slug,
  communityName: communities.name,
  authorName: users.name,
  authorUsername: users.username,
  authorDeletedAt: users.deletedAt,
  flair: communityFlairs.name,
  examPeriod: examPeriods.period,
  examYear: examPeriods.academicYear,
};

type PostRow = {
  post: typeof posts.$inferSelect;
  communitySlug: string;
  communityName: string;
  authorName: string;
  authorUsername: string | null;
  authorDeletedAt: Date | null;
  flair: string | null;
  examPeriod: string | null;
  examYear: string | null;
};

function toPostView(
  row: PostRow,
  viewer: CurrentUser | null,
  moderatorOf: Set<string>,
  myVotes: Map<string, number>,
): PostView {
  const p = row.post;
  const reveal = viewer?.role === 'admin' || moderatorOf.has(p.communityId);
  const hiddenBody = (p.removedAt && !reveal) || p.deletedAt;
  return {
    id: p.id,
    slug: p.slug,
    communityId: p.communityId,
    communitySlug: row.communitySlug,
    communityName: row.communityName,
    type: p.type,
    title: p.deletedAt ? '' : p.title,
    excerpt: hiddenBody
      ? null
      : p.body
        ? markdownExcerpt(p.body, 220)
        : (p.linkPreview?.description ?? null),
    body: hiddenBody ? null : p.body,
    url: hiddenBody ? null : p.url,
    linkPreview: hiddenBody ? null : p.linkPreview,
    author: authorView(
      { name: row.authorName, username: row.authorUsername, deletedAt: row.authorDeletedAt },
      p.isAnonymous,
      reveal,
    ),
    flair: row.flair,
    score: p.score,
    userVote: (myVotes.get(p.id) ?? 0) as -1 | 0 | 1,
    commentCount: p.commentCount,
    createdAt: p.createdAt.toISOString(),
    editedAt: p.editedAt?.toISOString() ?? null,
    pinned: Boolean(p.pinnedAt),
    locked: Boolean(p.lockedAt),
    removed: Boolean(p.removedAt),
    removedReason: reveal ? p.removedReason : null,
    deleted: Boolean(p.deletedAt),
    isOwn: viewer?.id === p.authorId,
    noteId: hiddenBody ? null : p.noteId,
    examPeriod:
      row.examPeriod && row.examYear
        ? { period: row.examPeriod, academicYear: row.examYear }
        : null,
  };
}

async function viewerVotes(
  viewerId: string | null,
  targetType: 'post' | 'comment',
  ids: string[],
): Promise<Map<string, number>> {
  if (!viewerId || ids.length === 0) return new Map();
  const rows = await db
    .select({ targetId: votes.targetId, value: votes.value })
    .from(votes)
    .where(
      and(
        eq(votes.userId, viewerId),
        eq(votes.targetType, targetType),
        inArray(votes.targetId, ids),
      ),
    );
  return new Map(rows.map((row) => [row.targetId, row.value]));
}

async function moderatedCommunities(viewer: CurrentUser | null): Promise<Set<string>> {
  if (!viewer) return new Set();
  const rows = await db
    .select({ communityId: communityMembers.communityId })
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.userId, viewer.id),
        inArray(communityMembers.role, ['moderator', 'owner']),
      ),
    );
  return new Set(rows.map((row) => row.communityId));
}

function postsQuery() {
  return db
    .select(postColumns)
    .from(posts)
    .innerJoin(communities, eq(communities.id, posts.communityId))
    .innerJoin(users, eq(users.id, posts.authorId))
    .leftJoin(communityFlairs, eq(communityFlairs.id, posts.flairId))
    .leftJoin(examPeriods, eq(examPeriods.id, posts.examPeriodId));
}

// --- Listing -----------------------------------------------------------------------------

export interface Cursor {
  o: number;
}
export const encodeCursor = (cursor: Cursor) =>
  Buffer.from(JSON.stringify(cursor)).toString('base64url');
export function decodeCursor(raw: string | null | undefined): Cursor {
  if (!raw) return { o: 0 };
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
    return Number.isInteger(parsed.o) && parsed.o >= 0 && parsed.o < 10_000 ? parsed : { o: 0 };
  } catch {
    return { o: 0 };
  }
}

function postOrder(sort: PostSort): SQL[] {
  switch (sort) {
    case 'new':
      return [desc(posts.createdAt), desc(posts.id)];
    case 'top':
      return [desc(posts.score), desc(posts.createdAt), desc(posts.id)];
    case 'controversial':
      return [
        desc(
          sql`CASE WHEN ${posts.upvotes} > 0 AND ${posts.downvotes} > 0 THEN power(${posts.upvotes} + ${posts.downvotes}, CASE WHEN ${posts.downvotes} > ${posts.upvotes} THEN ${posts.upvotes}::float / ${posts.downvotes} ELSE ${posts.downvotes}::float / ${posts.upvotes} END) ELSE 0 END`,
        ),
        desc(posts.createdAt),
      ];
    default:
      return [desc(posts.hotRank), desc(posts.id)];
  }
}

/**
 * Posts of one community (or several, for the home feed), with pinned posts first on the
 * community page. Offset cursor (stable enough for forum pages; documented in DECISIONS).
 */
export async function listPosts(input: {
  viewer: CurrentUser | null;
  communityIds: string[];
  sort: PostSort;
  window?: TopWindow;
  cursor?: string | null;
  limit?: number;
  pinnedFirst?: boolean;
}): Promise<{ posts: PostView[]; nextCursor: string | null }> {
  if (input.communityIds.length === 0) return { posts: [], nextCursor: null };
  const limit = input.limit ?? 20;
  const { o } = decodeCursor(input.cursor);
  const conditions: SQL[] = [
    inArray(posts.communityId, input.communityIds),
    isNull(posts.deletedAt),
  ];
  const moderatorOf = await moderatedCommunities(input.viewer);
  const seeRemoved =
    input.viewer?.role === 'admin' || input.communityIds.every((id) => moderatorOf.has(id));
  if (!seeRemoved) conditions.push(isNull(posts.removedAt));
  if (input.sort === 'top' && input.window) {
    const days = TOP_WINDOWS[input.window];
    if (days) conditions.push(gt(posts.createdAt, new Date(Date.now() - days * 86_400_000)));
  }
  const order = input.pinnedFirst
    ? [sql`${posts.pinnedAt} IS NULL`, desc(posts.pinnedAt), ...postOrder(input.sort)]
    : postOrder(input.sort);
  const rows = await postsQuery()
    .where(and(...conditions))
    .orderBy(...order)
    .limit(limit + 1)
    .offset(o);
  const page = rows.slice(0, limit);
  const myVotes = await viewerVotes(
    input.viewer?.id ?? null,
    'post',
    page.map((row) => row.post.id),
  );
  return {
    posts: page.map((row) => toPostView(row, input.viewer, moderatorOf, myVotes)),
    nextCursor: rows.length > limit ? encodeCursor({ o: o + limit }) : null,
  };
}

export async function getPost(
  postId: string,
  viewer: CurrentUser | null,
): Promise<{ post: PostView; community: LoadedCommunity } | null> {
  const [row] = await postsQuery().where(eq(posts.id, postId));
  if (!row) return null;
  const community = await loadCommunityById(row.post.communityId, viewer);
  if (!community || !canReadCommunity(viewer, community.access).allowed) return null;
  const moderatorOf = await moderatedCommunities(viewer);
  const myVotes = await viewerVotes(viewer?.id ?? null, 'post', [postId]);
  return { post: toPostView(row, viewer, moderatorOf, myVotes), community };
}

export async function getPollResults(postId: string, viewerId: string | null) {
  const [options, mine] = await Promise.all([
    db
      .select()
      .from(pollOptions)
      .where(eq(pollOptions.postId, postId))
      .orderBy(asc(pollOptions.position)),
    viewerId
      ? db
          .select({ optionId: pollVotes.optionId })
          .from(pollVotes)
          .where(and(eq(pollVotes.postId, postId), eq(pollVotes.userId, viewerId)))
      : Promise.resolve([]),
  ]);
  return {
    options: options.map((o) => ({ id: o.id, label: o.label, votes: o.voteCount })),
    myOptionId: mine[0]?.optionId ?? null,
  };
}

// --- Creating and editing posts ----------------------------------------------------------

export interface CreatePostInput {
  communityId: string;
  type: 'text' | 'link' | 'note_share' | 'poll';
  title: string;
  body: string;
  url?: string | undefined;
  noteId?: string | undefined;
  pollOptions?: string[] | undefined;
  flairId?: string | null | undefined;
  examPeriodId?: string | null | undefined;
  isAnonymous: boolean;
  acknowledgeRules?: boolean | undefined;
}

async function requirePostingAccess(
  user: CurrentUser,
  communityId: string,
): Promise<Result<LoadedCommunity>> {
  const loaded = await loadCommunityById(communityId, user);
  if (!loaded) return err(appError('NOT_FOUND', 'errors.notFound'));
  const check = canPostInCommunity(user, loaded.access);
  if (!check.allowed) return policyError(check.reason);
  return ok(loaded);
}

export async function createPost(
  user: CurrentUser,
  input: CreatePostInput,
): Promise<Result<{ id: string; slug: string; communitySlug: string }>> {
  const access = await requirePostingAccess(user, input.communityId);
  if (!access.ok) return access;
  const { community } = access.value;

  // Professor communities: a conduct reminder must be acknowledged once (SPEC §4.7) ⚖️.
  if (community.type === 'professor') {
    const [member] = await db
      .select({ ack: communityMembers.rulesAcknowledgedAt })
      .from(communityMembers)
      .where(
        and(eq(communityMembers.communityId, community.id), eq(communityMembers.userId, user.id)),
      );
    if (!member?.ack) {
      if (!input.acknowledgeRules)
        return err(
          appError('VALIDATION', 'errors.forum.rulesAckRequired', {
            acknowledgeRules: ['errors.forum.rulesAckRequired'],
          }),
        );
      await db
        .update(communityMembers)
        .set({ rulesAcknowledgedAt: new Date() })
        .where(
          and(eq(communityMembers.communityId, community.id), eq(communityMembers.userId, user.id)),
        );
    }
  }

  let linkPreview: LinkPreview | null = null;
  let url: string | null = null;
  if (input.type === 'link') {
    if (!input.url)
      return err(appError('VALIDATION', 'errors.validation', { url: ['validation.urlRequired'] }));
    try {
      linkPreview = await fetchLinkPreview(input.url);
      url = linkPreview.url;
    } catch (error) {
      if (error instanceof UnsafeUrlError)
        return err(
          appError('VALIDATION', 'errors.validation', { url: ['validation.urlNotAllowed'] }),
        );
      // Unreachable site: keep the link, skip the preview.
      logger.info(
        { err: error instanceof Error ? error.message : String(error) },
        'link preview unavailable',
      );
      url = new URL(input.url).toString();
    }
  }
  if (input.type === 'note_share') {
    const [note] = input.noteId
      ? await db
          .select({ id: notes.id })
          .from(notes)
          .where(
            and(eq(notes.id, input.noteId), eq(notes.status, 'published'), isNull(notes.deletedAt)),
          )
      : [];
    if (!note)
      return err(
        appError('VALIDATION', 'errors.validation', { noteId: ['validation.noteRequired'] }),
      );
  }
  const options =
    input.type === 'poll'
      ? (input.pollOptions ?? []).map((label) => label.trim()).filter(Boolean)
      : [];
  if (
    input.type === 'poll' &&
    (options.length < 2 || options.length > 6 || new Set(options).size !== options.length)
  ) {
    return err(
      appError('VALIDATION', 'errors.validation', { pollOptions: ['validation.pollOptions'] }),
    );
  }
  if (input.flairId) {
    const [flair] = await db
      .select({ id: communityFlairs.id })
      .from(communityFlairs)
      .where(
        and(eq(communityFlairs.id, input.flairId), eq(communityFlairs.communityId, community.id)),
      );
    if (!flair) return err(appError('VALIDATION', 'errors.validation'));
  }
  if (input.examPeriodId && community.courseId) {
    const [period] = await db
      .select({ id: examPeriods.id })
      .from(examPeriods)
      .where(
        and(eq(examPeriods.id, input.examPeriodId), eq(examPeriods.courseId, community.courseId)),
      );
    if (!period) return err(appError('VALIDATION', 'errors.validation'));
  }

  const id = uuidv7();
  const now = new Date();
  const slug = slugify(input.title, 60) || 'objava';
  await db.transaction(async (tx) => {
    await tx.insert(posts).values({
      id,
      communityId: community.id,
      authorId: user.id,
      type: input.type,
      title: input.title,
      slug,
      body: input.body,
      url,
      linkPreview,
      noteId: input.type === 'note_share' ? (input.noteId ?? null) : null,
      flairId: input.flairId ?? null,
      examPeriodId: input.examPeriodId ?? null,
      isAnonymous: input.isAnonymous,
      score: 1,
      upvotes: 1,
      hotRank: hotRank(1, now),
      createdAt: now,
      searchText: normalizeForSearch(`${input.title} ${input.body}`.slice(0, 5000)),
    });
    // Authors upvote their own post, as on Reddit.
    await tx.insert(votes).values({ targetType: 'post', targetId: id, userId: user.id, value: 1 });
    if (options.length > 0)
      await tx
        .insert(pollOptions)
        .values(options.map((label, position) => ({ postId: id, label, position })));
    await tx.execute(
      sql`UPDATE communities SET post_count = post_count + 1 WHERE id = ${community.id}`,
    );
  });
  await trySendEvent('forum/reply.created', { kind: 'post', id }, `post-created-${id}`);
  return ok({ id, slug, communitySlug: community.slug });
}

export async function editPost(
  user: CurrentUser,
  postId: string,
  input: { title: string; body: string },
): Promise<Result<void>> {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post || post.authorId !== user.id || post.deletedAt)
    return err(appError('NOT_FOUND', 'errors.notFound'));
  if (post.removedAt || post.lockedAt) return err(appError('FORBIDDEN', 'errors.policy.locked'));
  const access = await requirePostingAccess(user, post.communityId);
  if (!access.ok) return access;
  await db
    .update(posts)
    .set({
      title: input.title,
      body: input.body,
      editedAt: new Date(),
      searchText: normalizeForSearch(`${input.title} ${input.body}`.slice(0, 5000)),
    })
    .where(eq(posts.id, postId));
  return ok(undefined);
}

/** Author deletion: the thread stays, the post shows as "[obrisano]" (SPEC §3.5). */
export async function deletePost(user: CurrentUser, postId: string): Promise<Result<void>> {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post || post.authorId !== user.id || post.deletedAt)
    return err(appError('NOT_FOUND', 'errors.notFound'));
  await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, postId));
  return ok(undefined);
}

// --- Voting ------------------------------------------------------------------------------

/**
 * Vote on a post or comment (SPEC §4.7). The server is the source of truth: the vote row and
 * the target's counters change in one transaction; the response carries the new state.
 */
export async function vote(
  user: CurrentUser,
  input: { targetType: 'post' | 'comment'; targetId: string; value: -1 | 0 | 1 },
): Promise<Result<{ score: number; userVote: -1 | 0 | 1 }>> {
  const target =
    input.targetType === 'post'
      ? (
          await db
            .select({
              communityId: posts.communityId,
              removed: posts.removedAt,
              deleted: posts.deletedAt,
              locked: posts.lockedAt,
            })
            .from(posts)
            .where(eq(posts.id, input.targetId))
        )[0]
      : (
          await db
            .select({
              communityId: posts.communityId,
              removed: comments.removedAt,
              deleted: comments.deletedAt,
              locked: posts.lockedAt,
            })
            .from(comments)
            .innerJoin(posts, eq(posts.id, comments.postId))
            .where(eq(comments.id, input.targetId))
        )[0];
  if (!target || target.removed || target.deleted)
    return err(appError('NOT_FOUND', 'errors.notFound'));
  if (target.locked) return err(appError('FORBIDDEN', 'errors.policy.locked'));
  const access = await requirePostingAccess(user, target.communityId);
  if (!access.ok) return access;

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(votes)
      .where(
        and(
          eq(votes.userId, user.id),
          eq(votes.targetType, input.targetType),
          eq(votes.targetId, input.targetId),
        ),
      )
      .for('update');
    const previous = (existing?.value ?? 0) as -1 | 0 | 1;
    if (previous === input.value) return null;
    if (input.value === 0)
      await tx.delete(votes).where(eq(votes.id, (existing as { id: string }).id));
    else if (existing)
      await tx.update(votes).set({ value: input.value }).where(eq(votes.id, existing.id));
    else
      await tx.insert(votes).values({
        targetType: input.targetType,
        targetId: input.targetId,
        userId: user.id,
        value: input.value,
      });
    const up = (input.value === 1 ? 1 : 0) - (previous === 1 ? 1 : 0);
    const down = (input.value === -1 ? 1 : 0) - (previous === -1 ? 1 : 0);
    const table = input.targetType === 'post' ? sql`posts` : sql`comments`;
    const updated = await tx.execute<{ score: number; created_at: Date }>(
      sql`UPDATE ${table} SET upvotes = upvotes + ${up}, downvotes = downvotes + ${down}, score = score + ${up - down} WHERE id = ${input.targetId} RETURNING score, created_at`,
    );
    const row = updated[0] as { score: number; created_at: Date | string };
    if (input.targetType === 'post') {
      await tx.execute(
        sql`UPDATE posts SET hot_rank = ${hotRank(row.score, new Date(row.created_at))} WHERE id = ${input.targetId}`,
      );
    }
    return row.score;
  });
  const score =
    result ??
    (input.targetType === 'post'
      ? ((
          await db.select({ score: posts.score }).from(posts).where(eq(posts.id, input.targetId))
        )[0]?.score ?? 0)
      : ((
          await db
            .select({ score: comments.score })
            .from(comments)
            .where(eq(comments.id, input.targetId))
        )[0]?.score ?? 0));
  return ok({ score, userVote: input.value });
}

export async function votePoll(
  user: CurrentUser,
  postId: string,
  optionId: string,
): Promise<Result<void>> {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post || post.type !== 'poll' || post.deletedAt || post.removedAt)
    return err(appError('NOT_FOUND', 'errors.notFound'));
  if (post.lockedAt) return err(appError('FORBIDDEN', 'errors.policy.locked'));
  const access = await requirePostingAccess(user, post.communityId);
  if (!access.ok) return access;
  const [option] = await db
    .select()
    .from(pollOptions)
    .where(and(eq(pollOptions.id, optionId), eq(pollOptions.postId, postId)));
  if (!option) return err(appError('VALIDATION', 'errors.validation'));
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(pollVotes)
      .where(and(eq(pollVotes.postId, postId), eq(pollVotes.userId, user.id)))
      .for('update');
    if (existing?.optionId === optionId) return;
    if (existing) {
      await tx.update(pollVotes).set({ optionId }).where(eq(pollVotes.id, existing.id));
      await tx.execute(
        sql`UPDATE poll_options SET vote_count = vote_count - 1 WHERE id = ${existing.optionId}`,
      );
    } else {
      await tx.insert(pollVotes).values({ postId, optionId, userId: user.id });
    }
    await tx.execute(
      sql`UPDATE poll_options SET vote_count = vote_count + 1 WHERE id = ${optionId}`,
    );
  });
  return ok(undefined);
}

// --- Comments ----------------------------------------------------------------------------

export interface CommentView {
  id: string;
  parentId: string | null;
  author: AuthorView;
  body: string | null;
  score: number;
  upvotes: number;
  downvotes: number;
  userVote: -1 | 0 | 1;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  removed: boolean;
  isOwn: boolean;
  isOp: boolean;
  children: CommentView[];
}

export async function createComment(
  user: CurrentUser,
  input: { postId: string; parentId: string | null; body: string; isAnonymous: boolean },
): Promise<Result<{ id: string }>> {
  const [post] = await db.select().from(posts).where(eq(posts.id, input.postId));
  if (!post || post.deletedAt || post.removedAt)
    return err(appError('NOT_FOUND', 'errors.notFound'));
  if (post.lockedAt) return err(appError('FORBIDDEN', 'errors.policy.locked'));
  const access = await requirePostingAccess(user, post.communityId);
  if (!access.ok) return access;
  let depth = 0;
  if (input.parentId) {
    const [parent] = await db
      .select({
        depth: comments.depth,
        postId: comments.postId,
        deleted: comments.deletedAt,
        removed: comments.removedAt,
      })
      .from(comments)
      .where(eq(comments.id, input.parentId));
    if (!parent || parent.postId !== post.id)
      return err(appError('VALIDATION', 'errors.validation'));
    depth = Math.min(parent.depth + 1, 100);
  }
  const id = uuidv7();
  await db.transaction(async (tx: Tx) => {
    await tx.insert(comments).values({
      id,
      postId: post.id,
      parentId: input.parentId,
      authorId: user.id,
      body: input.body,
      depth,
      isAnonymous: input.isAnonymous,
      score: 1,
      upvotes: 1,
    });
    await tx
      .insert(votes)
      .values({ targetType: 'comment', targetId: id, userId: user.id, value: 1 });
    await tx.execute(sql`UPDATE posts SET comment_count = comment_count + 1 WHERE id = ${post.id}`);
  });
  await trySendEvent('forum/reply.created', { kind: 'comment', id }, `comment-created-${id}`);
  return ok({ id });
}

export async function editComment(
  user: CurrentUser,
  commentId: string,
  body: string,
): Promise<Result<void>> {
  const [row] = await db
    .select({ comment: comments, locked: posts.lockedAt, communityId: posts.communityId })
    .from(comments)
    .innerJoin(posts, eq(posts.id, comments.postId))
    .where(eq(comments.id, commentId));
  if (!row || row.comment.authorId !== user.id || row.comment.deletedAt || row.comment.removedAt)
    return err(appError('NOT_FOUND', 'errors.notFound'));
  if (row.locked) return err(appError('FORBIDDEN', 'errors.policy.locked'));
  const access = await requirePostingAccess(user, row.communityId);
  if (!access.ok) return access;
  await db.update(comments).set({ body, editedAt: new Date() }).where(eq(comments.id, commentId));
  return ok(undefined);
}

export async function deleteComment(user: CurrentUser, commentId: string): Promise<Result<void>> {
  const [comment] = await db.select().from(comments).where(eq(comments.id, commentId));
  if (!comment || comment.authorId !== user.id || comment.deletedAt)
    return err(appError('NOT_FOUND', 'errors.notFound'));
  await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, commentId));
  return ok(undefined);
}

function sortComments(list: CommentView[], sort: CommentSort): CommentView[] {
  const key = (c: CommentView) =>
    sort === 'new'
      ? Date.parse(c.createdAt)
      : sort === 'top'
        ? c.score
        : wilsonLowerBound(c.upvotes, c.downvotes);
  return list
    .sort((a, b) => key(b) - key(a) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((c) => ({ ...c, children: sortComments(c.children, sort) }));
}

/**
 * The comment tree of a post (up to 2000 comments), sorted per level: Best = Wilson lower
 * bound, New, Top (SPEC §4.7). `rootId` returns a continued thread.
 */
export async function getCommentTree(
  postId: string,
  viewer: CurrentUser | null,
  sort: CommentSort,
  rootId?: string,
): Promise<CommentView[]> {
  const [post] = await db
    .select({
      authorId: posts.authorId,
      communityId: posts.communityId,
      isAnonymous: posts.isAnonymous,
    })
    .from(posts)
    .where(eq(posts.id, postId));
  if (!post) return [];
  const moderatorOf = await moderatedCommunities(viewer);
  const reveal = viewer?.role === 'admin' || moderatorOf.has(post.communityId);
  const rows = await db
    .select({
      comment: comments,
      authorName: users.name,
      authorUsername: users.username,
      authorDeletedAt: users.deletedAt,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.postId, postId))
    .orderBy(asc(comments.createdAt))
    .limit(2000);
  const myVotes = await viewerVotes(
    viewer?.id ?? null,
    'comment',
    rows.map((r) => r.comment.id),
  );
  const views = new Map<string, CommentView>();
  for (const { comment, authorName, authorUsername, authorDeletedAt } of rows) {
    const hidden = Boolean(comment.deletedAt) || (Boolean(comment.removedAt) && !reveal);
    views.set(comment.id, {
      id: comment.id,
      parentId: comment.parentId,
      author: authorView(
        { name: authorName, username: authorUsername, deletedAt: authorDeletedAt },
        comment.isAnonymous,
        reveal,
      ),
      body: hidden ? null : comment.body,
      score: comment.score,
      upvotes: comment.upvotes,
      downvotes: comment.downvotes,
      userVote: (myVotes.get(comment.id) ?? 0) as -1 | 0 | 1,
      createdAt: comment.createdAt.toISOString(),
      editedAt: comment.editedAt?.toISOString() ?? null,
      deleted: Boolean(comment.deletedAt),
      removed: Boolean(comment.removedAt),
      isOwn: viewer?.id === comment.authorId,
      // "OP" only when it doesn't unmask an anonymous author.
      isOp: comment.authorId === post.authorId && !comment.isAnonymous && !post.isAnonymous,
      children: [],
    });
  }
  const roots: CommentView[] = [];
  for (const view of views.values()) {
    const parent = view.parentId ? views.get(view.parentId) : undefined;
    if (parent) parent.children.push(view);
    else if (!view.parentId) roots.push(view);
  }
  const start = rootId ? views.get(rootId) : undefined;
  return sortComments(start ? [start] : roots, sort);
}

// --- Moderation (SPEC §4.7) ---------------------------------------------------------------

async function requireModerator(
  user: CurrentUser,
  communityId: string,
): Promise<Result<CommunityAccess>> {
  const loaded = await loadCommunityById(communityId, user);
  if (!loaded) return err(appError('NOT_FOUND', 'errors.notFound'));
  const check = canModerate(user, loaded.access);
  if (!check.allowed) return policyError(check.reason);
  return ok(loaded.access);
}

async function logAction(
  tx: Tx | typeof db,
  entry: {
    communityId: string | null;
    actorId: string;
    action: (typeof moderationActions.$inferInsert)['action'];
    targetType: string;
    targetId: string;
    reason?: string | null;
    durationHours?: number | null;
  },
) {
  await tx
    .insert(moderationActions)
    .values({ ...entry, reason: entry.reason ?? null, durationHours: entry.durationHours ?? null });
}

export type PostModeration = 'remove' | 'restore' | 'lock' | 'unlock' | 'pin' | 'unpin';

export async function moderatePost(
  user: CurrentUser,
  postId: string,
  action: PostModeration,
  reason: string | null,
): Promise<Result<void>> {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post) return err(appError('NOT_FOUND', 'errors.notFound'));
  const access = await requireModerator(user, post.communityId);
  if (!access.ok) return access;
  if (action === 'remove' && !reason)
    return err(
      appError('VALIDATION', 'errors.validation', { reason: ['validation.reasonTooShort'] }),
    );
  if (action === 'pin' && !post.pinnedAt) {
    const [pinned] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(posts)
      .where(and(eq(posts.communityId, post.communityId), isNotNull(posts.pinnedAt)));
    if ((pinned?.n ?? 0) >= MAX_PINNED) return err(appError('CONFLICT', 'errors.forum.pinLimit'));
  }
  const now = new Date();
  const patch: Partial<typeof posts.$inferInsert> =
    action === 'remove'
      ? { removedAt: now, removedReason: reason, removedById: user.id }
      : action === 'restore'
        ? { removedAt: null, removedReason: null, removedById: null }
        : action === 'lock'
          ? { lockedAt: now }
          : action === 'unlock'
            ? { lockedAt: null }
            : action === 'pin'
              ? { pinnedAt: now }
              : { pinnedAt: null };
  await db.transaction(async (tx) => {
    await tx.update(posts).set(patch).where(eq(posts.id, postId));
    await logAction(tx, {
      communityId: post.communityId,
      actorId: user.id,
      action: `${action}_post` as never,
      targetType: 'post',
      targetId: postId,
      reason,
    });
  });
  if (action === 'remove') {
    await trySendEvent(
      'moderation/decision',
      { userId: post.authorId, targetType: 'post', action: 'removed', reason },
      `mod-post-${postId}-${now.getTime()}`,
    );
  }
  return ok(undefined);
}

export async function moderateComment(
  user: CurrentUser,
  commentId: string,
  action: 'remove' | 'restore',
  reason: string | null,
): Promise<Result<void>> {
  const [row] = await db
    .select({ comment: comments, communityId: posts.communityId })
    .from(comments)
    .innerJoin(posts, eq(posts.id, comments.postId))
    .where(eq(comments.id, commentId));
  if (!row) return err(appError('NOT_FOUND', 'errors.notFound'));
  const access = await requireModerator(user, row.communityId);
  if (!access.ok) return access;
  if (action === 'remove' && !reason)
    return err(
      appError('VALIDATION', 'errors.validation', { reason: ['validation.reasonTooShort'] }),
    );
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(comments)
      .set(
        action === 'remove'
          ? { removedAt: now, removedReason: reason, removedById: user.id }
          : { removedAt: null, removedReason: null, removedById: null },
      )
      .where(eq(comments.id, commentId));
    await logAction(tx, {
      communityId: row.communityId,
      actorId: user.id,
      action: `${action}_comment` as never,
      targetType: 'comment',
      targetId: commentId,
      reason,
    });
  });
  if (action === 'remove') {
    await trySendEvent(
      'moderation/decision',
      { userId: row.comment.authorId, targetType: 'comment', action: 'removed', reason },
      `mod-comment-${commentId}-${now.getTime()}`,
    );
  }
  return ok(undefined);
}

/** Ban a member (temporary by hours, or permanent), or lift a ban. */
export async function setMemberBan(
  user: CurrentUser,
  communityId: string,
  targetUsername: string,
  hours: number | null,
  reason: string | null,
  lift = false,
): Promise<Result<void>> {
  const access = await requireModerator(user, communityId);
  if (!access.ok) return access;
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, targetUsername));
  if (!target) return err(appError('NOT_FOUND', 'errors.forum.userNotFound'));
  if (target.id === user.id) return err(appError('VALIDATION', 'errors.forum.cannotBanSelf'));
  const [member] = await db
    .select()
    .from(communityMembers)
    .where(
      and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, target.id)),
    );
  if (member && member.role !== 'member' && user.role !== 'admin')
    return err(appError('FORBIDDEN', 'errors.forum.cannotBanModerator'));
  const until = lift ? null : hours ? new Date(Date.now() + hours * 3600_000) : PERMANENT_BAN;
  await db.transaction(async (tx) => {
    if (member) {
      await tx
        .update(communityMembers)
        .set({ bannedUntil: until, banReason: lift ? null : reason })
        .where(eq(communityMembers.id, member.id));
    } else if (!lift) {
      // Banning a non-member still blocks joining and posting.
      await tx
        .insert(communityMembers)
        .values({ communityId, userId: target.id, bannedUntil: until, banReason: reason });
    }
    await logAction(tx, {
      communityId,
      actorId: user.id,
      action: lift ? 'unban_member' : 'ban_member',
      targetType: 'user',
      targetId: target.id,
      reason,
      durationHours: lift ? null : hours,
    });
  });
  if (!lift)
    await trySendEvent(
      'moderation/decision',
      { userId: target.id, targetType: 'community', action: 'banned', reason },
      `ban-${communityId}-${target.id}-${Date.now()}`,
    );
  return ok(undefined);
}

/** Owners (and admins) appoint or remove moderators. */
export async function setModerator(
  user: CurrentUser,
  communityId: string,
  targetUsername: string,
  makeModerator: boolean,
): Promise<Result<void>> {
  const loaded = await loadCommunityById(communityId, user);
  if (!loaded) return err(appError('NOT_FOUND', 'errors.notFound'));
  if (user.role !== 'admin' && loaded.access.membership?.role !== 'owner')
    return policyError('not_allowed');
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, targetUsername));
  if (!target) return err(appError('NOT_FOUND', 'errors.forum.userNotFound'));
  await db.transaction(async (tx) => {
    const [member] = await tx
      .select()
      .from(communityMembers)
      .where(
        and(eq(communityMembers.communityId, communityId), eq(communityMembers.userId, target.id)),
      );
    if (member?.role === 'owner') return;
    if (member)
      await tx
        .update(communityMembers)
        .set({ role: makeModerator ? 'moderator' : 'member' })
        .where(eq(communityMembers.id, member.id));
    else if (makeModerator) {
      await tx
        .insert(communityMembers)
        .values({ communityId, userId: target.id, role: 'moderator' });
      await tx.execute(
        sql`UPDATE communities SET member_count = member_count + 1 WHERE id = ${communityId}`,
      );
    }
    await logAction(tx, {
      communityId,
      actorId: user.id,
      action: makeModerator ? 'add_moderator' : 'remove_moderator',
      targetType: 'user',
      targetId: target.id,
    });
  });
  return ok(undefined);
}

/** Mod log — visible to the community's moderators (SPEC §4.7). */
export async function modLog(user: CurrentUser, communityId: string) {
  const access = await requireModerator(user, communityId);
  if (!access.ok) return access;
  const rows = await db
    .select({ action: moderationActions, actorName: users.name })
    .from(moderationActions)
    .leftJoin(users, eq(users.id, moderationActions.actorId))
    .where(eq(moderationActions.communityId, communityId))
    .orderBy(desc(moderationActions.createdAt))
    .limit(100);
  return ok(rows);
}

/** Open reports for content in this community. */
export async function communityReports(user: CurrentUser, communityId: string) {
  const access = await requireModerator(user, communityId);
  if (!access.ok) return access;
  const rows = await db
    .select({
      report: reports,
      post: { id: posts.id, title: posts.title, slug: posts.slug },
      comment: { id: comments.id, body: comments.body, postId: comments.postId },
    })
    .from(reports)
    .leftJoin(posts, and(eq(reports.targetType, 'post'), eq(posts.id, reports.targetId)))
    .leftJoin(comments, and(eq(reports.targetType, 'comment'), eq(comments.id, reports.targetId)))
    .where(and(eq(reports.communityId, communityId), eq(reports.status, 'open')))
    .orderBy(asc(reports.createdAt));
  return ok(rows);
}

export async function resolveCommunityReport(
  user: CurrentUser,
  reportId: string,
  resolution: 'resolved' | 'dismissed',
  note: string | null,
): Promise<Result<void>> {
  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report?.communityId) return err(appError('NOT_FOUND', 'errors.notFound'));
  const access = await requireModerator(user, report.communityId);
  if (!access.ok) return access;
  await db.transaction(async (tx) => {
    await tx
      .update(reports)
      .set({ status: resolution, resolvedById: user.id, resolvedAt: new Date(), action: note })
      .where(eq(reports.id, reportId));
    await logAction(tx, {
      communityId: report.communityId,
      actorId: user.id,
      action: resolution === 'resolved' ? 'resolve_report' : 'dismiss_report',
      targetType: 'report',
      targetId: reportId,
      reason: note,
    });
  });
  return ok(undefined);
}

export async function listBannedMembers(user: CurrentUser, communityId: string) {
  const access = await requireModerator(user, communityId);
  if (!access.ok) return access;
  const rows = await db
    .select({
      username: users.username,
      name: users.name,
      bannedUntil: communityMembers.bannedUntil,
      reason: communityMembers.banReason,
    })
    .from(communityMembers)
    .innerJoin(users, eq(users.id, communityMembers.userId))
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        gt(communityMembers.bannedUntil, new Date()),
      ),
    );
  return ok(rows);
}

/** Home feed (SPEC §4.2): hot posts from the user's communities. */
export async function feedPosts(viewer: CurrentUser, limit = 10) {
  const memberships = await db
    .select({ communityId: communityMembers.communityId })
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.userId, viewer.id),
        or(isNull(communityMembers.bannedUntil), lt(communityMembers.bannedUntil, new Date())),
      ),
    );
  return listPosts({
    viewer,
    communityIds: memberships.map((m) => m.communityId),
    sort: 'hot',
    limit,
  });
}
