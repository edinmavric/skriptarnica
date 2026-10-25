import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import { appError, err, ok, type Result } from '@/lib/result';

import { db } from '../db/client';
import { entitlements, orderItems, orders, payouts, refunds, sellerProfiles } from '../db/schema';
import { trySendEvent } from '../jobs/client';
import { logger } from '../logger';
import { getPaymentProvider } from '../payments';

import { audit } from './admin/audit';
import { getInvoiceService } from './invoicing';
import { postTransaction, sellerBalances } from './ledger';
import { getSettings } from './settings';

/**
 * Funds release (SPEC §5.3.6): daily, matured seller earnings move seller_pending →
 * seller_available. Each item is released once (order_items.released_at), in its own
 * transaction, so a failure never half-releases.
 */
export async function releaseMaturedFunds(now = new Date()): Promise<number> {
  const due = await db
    .select({ item: orderItems })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        isNull(orderItems.releasedAt),
        eq(orders.status, 'paid'),
        isNotNull(orders.paidAt),
        sql`${orders.paidAt} + make_interval(days => ${orderItems.holdDays}) <= ${now.toISOString()}::timestamptz`,
      ),
    )
    .limit(1000);
  let released = 0;
  for (const { item } of due) {
    const done = await db.transaction(async (tx) => {
      const locked = await tx.execute<{ released_at: Date | null }>(
        sql`SELECT released_at FROM order_items WHERE id = ${item.id} FOR UPDATE`,
      );
      if (locked[0]?.released_at) return false;
      await tx.update(orderItems).set({ releasedAt: now }).where(eq(orderItems.id, item.id));
      if (item.sellerPara > 0) {
        await postTransaction(tx, {
          referenceType: 'release',
          referenceId: item.id,
          description: 'hold period ended',
          postings: [
            { account: 'seller_pending', ownerId: item.sellerId, amountPara: -item.sellerPara },
            { account: 'seller_available', ownerId: item.sellerId, amountPara: item.sellerPara },
          ],
        });
      }
      return true;
    });
    if (done) released += 1;
  }
  if (released > 0) logger.info({ released }, 'funds released');
  return released;
}

// --- Refunds ---------------------------------------------------------------------------

export type RefundReason = 'not_as_described' | 'corrupted' | 'empty' | 'plagiarism' | 'other';

/** Buyer reports a problem within the window (SPEC §4.3); an admin decides. */
export async function requestRefund(
  buyerId: string,
  input: { orderId: string; reason: RefundReason; text: string },
): Promise<Result<{ id: string }>> {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, input.orderId), eq(orders.buyerId, buyerId)));
  if (!order) return err(appError('NOT_FOUND', 'errors.notFound'));
  if (order.status !== 'paid' || order.totalPara === 0)
    return err(appError('CONFLICT', 'errors.refund.notEligible'));
  const settings = await getSettings();
  const deadline = new Date(
    (order.paidAt as Date).getTime() + settings.purchaseProblemWindowDays * 24 * 3600_000,
  );
  if (new Date() > deadline) return err(appError('CONFLICT', 'errors.refund.windowClosed'));
  const [open] = await db
    .select({ id: refunds.id })
    .from(refunds)
    .where(
      and(
        eq(refunds.orderId, order.id),
        inArray(refunds.status, ['requested', 'approved', 'completed']),
      ),
    );
  if (open) return err(appError('CONFLICT', 'errors.refund.alreadyRequested'));
  const [row] = await db
    .insert(refunds)
    .values({
      orderId: order.id,
      reason: input.reason,
      text: input.text,
      initiatedBy: 'buyer',
      initiatorId: buyerId,
      amountPara: order.totalPara,
    })
    .returning({ id: refunds.id });
  if (!row) return err(appError('INTERNAL', 'errors.internal'));
  return ok({ id: row.id });
}

/**
 * Approve (and execute) or reject a refund. Approval refunds through the provider, then in one
 * transaction: order → refunded, entitlement revoked, ledger reversal. If the seller's share was
 * already released, it comes out of seller_available, which may go negative (SPEC §5.4).
 */
export async function decideRefund(
  adminId: string,
  input: { refundId: string; approve: boolean; note: string | null },
  ipHash: string,
): Promise<Result<{ status: 'completed' | 'rejected' }>> {
  const [refund] = await db.select().from(refunds).where(eq(refunds.id, input.refundId));
  if (!refund || refund.status !== 'requested')
    return err(appError('CONFLICT', 'errors.refund.notPending'));
  if (!input.approve) {
    await db.transaction(async (tx) => {
      await tx
        .update(refunds)
        .set({
          status: 'rejected',
          decidedById: adminId,
          decidedAt: new Date(),
          decisionNote: input.note,
        })
        .where(eq(refunds.id, refund.id));
      await audit(tx, {
        actorId: adminId,
        action: 'refund.rejected',
        targetType: 'refund',
        targetId: refund.id,
        details: { note: input.note },
        ipHash,
      });
    });
    await trySendEvent(
      'order/refunded',
      { orderId: refund.orderId, refundId: refund.id },
      `refund-decided-${refund.id}`,
    );
    return ok({ status: 'rejected' });
  }
  return executeRefund(adminId, refund.id, input.note, ipHash);
}

