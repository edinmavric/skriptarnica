import { relations, sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { id, timestamps, tsvector } from './_common';
import { users } from './auth';
import { courses, professors } from './catalog';

export const sellerStatus = pgEnum('seller_status', ['none', 'pending', 'active', 'suspended']);

/** Seller profile (SPEC §3.2). Payout details are encrypted at the application level (AES-GCM). */
export const sellerProfiles = pgTable(
  'seller_profiles',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: sellerStatus().notNull().default('none'),
    sellerTermsVersion: text(),
    sellerTermsAcceptedAt: timestamp({ withTimezone: true }),
    /** "v<key>:<iv>:<ciphertext>:<tag>" (base64) — see server/crypto/encryption.ts */
    payoutHolderEnc: text(),
    payoutAccountEnc: text(),
    /** Last 4 digits for display without decrypting. */
    payoutAccountLast4: text(),
    payoutDetailsUpdatedAt: timestamp({ withTimezone: true }),
    payoutHoldDays: smallint(),
    /** Flagged sellers go back to pre-moderation (SPEC §4.4). */
    flaggedAt: timestamp({ withTimezone: true }),
    flagReason: text(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('seller_profiles_user_uq').on(t.userId),
    index('seller_profiles_status_idx').on(t.status),
  ],
);

export const noteStatus = pgEnum('note_status', [
  'draft',
  'processing',
  'pending_review',
  'published',
  'rejected',
  'unlisted',
  'removed',
]);
export const noteLanguage = pgEnum('note_language', ['sr_latn', 'sr_cyrl', 'en', 'other']);

export interface NoteModerationFlags {
  possibleDuplicate?: {
    noteId: string;
    versionId: string;
    reason: 'same_hash' | 'similar_text';
    distance?: number;
  };
  preModeration?: boolean;
  sellerFlagged?: boolean;
}

export const notes = pgTable(
  'notes',
  {
    id: id(),
    sellerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    courseId: uuid().references(() => courses.id, { onDelete: 'restrict' }),
    professorId: uuid().references(() => professors.id, { onDelete: 'set null' }),
    title: text().notNull().default(''),
    /** Stable once published (SPEC §8.3); a title change doesn't change the URL. */
    slug: text().notNull(),
    shortDescription: text().notNull().default(''),
    /** "How I studied" — markdown, min 200 characters to publish. */
    howIStudied: text().notNull().default(''),
    /** Self-reported grade 5–10. */
    grade: smallint(),
    /** e.g. "2025/26" */
    academicYear: text(),
    /** e.g. "januarski" */
    examPeriod: text(),
    pageCount: integer().notNull().default(0),
    language: noteLanguage().notNull().default('sr_latn'),
    tags: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    pricePara: integer().notNull().default(0),
    status: noteStatus().notNull().default('draft'),
    rejectionReason: text(),
    moderationFlags: jsonb().$type<NoteModerationFlags>().notNull().default({}),
    declarationAcceptedAt: timestamp({ withTimezone: true }),
    /** Wizard step the seller last saved (autosave/resume). */
    wizardStep: smallint().notNull().default(1),
    currentVersionId: uuid(),
    publishedAt: timestamp({ withTimezone: true }),
    // Denormalized stats, updated in transactions/jobs.
    salesCount: integer().notNull().default(0),
    ratingSum: integer().notNull().default(0),
    reviewCount: integer().notNull().default(0),
    viewCount: integer().notNull().default(0),
    searchText: text().notNull().default(''),
    searchTsv: tsvector().generatedAlwaysAs((): SQL => sql`to_tsvector('simple', search_text)`),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('notes_slug_uq').on(t.slug),
    index('notes_seller_idx').on(t.sellerId, t.status),
    index('notes_course_status_idx').on(t.courseId, t.status, t.publishedAt),
    index('notes_status_idx').on(t.status, t.updatedAt),
    index('notes_professor_idx').on(t.professorId),
    index('notes_search_tsv_idx').using('gin', t.searchTsv),
    index('notes_search_trgm_idx').using('gin', sql`${t.searchText} gin_trgm_ops`),
  ],
);

export const versionStatus = pgEnum('note_version_status', [
  'uploaded',
  'processing',
  'ready',
  'failed',
]);

export const noteVersions = pgTable(
  'note_versions',
  {
    id: id(),
    noteId: uuid()
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    versionNumber: integer().notNull(),
    /** Private bucket key. Never public. */
    fileKey: text().notNull(),
    sha256: text(),
    sizeBytes: integer().notNull(),
    pageCount: integer(),
    extractedText: text(),
    extractedTsv: tsvector().generatedAlwaysAs(
      (): SQL => sql`to_tsvector('simple', coalesce(left(extracted_text, 500000), ''))`,
    ),
    /** 64-bit simhash of the extracted text (signed bigint). */
    simhash: bigint({ mode: 'bigint' }),
    status: versionStatus().notNull().default('uploaded'),
    /** i18n key of the processing error shown to the seller. */
    errorKey: text(),
    changelog: text(),
    publishedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('note_versions_note_number_uq').on(t.noteId, t.versionNumber),
    index('note_versions_sha_idx').on(t.sha256),
    index('note_versions_status_idx').on(t.status),
  ],
);

/** Rendered preview pages (public bucket, WebP); the last one is blurred (SPEC §3.3). */
export const notePreviews = pgTable(
  'note_previews',
  {
    id: id(),
    noteVersionId: uuid()
      .notNull()
      .references(() => noteVersions.id, { onDelete: 'cascade' }),
    pageNumber: integer().notNull(),
    imageKey: text().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    blurred: boolean().notNull().default(false),
    ...timestamps(),
  },
  (t) => [uniqueIndex('note_previews_version_page_uq').on(t.noteVersionId, t.pageNumber)],
);

export const uploadStatus = pgEnum('upload_status', ['pending', 'consumed', 'rejected']);

/** Presigned upload sessions: binds an object key to a user, a size and an expiry. */
export const uploads = pgTable(
  'uploads',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    noteId: uuid().references(() => notes.id, { onDelete: 'cascade' }),
    objectKey: text().notNull(),
    sizeBytes: integer().notNull(),
    contentType: text().notNull(),
    status: uploadStatus().notNull().default('pending'),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('uploads_key_uq').on(t.objectKey),
    index('uploads_user_idx').on(t.userId, t.createdAt),
  ],
);

export const bookmarks = pgTable(
  'bookmarks',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    noteId: uuid()
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('bookmarks_user_note_uq').on(t.userId, t.noteId),
    index('bookmarks_note_idx').on(t.noteId),
  ],
);

export const notesRelations = relations(notes, ({ one, many }) => ({
  seller: one(users, { fields: [notes.sellerId], references: [users.id] }),
  course: one(courses, { fields: [notes.courseId], references: [courses.id] }),
  professor: one(professors, { fields: [notes.professorId], references: [professors.id] }),
  versions: many(noteVersions),
}));
export const noteVersionsRelations = relations(noteVersions, ({ one, many }) => ({
  note: one(notes, { fields: [noteVersions.noteId], references: [notes.id] }),
  previews: many(notePreviews),
}));
export const notePreviewsRelations = relations(notePreviews, ({ one }) => ({
  version: one(noteVersions, {
    fields: [notePreviews.noteVersionId],
    references: [noteVersions.id],
  }),
}));
