import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { env } from '@/env';
import { calculateCommission } from '@/lib/money';
import { appError, err, ok, type Result } from '@/lib/result';

import type { CurrentUser } from '../auth/session';
import { db } from '../db/client';
import {
  entitlements,
  notes,
  orderItems,
  orders,
  processedWebhookEvents,
  sellerProfiles,
} from '../db/schema';
import type { Tx } from '../db/types';
import { trySendEvent } from '../jobs/client';
import { alertOps } from '../jobs/alerts';
import { logger } from '../logger';
import { getPaymentProvider, type PaymentEvent } from '../payments';
import { canParticipate } from '../policies';

import { getInvoiceService } from './invoicing';
import { postTransaction } from './ledger';
import { invalidateNoteListings } from './note-pages';
import { getSettings } from './settings';

export type Order = typeof orders.$inferSelect;

export async function hasActiveEntitlement(
  userId: string,
  noteId: string,
  tx: Tx | typeof db = db,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.noteId, noteId),
        isNull(entitlements.revokedAt),
      ),
    );
  return Boolean(row);
}

export interface PurchaseTarget {
  id: string;
  title: string;
  slug: string;
  pricePara: number;
  sellerId: string;
  status: string;
}

export async function getPurchasableNote(noteId: string): Promise<PurchaseTarget | null> {
  const [note] = await db
    .select({
      id: notes.id,
      title: notes.title,
      slug: notes.slug,
      pricePara: notes.pricePara,
      sellerId: notes.sellerId,
      status: notes.status,
    })
    .from(notes)
    .where(
      and(
        eq(notes.id, noteId),
        isNull(notes.deletedAt),
        inArray(notes.status, ['published', 'unlisted']),
      ),
    );
  return note ?? null;
}

export type CreateOrderOutcome =
  { kind: 'redirect'; url: string; orderId: string } | { kind: 'granted'; orderId: string };

/**
 * SPEC §5.3 step 1–2: create (idempotently) a pending order with a commission snapshot and
 * hand over to the provider's hosted page. Free notes are granted immediately, through the
 * same order + ledger path with zero amounts.
 */
export async function createOrder(
  user: CurrentUser,
  input: { noteId: string; idempotencyKey: string; withdrawalWaiver: true },
): Promise<Result<CreateOrderOutcome>> {
  const check = canParticipate(user);
  if (!check.allowed) return err(appError('FORBIDDEN', `errors.policy.${check.reason}`));
  const note = await getPurchasableNote(input.noteId);
  if (!note) return err(appError('NOT_FOUND', 'errors.purchase.unavailable'));
  if (note.sellerId === user.id) return err(appError('CONFLICT', 'errors.purchase.ownNote'));

  // A retried submit with the same key resumes the same order.
  const [existing] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.buyerId, user.id), eq(orders.idempotencyKey, input.idempotencyKey)));
  if (existing) return resumeOrder(existing, user, note);

  if (await hasActiveEntitlement(user.id, note.id))
    return err(appError('CONFLICT', 'errors.purchase.alreadyOwned'));

  const settings = await getSettings();
  const [seller] = await db
    .select({ holdDays: sellerProfiles.payoutHoldDays })
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, note.sellerId));
  const split = calculateCommission(note.pricePara, settings.commissionBasisPoints);
  const provider = getPaymentProvider();
  const orderId = uuidv7();

  const created = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        id: orderId,
        buyerId: user.id,
        status: 'pending',
        totalPara: note.pricePara,
        idempotencyKey: input.idempotencyKey,
        provider: note.pricePara === 0 ? 'free' : provider.id,
        withdrawalWaiverAcceptedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (!order) return null;
    await tx.insert(orderItems).values({
      orderId,
      noteId: note.id,
      sellerId: note.sellerId,
      pricePara: note.pricePara,
      commissionBasisPoints: settings.commissionBasisPoints,
      commissionPara: split.commissionPara,
      sellerPara: split.sellerPara,
      holdDays: seller?.holdDays ?? settings.fundsHoldDays,
    });
    return order;
  });
  if (!created) {
    const [raced] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.buyerId, user.id), eq(orders.idempotencyKey, input.idempotencyKey)));
    if (!raced) return err(appError('INTERNAL', 'errors.internal'));
    return resumeOrder(raced, user, note);
  }
  return resumeOrder(created, user, note);
}