/** Admin-initiated refund without a buyer request (e.g. plagiarism found later). */
export async function adminRefund(
  adminId: string,
  orderId: string,
  reason: RefundReason,
  note: string,
  ipHash: string,
): Promise<Result<{ status: 'completed' | 'rejected' }>> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.status !== 'paid')
    return err(appError('CONFLICT', 'errors.refund.notEligible'));
  const [row] = await db
    .insert(refunds)
    .values({
      orderId,
      reason,
      text: note,
      initiatedBy: 'admin',
      initiatorId: adminId,
      amountPara: order.totalPara,
    })
    .returning({ id: refunds.id });
  if (!row) return err(appError('INTERNAL', 'errors.internal'));
  return executeRefund(adminId, row.id, note, ipHash);
}

async function executeRefund(
  adminId: string,
  refundId: string,
  note: string | null,
  ipHash: string,
): Promise<Result<{ status: 'completed' }>> {
  const [row] = await db
    .select({ refund: refunds, order: orders, item: orderItems })
    .from(refunds)
    .innerJoin(orders, eq(orders.id, refunds.orderId))
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(eq(refunds.id, refundId));
  if (!row) return err(appError('NOT_FOUND', 'errors.notFound'));
  const { refund, order, item } = row;
  if (order.status !== 'paid') return err(appError('CONFLICT', 'errors.refund.notEligible'));

  await db
    .update(refunds)
    .set({ status: 'approved', decidedById: adminId, decidedAt: new Date(), decisionNote: note })
    .where(eq(refunds.id, refund.id));
  let providerRefundRef: string | null = null;
  if (order.totalPara > 0 && order.providerRef) {
    const result = await getPaymentProvider(order.provider).refund({
      providerRef: order.providerRef,
      amount: refund.amountPara,
      reason: refund.reason,
    });
    if (result.status === 'failed') {
      await db.update(refunds).set({ status: 'failed' }).where(eq(refunds.id, refund.id));
      return err(appError('INTERNAL', 'errors.refund.providerFailed'));
    }
    providerRefundRef = result.providerRefundRef;
  }

  await db.transaction(async (tx) => {
    const locked = await tx.execute<{ status: string }>(
      sql`SELECT status FROM orders WHERE id = ${order.id} FOR UPDATE`,
    );
    if (locked[0]?.status !== 'paid') throw new Error('order changed during refund');
    await tx.update(orders).set({ status: 'refunded' }).where(eq(orders.id, order.id));
    await tx
      .update(entitlements)
      .set({ revokedAt: new Date() })
      .where(and(eq(entitlements.orderId, order.id), isNull(entitlements.revokedAt)));
    const sellerAccount = item.releasedAt ? 'seller_available' : 'seller_pending';
    await postTransaction(tx, {
      referenceType: 'refund',
      referenceId: refund.id,
      description: 'refund to buyer',
      postings: [
        { account: sellerAccount, ownerId: item.sellerId, amountPara: -item.sellerPara },
        { account: 'platform_revenue', ownerId: null, amountPara: -item.commissionPara },
        { account: 'refunds', ownerId: null, amountPara: item.pricePara },
      ],
    });
    // A refunded item is never released later.
    if (!item.releasedAt)
      await tx.update(orderItems).set({ releasedAt: new Date() }).where(eq(orderItems.id, item.id));
    await tx.execute(
      sql`UPDATE notes SET sales_count = greatest(sales_count - 1, 0) WHERE id = ${item.noteId}`,
    );
    await tx
      .update(refunds)
      .set({ status: 'completed', providerRefundRef })
      .where(eq(refunds.id, refund.id));
    await audit(tx, {
      actorId: adminId,
      action: 'refund.completed',
      targetType: 'order',
      targetId: order.id,
      details: { refundId: refund.id, amountPara: refund.amountPara, sellerAccount },
      ipHash,
    });
  });
  const settings = await getSettings();
  await getInvoiceService(settings.featureFlags.invoicing).issueForRefund({
    orderId: order.id,
    refundId: refund.id,
    amountPara: refund.amountPara,
  });
  await trySendEvent(
    'order/refunded',
    { orderId: order.id, refundId: refund.id },
    `refund-completed-${refund.id}`,
  );
  return ok({ status: 'completed' });
}

// --- Payouts ---------------------------------------------------------------------------

/**
 * Seller requests a payout (SPEC §4.4): at least the minimum, at most the available balance.
 * The amount is reserved immediately (seller_available → seller_paid_out); a rejection reverses it.
 */
