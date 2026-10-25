import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { id, timestamps } from './_common';
import { users } from './auth';
import { notes, noteVersions } from './marketplace';

export const orderStatus = pgEnum('order_status', [
  'pending',
  'paid',
  'failed',
  'refunded',
  'disputed',
]);

/** One item per order in v1 (SPEC §3.4). Amounts are integer para. */
export const orders = pgTable(
  'orders',
  {
    id: id(),
    buyerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: orderStatus().notNull().default('pending'),
    totalPara: integer().notNull(),
    currency: text().notNull().default('RSD'),
    /** Client-generated; a retried submit returns the same order (SPEC §2.2). */
    idempotencyKey: text().notNull(),
    provider: text().notNull(),
    providerRef: text(),
    paidAt: timestamp({ withTimezone: true }),
    failureReason: text(),
    /** ⚖️ Buyer requested immediate access and acknowledged the effect on withdrawal (SPEC §4.3). */
    withdrawalWaiverAcceptedAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('orders_idempotency_uq').on(t.buyerId, t.idempotencyKey),
    uniqueIndex('orders_provider_ref_uq').on(t.provider, t.providerRef),
    index('orders_buyer_idx').on(t.buyerId, t.createdAt),
    index('orders_status_idx').on(t.status, t.createdAt),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    noteId: uuid()
      .notNull()
      .references(() => notes.id, { onDelete: 'restrict' }),
    sellerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    pricePara: integer().notNull(),
    /** Commission snapshot at purchase time. */
    commissionBasisPoints: integer().notNull(),
    commissionPara: integer().notNull(),
    sellerPara: integer().notNull(),
    holdDays: smallint().notNull(),
    /** When seller_pending moved to seller_available (funds release job). */
    releasedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('order_items_order_uq').on(t.orderId),
    index('order_items_note_idx').on(t.noteId),
    index('order_items_seller_idx').on(t.sellerId, t.createdAt),
    index('order_items_release_idx').on(t.releasedAt),
  ],
);

/** The only source of truth for download rights (SPEC §3.4). */
export const entitlements = pgTable(
  'entitlements',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    noteId: uuid()
      .notNull()
      .references(() => notes.id, { onDelete: 'restrict' }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    grantedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('entitlements_order_uq').on(t.orderId),
    uniqueIndex('entitlements_active_uq')
      .on(t.userId, t.noteId)
      .where(sql`revoked_at IS NULL`),
    index('entitlements_note_idx').on(t.noteId),
  ],
);

export const ledgerAccount = pgEnum('ledger_account', [
  'platform_revenue',
  'seller_pending',
  'seller_available',
  'seller_paid_out',
  'provider_clearing',
  'refunds',
]);
export const ledgerReference = pgEnum('ledger_reference', [
  'order',
  'release',
  'refund',
  'payout',
  'payout_reversal',
  'adjustment',
]);

/**
 * Double-entry ledger (SPEC §3.4). Entries sharing a transactionId sum to zero — enforced by a
 * deferred constraint trigger at commit. Balances are always computed, never stored.
 */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: id(),
    transactionId: uuid().notNull(),
    accountType: ledgerAccount().notNull(),
    /** Seller for seller_* accounts; null for platform/provider accounts. */
    accountOwnerId: uuid().references(() => users.id, { onDelete: 'restrict' }),
    amountPara: integer().notNull(),
    referenceType: ledgerReference().notNull(),
    referenceId: uuid().notNull(),
    description: text().notNull(),
    ...timestamps(),
  },
  (t) => [
    index('ledger_tx_idx').on(t.transactionId),
    index('ledger_owner_account_idx').on(t.accountOwnerId, t.accountType),
    index('ledger_reference_idx').on(t.referenceType, t.referenceId),
    index('ledger_created_idx').on(t.createdAt),
  ],
);

export const payoutStatus = pgEnum('payout_status', [
  'requested',
  'approved',
  'processing',
  'paid',
  'rejected',
]);

export const payouts = pgTable(
  'payouts',
  {
    id: id(),
    sellerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    amountPara: integer().notNull(),
    status: payoutStatus().notNull().default('requested'),
    /** Last 4 digits of the account at request time (full details stay encrypted). */
    accountLast4: text(),
    approvedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp({ withTimezone: true }),
    bankReference: text(),
    paidAt: timestamp({ withTimezone: true }),
    rejectionReason: text(),
    ...timestamps(),
  },
  (t) => [
    index('payouts_seller_idx').on(t.sellerId, t.createdAt),
    index('payouts_status_idx').on(t.status, t.createdAt),
  ],
);

export const refundStatus = pgEnum('refund_status', [
  'requested',
  'approved',
  'rejected',
  'completed',
  'failed',
]);
export const refundReason = pgEnum('refund_reason', [
  'not_as_described',
  'corrupted',
  'empty',
  'plagiarism',
  'other',
]);

export const refunds = pgTable(
  'refunds',
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    reason: refundReason().notNull(),
    text: text(),
    initiatedBy: text({ enum: ['buyer', 'admin'] }).notNull(),
    initiatorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    status: refundStatus().notNull().default('requested'),
    amountPara: integer().notNull(),
    decidedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp({ withTimezone: true }),
    decisionNote: text(),
    providerRefundRef: text(),
    ...timestamps(),
  },
  (t) => [
    index('refunds_order_idx').on(t.orderId),
    index('refunds_status_idx').on(t.status, t.createdAt),
  ],
);

/** Download log for abuse detection (12-month retention, SPEC §3.4). No raw IPs. */
export const downloadEvents = pgTable(
  'download_events',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    noteVersionId: uuid()
      .notNull()
      .references(() => noteVersions.id, { onDelete: 'restrict' }),
    ipHash: text(),
    userAgent: text(),
    ...timestamps(),
  },
  (t) => [
    index('download_events_user_idx').on(t.userId, t.createdAt),
    index('download_events_version_idx').on(t.noteVersionId, t.createdAt),
  ],
);

/** Watermarked copy cache per (user, version), stored in the private bucket. */
export const watermarkedFiles = pgTable(
  'watermarked_files',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    noteVersionId: uuid()
      .notNull()
      .references(() => noteVersions.id, { onDelete: 'cascade' }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    objectKey: text().notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('watermarked_files_user_version_uq').on(t.userId, t.noteVersionId)],
);

/** Webhook idempotency (SPEC §5.3): one row per provider event id. */
export const processedWebhookEvents = pgTable(
  'processed_webhook_events',
  {
    id: id(),
    provider: text().notNull(),
    eventId: text().notNull(),
    type: text().notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('processed_webhook_events_uq').on(t.provider, t.eventId)],
);

/** Buyer reviews: one per purchase (SPEC §3.3); the seller may reply once. */
export const reviews = pgTable(
  'reviews',
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    noteId: uuid()
      .notNull()
      .references(() => notes.id, { onDelete: 'restrict' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    rating: smallint().notNull(),
    text: text().notNull().default(''),
    /** "I passed using these notes: grade X" */
    passedGrade: smallint(),
    sellerReply: text(),
    sellerRepliedAt: timestamp({ withTimezone: true }),
    removedAt: timestamp({ withTimezone: true }),
    removedReason: text(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('reviews_order_uq').on(t.orderId),
    index('reviews_note_idx').on(t.noteId, t.createdAt),
    index('reviews_user_idx').on(t.userId),
  ],
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  buyer: one(users, { fields: [orders.buyerId], references: [users.id] }),
  items: many(orderItems),
}));
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  note: one(notes, { fields: [orderItems.noteId], references: [notes.id] }),
}));
