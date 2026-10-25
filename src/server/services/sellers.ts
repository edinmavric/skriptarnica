import { eq, sql } from 'drizzle-orm';

import { legalVersions } from '@/config/legal';
import { normalizeBankAccount } from '@/lib/bank-account';
import { appError, err, ok, type Result } from '@/lib/result';

import { decrypt, encrypt } from '../crypto/encryption';
import { payoutKeyRing } from '../crypto/payout-keys';
import { db } from '../db/client';
import { auditLog, consents, notes, sellerProfiles, studentProfiles } from '../db/schema';
import type { DbOrTx } from '../db/types';

export type SellerProfile = typeof sellerProfiles.$inferSelect;

export async function getSellerProfile(
  userId: string,
  tx: DbOrTx = db,
): Promise<SellerProfile | null> {
  const [row] = await tx.select().from(sellerProfiles).where(eq(sellerProfiles.userId, userId));
  return row ?? null;
}

export function isActiveSeller(profile: SellerProfile | null): boolean {
  return profile?.status === 'active';
}

/** AAD binds ciphertext to its owner and field, so values can't be swapped between rows. */
const aad = (userId: string, field: 'holder' | 'account') => `${userId}:${field}`;

function encryptPayout(userId: string, holder: string, account: string) {
  const normalized = normalizeBankAccount(account) as string;
  return {
    payoutHolderEnc: encrypt(holder, payoutKeyRing(), aad(userId, 'holder')),
    payoutAccountEnc: encrypt(normalized, payoutKeyRing(), aad(userId, 'account')),
    payoutAccountLast4: normalized.replace(/\D/g, '').slice(-4),
    payoutDetailsUpdatedAt: new Date(),
  };
}

/** Decrypted payout details: only for the owner (masked UI) and admins processing payouts. */
export function decryptPayout(profile: SellerProfile): { holder: string; account: string } | null {
  if (!profile.payoutHolderEnc || !profile.payoutAccountEnc) return null;
  return {
    holder: decrypt(profile.payoutHolderEnc, payoutKeyRing(), aad(profile.userId, 'holder')),
    account: decrypt(profile.payoutAccountEnc, payoutKeyRing(), aad(profile.userId, 'account')),
  };
}

/**
 * Become a seller (SPEC §4.4): 18+ confirmation, Seller Terms acceptance, payout details.
 * Active immediately; the first notes go through pre-moderation.
 */
export async function becomeSeller(
  userId: string,
  input: { accountHolder: string; accountNumber: string },
  ipHash: string,
): Promise<Result<SellerProfile>> {
  const existing = await getSellerProfile(userId);
  if (existing?.status === 'suspended')
    return err(appError('FORBIDDEN', 'errors.policy.seller_suspended'));
  const profile = await db.transaction(async (tx) => {
    const values = {
      status: 'active' as const,
      sellerTermsVersion: legalVersions.sellerTerms,
      sellerTermsAcceptedAt: new Date(),
      ...encryptPayout(userId, input.accountHolder, input.accountNumber),
    };
    const [row] = await tx
      .insert(sellerProfiles)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: sellerProfiles.userId, set: values })
      .returning();
    await tx.insert(consents).values([
      {
        userId,
        type: 'seller_terms',
        documentVersion: legalVersions.sellerTerms,
        value: true,
        ipHash,
      },
      { userId, type: 'age_18', documentVersion: legalVersions.sellerTerms, value: true, ipHash },
    ]);
    await tx
      .update(studentProfiles)
      .set({ isAdult: true })
      .where(eq(studentProfiles.userId, userId));
    await tx
      .insert(auditLog)
      .values({
        actorId: userId,
        action: 'seller.activated',
        targetType: 'user',
        targetId: userId,
        ipHash,
      });
    return row as SellerProfile;
  });
  return ok(profile);
}

export async function updatePayoutDetails(
  userId: string,
  input: { accountHolder: string; accountNumber: string },
  ipHash: string,
): Promise<Result<void>> {
  const profile = await getSellerProfile(userId);
  if (!profile || profile.status === 'none')
    return err(appError('FORBIDDEN', 'errors.policy.not_seller'));
  await db.transaction(async (tx) => {
    await tx
      .update(sellerProfiles)
      .set(encryptPayout(userId, input.accountHolder, input.accountNumber))
      .where(eq(sellerProfiles.userId, userId));
    // Payout detail changes are sensitive (SPEC §3.6).
    await tx
      .insert(auditLog)
      .values({
        actorId: userId,
        action: 'seller.payout_details_changed',
        targetType: 'user',
        targetId: userId,
        ipHash,
      });
  });
  return ok(undefined);
}

/** Notes already approved/published once — drives pre-moderation of the first N notes. */
export async function countApprovedNotes(sellerId: string, tx: DbOrTx = db): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(notes)
    .where(sql`${notes.sellerId} = ${sellerId} AND ${notes.publishedAt} IS NOT NULL`);
  return row?.count ?? 0;
}
