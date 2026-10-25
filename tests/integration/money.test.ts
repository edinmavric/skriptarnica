import { randomUUID } from 'node:crypto';

import { and, eq, isNull, sql } from 'drizzle-orm';
import fc from 'fast-check';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { bankAccountControl } from '@/lib/bank-account';
import { db } from '@/server/db/client';
import { entitlements, ledgerEntries, notes, orderItems, orders } from '@/server/db/schema';
import type { PaymentEvent } from '@/server/payments';
import {
  postTransaction,
  sellerBalances,
  UnbalancedTransactionError,
} from '@/server/services/ledger';
import { createOrder, handlePaymentEvent, reconcilePendingOrders } from '@/server/services/orders';
import { becomeSeller } from '@/server/services/sellers';
import {
  decidePayout,
  decideRefund,
  releaseMaturedFunds,
  requestPayout,
  requestRefund,
} from '@/server/services/wallet';
import { completeMockSession, getMockSession } from '@/server/payments/mock';

import { asCurrentUser, createCatalog, createUser } from './factories';

vi.mock('@/server/jobs/client', () => ({
  sendEvent: vi.fn(),
  trySendEvent: vi.fn(async () => true),
  events: {},
  inngest: {},
}));
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));

const account = `160-0000000012345-${bankAccountControl('160', '0000000012345')}`;
let catalog: Awaited<ReturnType<typeof createCatalog>>;

beforeAll(async () => {
  catalog = await createCatalog();
});

async function createSellerWithNote(pricePara: number) {
  const seller = await createUser();
  await becomeSeller(seller.id, { accountHolder: 'Pera Perić', accountNumber: account }, 'ip');
  const [note] = await db
    .insert(notes)
    .values({
      sellerId: seller.id,
      courseId: catalog.courses[0].id,
      title: 'Test skripta',
      slug: `test-${randomUUID()}`,
      status: 'published',
      publishedAt: new Date(),
      pricePara,
      howIStudied: 'x'.repeat(200),
      shortDescription: 'Kratak opis skripte za test.',
    })
    .returning();
  return { seller, note: note as NonNullable<typeof note> };
}

