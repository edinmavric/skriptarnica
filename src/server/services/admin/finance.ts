import { and, count, desc, eq, gte, ilike, lt, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { toCsv } from '@/lib/csv';
import { appError, err, ok, type Result } from '@/lib/result';

import { db } from '../../db/client';
import {
  ledgerEntries,
  notes,
  orderItems,
  orders,
  payouts,
  refunds,
  sellerProfiles,
  users,
} from '../../db/schema';
import { postTransaction, sellerBalances } from '../ledger';
import { audit } from './audit';

type OrderStatus = (typeof orders.$inferSelect)['status'];

export async function listOrders(input: {
  status?: OrderStatus | null;
  query?: string;
  page?: number;
}) {
  const q = input.query?.trim();
  const rows = await db
    .select({ order: orders, buyerEmail: users.email, buyerUsername: users.username })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.buyerId))
    .where(
      and(
        input.status ? eq(orders.status, input.status) : undefined,
        q
          ? or(
              ilike(users.email, `%${q}%`),
              ilike(users.username, `%${q}%`),
              sql`${orders.id}::text = ${q}`,
              eq(orders.providerRef, q),
            )
          : undefined,
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(51)
    .offset((input.page ?? 0) * 50);
  return { rows: rows.slice(0, 50), hasMore: rows.length > 50 };
}

export async function getOrderDetail(orderId: string) {
  const [row] = await db
    .select({
      order: orders,
      buyerEmail: users.email,
      buyerUsername: users.username,
      buyerId: users.id,
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.buyerId))
    .where(eq(orders.id, orderId));
  if (!row) return null;
  const [items, ledger, refundRows] = await Promise.all([
    db
      .select({ item: orderItems, title: notes.title, slug: notes.slug })
      .from(orderItems)
      .innerJoin(notes, eq(notes.id, orderItems.noteId))
      .where(eq(orderItems.orderId, orderId)),
    db
      .select()
      .from(ledgerEntries)
      .where(
        or(
          and(eq(ledgerEntries.referenceType, 'order'), eq(ledgerEntries.referenceId, orderId)),
          sql`${ledgerEntries.referenceId} IN (SELECT id FROM refunds WHERE order_id = ${orderId})`,
        ),
      )
      .orderBy(ledgerEntries.createdAt),
    db.select().from(refunds).where(eq(refunds.orderId, orderId)),
  ]);
  return { ...row, items, ledger, refunds: refundRows };
}

/**
 * Manual ledger adjustment (SPEC §4.10): seller_available ± amount against platform_revenue,
 * so the books stay balanced. Needs a reason and a second confirmation (the retyped amount);
 * the action also requires recent re-authentication.
 */
export async function adjustSellerBalance(
  adminId: string,
  input: { sellerId: string; amountPara: number; reason: string; confirmAmountPara: number },
  ipHash: string,
): Promise<Result<{ transactionId: string }>> {
  if (input.amountPara !== input.confirmAmountPara)
    return err(
      appError('VALIDATION', 'errors.validation', {
        confirmAmountPara: ['validation.amountMismatch'],
      }),
    );
  const [seller] = await db
    .select({ userId: sellerProfiles.userId })
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, input.sellerId));
  if (!seller) return err(appError('NOT_FOUND', 'errors.admin.notSeller'));
  const referenceId = uuidv7();
  const transactionId = await db.transaction(async (tx) => {
    const id = await postTransaction(tx, {
      referenceType: 'adjustment',
      referenceId,
      description: input.reason,
      postings: [
        { account: 'seller_available', ownerId: input.sellerId, amountPara: input.amountPara },
        { account: 'platform_revenue', ownerId: null, amountPara: -input.amountPara },
      ],
    });
    await audit(tx, {
      actorId: adminId,
      action: 'ledger.adjustment',
      targetType: 'user',
      targetId: input.sellerId,
      details: { amountPara: input.amountPara, reason: input.reason, transactionId: id },
      ipHash,
    });
    return id;
  });
  return ok({ transactionId });
}

export async function sellerLedger(sellerId: string) {
  const [balances, entries] = await Promise.all([
    sellerBalances(sellerId),
    db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.accountOwnerId, sellerId))
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(100),
  ]);
  return { balances, entries };
}

// --- Dashboard ------------------------------------------------------------------------------

export interface DashboardStats {
  users: number;
  newUsers7d: number;
  gmv30dPara: number;
  revenue30dPara: number;
  salesPerDay: { day: string; count: number; gmvPara: number }[];
  pendingPayouts: number;
  openRefunds: number;
}

