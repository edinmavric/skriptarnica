import { and, count, desc, eq, isNull, sql, sum } from 'drizzle-orm';

import { db } from '../db/client';
import {
  comments,
  communities,
  faculties,
  follows,
  notes,
  posts,
  sellerProfiles,
  studentProfiles,
  studyPrograms,
  universities,
  users,
} from '../db/schema';
import type { CurrentUser } from '../auth/session';
import { publishedNotesBase, toNoteCards } from './note-pages';

export interface PublicProfile {
  id: string;
  name: string;
  username: string;
  image: string | null;
  bio: string | null;
  joinedAt: string;
  faculty: { name: string; slug: string; university: string } | null;
  program: string | null;
  verifiedStudent: boolean;
  isSeller: boolean;
  soldCount: number;
  followers: number;
  viewerFollows: boolean;
  isSelf: boolean;
  showActivity: boolean;
}

/**
 * Public profile (SPEC §4.8). Deleted and banned users have none. Faculty and program only
 * when the user made them public; anonymous posts and comments are never listed, and posts in
 * faculty-only communities only for viewers of that faculty.
 */
export async function getPublicProfile(
  username: string,
  viewer: CurrentUser | null,
): Promise<PublicProfile | null> {
  const [row] = await db
    .select({
      user: {
        id: users.id,
        name: users.name,
        username: users.username,
        image: users.image,
        createdAt: users.createdAt,
        deletedAt: users.deletedAt,
        bannedAt: users.bannedAt,
      },
      profile: studentProfiles,
      facultyName: faculties.name,
      facultySlug: faculties.slug,
      universityName: universities.name,
      programName: studyPrograms.name,
      sellerStatus: sellerProfiles.status,
    })
    .from(users)
    .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .leftJoin(faculties, eq(faculties.id, studentProfiles.facultyId))
    .leftJoin(universities, eq(universities.id, faculties.universityId))
    .leftJoin(studyPrograms, eq(studyPrograms.id, studentProfiles.programId))
    .leftJoin(sellerProfiles, eq(sellerProfiles.userId, users.id))
    .where(sql`lower(${users.username}) = ${username.toLowerCase()}`);
  if (!row || !row.user.username || row.user.deletedAt || row.user.bannedAt) return null;
  const userId = row.user.id;
  const [[sold], [followers], [following]] = await Promise.all([
    db
      .select({ total: sum(notes.salesCount) })
      .from(notes)
      .where(eq(notes.sellerId, userId)),
    db
      .select({ value: count() })
      .from(follows)
      .where(and(eq(follows.targetType, 'seller'), eq(follows.targetId, userId))),
    viewer
      ? db
          .select({ value: count() })
          .from(follows)
          .where(
            and(
              eq(follows.userId, viewer.id),
              eq(follows.targetType, 'seller'),
              eq(follows.targetId, userId),
            ),
          )
      : Promise.resolve([{ value: 0 }]),
  ]);
  const showFaculty = row.profile?.showFaculty ?? true;
  return {
    id: userId,
    name: row.user.name,
    username: row.user.username,
    image: row.user.image,
    bio: row.profile?.bio ?? null,
    joinedAt: row.user.createdAt.toISOString(),
    faculty:
      showFaculty && row.facultyName && row.facultySlug
        ? { name: row.facultyName, slug: row.facultySlug, university: row.universityName ?? '' }
        : null,
    program: showFaculty && (row.profile?.showProgram ?? true) ? (row.programName ?? null) : null,
    verifiedStudent: Boolean(row.profile?.studentVerifiedAt),
    isSeller: row.sellerStatus === 'active',
    soldCount: Number(sold?.total ?? 0),
    followers: followers?.value ?? 0,
    viewerFollows: (following?.value ?? 0) > 0,
    isSelf: viewer?.id === userId,
    showActivity: (row.profile?.showActivity ?? true) || viewer?.id === userId,
  };
}

export async function profileNotes(userId: string) {
  const rows = await publishedNotesBase()
    .where(and(eq(notes.sellerId, userId), eq(notes.status, 'published'), isNull(notes.deletedAt)))
    .orderBy(desc(notes.salesCount))
    .limit(12);
  return toNoteCards(rows);
}

/** Faculty-only communities are visible only to viewers of that faculty. */
async function visibleCommunityFilter(viewer: CurrentUser | null) {
  if (!viewer) return sql`${communities.visibility} = 'public'`;
  return sql`(${communities.visibility} = 'public' OR ${communities.facultyId} = (SELECT faculty_id FROM student_profiles WHERE user_id = ${viewer.id}))`;
}

export async function profileActivity(userId: string, viewer: CurrentUser | null) {
  const visible = await visibleCommunityFilter(viewer);
  const [postRows, commentRows] = await Promise.all([
    db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        score: posts.score,
        commentCount: posts.commentCount,
        createdAt: posts.createdAt,
        community: communities.slug,
      })
      .from(posts)
      .innerJoin(communities, eq(communities.id, posts.communityId))
      .where(
        and(
          eq(posts.authorId, userId),
          eq(posts.isAnonymous, false),
          isNull(posts.removedAt),
          isNull(posts.deletedAt),
          visible,
        ),
      )
      .orderBy(desc(posts.createdAt))
      .limit(10),
    db
      .select({
        id: comments.id,
        body: comments.body,
        createdAt: comments.createdAt,
        postId: posts.id,
        postTitle: posts.title,
        postSlug: posts.slug,
        community: communities.slug,
      })
      .from(comments)
      .innerJoin(posts, eq(posts.id, comments.postId))
      .innerJoin(communities, eq(communities.id, posts.communityId))
      .where(
        and(
          eq(comments.authorId, userId),
          eq(comments.isAnonymous, false),
          isNull(comments.removedAt),
          isNull(comments.deletedAt),
          isNull(posts.removedAt),
          isNull(posts.deletedAt),
          visible,
        ),
      )
      .orderBy(desc(comments.createdAt))
      .limit(10),
  ]);
  return { posts: postRows, comments: commentRows };
}