async function buy(noteId: string, buyer?: Awaited<ReturnType<typeof createUser>>) {
  const user = buyer ?? (await createUser());
  const result = await createOrder(asCurrentUser(user), {
    noteId,
    idempotencyKey: randomUUID(),
    withdrawalWaiver: true,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return { buyer: user, outcome: result.value };
}

async function orderRow(orderId: string) {
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
  return row as NonNullable<typeof row>;
}

function successEvent(
  order: { providerRef: string | null; totalPara: number },
  id = `evt_${randomUUID()}`,
): PaymentEvent {
  return {
    id,
    type: 'payment.succeeded',
    providerRef: order.providerRef as string,
    amountPara: order.totalPara,
    occurredAt: new Date(),
  };
}

/** Buyer pays on the mock hosted page; the webhook is then delivered to our handler. */
async function pay(orderId: string, eventId?: string) {
  const order = await orderRow(orderId);
  await completeMockSession(order.providerRef as string, 'succeeded');
  return handlePaymentEvent('mock', successEvent(order, eventId));
}

async function unbalancedTransactions(): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM (SELECT transaction_id FROM ledger_entries GROUP BY transaction_id HAVING sum(amount_para) <> 0) t`,
  );
  return rows[0]?.n ?? -1;
}

async function ageOrder(orderId: string, days: number) {
  await db.execute(
    sql`UPDATE orders SET paid_at = paid_at - make_interval(days => ${days}) WHERE id = ${orderId}`,
  );
}

describe('purchase → webhook → entitlement and ledger', () => {
  it('records a balanced sale with the commission snapshot (800 → 640 / 160)', async () => {
    const { seller, note } = await createSellerWithNote(80_000);
    const { buyer, outcome } = await buy(note.id);
    expect(outcome.kind).toBe('redirect');
    const order = await orderRow(outcome.orderId);
    expect(order.status).toBe('pending');
    expect(await handlePaymentEvent('mock', successEvent(order))).toBe('paid');
    expect((await orderRow(order.id)).status).toBe('paid');
    const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(item).toMatchObject({
      pricePara: 80_000,
      commissionBasisPoints: 2000,
      commissionPara: 16_000,
      sellerPara: 64_000,
    });
    expect(await sellerBalances(seller.id)).toEqual({
      pendingPara: 64_000,
      availablePara: 0,
      paidOutPara: 0,
    });
    const ent = await db
      .select()
      .from(entitlements)
      .where(and(eq(entitlements.userId, buyer.id), eq(entitlements.noteId, note.id)));
    expect(ent).toHaveLength(1);
    expect(await unbalancedTransactions()).toBe(0);
  });

  it('a duplicate webhook creates no duplicate entitlement or ledger entries', async () => {
    const { seller, note } = await createSellerWithNote(50_000);
    const { outcome } = await buy(note.id);
    const order = await orderRow(outcome.orderId);
    const event = successEvent(order);
    expect(await handlePaymentEvent('mock', event)).toBe('paid');
    expect(await handlePaymentEvent('mock', event)).toBe('duplicate');
    // A different event id for the same payment (provider retry with a new id) is also harmless.
    expect(await handlePaymentEvent('mock', successEvent(order))).toBe('already_paid');
    const ledger = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.referenceId, order.id));
    expect(ledger).toHaveLength(3);
    expect(
      await db.select().from(entitlements).where(eq(entitlements.orderId, order.id)),
    ).toHaveLength(1);
    expect((await sellerBalances(seller.id)).pendingPara).toBe(40_000);
    const [noteRow] = await db.select().from(notes).where(eq(notes.id, note.id));
    expect(noteRow?.salesCount).toBe(1);
  });

  it('rejects a webhook whose amount differs from the order total', async () => {
    const { note } = await createSellerWithNote(30_000);
    const { outcome } = await buy(note.id);
    const order = await orderRow(outcome.orderId);
    await expect(
      handlePaymentEvent('mock', {
        ...(successEvent(order) as Extract<PaymentEvent, { type: 'payment.succeeded' }>),
        amountPara: 100,
      }),
    ).rejects.toThrow(/expected 30000/);
    expect((await orderRow(order.id)).status).toBe('pending');
  });

  it('failed and cancelled payments leave no entitlement', async () => {
    const { note } = await createSellerWithNote(30_000);
    const { outcome } = await buy(note.id);
    const order = await orderRow(outcome.orderId);
    expect(
      await handlePaymentEvent('mock', {
        id: `evt_${randomUUID()}`,
        type: 'payment.failed',
        providerRef: order.providerRef as string,
        reason: 'card_declined',
        occurredAt: new Date(),
      }),
    ).toBe('failed');
    expect((await orderRow(order.id)).status).toBe('failed');
    expect(
      await db.select().from(entitlements).where(eq(entitlements.orderId, order.id)),
    ).toHaveLength(0);
  });

  it('retrying the same idempotency key resumes the same order', async () => {
    const { note } = await createSellerWithNote(30_000);
    const buyer = await createUser();
    const key = randomUUID();
    const first = await createOrder(asCurrentUser(buyer), {
      noteId: note.id,
      idempotencyKey: key,
      withdrawalWaiver: true,
    });
    const second = await createOrder(asCurrentUser(buyer), {
      noteId: note.id,
      idempotencyKey: key,
      withdrawalWaiver: true,
    });
    expect(first.ok && second.ok && first.value.orderId === second.value.orderId).toBe(true);
  });

  it('free notes are granted immediately with zero ledger amounts', async () => {
    const { note } = await createSellerWithNote(0);
    const { buyer, outcome } = await buy(note.id);
    expect(outcome.kind).toBe('granted');
    expect((await orderRow(outcome.orderId)).status).toBe('paid');
    expect(
      await db
        .select()
        .from(entitlements)
        .where(
          and(
            eq(entitlements.userId, buyer.id),
            isNull(entitlements.revokedAt),
            eq(entitlements.noteId, note.id),
          ),
        ),
    ).toHaveLength(1);
  });

  it('refuses buying your own note or a note you already own', async () => {
    const { seller, note } = await createSellerWithNote(30_000);
    const own = await createOrder(asCurrentUser(seller), {
      noteId: note.id,
      idempotencyKey: randomUUID(),
      withdrawalWaiver: true,
    });
    expect(own.ok).toBe(false);
    const { buyer, outcome } = await buy(note.id);
    await pay(outcome.orderId);
    const again = await createOrder(asCurrentUser(buyer), {
      noteId: note.id,
      idempotencyKey: randomUUID(),
      withdrawalWaiver: true,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.messageKey).toBe('errors.purchase.alreadyOwned');
  });

  it('reconciliation pays orders whose webhook never arrived', async () => {
    const { note } = await createSellerWithNote(25_000);
    const { outcome } = await buy(note.id);
    const order = await orderRow(outcome.orderId);
    await completeMockSession(order.providerRef as string, 'succeeded');
    expect((await getMockSession(order.providerRef as string))?.status).toBe('succeeded');
    await db.execute(
      sql`UPDATE orders SET created_at = now() - interval '20 minutes' WHERE id = ${order.id}`,
    );
    const summary = await reconcilePendingOrders();
    expect(summary.paid).toBeGreaterThanOrEqual(1);
    expect((await orderRow(order.id)).status).toBe('paid');
  });
});

describe('funds release, refunds and payouts', () => {
  it('releases matured funds once', async () => {
    const { seller, note } = await createSellerWithNote(80_000);
    const { outcome } = await buy(note.id);
    await pay(outcome.orderId);
    await releaseMaturedFunds();
    expect(await sellerBalances(seller.id)).toMatchObject({
      pendingPara: 64_000,
      availablePara: 0,
    });
    await ageOrder(outcome.orderId, 15);
    await releaseMaturedFunds();
    await releaseMaturedFunds();
    expect(await sellerBalances(seller.id)).toMatchObject({
      pendingPara: 0,
      availablePara: 64_000,
    });
  });

  it('a refund after release makes seller_available negative; the next sale covers the debt', async () => {
    const admin = await createUser({ role: 'admin', twoFactorEnabled: true });
    const { seller, note } = await createSellerWithNote(200_000);
    const { buyer, outcome } = await buy(note.id);
    await pay(outcome.orderId);
    await ageOrder(outcome.orderId, 15);
    await releaseMaturedFunds();
    // Seller pays everything out before the refund.
    const payout = await requestPayout(seller.id, 160_000);
    expect(payout.ok).toBe(true);
    // Buyer is still inside the 7-day window measured from payment? Move paid_at back into the window.
    await db.execute(
      sql`UPDATE orders SET paid_at = now() - interval '2 days' WHERE id = ${outcome.orderId}`,
    );
    const requested = await requestRefund(buyer.id, {
      orderId: outcome.orderId,
      reason: 'corrupted',
      text: 'Fajl se ne otvara.',
    });
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    const decided = await decideRefund(
      admin.id,
      { refundId: requested.value.id, approve: true, note: 'Potvrđeno.' },
      'ip',
    );
    expect(decided).toEqual({ ok: true, value: { status: 'completed' } });
    expect(await sellerBalances(seller.id)).toEqual({
      pendingPara: 0,
      availablePara: -160_000,
      paidOutPara: 160_000,
    });
    expect((await orderRow(outcome.orderId)).status).toBe('refunded');
    const [ent] = await db
      .select()
      .from(entitlements)
      .where(eq(entitlements.orderId, outcome.orderId));
    expect(ent?.revokedAt).not.toBeNull();
    // Next sale, released: covers the debt first.
    const next = await buy(note.id);
    await pay(next.outcome.orderId);
    await ageOrder(next.outcome.orderId, 15);
    await releaseMaturedFunds();
    expect((await sellerBalances(seller.id)).availablePara).toBe(0);
    expect(await unbalancedTransactions()).toBe(0);
  });

  it('a refund before release comes out of seller_pending and is never released', async () => {
    const admin = await createUser({ role: 'admin', twoFactorEnabled: true });
    const { seller, note } = await createSellerWithNote(50_000);
    const { buyer, outcome } = await buy(note.id);
    await pay(outcome.orderId);
    const requested = await requestRefund(buyer.id, {
      orderId: outcome.orderId,
      reason: 'empty',
      text: 'Prazne strane.',
    });
    if (!requested.ok) throw new Error('refund');
    await decideRefund(admin.id, { refundId: requested.value.id, approve: true, note: null }, 'ip');
    await ageOrder(outcome.orderId, 30);
    await releaseMaturedFunds();
    expect(await sellerBalances(seller.id)).toEqual({
      pendingPara: 0,
      availablePara: 0,
      paidOutPara: 0,
    });
  });

  it('refund requests close after the 7-day window and need a paid order of the buyer', async () => {
    const { note } = await createSellerWithNote(50_000);
    const { buyer, outcome } = await buy(note.id);
    await pay(outcome.orderId);
    const stranger = await createUser();
    expect(
      (await requestRefund(stranger.id, { orderId: outcome.orderId, reason: 'other', text: 'x' }))
        .ok,
    ).toBe(false);
    await ageOrder(outcome.orderId, 8);
    const late = await requestRefund(buyer.id, {
      orderId: outcome.orderId,
      reason: 'other',
      text: 'x',
    });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.messageKey).toBe('errors.refund.windowClosed');
  });

  it('payouts respect the minimum and available balance, and a rejection restores funds', async () => {
    const admin = await createUser({ role: 'admin', twoFactorEnabled: true });
    const { seller, note } = await createSellerWithNote(300_000);
    const { outcome } = await buy(note.id);
    await pay(outcome.orderId);
    expect((await requestPayout(seller.id, 100_000)).ok).toBe(false); // nothing available yet
    await ageOrder(outcome.orderId, 15);
    await releaseMaturedFunds();
    expect((await requestPayout(seller.id, 50_000)).ok).toBe(false); // below 1.000 RSD minimum
    expect((await requestPayout(seller.id, 300_000)).ok).toBe(false); // more than available (240.000)
    const payout = await requestPayout(seller.id, 200_000);
    if (!payout.ok) throw new Error('payout');
    expect((await requestPayout(seller.id, 100_000)).ok).toBe(false); // one open request at a time
    expect(await sellerBalances(seller.id)).toEqual({
      pendingPara: 0,
      availablePara: 40_000,
      paidOutPara: 200_000,
    });
    expect(
      (await decidePayout(admin.id, payout.value.id, { kind: 'paid', bankReference: 'X' }, 'ip'))
        .ok,
    ).toBe(false); // must be approved first
    expect(
      (
        await decidePayout(
          admin.id,
          payout.value.id,
          { kind: 'reject', reason: 'Pogrešan račun' },
          'ip',
        )
      ).ok,
    ).toBe(true);
    expect(await sellerBalances(seller.id)).toEqual({
      pendingPara: 0,
      availablePara: 240_000,
      paidOutPara: 0,
    });
    const second = await requestPayout(seller.id, 240_000);
    if (!second.ok) throw new Error('payout 2');
    expect((await decidePayout(admin.id, second.value.id, { kind: 'approve' }, 'ip')).ok).toBe(
      true,
    );
    expect(
      (
        await decidePayout(
          admin.id,
          second.value.id,
          { kind: 'paid', bankReference: 'NALOG-123' },
          'ip',
        )
      ).ok,
    ).toBe(true);
    expect(await sellerBalances(seller.id)).toEqual({
      pendingPara: 0,
      availablePara: 0,
      paidOutPara: 240_000,
    });
  });
});

describe('ledger invariants', () => {
  it('the database rejects an unbalanced transaction and any edit', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(ledgerEntries).values({
          transactionId: randomUUID(),
          accountType: 'platform_revenue',
          accountOwnerId: null,
          amountPara: 100,
          referenceType: 'adjustment',
          referenceId: randomUUID(),
          description: 'unbalanced',
        });
      }),
    ).rejects.toSatisfy((error: unknown) =>
      /unbalanced/.test(String((error as Error & { cause?: unknown }).cause ?? error)),
    );
    await expect(
      postTransaction(db, {
        referenceType: 'adjustment',
        referenceId: randomUUID(),
        description: 'x',
        postings: [{ account: 'refunds', ownerId: null, amountPara: 1 }],
      }),
    ).rejects.toThrow(UnbalancedTransactionError);
    const edit = await db
      .execute(
        sql`UPDATE ledger_entries SET amount_para = amount_para + 1 WHERE id = (SELECT id FROM ledger_entries LIMIT 1)`,
      )
      .catch((error: unknown) => error);
    expect(String((edit as Error & { cause?: unknown }).cause)).toMatch(/append-only/);
  });

  it('every transaction sums to zero across random sequences of operations (property)', async () => {
    const admin = await createUser({ role: 'admin', twoFactorEnabled: true });
    const op = fc.oneof(
      fc.record({ kind: fc.constant('buy' as const), price: fc.integer({ min: 0, max: 300_000 }) }),
      fc.record({ kind: fc.constant('release' as const) }),
      fc.record({ kind: fc.constant('refund' as const), pick: fc.nat() }),
      fc.record({
        kind: fc.constant('payout' as const),
        fraction: fc.double({ min: 0.1, max: 1, noNaN: true }),
      }),
    );
    await fc.assert(
      fc.asyncProperty(fc.array(op, { minLength: 3, maxLength: 10 }), async (ops) => {
        const { seller, note } = await createSellerWithNote(0);
        const paidOrders: { id: string; buyerId: string }[] = [];
        // Model of the seller's wallet.
        const model = { pending: 0, available: 0, paidOut: 0 };
        for (const step of ops) {
          if (step.kind === 'buy') {
            await db.update(notes).set({ pricePara: step.price }).where(eq(notes.id, note.id));
            const { buyer, outcome } = await buy(note.id);
            const order = await orderRow(outcome.orderId);
            if (order.status === 'pending') await pay(order.id);
            const [item] = await db
              .select()
              .from(orderItems)
              .where(eq(orderItems.orderId, order.id));
            model.pending += item?.sellerPara ?? 0;
            paidOrders.push({ id: order.id, buyerId: buyer.id });
          } else if (step.kind === 'release') {
            for (const order of paidOrders) await ageOrder(order.id, 15);
            const before = await sellerBalances(seller.id);
            await releaseMaturedFunds();
            const after = await sellerBalances(seller.id);
            model.available += before.pendingPara - after.pendingPara;
            model.pending = after.pendingPara;
          } else if (step.kind === 'refund' && paidOrders.length > 0) {
            const target = paidOrders.splice(step.pick % paidOrders.length, 1)[0] as {
              id: string;
              buyerId: string;
            };
            const order = await orderRow(target.id);
            if (order.totalPara === 0) continue;
            await db.execute(sql`UPDATE orders SET paid_at = now() WHERE id = ${target.id}`);
            const [item] = await db
              .select()
              .from(orderItems)
              .where(eq(orderItems.orderId, target.id));
            const requested = await requestRefund(target.buyerId, {
              orderId: target.id,
              reason: 'other',
              text: 'test',
            });
            if (!requested.ok) continue;
            const decided = await decideRefund(
              admin.id,
              { refundId: requested.value.id, approve: true, note: null },
              'ip',
            );
            expect(decided.ok).toBe(true);
            if (item?.releasedAt) model.available -= item.sellerPara;
            else model.pending -= item?.sellerPara ?? 0;
          } else if (step.kind === 'payout') {
            const balances = await sellerBalances(seller.id);
            const amount = Math.floor(balances.availablePara * step.fraction);
            const result = await requestPayout(seller.id, amount);
            if (result.ok) {
              model.available -= amount;
              model.paidOut += amount;
              await decidePayout(admin.id, result.value.id, { kind: 'approve' }, 'ip');
              await decidePayout(
                admin.id,
                result.value.id,
                { kind: 'paid', bankReference: 'P' },
                'ip',
              );
            }
          }
          expect(await unbalancedTransactions()).toBe(0);
        }
        expect(await sellerBalances(seller.id)).toEqual({
          pendingPara: model.pending,
          availablePara: model.available,
          paidOutPara: model.paidOut,
        });
        const [total] = await db.execute<{ s: number }>(
          sql`SELECT coalesce(sum(amount_para), 0)::int AS s FROM ledger_entries`,
        );
        expect(total?.s).toBe(0);
      }),
      { numRuns: 15 },
    );
  });
});