async function resumeOrder(
  order: Order,
  user: CurrentUser,
  note: PurchaseTarget,
): Promise<Result<CreateOrderOutcome>> {
  if (order.status === 'paid') return ok({ kind: 'granted', orderId: order.id });
  if (order.status !== 'pending') return err(appError('CONFLICT', 'errors.purchase.orderClosed'));
  if (order.totalPara === 0) {
    await db.transaction((tx) => fulfillOrder(tx, order.id, null));
    await afterPaid(order.id);
    return ok({ kind: 'granted', orderId: order.id });
  }
  const provider = getPaymentProvider(order.provider);
  const checkout = await provider.createCheckout({
    orderId: order.id,
    amount: order.totalPara,
    currency: 'RSD',
    description: note.title,
    customerEmail: user.email,
    successUrl: `${env.NEXT_PUBLIC_APP_URL}/kupovina/status/${order.id}`,
    cancelUrl: `${env.NEXT_PUBLIC_APP_URL}/kupovina/${note.id}?otkazano=1`,
    idempotencyKey: order.id,
  });
  if (order.providerRef !== checkout.providerRef) {
    await db
      .update(orders)
      .set({ providerRef: checkout.providerRef })
      .where(eq(orders.id, order.id));
  }
  return ok({ kind: 'redirect', url: checkout.redirectUrl, orderId: order.id });
}

/**
 * Marks an order paid, grants the entitlement and posts the sale to the ledger, in the
 * caller's transaction. Idempotent: an already-paid order is a no-op (returns false).
 * The order row is locked so concurrent webhook + reconciliation can't double-fulfil.
 */
export async function fulfillOrder(
  tx: Tx,
  orderId: string,
  paidAmountPara: number | null,
): Promise<boolean> {
  const locked = await tx.execute<{
    id: string;
    status: string;
    total_para: number;
    buyer_id: string;
  }>(sql`SELECT id, status, total_para, buyer_id FROM orders WHERE id = ${orderId} FOR UPDATE`);
  const order = locked[0];
  if (!order) throw new Error(`order ${orderId} not found`);
  if (order.status === 'paid' || order.status === 'refunded') return false;
  if (order.status !== 'pending') throw new Error(`order ${orderId} is ${order.status}`);
  if (paidAmountPara !== null && paidAmountPara !== order.total_para) {
    throw new AmountMismatchError(orderId, order.total_para, paidAmountPara);
  }
  const [item] = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  if (!item) throw new Error(`order ${orderId} has no item`);
  const now = new Date();
  await tx.update(orders).set({ status: 'paid', paidAt: now }).where(eq(orders.id, orderId));
  await tx
    .insert(entitlements)
    .values({ userId: order.buyer_id, noteId: item.noteId, orderId, grantedAt: now })
    .onConflictDoNothing();
  await postTransaction(tx, {
    referenceType: 'order',
    referenceId: orderId,
    description: 'sale',
    postings: [
      { account: 'provider_clearing', ownerId: null, amountPara: -item.pricePara },
      { account: 'seller_pending', ownerId: item.sellerId, amountPara: item.sellerPara },
      { account: 'platform_revenue', ownerId: null, amountPara: item.commissionPara },
    ],
  });
  await tx.execute(sql`UPDATE notes SET sales_count = sales_count + 1 WHERE id = ${item.noteId}`);
  return true;
}

export class AmountMismatchError extends Error {
  constructor(orderId: string, expected: number, received: number) {
    super(`order ${orderId}: expected ${expected} para, provider reported ${received}`);
    this.name = 'AmountMismatchError';
  }
}

/** Side effects after commit: notifications, invoicing hook, listings. Never throws. */
async function afterPaid(orderId: string): Promise<void> {
  try {
    const settings = await getSettings();
    const [row] = await db
      .select({ total: orders.totalPara, commission: orderItems.commissionPara })
      .from(orders)
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(eq(orders.id, orderId));
    if (row)
      await getInvoiceService(settings.featureFlags.invoicing).issueForPaidOrder({
        orderId,
        totalPara: row.total,
        commissionPara: row.commission,
      });
  } catch (error) {
    logger.error(
      { orderId, err: error instanceof Error ? error.message : String(error) },
      'invoice hook failed',
    );
  }
  await trySendEvent('order/paid', { orderId }, `order-paid-${orderId}`);
  invalidateNoteListingsSafe();
}

