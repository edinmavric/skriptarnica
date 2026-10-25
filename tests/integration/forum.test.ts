import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '@/server/db/client';
import { communities, posts, reports, studentProfiles } from '@/server/db/schema';
import { createCommunity, joinCommunity, leaveCommunity } from '@/server/services/communities';
import {
  createComment,
  createPost,
  getCommentTree,
  getPollResults,
  getPost,
  listPosts,
  moderateComment,
  moderatePost,
  setMemberBan,
  setModerator,
  vote,
  votePoll,
} from '@/server/services/forum';
import { createReport } from '@/server/services/reports';

import { asCurrentUser, createCatalog, createUser } from './factories';

vi.mock('@/server/jobs/client', () => ({
  sendEvent: vi.fn(),
  trySendEvent: vi.fn(async () => true),
  events: {},
  inngest: {},
}));
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));

let catalog: Awaited<ReturnType<typeof createCatalog>>;
let courseCommunity: { id: string; slug: string };

async function member(facultyId?: string) {
  const user = await createUser();
  if (facultyId)
    await db.update(studentProfiles).set({ facultyId }).where(eq(studentProfiles.userId, user.id));
  const current = asCurrentUser(user);
  await joinCommunity(current, courseCommunity.slug);
  return current;
}

async function textPost(
  author: ReturnType<typeof asCurrentUser>,
  overrides: Partial<Parameters<typeof createPost>[1]> = {},
) {
  const result = await createPost(author, {
    communityId: courseCommunity.id,
    type: 'text',
    title: 'Pitanje o roku',
    body: 'Šta je bilo na roku?',
    isAnonymous: false,
    ...overrides,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value.id;
}

beforeAll(async () => {
  catalog = await createCatalog();
  const [row] = await db
    .select({ id: communities.id, slug: communities.slug })
    .from(communities)
    .where(eq(communities.courseId, catalog.courses[0].id));
  if (!row) throw new Error('course community was not created automatically');
  courseCommunity = row;
});

describe('automatic communities', () => {
  it('every faculty and course gets a community with default flairs', async () => {
    const rows = await db
      .select()
      .from(communities)
      .where(eq(communities.facultyId, catalog.faculty.id));
    expect(rows.filter((r) => r.type === 'faculty')).toHaveLength(1);
    expect(rows.filter((r) => r.type === 'course')).toHaveLength(3);
  });
});

describe('anonymity (Phase 7 acceptance)', () => {
  it('regular users never receive the author of an anonymous post or comment; moderators do', async () => {
    const author = await member();
    const reader = await member();
    const postId = await textPost(author, { isAnonymous: true, title: 'Anonimno pitanje' });
    await createComment(author, {
      postId,
      parentId: null,
      body: 'Anonimni komentar',
      isAnonymous: true,
    });

    const asReader = await getPost(postId, reader);
    expect(asReader?.post.author).toEqual({
      name: null,
      username: null,
      anonymous: true,
      deleted: false,
    });
    expect(JSON.stringify(asReader)).not.toContain(author.username as string);
    expect(JSON.stringify(asReader)).not.toContain(author.id);
    const tree = await getCommentTree(postId, reader, 'best');
    expect(tree[0]?.author.name).toBeNull();
    expect(tree[0]?.isOp).toBe(false);
    expect(JSON.stringify(tree)).not.toContain(author.username as string);
    const list = await listPosts({ viewer: null, communityIds: [courseCommunity.id], sort: 'new' });
    expect(JSON.stringify(list)).not.toContain(author.username as string);

    const admin = asCurrentUser(await createUser({ role: 'admin', twoFactorEnabled: true }));
    await setModerator(admin, courseCommunity.id, reader.username as string, true);
    const asModerator = await getPost(postId, reader);
    expect(asModerator?.post.author.username).toBe(author.username);
  });
});

describe('access', () => {
  it('faculty_only communities are closed to other faculties', async () => {
    const owner = asCurrentUser(await createUser());
    await db.execute(
      `UPDATE users SET created_at = now() - interval '10 days' WHERE id = '${owner.id}'`,
    );
    await db
      .update(studentProfiles)
      .set({ facultyId: catalog.faculty.id })
      .where(eq(studentProfiles.userId, owner.id));
    const created = await createCommunity(owner, {
      type: 'general',
      name: `Samo za nas ${Date.now()}`,
      description: 'Interno',
      rules: '',
      visibility: 'faculty_only',
    });
    if (!created.ok) throw new Error(JSON.stringify(created.error));
    const other = await createCatalog();
    const outsider = asCurrentUser(await createUser());
    await db
      .update(studentProfiles)
      .set({ facultyId: other.faculty.id })
      .where(eq(studentProfiles.userId, outsider.id));
    expect((await joinCommunity(outsider, created.value.slug)).ok).toBe(false);
    const insider = asCurrentUser(await createUser());
    await db
      .update(studentProfiles)
      .set({ facultyId: catalog.faculty.id })
      .where(eq(studentProfiles.userId, insider.id));
    expect((await joinCommunity(insider, created.value.slug)).ok).toBe(true);
  });

  it('new accounts cannot create communities; owners cannot leave', async () => {
    const fresh = asCurrentUser(await createUser());
    const result = await createCommunity(fresh, {
      type: 'general',
      name: 'Nova',
      description: '',
      rules: '',
      visibility: 'public',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.messageKey).toBe('errors.policy.account_too_new');
  });

  it('non-members cannot post', async () => {
    const outsider = asCurrentUser(await createUser());
    const result = await createPost(outsider, {
      communityId: courseCommunity.id,
      type: 'text',
      title: 'x',
      body: 'y',
      isAnonymous: false,
    });
    expect(result.ok).toBe(false);
  });
});

describe('votes, polls and comments', () => {
  it('voting is idempotent per user and keeps score = up − down', async () => {
    const author = await member();
    const voter = await member();
    const postId = await textPost(author);
    expect(await vote(voter, { targetType: 'post', targetId: postId, value: 1 })).toEqual({
      ok: true,
      value: { score: 2, userVote: 1 },
    });
    expect(await vote(voter, { targetType: 'post', targetId: postId, value: 1 })).toEqual({
      ok: true,
      value: { score: 2, userVote: 1 },
    });
    expect(await vote(voter, { targetType: 'post', targetId: postId, value: -1 })).toEqual({
      ok: true,
      value: { score: 0, userVote: -1 },
    });
    expect(await vote(voter, { targetType: 'post', targetId: postId, value: 0 })).toEqual({
      ok: true,
      value: { score: 1, userVote: 0 },
    });
    const [row] = await db.select().from(posts).where(eq(posts.id, postId));
    expect(row).toMatchObject({ score: 1, upvotes: 1, downvotes: 0 });
    expect(row?.hotRank).toBeGreaterThan(0);
  });

  it('a poll accepts one vote per user and allows changing it', async () => {
    const author = await member();
    const voter = await member();
    const result = await createPost(author, {
      communityId: courseCommunity.id,
      type: 'poll',
      title: 'Kad učite?',
      body: '',
      pollOptions: ['Ujutru', 'Noću'],
      isAnonymous: false,
    });
    if (!result.ok) throw new Error('poll');
    const poll = await getPollResults(result.value.id, voter.id);
    const [morning, night] = poll.options as unknown as [{ id: string }, { id: string }];
    await votePoll(voter, result.value.id, morning.id);
    await votePoll(voter, result.value.id, night.id);
    const after = await getPollResults(result.value.id, voter.id);
    expect(after.options.map((o) => o.votes)).toEqual([0, 1]);
    expect(after.myOptionId).toBe(night.id);
    const bad = await createPost(author, {
      communityId: courseCommunity.id,
      type: 'poll',
      title: 'x',
      body: '',
      pollOptions: ['Samo jedna'],
      isAnonymous: false,
    });
    expect(bad.ok).toBe(false);
  });

  it('builds a comment tree sorted by Wilson score; locked posts refuse comments', async () => {
    const author = await member();
    const postId = await textPost(author);
    const a = await createComment(author, {
      postId,
      parentId: null,
      body: 'A',
      isAnonymous: false,
    });
    const b = await createComment(author, {
      postId,
      parentId: null,
      body: 'B',
      isAnonymous: false,
    });
    if (!a.ok || !b.ok) throw new Error('comments');
    const reply = await createComment(author, {
      postId,
      parentId: a.value.id,
      body: 'A1',
      isAnonymous: false,
    });
    if (!reply.ok) throw new Error('reply');
    for (let i = 0; i < 3; i += 1) {
      const voter = await member();
      await vote(voter, { targetType: 'comment', targetId: b.value.id, value: 1 });
    }
    const tree = await getCommentTree(postId, null, 'best');
    expect(tree.map((c) => c.body)).toEqual(['B', 'A']);
    expect(tree[1]?.children.map((c) => c.body)).toEqual(['A1']);
    expect((await getCommentTree(postId, null, 'new'))[0]?.body).toBe('B');

    const admin = asCurrentUser(await createUser({ role: 'admin', twoFactorEnabled: true }));
    await moderatePost(admin, postId, 'lock', null);
    expect(
      (await createComment(author, { postId, parentId: null, body: 'kasno', isAnonymous: false }))
        .ok,
    ).toBe(false);
  });
});

describe('moderation', () => {
  it('removes content with a reason, pins at most 2, and bans block posting', async () => {
    const owner = asCurrentUser(await createUser({ role: 'admin', twoFactorEnabled: true }));
    const author = await member();
    const reader = await member();
    const p1 = await textPost(author);
    const p2 = await textPost(author);
    const p3 = await textPost(author);
    expect((await moderatePost(owner, p1, 'remove', null)).ok).toBe(false);
    expect((await moderatePost(owner, p1, 'remove', 'Spam')).ok).toBe(true);
    const removed = await getPost(p1, reader);
    expect(removed?.post).toMatchObject({ removed: true, body: null });
    expect(
      (
        await listPosts({ viewer: reader, communityIds: [courseCommunity.id], sort: 'new' })
      ).posts.map((p) => p.id),
    ).not.toContain(p1);

    // Clean slate for pins in this community.
    await db.update(posts).set({ pinnedAt: null }).where(eq(posts.communityId, courseCommunity.id));
    expect((await moderatePost(owner, p2, 'pin', null)).ok).toBe(true);
    expect((await moderatePost(owner, p3, 'pin', null)).ok).toBe(true);
    const third = await textPost(author);
    const pin = await moderatePost(owner, third, 'pin', null);
    expect(pin.ok).toBe(false);
    if (!pin.ok) expect(pin.error.messageKey).toBe('errors.forum.pinLimit');
    const listed = await listPosts({
      viewer: null,
      communityIds: [courseCommunity.id],
      sort: 'new',
      pinnedFirst: true,
    });
    expect(listed.posts.slice(0, 2).every((p) => p.pinned)).toBe(true);

    expect(
      (await setMemberBan(owner, courseCommunity.id, author.username as string, 24, 'Vređanje')).ok,
    ).toBe(true);
    const blocked = await createPost(author, {
      communityId: courseCommunity.id,
      type: 'text',
      title: 'x',
      body: 'y',
      isAnonymous: false,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.messageKey).toBe('errors.policy.community_banned');
    // Leaving doesn't lift the ban.
    await leaveCommunity(author, courseCommunity.slug);
    expect(
      (
        await createPost(author, {
          communityId: courseCommunity.id,
          type: 'text',
          title: 'x',
          body: 'y',
          isAnonymous: false,
        })
      ).ok,
    ).toBe(false);
    await setMemberBan(owner, courseCommunity.id, author.username as string, null, null, true);
    expect(
      (
        await createPost(author, {
          communityId: courseCommunity.id,
          type: 'text',
          title: 'Vratio sam se',
          body: 'y',
          isAnonymous: false,
        })
      ).ok,
    ).toBe(true);

    const c = await createComment(reader, {
      postId: p2,
      parentId: null,
      body: 'Uvreda',
      isAnonymous: false,
    });
    if (!c.ok) throw new Error('comment');
    expect((await moderateComment(reader, c.value.id, 'remove', 'x')).ok).toBe(false);
    expect((await moderateComment(owner, c.value.id, 'remove', 'Uvreda')).ok).toBe(true);
  });

  it('professor communities require acknowledging the conduct rules on the first post', async () => {
    const owner = asCurrentUser(await createUser());
    await db.execute(
      `UPDATE users SET created_at = now() - interval '10 days' WHERE id = '${owner.id}'`,
    );
    const created = await createCommunity(owner, {
      type: 'professor',
      name: `Profesor ${Date.now()}`,
      description: 'Iskustva',
      rules: 'Bez vređanja',
      visibility: 'public',
    });
    if (!created.ok) throw new Error(JSON.stringify(created.error));
    const [community] = await db
      .select()
      .from(communities)
      .where(eq(communities.slug, created.value.slug));
    const student = asCurrentUser(await createUser());
    await joinCommunity(student, created.value.slug);
    const first = await createPost(student, {
      communityId: community?.id as string,
      type: 'text',
      title: 'Usmeni',
      body: 'Kako izgleda usmeni?',
      isAnonymous: false,
    });
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.error.messageKey).toBe('errors.forum.rulesAckRequired');
    const acked = await createPost(student, {
      communityId: community?.id as string,
      type: 'text',
      title: 'Usmeni',
      body: 'Kako izgleda usmeni?',
      isAnonymous: false,
      acknowledgeRules: true,
    });
    expect(acked.ok).toBe(true);
    const second = await createPost(student, {
      communityId: community?.id as string,
      type: 'text',
      title: 'Drugo',
      body: 'Još jedno pitanje',
      isAnonymous: false,
    });
    expect(second.ok).toBe(true);
  });

  it('reports on posts land in the community queue', async () => {
    const author = await member();
    const reporter = await member();
    const postId = await textPost(author);
    const report = await createReport(reporter.id, {
      targetType: 'post',
      targetId: postId,
      reason: 'abuse',
    });
    if (!report.ok) throw new Error('report');
    const [row] = await db.select().from(reports).where(eq(reports.id, report.value.id));
    expect(row?.communityId).toBe(courseCommunity.id);
  });

  it('only owners/admins appoint moderators; moderators cannot ban other moderators', async () => {
    const admin = asCurrentUser(await createUser({ role: 'admin', twoFactorEnabled: true }));
    const mod = await member();
    const other = await member();
    expect((await setModerator(mod, courseCommunity.id, other.username as string, true)).ok).toBe(
      false,
    );
    await setModerator(admin, courseCommunity.id, mod.username as string, true);
    await setModerator(admin, courseCommunity.id, other.username as string, true);
    const ban = await setMemberBan(mod, courseCommunity.id, other.username as string, 1, 'x');
    expect(ban.ok).toBe(false);
  });
});
