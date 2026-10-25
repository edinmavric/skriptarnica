import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { appError, err, ok, type Result } from '@/lib/result';
import { normalizeForSearch } from '@/lib/search/normalize';
import { slugify } from '@/lib/slug';

import type { CurrentUser } from '../auth/session';
import { db } from '../db/client';
import {
  communities,
  communityFlairs,
  communityMembers,
  courses,
  faculties,
  professors,
  studentProfiles,
  users,
} from '../db/schema';
import type { DbOrTx } from '../db/types';
import {
  canCreateCommunity,
  canReadCommunity,
  isCommunityModerator,
  type CommunityAccess,
} from '../policies/forum';

import { getSettings } from './settings';

export type Community = typeof communities.$inferSelect;

/** Default flairs (SPEC §3.5): Question, Exam period, Material, Experience, Results. */
export const DEFAULT_FLAIRS = ['Pitanje', 'Rok', 'Materijal', 'Iskustvo', 'Rezultati'];

async function addDefaultFlairs(tx: DbOrTx, communityId: string) {
  await tx
    .insert(communityFlairs)
    .values(DEFAULT_FLAIRS.map((name, position) => ({ communityId, name, position })))
    .onConflictDoNothing();
}

async function uniqueCommunitySlug(tx: DbOrTx, base: string): Promise<string> {
  const slug = base.slice(0, 60).replace(/-+$/, '') || 'zajednica';
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    const [taken] = await tx
      .select({ id: communities.id })
      .from(communities)
      .where(eq(communities.slug, candidate));
    if (!taken) return candidate;
  }
  return `${slug}-${uuidv7().slice(-6)}`;
}

/** Automatic faculty community (SPEC §4.7), owner = system. Idempotent. */
export async function ensureFacultyCommunity(
  tx: DbOrTx,
  faculty: { id: string; name: string; shortName: string; slug: string; city: string },
): Promise<string> {
  const [existing] = await tx
    .select({ id: communities.id })
    .from(communities)
    .where(and(eq(communities.type, 'faculty'), eq(communities.facultyId, faculty.id)));
  if (existing) return existing.id;
  const id = uuidv7();
  await tx.insert(communities).values({
    id,
    type: 'faculty',
    facultyId: faculty.id,
    name: faculty.name,
    slug: await uniqueCommunitySlug(tx, faculty.slug),
    description: `Zajednica studenata: ${faculty.name} (${faculty.city}).`,
    searchText: normalizeForSearch(`${faculty.name} ${faculty.shortName} ${faculty.city}`),
  });
  await addDefaultFlairs(tx, id);
  return id;
}

/** Automatic course community, e.g. z/oet1-etf-bg. Idempotent. */
export async function ensureCourseCommunity(
  tx: DbOrTx,
  course: { id: string; name: string; code: string | null; slug: string },
  faculty: { id: string; shortName: string; slug: string },
): Promise<string> {
  const [existing] = await tx
    .select({ id: communities.id })
    .from(communities)
    .where(and(eq(communities.type, 'course'), eq(communities.courseId, course.id)));
  if (existing) return existing.id;
  const id = uuidv7();
  const base = `${course.code ? slugify(course.code) : course.slug}-${faculty.slug}`;
  await tx.insert(communities).values({
    id,
    type: 'course',
    facultyId: faculty.id,
    courseId: course.id,
    name: `${course.name} (${faculty.shortName})`,
    slug: await uniqueCommunitySlug(tx, base),
    description: `Pitanja, rokovi i iskustva za predmet ${course.name}.`,
    searchText: normalizeForSearch(`${course.name} ${course.code ?? ''} ${faculty.shortName}`),
  });
  await addDefaultFlairs(tx, id);
  return id;
}

/** Backfill for the whole catalog (seed, admin catalog import). */
export async function ensureCatalogCommunities(): Promise<number> {
  const facultyRows = await db.select().from(faculties);
  let created = 0;
  for (const faculty of facultyRows) {
    const before = await db.select({ n: sql<number>`count(*)::int` }).from(communities);
    await ensureFacultyCommunity(db, faculty);
    const courseRows = await db.select().from(courses).where(eq(courses.facultyId, faculty.id));
    for (const course of courseRows) await ensureCourseCommunity(db, course, faculty);
    const after = await db.select({ n: sql<number>`count(*)::int` }).from(communities);
    created += (after[0]?.n ?? 0) - (before[0]?.n ?? 0);
  }
  return created;
}

export interface LoadedCommunity {
  community: Community;
  access: CommunityAccess;
  isModerator: boolean;
}

