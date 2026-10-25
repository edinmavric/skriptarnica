import { and, desc, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { PARA_PER_RSD } from '@/config/constants';
import { appError, err, ok, type Result } from '@/lib/result';
import { normalizeForSearch } from '@/lib/search/normalize';
import { slugify } from '@/lib/slug';
import { MIN_HOW_I_STUDIED, type NoteDescriptionInput } from '@/lib/validation/notes';

import type { CurrentUser } from '../auth/session';
import { db } from '../db/client';
import {
  bookmarks,
  courseProfessors,
  courses,
  notePreviews,
  notes,
  noteVersions,
  professors,
  uploads,
} from '../db/schema';
import type { DbOrTx } from '../db/types';
import { sendEvent } from '../jobs/client';
import { logger } from '../logger';
import { canEditNote, canSell, type PolicyResult } from '../policies';
import {
  buckets,
  deleteObject,
  headObject,
  presignUpload,
  publicUrl,
  readObjectRange,
} from '../storage/s3';

import { countApprovedNotes, getSellerProfile } from './sellers';
import { getSettings } from './settings';

export type Note = typeof notes.$inferSelect;
export type NoteVersion = typeof noteVersions.$inferSelect;

const denied = (check: PolicyResult): Result<never> =>
  err(
    appError(
      check.allowed ? 'INTERNAL' : check.reason === 'not_owner' ? 'NOT_FOUND' : 'FORBIDDEN',
      check.allowed ? 'errors.internal' : `errors.policy.${check.reason}`,
    ),
  );

/** Loads a note the user may edit. Other users' notes look like "not found" (no IDOR oracle). */
async function loadEditableNote(
  user: CurrentUser,
  noteId: string,
  tx: DbOrTx = db,
): Promise<Result<Note>> {
  const [note] = await tx.select().from(notes).where(eq(notes.id, noteId));
  if (!note) return err(appError('NOT_FOUND', 'errors.notFound'));
  const check = canEditNote(user, note);
  if (!check.allowed) return denied(check);
  return ok(note);
}

async function requireSeller(user: CurrentUser): Promise<Result<void>> {
  const check = canSell(user, await getSellerProfile(user.id));
  return check.allowed ? ok(undefined) : denied(check);
}

async function refreshSearchText(tx: DbOrTx, noteId: string): Promise<void> {
  const [row] = await tx
    .select({
      title: notes.title,
      short: notes.shortDescription,
      tags: notes.tags,
      course: courses.name,
      code: courses.code,
      professor: professors.name,
    })
    .from(notes)
    .leftJoin(courses, eq(courses.id, notes.courseId))
    .leftJoin(professors, eq(professors.id, notes.professorId))
    .where(eq(notes.id, noteId));
  if (!row) return;
  const text = normalizeForSearch(
    [row.title, row.course, row.code, row.professor, row.tags.join(' '), row.short]
      .filter(Boolean)
      .join(' '),
  );
  await tx.update(notes).set({ searchText: text }).where(eq(notes.id, noteId));
}

async function validateCourseAndProfessor(
  courseId: string,
  professorId: string | null | undefined,
): Promise<Result<void>> {
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.id, courseId));
  if (!course)
    return err(
      appError('VALIDATION', 'errors.validation', { courseId: ['validation.courseRequired'] }),
    );
  if (professorId) {
    const [link] = await db
      .select({ id: courseProfessors.id })
      .from(courseProfessors)
      .where(
        and(eq(courseProfessors.courseId, courseId), eq(courseProfessors.professorId, professorId)),
      );
    if (!link)
      return err(
        appError('VALIDATION', 'errors.validation', {
          professorId: ['validation.professorNotOnCourse'],
        }),
      );
  }
  return ok(undefined);
}