export async function requestPayout(
  sellerId: string,
  amountPara: number,
): Promise<Result<{ id: string }>> {
  if (!Number.isSafeInteger(amountPara) || amountPara <= 0)
    return err(appError('VALIDATION', 'errors.payout.invalidAmount'));
  const settings = await getSettings();
  if (amountPara < settings.minPayoutPara)
    return err(appError('VALIDATION', 'errors.payout.belowMinimum'));
  const [profile] = await db
    .select()
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, sellerId));
  if (!profile || profile.status !== 'active' || !profile.payoutAccountEnc)
    return err(appError('FORBIDDEN', 'errors.payout.noDetails'));
  const result = await db.transaction(async (tx) => {
    // Serialize payout requests per seller so two tabs can't overdraw.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`payout:${sellerId}`}))`);
    const [open] = await tx
      .select({ id: payouts.id })
      .from(payouts)
      .where(
        and(
          eq(payouts.sellerId, sellerId),
          inArray(payouts.status, ['requested', 'approved', 'processing']),
        ),
      );
    if (open) return err(appError('CONFLICT', 'errors.payout.alreadyOpen'));
    const balances = await sellerBalances(sellerId, tx);
    if (amountPara > balances.availablePara)
      return err(appError('VALIDATION', 'errors.payout.insufficient'));
    const [payout] = await tx
      .insert(payouts)
      .values({ sellerId, amountPara, accountLast4: profile.payoutAccountLast4 })
      .returning({ id: payouts.id });
    if (!payout) throw new Error('payout insert failed');
    await postTransaction(tx, {
      referenceType: 'payout',
      referenceId: payout.id,
      description: 'payout requested',
      postings: [
        { account: 'seller_available', ownerId: sellerId, amountPara: -amountPara },
        { account: 'seller_paid_out', ownerId: sellerId, amountPara },
      ],
    });
    return ok({ id: payout.id });
  });
  if (result.ok)
    await trySendEvent(
      'payout/status.changed',
      { payoutId: result.value.id },
      `payout-${result.value.id}-requested`,
    );
  return result;
}

type PayoutDecision =
  | { kind: 'approve' }
  | { kind: 'paid'; bankReference: string }
  | { kind: 'reject'; reason: string };

/** Admin payout workflow: requested → approved → paid (with bank reference), or rejected. */
export async function decidePayout(
  adminId: string,
  payoutId: string,
  decision: PayoutDecision,
  ipHash: string,
): Promise<Result<void>> {
  const result = await db.transaction(async (tx) => {
    const locked = await tx.execute<{ status: string; seller_id: string; amount_para: number }>(
      sql`SELECT status, seller_id, amount_para FROM payouts WHERE id = ${payoutId} FOR UPDATE`,
    );
    const payout = locked[0];
    if (!payout) return err(appError('NOT_FOUND', 'errors.notFound'));
    const now = new Date();
    if (decision.kind === 'approve') {
      if (payout.status !== 'requested')
        return err(appError('CONFLICT', 'errors.payout.wrongState'));
      await tx
        .update(payouts)
        .set({ status: 'approved', approvedById: adminId, approvedAt: now })
        .where(eq(payouts.id, payoutId));
    } else if (decision.kind === 'paid') {
      if (payout.status !== 'approved' && payout.status !== 'processing')
        return err(appError('CONFLICT', 'errors.payout.wrongState'));
      await tx
        .update(payouts)
        .set({ status: 'paid', bankReference: decision.bankReference, paidAt: now })
        .where(eq(payouts.id, payoutId));
    } else {
      if (!['requested', 'approved', 'processing'].includes(payout.status))
        return err(appError('CONFLICT', 'errors.payout.wrongState'));
      await tx
        .update(payouts)
        .set({ status: 'rejected', rejectionReason: decision.reason })
        .where(eq(payouts.id, payoutId));
      await postTransaction(tx, {
        referenceType: 'payout_reversal',
        referenceId: payoutId,
        description: 'payout rejected',
        postings: [
          {
            account: 'seller_paid_out',
            ownerId: payout.seller_id,
            amountPara: -payout.amount_para,
          },
          {
            account: 'seller_available',
            ownerId: payout.seller_id,
            amountPara: payout.amount_para,
          },
        ],
      });
    }
    await audit(tx, {
      actorId: adminId,
      action: `payout.${decision.kind}`,
      targetType: 'payout',
      targetId: payoutId,
      details: decision.kind === 'approve' ? {} : { ...decision },
      ipHash,
    });
    return ok(undefined);
  });
  if (result.ok)
    await trySendEvent(
      'payout/status.changed',
      { payoutId },
      `payout-${payoutId}-${decision.kind}`,
    );
  return result;
}

export async function listSellerPayouts(sellerId: string) {
  return db
    .select()
    .from(payouts)
    .where(eq(payouts.sellerId, sellerId))
    .orderBy(desc(payouts.createdAt))
    .limit(50);
}