/** Community + the viewer's access facts (membership, faculty). */
export async function loadCommunity(
  slug: string,
  viewer: CurrentUser | null,
  tx: DbOrTx = db,
): Promise<LoadedCommunity | null> {
  const [community] = await tx.select().from(communities).where(eq(communities.slug, slug));
  if (!community) return null;
  return withAccess(community, viewer, tx);
}

export async function loadCommunityById(
  id: string,
  viewer: CurrentUser | null,
  tx: DbOrTx = db,
): Promise<LoadedCommunity | null> {
  const [community] = await tx.select().from(communities).where(eq(communities.id, id));
  return community ? withAccess(community, viewer, tx) : null;
}

async function withAccess(
  community: Community,
  viewer: CurrentUser | null,
  tx: DbOrTx,
): Promise<LoadedCommunity> {
  let membership: CommunityAccess['membership'] = null;
  let viewerFacultyId: string | null = null;
  if (viewer) {
    const [[member], [profile]] = await Promise.all([
      tx
        .select({ role: communityMembers.role, bannedUntil: communityMembers.bannedUntil })
        .from(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, community.id),
            eq(communityMembers.userId, viewer.id),
          ),
        ),
      tx
        .select({ facultyId: studentProfiles.facultyId })
        .from(studentProfiles)
        .where(eq(studentProfiles.userId, viewer.id)),
    ]);
    membership = member ?? null;
    viewerFacultyId = profile?.facultyId ?? null;
  }
  const access: CommunityAccess = {
    visibility: community.visibility,
    facultyId: community.facultyId,
    viewerFacultyId,
    membership,
  };
  return { community, access, isModerator: isCommunityModerator(viewer, access) };
}

export async function joinCommunity(user: CurrentUser, slug: string): Promise<Result<void>> {
  const loaded = await loadCommunity(slug, user);
  if (!loaded) return err(appError('NOT_FOUND', 'errors.notFound'));
  const read = canReadCommunity(user, loaded.access);
  if (!read.allowed) return err(appError('FORBIDDEN', `errors.policy.${read.reason}`));
  if (loaded.access.membership) return ok(undefined);
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(communityMembers)
      .values({ communityId: loaded.community.id, userId: user.id })
      .onConflictDoNothing()
      .returning({ id: communityMembers.id });
    if (inserted.length > 0)
      await tx.execute(
        sql`UPDATE communities SET member_count = member_count + 1 WHERE id = ${loaded.community.id}`,
      );
  });
  return ok(undefined);
}

export async function leaveCommunity(user: CurrentUser, slug: string): Promise<Result<void>> {
  const loaded = await loadCommunity(slug, user);
  if (!loaded?.access.membership) return ok(undefined);
  if (loaded.access.membership.role === 'owner')
    return err(appError('CONFLICT', 'errors.forum.ownerCannotLeave'));
  // Banned members stay recorded so leaving doesn't lift the ban.
  if (loaded.access.membership.bannedUntil && loaded.access.membership.bannedUntil > new Date())
    return ok(undefined);
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(communityMembers)
      .where(
        and(
          eq(communityMembers.communityId, loaded.community.id),
          eq(communityMembers.userId, user.id),
        ),
      )
      .returning({ id: communityMembers.id });
    if (removed.length > 0)
      await tx.execute(
        sql`UPDATE communities SET member_count = greatest(member_count - 1, 0) WHERE id = ${loaded.community.id}`,
      );
  });
  return ok(undefined);
}

export interface CreateCommunityInput {
  type: 'professor' | 'exam' | 'general';
  name: string;
  description: string;
  rules: string;
  visibility: 'public' | 'faculty_only';
  professorId?: string | null | undefined;
  courseId?: string | null | undefined;
}