/** Step 1: create (or update) a draft with its course. */
export async function saveNoteCourse(
  user: CurrentUser,
  input: { noteId?: string | undefined; courseId: string; professorId?: string | null | undefined },
): Promise<Result<{ noteId: string }>> {
  const seller = await requireSeller(user);
  if (!seller.ok) return seller;
  const valid = await validateCourseAndProfessor(input.courseId, input.professorId);
  if (!valid.ok) return valid;
  if (input.noteId) {
    const loaded = await loadEditableNote(user, input.noteId);
    if (!loaded.ok) return loaded;
    await db.transaction(async (tx) => {
      await tx
        .update(notes)
        .set({
          courseId: input.courseId,
          professorId: input.professorId ?? null,
          wizardStep: Math.max(loaded.value.wizardStep, 2),
        })
        .where(eq(notes.id, loaded.value.id));
      await refreshSearchText(tx, loaded.value.id);
    });
    return ok({ noteId: loaded.value.id });
  }
  const id = uuidv7();
  await db.insert(notes).values({
    id,
    sellerId: user.id,
    courseId: input.courseId,
    professorId: input.professorId ?? null,
    // Placeholder slug; the stable public slug is assigned at first publication.
    slug: `nacrt-${id}`,
    wizardStep: 2,
  });
  await refreshSearchText(db, id);
  return ok({ noteId: id });
}

/** Step 2: a presigned PUT bound to this user, note, size and content type. */
export async function requestUpload(
  user: CurrentUser,
  input: { noteId: string; fileName: string; size: number; contentType: 'application/pdf' },
): Promise<Result<{ uploadId: string; url: string; headers: Record<string, string> }>> {
  const seller = await requireSeller(user);
  if (!seller.ok) return seller;
  const loaded = await loadEditableNote(user, input.noteId);
  if (!loaded.ok) return loaded;
  const settings = await getSettings();
  if (input.size > settings.maxPdfSizeBytes) {
    return err(
      appError('VALIDATION', 'errors.notes.tooLarge', {
        file: [`errors.notes.tooLarge|${Math.round(settings.maxPdfSizeBytes / 1024 / 1024)}`],
      }),
    );
  }
  const id = uuidv7();
  const objectKey = `notes/${loaded.value.id}/${id}.pdf`;
  await db.insert(uploads).values({
    id,
    userId: user.id,
    noteId: loaded.value.id,
    objectKey,
    sizeBytes: input.size,
    contentType: input.contentType,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });
  const url = await presignUpload(objectKey, input.contentType, input.size);
  return ok({ uploadId: id, url, headers: { 'Content-Type': input.contentType } });
}

const MAGIC = '%PDF-';

/**
 * Called after the browser PUT finishes: verifies the object (owner, size, magic bytes) and
 * starts background processing. Non-PDF uploads are deleted immediately.
 */
export async function confirmUpload(
  user: CurrentUser,
  input: { uploadId: string; changelog?: string | undefined },
): Promise<Result<{ versionId: string }>> {
  const [upload] = await db.select().from(uploads).where(eq(uploads.id, input.uploadId));
  if (!upload || upload.userId !== user.id || !upload.noteId)
    return err(appError('NOT_FOUND', 'errors.notFound'));
  if (upload.status !== 'pending' || upload.expiresAt < new Date())
    return err(appError('VALIDATION', 'errors.notes.uploadExpired'));
  const loaded = await loadEditableNote(user, upload.noteId);
  if (!loaded.ok) return loaded;
  const note = loaded.value;

  const head = await headObject(buckets.private, upload.objectKey);
  if (!head || head.size !== upload.sizeBytes)
    return err(appError('VALIDATION', 'errors.notes.uploadMissing'));
  const magic = (
    await readObjectRange(buckets.private, upload.objectKey, 0, MAGIC.length - 1)
  ).toString('latin1');
  if (magic !== MAGIC) {
    await deleteObject(buckets.private, upload.objectKey);
    await db.update(uploads).set({ status: 'rejected' }).where(eq(uploads.id, upload.id));
    return err(appError('VALIDATION', 'errors.notes.notPdf', { file: ['errors.notes.notPdf'] }));
  }

  const isNewVersionOfPublished = note.publishedAt !== null;
  if (isNewVersionOfPublished && !input.changelog?.trim()) {
    return err(
      appError('VALIDATION', 'errors.validation', { changelog: ['validation.changelogRequired'] }),
    );
  }

  const versionId = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ n: max(noteVersions.versionNumber) })
      .from(noteVersions)
      .where(eq(noteVersions.noteId, note.id));
    const id = uuidv7();
    await tx.insert(noteVersions).values({
      id,
      noteId: note.id,
      versionNumber: (current?.n ?? 0) + 1,
      fileKey: upload.objectKey,
      sizeBytes: upload.sizeBytes,
      status: 'uploaded',
      changelog: input.changelog?.trim() || null,
    });
    await tx.update(uploads).set({ status: 'consumed' }).where(eq(uploads.id, upload.id));
    if (!isNewVersionOfPublished) {
      await tx
        .update(notes)
        .set({ wizardStep: Math.max(note.wizardStep, 3) })
        .where(eq(notes.id, note.id));
    }
    return id;
  });
  await sendEvent('note/version.uploaded', { versionId }, `version-uploaded-${versionId}`);
  logger.info({ noteId: note.id, versionId }, 'note version uploaded');
  return ok({ versionId });
}

