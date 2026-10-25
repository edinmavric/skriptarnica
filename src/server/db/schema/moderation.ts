import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { id, timestamps } from './_common';
import { users } from './auth';

export const reportTargetType = pgEnum('report_target_type', [
  'note',
  'review',
  'post',
  'comment',
  'user',
  'community',
]);
export const reportReason = pgEnum('report_reason', [
  'spam',
  'abuse',
  'plagiarism',
  'exam_material',
  'personal_data',
  'other',
]);
export const reportStatus = pgEnum('report_status', ['open', 'resolved', 'dismissed']);

/** User reports (SPEC §3.6), handled by community moderators or admins. */
export const reports = pgTable(
  'reports',
  {
    id: id(),
    reporterId: uuid().references(() => users.id, { onDelete: 'set null' }),
    targetType: reportTargetType().notNull(),
    targetId: uuid().notNull(),
    /** For community-scoped targets, so community moderators see their queue. */
    communityId: uuid(),
    reason: reportReason().notNull(),
    text: text(),
    status: reportStatus().notNull().default('open'),
    resolvedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp({ withTimezone: true }),
    action: text(),
    ...timestamps(),
  },
  (t) => [
    index('reports_status_idx').on(t.status, t.createdAt),
    index('reports_target_idx').on(t.targetType, t.targetId),
    index('reports_community_idx').on(t.communityId, t.status),
  ],
);

/** Append-only log of admin actions and sensitive operations (SPEC §3.6). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: text(),
    details: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ipHash: text(),
    ...timestamps(),
  },
  (t) => [
    index('audit_log_actor_idx').on(t.actorId, t.createdAt),
    index('audit_log_target_idx').on(t.targetType, t.targetId),
    index('audit_log_created_idx').on(t.createdAt),
  ],
);

export const copyrightClaimStatus = pgEnum('copyright_claim_status', [
  'open',
  'accepted',
  'rejected',
  'countered',
]);

/**
 * Copyright infringement claims (SPEC §3.6), separate from user reports: the claimant may not
 * have an account, and the outcome (removal, counter-notice) is a legal record. ⚖️
 */
export const copyrightClaims = pgTable(
  'copyright_claims',
  {
    id: id(),
    claimantName: text().notNull(),
    claimantEmail: text().notNull(),
    organization: text(),
    /** What the claimant owns and how they can prove it. */
    ownershipProof: text().notNull(),
    contentUrl: text().notNull(),
    noteId: uuid(),
    /** Statement under full material and criminal liability that the claim is accurate. */
    statementAcceptedAt: timestamp({ withTimezone: true }).notNull(),
    status: copyrightClaimStatus().notNull().default('open'),
    counterNotice: text(),
    counterNoticeAt: timestamp({ withTimezone: true }),
    decidedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp({ withTimezone: true }),
    decisionNote: text(),
    ...timestamps(),
  },
  (t) => [
    index('copyright_claims_status_idx').on(t.status, t.createdAt),
    index('copyright_claims_note_idx').on(t.noteId),
  ],
);
