import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { db } from '../../db/client';
import {
  notes,
  orderItems,
  orders,
  payouts,
  refunds,
  sellerProfiles,
  users,
} from '../../db/schema';
import { decryptPayout } from '../sellers';

import { audit } from './audit';

export async function listRefunds(
  status: ('requested' | 'approved' | 'rejected' | 'completed' | 'failed')[] = ['requested'],
) {
  return db
    .select({
      refund: refunds,
      orderId: orders.id,
      totalPara: orders.totalPara,
      paidAt: orders.paidAt,
      buyerName: users.name,
      buyerEmail: users.email,
      noteTitle: notes.title,
      noteSlug: notes.slug,
    })
    .from(refunds)
    .innerJoin(orders, eq(orders.id, refunds.orderId))
    .innerJoin(users, eq(users.id, orders.buyerId))
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(notes, eq(notes.id, orderItems.noteId))
    .where(inArray(refunds.status, status))
    .orderBy(asc(refunds.createdAt));
}

export async function listPayouts(
  status: ('requested' | 'approved' | 'processing' | 'paid' | 'rejected')[],
) {
  return db
    .select({ payout: payouts, sellerName: users.name, sellerEmail: users.email })
    .from(payouts)
    .innerJoin(users, eq(users.id, payouts.sellerId))
    .where(inArray(payouts.status, status))
    .orderBy(asc(payouts.createdAt));
}

/** Decrypted bank details for executing a payout. Every view is audited (SPEC §3.6). */
export async function payoutDetailsForAdmin(adminId: string, payoutId: string, ipHash: string) {
  const [row] = await db
    .select({ payout: payouts, profile: sellerProfiles })
    .from(payouts)
    .innerJoin(sellerProfiles, eq(sellerProfiles.userId, payouts.sellerId))
    .where(eq(payouts.id, payoutId));
  if (!row) return null;
  await audit(db, {
    actorId: adminId,
    action: 'payout.details_viewed',
    targetType: 'payout',
    targetId: payoutId,
    ipHash,
  });
  return { payout: row.payout, details: decryptPayout(row.profile) };
}

export async function recentOrders(limit = 50) {
  return db
    .select({ order: orders, buyerName: users.name, noteTitle: notes.title })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.buyerId))
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(notes, eq(notes.id, orderItems.noteId))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}

export async function sellerOfPayout(payoutId: string) {
  const [row] = await db
    .select({ sellerId: payouts.sellerId })
    .from(payouts)
    .where(and(eq(payouts.id, payoutId)));
  return row?.sellerId ?? null;
}