export interface ProcessingStatus {
  versionId: string;
  versionNumber: number;
  status: NoteVersion['status'];
  errorKey: string | null;
  pageCount: number | null;
  previews: { pageNumber: number; url: string; width: number; height: number; blurred: boolean }[];
}

export async function getLatestVersionStatus(
  user: CurrentUser,
  noteId: string,
): Promise<Result<ProcessingStatus | null>> {
  const loaded = await loadEditableNote(user, noteId);
  if (!loaded.ok) return loaded;
  const [version] = await db
    .select()
    .from(noteVersions)
    .where(eq(noteVersions.noteId, noteId))
    .orderBy(desc(noteVersions.versionNumber))
    .limit(1);
  if (!version) return ok(null);
  const previews = await db
    .select()
    .from(notePreviews)
    .where(eq(notePreviews.noteVersionId, version.id))
    .orderBy(notePreviews.pageNumber);
  return ok({
    versionId: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    errorKey: version.errorKey,
    pageCount: version.pageCount,
    previews: previews.map((p) => ({
      pageNumber: p.pageNumber,
      url: publicUrl(p.imageKey),
      width: p.width,
      height: p.height,
      blurred: p.blurred,
    })),
  });
}

export async function saveNoteDescription(
  user: CurrentUser,
  input: NoteDescriptionInput & { noteId: string },
): Promise<Result<void>> {
  const loaded = await loadEditableNote(user, input.noteId);
  if (!loaded.ok) return loaded;
  await db.transaction(async (tx) => {
    await tx
      .update(notes)
      .set({
        title: input.title,
        shortDescription: input.shortDescription,
        howIStudied: input.howIStudied,
        grade: input.grade,
        academicYear: input.academicYear,
        examPeriod: input.examPeriod,
        language: input.language,
        tags: [...new Set(input.tags.map((tag) => tag.toLowerCase()))],
        wizardStep: Math.max(loaded.value.wizardStep, 5),
      })
      .where(eq(notes.id, input.noteId));
    await refreshSearchText(tx, input.noteId);
  });
  return ok(undefined);
}

export async function saveNotePrice(
  user: CurrentUser,
  input: { noteId: string; priceRsd: number },
): Promise<Result<void>> {
  const loaded = await loadEditableNote(user, input.noteId);
  if (!loaded.ok) return loaded;
  const settings = await getSettings();
  const pricePara = input.priceRsd * PARA_PER_RSD;
  if (pricePara > settings.maxNotePricePara) {
    return err(
      appError('VALIDATION', 'errors.validation', {
        priceRsd: [`validation.priceTooHigh|${settings.maxNotePricePara / PARA_PER_RSD}`],
      }),
    );
  }
  await db
    .update(notes)
    .set({ pricePara, wizardStep: Math.max(loaded.value.wizardStep, 6) })
    .where(eq(notes.id, input.noteId));
  return ok(undefined);
}

