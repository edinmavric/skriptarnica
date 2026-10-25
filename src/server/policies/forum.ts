import type { CurrentUser } from '../auth/session';

import { canParticipate, type PolicyResult } from './index';

/** Facts the forum policies need, loaded once per request by the service. */
export interface CommunityAccess {
  visibility: 'public' | 'faculty_only';
  facultyId: string | null;
  viewerFacultyId: string | null;
  membership: { role: 'member' | 'moderator' | 'owner'; bannedUntil: Date | null } | null;
}

const allow: PolicyResult = { allowed: true };
const deny = (reason: Extract<PolicyResult, { allowed: false }>['reason']): PolicyResult => ({
  allowed: false,
  reason,
});

export function isCommunityModerator(user: CurrentUser | null, access: CommunityAccess): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return access.membership?.role === 'moderator' || access.membership?.role === 'owner';
}

export function isBanned(access: CommunityAccess, now = new Date()): boolean {
  return Boolean(access.membership?.bannedUntil && access.membership.bannedUntil > now);
}

/** faculty_only communities are readable only by students of that faculty (and admins). */
export function canReadCommunity(user: CurrentUser | null, access: CommunityAccess): PolicyResult {
  if (access.visibility === 'public') return allow;
  if (user?.role === 'admin') return allow;
  if (!user) return deny('unauthenticated');
  if (access.facultyId && access.viewerFacultyId === access.facultyId) return allow;
  return deny('faculty_only');
}

/** Posting/commenting/voting: verified, can read, member, not banned. */
export function canPostInCommunity(
  user: CurrentUser | null,
  access: CommunityAccess,
): PolicyResult {
  const base = canParticipate(user);
  if (!base.allowed) return base;
  const read = canReadCommunity(user, access);
  if (!read.allowed) return read;
  if (isBanned(access)) return deny('community_banned');
  if (!access.membership) return deny('not_member');
  return allow;
}

export function canModerate(user: CurrentUser | null, access: CommunityAccess): PolicyResult {
  const base = canParticipate(user);
  if (!base.allowed) return base;
  return isCommunityModerator(user, access) ? allow : deny('not_moderator');
}

/** User-created communities (SPEC §4.7): verified, account ≥ N days old, at most N owned. */
export function canCreateCommunity(
  user: CurrentUser | null,
  facts: { accountCreatedAt: Date; ownedCount: number },
  limits: { minAgeDays: number; maxOwned: number },
): PolicyResult {
  const base = canParticipate(user);
  if (!base.allowed) return base;
  if (Date.now() - facts.accountCreatedAt.getTime() < limits.minAgeDays * 86_400_000)
    return deny('account_too_new');
  if (facts.ownedCount >= limits.maxOwned) return deny('limit_reached');
  return allow;
}