/** User-created community (SPEC §4.7); the creator becomes owner. */
export async function createCommunity(
  user: CurrentUser,
  input: CreateCommunityInput,
): Promise<Result<{ slug: string }>> {
  const settings = await getSettings();
  const [[account], [owned], [profile]] = await Promise.all([
    db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, user.id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(communities)
      .where(eq(communities.createdById, user.id)),
    db
      .select({ facultyId: studentProfiles.facultyId })
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, user.id)),
  ]);
  const check = canCreateCommunity(
    user,
    { accountCreatedAt: account?.createdAt ?? new Date(), ownedCount: owned?.n ?? 0 },
    {
      minAgeDays: settings.minAccountAgeDaysToCreateCommunity,
      maxOwned: settings.maxCommunitiesPerUser,
    },
  );
  if (!check.allowed) return err(appError('FORBIDDEN', `errors.policy.${check.reason}`));
  if (input.visibility === 'faculty_only' && !profile?.facultyId)
    return err(appError('VALIDATION', 'errors.forum.facultyRequired'));
  let facultyId = profile?.facultyId ?? null;
  if (input.professorId) {
    const [professor] = await db
      .select({ facultyId: professors.facultyId })
      .from(professors)
      .where(eq(professors.id, input.professorId));
    if (!professor) return err(appError('VALIDATION', 'errors.validation'));
    facultyId = professor.facultyId;
  }
  const id = uuidv7();
  const slug = await db.transaction(async (tx) => {
    const finalSlug = await uniqueCommunitySlug(tx, slugify(input.name, 50));
    await tx.insert(communities).values({
      id,
      type: input.type,
      facultyId,
      professorId: input.professorId ?? null,
      courseId: input.courseId ?? null,
      name: input.name,
      slug: finalSlug,
      description: input.description,
      rules: input.rules,
      visibility: input.visibility,
      createdById: user.id,
      memberCount: 1,
      searchText: normalizeForSearch(`${input.name} ${input.description}`),
    });
    await tx.insert(communityMembers).values({ communityId: id, userId: user.id, role: 'owner' });
    await addDefaultFlairs(tx, id);
    return finalSlug;
  });
  return ok({ slug });
}

/** Communities list (SPEC §4.7): the viewer's own, suggested for their faculty, popular public ones. */
export async function listCommunitiesForViewer(viewer: CurrentUser | null) {
  const profile = viewer
    ? (
        await db
          .select({ facultyId: studentProfiles.facultyId })
          .from(studentProfiles)
          .where(eq(studentProfiles.userId, viewer.id))
      )[0]
    : undefined;
  const mine = viewer
    ? await db
        .select({ community: communities, role: communityMembers.role })
        .from(communityMembers)
        .innerJoin(communities, eq(communities.id, communityMembers.communityId))
        .where(
          and(
            eq(communityMembers.userId, viewer.id),
            or(isNull(communityMembers.bannedUntil), sql`${communityMembers.bannedUntil} < now()`),
          ),
        )
        .orderBy(desc(communities.memberCount))
    : [];
  const mineIds = mine.map((row) => row.community.id);
  const visible = profile?.facultyId
    ? or(eq(communities.visibility, 'public'), eq(communities.facultyId, profile.facultyId))
    : eq(communities.visibility, 'public');
  const suggested = profile?.facultyId
    ? await db
        .select()
        .from(communities)
        .where(
          and(
            eq(communities.facultyId, profile.facultyId),
            visible,
            mineIds.length ? sql`${communities.id} NOT IN ${mineIds}` : undefined,
          ),
        )
        .orderBy(asc(communities.type), desc(communities.memberCount))
        .limit(12)
    : [];
  const popular = await db
    .select()
    .from(communities)
    .where(and(visible, mineIds.length ? sql`${communities.id} NOT IN ${mineIds}` : undefined))
    .orderBy(desc(communities.memberCount), desc(communities.postCount))
    .limit(12);
  return { mine, suggested, popular: popular.filter((c) => !suggested.some((s) => s.id === c.id)) };
}

export async function listModerators(communityId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      username: users.username,
      role: communityMembers.role,
    })
    .from(communityMembers)
    .innerJoin(users, eq(users.id, communityMembers.userId))
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        inArray(communityMembers.role, ['moderator', 'owner']),
      ),
    );
}

export async function listFlairs(communityId: string) {
  return db
    .select()
    .from(communityFlairs)
    .where(eq(communityFlairs.communityId, communityId))
    .orderBy(asc(communityFlairs.position));
}

export async function communityForCourse(courseId: string) {
  const [row] = await db
    .select({
      slug: communities.slug,
      name: communities.name,
      memberCount: communities.memberCount,
    })
    .from(communities)
    .where(and(eq(communities.type, 'course'), eq(communities.courseId, courseId)));
  return row ?? null;
}

export async function communityForFaculty(facultyId: string) {
  const [row] = await db
    .select({
      slug: communities.slug,
      name: communities.name,
      memberCount: communities.memberCount,
    })
    .from(communities)
    .where(and(eq(communities.type, 'faculty'), eq(communities.facultyId, facultyId)));
  return row ?? null;
}

export async function communitiesForProfessor(professorId: string) {
  return db
    .select({ slug: communities.slug, name: communities.name })
    .from(communities)
    .where(
      and(eq(communities.professorId, professorId), ne(communities.visibility, 'faculty_only')),
    );
}