export async function acceptDeclaration(user: CurrentUser, noteId: string): Promise<Result<void>> {
  const loaded = await loadEditableNote(user, noteId);
  if (!loaded.ok) return loaded;
  await db
    .update(notes)
    .set({ declarationAcceptedAt: new Date(), wizardStep: Math.max(loaded.value.wizardStep, 7) })
    .where(eq(notes.id, noteId));
  return ok(undefined);
}

/** Missing requirements for publication, as i18n keys (shown on the review step). */
export function publicationProblems(note: Note, latest: NoteVersion | null): string[] {
  const problems: string[] = [];
  if (!note.courseId) problems.push('notes.problems.course');
  if (!latest) problems.push('notes.problems.file');
  else if (latest.status === 'failed') problems.push('notes.problems.fileFailed');
  else if (latest.status !== 'ready') problems.push('notes.problems.processing');
  if (note.title.trim().length < 5) problems.push('notes.problems.title');
  if (note.shortDescription.trim().length < 20) problems.push('notes.problems.shortDescription');
  if (note.howIStudied.trim().length < MIN_HOW_I_STUDIED)
    problems.push('notes.problems.howIStudied');
  if (!note.declarationAcceptedAt) problems.push('notes.problems.declaration');
  return problems;
}

async function uniqueSlug(tx: DbOrTx, title: string, noteId: string): Promise<string> {
  const base = slugify(title, 70) || 'skripta';
  const candidates = [base, `${base}-${noteId.slice(-6)}`];
  for (const candidate of candidates) {
    const [taken] = await tx.select({ id: notes.id }).from(notes).where(eq(notes.slug, candidate));
    if (!taken || taken.id === noteId) return candidate;
  }
  return `${base}-${noteId.slice(-12)}`;
}

/**
 * Publish (SPEC §4.4): pre-moderation for the first N notes, flagged sellers and possible
 * duplicates → pending_review; otherwise published immediately.
 */
export async function publishNote(
  user: CurrentUser,
  noteId: string,
): Promise<Result<{ status: 'published' | 'pending_review'; slug: string }>> {
  const seller = await requireSeller(user);
  if (!seller.ok) return seller;
  const loaded = await loadEditableNote(user, noteId);
  if (!loaded.ok) return loaded;
  const note = loaded.value;
  if (!['draft', 'rejected'].includes(note.status))
    return err(appError('CONFLICT', 'errors.notes.alreadySubmitted'));
  const [latest] = await db
    .select()
    .from(noteVersions)
    .where(eq(noteVersions.noteId, noteId))
    .orderBy(desc(noteVersions.versionNumber))
    .limit(1);
  const problems = publicationProblems(note, latest ?? null);
  if (problems.length > 0)
    return err(appError('VALIDATION', 'errors.notes.notReady', { _form: problems }));
  const settings = await getSettings();
  if (note.pricePara > settings.maxNotePricePara)
    return err(appError('VALIDATION', 'errors.notes.notReady'));

  const sellerProfile = await getSellerProfile(user.id);
  const approved = await countApprovedNotes(user.id);
  const preModeration = approved < settings.preModeratedNotesCount;
  const flagged = Boolean(sellerProfile?.flaggedAt);
  const duplicate = Boolean(note.moderationFlags.possibleDuplicate);
  const status = preModeration || flagged || duplicate ? 'pending_review' : 'published';

  const slug = await db.transaction(async (tx) => {
    const newSlug = note.slug.startsWith('nacrt-')
      ? await uniqueSlug(tx, note.title, note.id)
      : note.slug;
    const now = new Date();
    await tx
      .update(notes)
      .set({
        status,
        slug: newSlug,
        rejectionReason: null,
        currentVersionId: (latest as NoteVersion).id,
        pageCount: (latest as NoteVersion).pageCount ?? 0,
        moderationFlags: { ...note.moderationFlags, preModeration, sellerFlagged: flagged },
        ...(status === 'published' ? { publishedAt: note.publishedAt ?? now } : {}),
      })
      .where(eq(notes.id, note.id));
    if (status === 'published') {
      await tx
        .update(noteVersions)
        .set({ publishedAt: now })
        .where(eq(noteVersions.id, (latest as NoteVersion).id));
    }
    return newSlug;
  });
  logger.info({ noteId, status }, 'note submitted');
  return ok({ status, slug });
}

