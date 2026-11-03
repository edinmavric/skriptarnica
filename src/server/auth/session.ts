import { and, desc, eq, inArray } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { legalVersions } from '@/config/legal';
import { routes } from '@/config/routes';

import { db } from '../db/client';
import { consents, studentProfiles, users } from '../db/schema';

import { auth } from './auth';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  username: string | null;
  image: string | null;
  role: 'student' | 'admin';
  twoFactorEnabled: boolean;
  bannedAt: Date | null;
  /** Set while an account deletion is pending (the banner in every layout shows it). */
  deletionScheduledFor: Date | null;
  sessionId: string;
  /** Set when an admin is viewing as this user (read-only impersonation). */
  impersonatedBy: string | null;
}

/** Session lookup, memoized per request. */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      username: users.username,
      image: users.image,
      role: users.role,
      twoFactorEnabled: users.twoFactorEnabled,
      bannedAt: users.bannedAt,
      deletedAt: users.deletedAt,
      deletionScheduledFor: users.deletionScheduledFor,
    })
    .from(users)
    .where(eq(users.id, session.user.id));
  if (!row || row.deletedAt || row.bannedAt) return null;
  const impersonatedBy =
    (session.session as { impersonatedBy?: string | null }).impersonatedBy ?? null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    username: row.username,
    image: row.image,
    role: row.role,
    twoFactorEnabled: row.twoFactorEnabled,
    bannedAt: row.bannedAt,
    deletionScheduledFor: row.deletionScheduledFor,
    sessionId: session.session.id,
    impersonatedBy,
  };
});

async function currentPath(): Promise<string> {
  return (await headers()).get('x-pathname') ?? '/';
}

/** Redirects guests to sign-in (returning to the current page afterwards). */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`${routes.signIn}?next=${encodeURIComponent(await currentPath())}`);
  }
  return user;
}

/**
 * Whether the user has accepted the current Terms and Privacy Policy versions (SPEC §7.4).
 * Memoized per request: the layout and the page both check it.
 */
export const hasCurrentConsents = cache(async (userId: string): Promise<boolean> => {
  const rows = await db
    .select({ type: consents.type, version: consents.documentVersion, value: consents.value })
    .from(consents)
    .where(and(eq(consents.userId, userId), inArray(consents.type, ['terms', 'privacy', 'age_15'])))
    .orderBy(desc(consents.createdAt));
  const latest = new Map<string, { version: string; value: boolean }>();
  for (const row of rows) if (!latest.has(row.type)) latest.set(row.type, row);
  const terms = latest.get('terms');
  const privacy = latest.get('privacy');
  const age = latest.get('age_15');
  return Boolean(
    terms?.value &&
    terms.version === legalVersions.terms &&
    privacy?.value &&
    privacy.version === legalVersions.privacy &&
    age?.value,
  );
});

/**
 * Guard for the logged-in area: signed in, current terms accepted (e.g. Google sign-ups and
 * version bumps go to the acceptance page first).
 */
export async function requireAppUser(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!(await hasCurrentConsents(user.id))) {
    redirect(`${routes.acceptTerms}?next=${encodeURIComponent(await currentPath())}`);
  }
  return user;
}

/** Memoized per request (layouts, pages and the feed all read it). */
export const getStudentProfile = cache(async (userId: string) => {
  const [profile] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId));
  return profile ?? null;
});