/** Last 30 days, by Belgrade calendar day; days without sales are present with zeros. */
export async function dashboardStats(now = new Date()): Promise<DashboardStats> {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [[userCount], [newUsers], [money], daily, [pendingPayouts], [openRefunds]] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(users)
        .where(sql`${users.deletedAt} IS NULL`),
      db
        .select({ value: count() })
        .from(users)
        .where(gte(users.createdAt, new Date(now.getTime() - 7 * 86_400_000))),
      db
        .select({
          gmv: sql<number>`coalesce(sum(${orderItems.pricePara}), 0)::bigint`,
          revenue: sql<number>`coalesce(sum(${orderItems.commissionPara}), 0)::bigint`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(eq(orders.status, 'paid'), gte(orders.paidAt, since))),
      db.execute<{ day: string; count: number; gmv: number }>(sql`
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day, count(o.id)::int AS count, coalesce(sum(o.total_para), 0)::bigint AS gmv
      FROM generate_series((${now.toISOString()}::timestamptz AT TIME ZONE 'Europe/Belgrade')::date - 29, (${now.toISOString()}::timestamptz AT TIME ZONE 'Europe/Belgrade')::date, interval '1 day') AS d(day)
      LEFT JOIN orders o ON o.status = 'paid' AND (o.paid_at AT TIME ZONE 'Europe/Belgrade')::date = d.day
      GROUP BY d.day ORDER BY d.day`),
      db
        .select({ value: count() })
        .from(payouts)
        .where(sql`${payouts.status} IN ('requested', 'approved', 'processing')`),
      db.select({ value: count() }).from(refunds).where(eq(refunds.status, 'requested')),
    ]);
  return {
    users: userCount?.value ?? 0,
    newUsers7d: newUsers?.value ?? 0,
    gmv30dPara: Number(money?.gmv ?? 0),
    revenue30dPara: Number(money?.revenue ?? 0),
    salesPerDay: daily.map((row) => ({
      day: row.day,
      count: Number(row.count),
      gmvPara: Number(row.gmv),
    })),
    pendingPayouts: pendingPayouts?.value ?? 0,
    openRefunds: openRefunds?.value ?? 0,
  };
}

// --- CSV reports -----------------------------------------------------------------------------

export type ReportKind = 'porudzbine' | 'isplate' | 'knjizenja';

/** Amounts are exported in RSD with two decimals (and the raw para) for accounting. */
const rsd = (para: number) => (para / 100).toFixed(2);

export async function financeCsv(kind: ReportKind, from: Date, to: Date): Promise<string> {
  if (kind === 'porudzbine') {
    const rows = await db
      .select({ order: orders, item: orderItems, title: notes.title })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(notes, eq(notes.id, orderItems.noteId))
      .where(and(gte(orders.createdAt, from), lt(orders.createdAt, to)))
      .orderBy(orders.createdAt);
    return toCsv([
      [
        'order_id',
        'created_at',
        'paid_at',
        'status',
        'provider',
        'provider_ref',
        'note',
        'price_rsd',
        'commission_rsd',
        'seller_rsd',
        'seller_id',
      ],
      ...rows.map((r) => [
        r.order.id,
        r.order.createdAt.toISOString(),
        r.order.paidAt?.toISOString() ?? '',
        r.order.status,
        r.order.provider,
        r.order.providerRef ?? '',
        r.title,
        rsd(r.item.pricePara),
        rsd(r.item.commissionPara),
        rsd(r.item.sellerPara),
        r.item.sellerId,
      ]),
    ]);
  }
  if (kind === 'isplate') {
    const rows = await db
      .select()
      .from(payouts)
      .where(and(gte(payouts.createdAt, from), lt(payouts.createdAt, to)))
      .orderBy(payouts.createdAt);
    return toCsv([
      [
        'payout_id',
        'seller_id',
        'amount_rsd',
        'status',
        'requested_at',
        'approved_at',
        'paid_at',
        'bank_reference',
      ],
      ...rows.map((p) => [
        p.id,
        p.sellerId,
        rsd(p.amountPara),
        p.status,
        p.createdAt.toISOString(),
        p.approvedAt?.toISOString() ?? '',
        p.paidAt?.toISOString() ?? '',
        p.bankReference ?? '',
      ]),
    ]);
  }
  const rows = await db
    .select()
    .from(ledgerEntries)
    .where(and(gte(ledgerEntries.createdAt, from), lt(ledgerEntries.createdAt, to)))
    .orderBy(ledgerEntries.createdAt);
  return toCsv([
    [
      'transaction_id',
      'created_at',
      'account',
      'owner_id',
      'amount_rsd',
      'amount_para',
      'reference_type',
      'reference_id',
      'description',
    ],
    ...rows.map((e) => [
      e.transactionId,
      e.createdAt.toISOString(),
      e.accountType,
      e.accountOwnerId ?? '',
      rsd(e.amountPara),
      e.amountPara,
      e.referenceType,
      e.referenceId,
      e.description,
    ]),
  ]);
}
