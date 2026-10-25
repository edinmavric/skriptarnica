import { and, eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { db } from '../db/client';
import { ledgerEntries } from '../db/schema';
import type { DbOrTx } from '../db/types';

/**
 * Double-entry ledger (SPEC §3.4). Every posting is a transaction whose entries sum to zero —
 * checked here and again by a deferred constraint trigger in Postgres.
 *
 * Accounts:
 *  provider_clearing  money collected through the card processor (credited as a negative)
 *  platform_revenue   commission
 *  seller_pending     seller earnings inside the hold period
 *  seller_available   seller earnings that can be paid out (may go negative after refunds)
 *  seller_paid_out    payouts requested/paid
 *  refunds            money returned to buyers
 */
export type LedgerAccount = (typeof ledgerEntries.$inferInsert)['accountType'];
export type LedgerReference = (typeof ledgerEntries.$inferInsert)['referenceType'];

export interface Posting {
  account: LedgerAccount;
  ownerId: string | null;
  amountPara: number;
}

export class UnbalancedTransactionError extends Error {}

export async function postTransaction(
  tx: DbOrTx,
  input: {
    referenceType: LedgerReference;
    referenceId: string;
    description: string;
    postings: Posting[];
  },
): Promise<string> {
  const postings = input.postings.filter((posting) => posting.amountPara !== 0);
  if (postings.some((posting) => !Number.isSafeInteger(posting.amountPara))) {
    throw new UnbalancedTransactionError('amounts must be integer para');
  }
  const sum = postings.reduce((total, posting) => total + posting.amountPara, 0);
  if (sum !== 0) throw new UnbalancedTransactionError(`transaction does not balance (sum ${sum})`);
  const transactionId = uuidv7();
  if (postings.length === 0) return transactionId;
  await tx.insert(ledgerEntries).values(
    postings.map((posting) => ({
      transactionId,
      accountType: posting.account,
      accountOwnerId: posting.ownerId,
      amountPara: posting.amountPara,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      description: input.description,
    })),
  );
  return transactionId;
}

export interface SellerBalances {
  pendingPara: number;
  availablePara: number;
  paidOutPara: number;
}

/** Seller wallet, computed from the ledger (never stored). */
export async function sellerBalances(sellerId: string, tx: DbOrTx = db): Promise<SellerBalances> {
  const rows = await tx
    .select({
      account: ledgerEntries.accountType,
      total: sql<number>`coalesce(sum(${ledgerEntries.amountPara}), 0)::int`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.accountOwnerId, sellerId))
    .groupBy(ledgerEntries.accountType);
  const get = (account: LedgerAccount) => rows.find((row) => row.account === account)?.total ?? 0;
  return {
    pendingPara: get('seller_pending'),
    availablePara: get('seller_available'),
    paidOutPara: get('seller_paid_out'),
  };
}

export async function accountTotal(
  account: LedgerAccount,
  tx: DbOrTx = db,
  ownerId?: string,
): Promise<number> {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${ledgerEntries.amountPara}), 0)::int` })
    .from(ledgerEntries)
    .where(
      ownerId
        ? and(eq(ledgerEntries.accountType, account), eq(ledgerEntries.accountOwnerId, ownerId))
        : eq(ledgerEntries.accountType, account),
    );
  return row?.total ?? 0;
}
