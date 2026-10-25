import { describe, expect, it } from 'vitest';

import type { CurrentUser } from '@/server/auth/session';
import {
  canCreateCommunity,
  canModerate,
  canPostInCommunity,
  canReadCommunity,
  type CommunityAccess,
} from '@/server/policies/forum';

const user = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
  id: 'u',
  name: 'U',
  email: 'u@example.com',
  emailVerified: true,
  username: 'u',
  image: null,
  role: 'student',
  twoFactorEnabled: false,
  bannedAt: null,
  sessionId: 's',
  impersonatedBy: null,
  ...overrides,
});
const access = (overrides: Partial<CommunityAccess> = {}): CommunityAccess => ({
  visibility: 'public',
  facultyId: 'f1',
  viewerFacultyId: null,
  membership: null,
  ...overrides,
});

describe('forum policies', () => {
  it('faculty_only communities are readable only by that faculty’s students and admins', () => {
    const closed = access({ visibility: 'faculty_only' });
    expect(canReadCommunity(null, closed)).toEqual({ allowed: false, reason: 'unauthenticated' });
    expect(canReadCommunity(user(), { ...closed, viewerFacultyId: 'f2' })).toEqual({
      allowed: false,
      reason: 'faculty_only',
    });
    expect(canReadCommunity(user(), { ...closed, viewerFacultyId: 'f1' }).allowed).toBe(true);
    expect(canReadCommunity(user({ role: 'admin' }), closed).allowed).toBe(true);
    expect(canReadCommunity(null, access()).allowed).toBe(true);
  });

  it('posting needs a verified email, membership and no active ban', () => {
    const member = access({ membership: { role: 'member', bannedUntil: null } });
    expect(canPostInCommunity(user(), member).allowed).toBe(true);
    expect(canPostInCommunity(user({ emailVerified: false }), member)).toEqual({
      allowed: false,
      reason: 'email_not_verified',
    });
    expect(canPostInCommunity(user(), access())).toEqual({ allowed: false, reason: 'not_member' });
    expect(
      canPostInCommunity(
        user(),
        access({ membership: { role: 'member', bannedUntil: new Date(Date.now() + 3600_000) } }),
      ),
    ).toEqual({ allowed: false, reason: 'community_banned' });
    expect(
      canPostInCommunity(
        user(),
        access({ membership: { role: 'member', bannedUntil: new Date(Date.now() - 1000) } }),
      ).allowed,
    ).toBe(true);
    expect(canPostInCommunity(user({ impersonatedBy: 'admin' }), member)).toEqual({
      allowed: false,
      reason: 'impersonating',
    });
  });

  it('only moderators, owners and admins moderate', () => {
    expect(
      canModerate(user(), access({ membership: { role: 'member', bannedUntil: null } })).allowed,
    ).toBe(false);
    expect(
      canModerate(user(), access({ membership: { role: 'moderator', bannedUntil: null } })).allowed,
    ).toBe(true);
    expect(
      canModerate(user(), access({ membership: { role: 'owner', bannedUntil: null } })).allowed,
    ).toBe(true);
    expect(canModerate(user({ role: 'admin' }), access()).allowed).toBe(true);
  });

  it('creating a community needs a 7-day-old verified account and fewer than 3 owned', () => {
    const limits = { minAgeDays: 7, maxOwned: 3 };
    const old = new Date(Date.now() - 8 * 86_400_000);
    expect(
      canCreateCommunity(user(), { accountCreatedAt: old, ownedCount: 2 }, limits).allowed,
    ).toBe(true);
    expect(
      canCreateCommunity(user(), { accountCreatedAt: new Date(), ownedCount: 0 }, limits),
    ).toEqual({ allowed: false, reason: 'account_too_new' });
    expect(canCreateCommunity(user(), { accountCreatedAt: old, ownedCount: 3 }, limits)).toEqual({
      allowed: false,
      reason: 'limit_reached',
    });
  });
});