function invalidateNoteListingsSafe() {
  try {
    invalidateNoteListings();
  } catch {
    // Outside a request (jobs) there is no cache to invalidate.
  }
}

async function markFailed(orderId: string, reason: string): Promise<void> {
  await db
    .update(orders)
    .set({ status: 'failed', failureReason: reason })
    .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')));
}

/**
 * Webhook processing (SPEC §5.3.3): idempotent per provider event id; all state changes in
 * one transaction. Returns what happened, for logging and tests.
 */
export async function handlePaymentEvent(
  providerId: string,
  event: PaymentEvent,
): Promise<'duplicate' | 'paid' | 'already_paid' | 'failed' | 'ignored'> {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.provider, providerId), eq(orders.providerRef, event.providerRef)));
  const outcome = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(processedWebhookEvents)
      .values({ provider: providerId, eventId: event.id, type: event.type })
      .onConflictDoNothing()
      .returning({ id: processedWebhookEvents.id });
    if (inserted.length === 0) return 'duplicate' as const;
    if (!order) return 'ignored' as const;
    switch (event.type) {
      case 'payment.succeeded':
        return (await fulfillOrder(tx, order.id, event.amountPara))
          ? ('paid' as const)
          : ('already_paid' as const);
      case 'payment.failed':
      case 'payment.cancelled':
        await tx
          .update(orders)
          .set({
            status: 'failed',
            failureReason: event.type === 'payment.failed' ? event.reason : 'cancelled',
          })
          .where(and(eq(orders.id, order.id), eq(orders.status, 'pending')));
        return 'failed' as const;
      default:
        // Refunds are initiated by us and recorded when the refund call returns.
        return 'ignored' as const;
    }
  });
  if (outcome === 'paid' && order) await afterPaid(order.id);
  return outcome;
}

/** Reconciliation (SPEC §5.3.5): pending orders older than 10 minutes are checked at the provider. */
export async function reconcilePendingOrders(
  olderThanMinutes = 10,
): Promise<{ checked: number; paid: number; failed: number }> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const pending = await db
    .select()
    .from(orders)
    .where(and(eq(orders.status, 'pending'), lt(orders.createdAt, cutoff)))
    .limit(200);
  let paid = 0;
  let failed = 0;
  for (const order of pending) {
    if (!order.providerRef) {
      // Never reached the provider (abandoned before checkout) and old enough to close.
      if (order.createdAt < new Date(Date.now() - 24 * 3600_000)) {
        await markFailed(order.id, 'abandoned');
        failed += 1;
      }
      continue;
    }
    try {
      const status = await getPaymentProvider(order.provider).getStatus(order.providerRef);
      if (status === 'succeeded') {
        const fulfilled = await db.transaction((tx) => fulfillOrder(tx, order.id, null));
        if (fulfilled) {
          paid += 1;
          await afterPaid(order.id);
        }
      } else if (status === 'failed' || status === 'cancelled') {
        await markFailed(order.id, status === 'cancelled' ? 'cancelled' : 'provider_failed');
        failed += 1;
      } else if (order.createdAt < new Date(Date.now() - 24 * 3600_000)) {
        await markFailed(order.id, 'expired');
        failed += 1;
      }
    } catch (error) {
      logger.error(
        { orderId: order.id, err: error instanceof Error ? error.message : String(error) },
        'reconciliation failed for order',
      );
      await alertOps(
        'Payment reconciliation error',
        `order ${order.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { checked: pending.length, paid, failed };
}

export async function getOrderForBuyer(userId: string, orderId: string) {
  const [row] = await db
    .select({
      order: orders,
      noteId: orderItems.noteId,
      noteTitle: notes.title,
      noteSlug: notes.slug,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(notes, eq(notes.id, orderItems.noteId))
    .where(and(eq(orders.id, orderId), eq(orders.buyerId, userId)));
  return row ?? null;
}
