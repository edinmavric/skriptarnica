import type { CurrentUser } from '../auth/session';

/**
 * Centralized authorization (SPEC §2.2). Services call these; UI hiding is never enough.
 * Pure functions over already-loaded data so they are cheap and unit-testable.
 */

export type PolicyResult = { allowed: true } | { allowed: false; reason: PolicyDenial };
export type PolicyDenial =
  | 'unauthenticated'
  | 'email_not_verified'
  | 'banned'
  | 'not_admin'
  | 'admin_2fa_required'
  | 'not_seller'
  | 'seller_suspended'
  | 'not_adult'
  | 'not_owner'
  | 'not_entitled'
  | 'not_member'
  | 'not_moderator'
  | 'faculty_only'
  | 'community_banned'
  | 'locked'
  | 'account_too_new'
  | 'limit_reached'
  | 'impersonating'
  | 'not_allowed';

const allow: PolicyResult = { allowed: true };
const deny = (reason: PolicyDenial): PolicyResult => ({ allowed: false, reason });

/** Any state-changing action by a regular user. Admin impersonation is read-only. */
export function canMutate(user: CurrentUser | null): PolicyResult {
  if (!user) return deny('unauthenticated');
  if (user.bannedAt) return deny('banned');
  if (user.impersonatedBy) return deny('impersonating');
  return allow;
}

/** Buying, selling and posting need a verified email (SPEC §4.1.2). */
export function canParticipate(user: CurrentUser | null): PolicyResult {
  const base = canMutate(user);
  if (!base.allowed) return base;
  if (!user?.emailVerified) return deny('email_not_verified');
  return allow;
}

export function isAdmin(user: CurrentUser | null): PolicyResult {
  if (!user) return deny('unauthenticated');
  if (user.role !== 'admin') return deny('not_admin');
  if (!user.twoFactorEnabled) return deny('admin_2fa_required');
  return allow;
}

/** Minimal shapes the note policies need. */
export interface NoteForPolicy {
  sellerId: string;
  status:
    'draft' | 'processing' | 'pending_review' | 'published' | 'rejected' | 'unlisted' | 'removed';
  deletedAt: Date | null;
}

export function canSell(user: CurrentUser | null, seller: { status: string } | null): PolicyResult {
  const base = canParticipate(user);
  if (!base.allowed) return base;
  if (!seller || seller.status === 'none' || seller.status === 'pending') return deny('not_seller');
  if (seller.status === 'suspended') return deny('seller_suspended');
  return allow;
}

/** Only the author edits a note; removed notes are frozen. */
export function canEditNote(user: CurrentUser | null, note: NoteForPolicy): PolicyResult {
  const base = canMutate(user);
  if (!base.allowed) return base;
  if (user?.id !== note.sellerId) return deny('not_owner');
  if (note.status === 'removed' || note.deletedAt) return deny('not_allowed');
  return allow;
}

/** Published and unlisted notes are viewable by link; everything else only by owner/admin. */
export function canViewNote(user: CurrentUser | null, note: NoteForPolicy): PolicyResult {
  if (note.deletedAt) return user?.role === 'admin' ? allow : deny('not_allowed');
  if (note.status === 'published' || note.status === 'unlisted') return allow;
  if (user && (user.id === note.sellerId || user.role === 'admin')) return allow;
  return deny('not_allowed');
}