/** Seller takes a published note off sale, or puts it back (unlisted ↔ published). */
export async function setNoteListed(
  user: CurrentUser,
  noteId: string,
  listed: boolean,
): Promise<Result<void>> {
  const loaded = await loadEditableNote(user, noteId);
  if (!loaded.ok) return loaded;
  const note = loaded.value;
  if (listed && note.status !== 'unlisted')
    return err(appError('CONFLICT', 'errors.notes.cannotList'));
  if (!listed && note.status !== 'published')
    return err(appError('CONFLICT', 'errors.notes.cannotUnlist'));
  await db
    .update(notes)
    .set({ status: listed ? 'published' : 'unlisted' })
    .where(eq(notes.id, noteId));
  return ok(undefined);
}

export async function deleteDraft(user: CurrentUser, noteId: string): Promise<Result<void>> {
  const loaded = await loadEditableNote(user, noteId);
  if (!loaded.ok) return loaded;
  if (loaded.value.publishedAt)
    return err(appError('CONFLICT', 'errors.notes.cannotDeletePublished'));
  await db
    .update(notes)
    .set({ deletedAt: new Date(), status: 'removed' })
    .where(eq(notes.id, noteId));
  return ok(undefined);
}

export async function toggleBookmark(
  userId: string,
  noteId: string,
  saved: boolean,
): Promise<Result<{ saved: boolean }>> {
  const [note] = await db
    .select({ status: notes.status })
    .from(notes)
    .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)));
  if (!note || !['published', 'unlisted'].includes(note.status))
    return err(appError('NOT_FOUND', 'errors.notFound'));
  if (saved) await db.insert(bookmarks).values({ userId, noteId }).onConflictDoNothing();
  else
    await db
      .delete(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.noteId, noteId)));
  return ok({ saved });
}

export async function listSellerNotes(sellerId: string) {
  return db
    .select({
      id: notes.id,
      title: notes.title,
      slug: notes.slug,
      status: notes.status,
      pricePara: notes.pricePara,
      salesCount: notes.salesCount,
      viewCount: notes.viewCount,
      reviewCount: notes.reviewCount,
      ratingSum: notes.ratingSum,
      rejectionReason: notes.rejectionReason,
      updatedAt: notes.updatedAt,
      wizardStep: notes.wizardStep,
      courseName: courses.name,
    })
    .from(notes)
    .leftJoin(courses, eq(courses.id, notes.courseId))
    .where(and(eq(notes.sellerId, sellerId), isNull(notes.deletedAt)))
    .orderBy(desc(notes.updatedAt));
}

export async function getVersionsForNotes(noteIds: string[]) {
  if (noteIds.length === 0) return [];
  return db.select().from(noteVersions).where(inArray(noteVersions.noteId, noteIds));
}

/** Median price of published paid notes for a course (SPEC §4.4 suggested price). */
export async function suggestedPricePara(courseId: string): Promise<number | null> {
  const [row] = await db.execute<{ median: number | null }>(sql`
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price_para)::int AS median
    FROM notes WHERE course_id = ${courseId} AND status = 'published' AND price_para > 0 AND deleted_at IS NULL`);
  if (!row?.median) return null;
  // Round to whole tens of dinars for a friendlier suggestion.
  return Math.round(row.median / 1000) * 1000;
}
