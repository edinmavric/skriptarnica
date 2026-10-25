import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { bankAccountControl } from '@/lib/bank-account';
import { db } from '@/server/db/client';
import { notePreviews, notes, noteVersions, sellerProfiles } from '@/server/db/schema';
import {
  checkDuplicates,
  finalizeVersion,
  processVersion,
} from '@/server/services/note-processing';
import {
  acceptDeclaration,
  confirmUpload,
  getLatestVersionStatus,
  publishNote,
  requestUpload,
  saveNoteCourse,
  saveNoteDescription,
  saveNotePrice,
} from '@/server/services/notes';
import { becomeSeller, decryptPayout, getSellerProfile } from '@/server/services/sellers';
import { buckets, headObject } from '@/server/storage/s3';

import { makeEncryptedPdf, makeNotPdf, makePdf, uniqueParagraphs } from '../fixtures/pdf';
import { asCurrentUser, createCatalog, createUser } from './factories';

vi.mock('@/server/jobs/client', () => ({
  sendEvent: vi.fn(),
  trySendEvent: vi.fn(async () => true),
  events: {},
  inngest: {},
}));

const account = `160-0000000012345-${bankAccountControl('160', '0000000012345')}`;

async function createSeller() {
  const user = await createUser();
  const result = await becomeSeller(
    user.id,
    { accountHolder: 'Pera Perić', accountNumber: account },
    'iphash',
  );
  expect(result.ok).toBe(true);
  return asCurrentUser(user);
}

async function upload(
  user: ReturnType<typeof asCurrentUser>,
  noteId: string,
  file: Buffer,
  changelog?: string,
) {
  const requested = await requestUpload(user, {
    noteId,
    fileName: 'skripta.pdf',
    size: file.length,
    contentType: 'application/pdf',
  });
  if (!requested.ok) throw new Error(JSON.stringify(requested.error));
  const put = await fetch(requested.value.url, {
    method: 'PUT',
    body: new Uint8Array(file),
    headers: requested.value.headers,
  });
  expect(put.status).toBe(200);
  return confirmUpload(user, {
    uploadId: requested.value.uploadId,
    ...(changelog ? { changelog } : {}),
  });
}

const description = {
  title: 'OET 1 — kompletna teorija',
  shortDescription: 'Sva teorija sa predavanja i rešeni zadaci sa rokova.',
  howIStudied: 'Učio sam dvanaest dana, po četiri do pet sati dnevno. '.repeat(6),
  grade: 9,
  academicYear: '2025/26',
  examPeriod: 'januarski' as const,
  language: 'sr_latn' as const,
  tags: ['teorija', 'zadaci'],
};

let catalog: Awaited<ReturnType<typeof createCatalog>>;
beforeAll(async () => {
  catalog = await createCatalog();
});

describe('becoming a seller', () => {
  it('stores payout details encrypted, never in plaintext', async () => {
    const seller = await createSeller();
    const [row] = await db
      .select()
      .from(sellerProfiles)
      .where(eq(sellerProfiles.userId, seller.id));
    expect(row?.status).toBe('active');
    expect(row?.payoutAccountEnc).not.toContain('0000000012345');
    expect(row?.payoutHolderEnc).not.toContain('Perić');
    expect(row?.payoutAccountLast4).toBe(account.replace(/\D/g, '').slice(-4));
    expect(decryptPayout(row as NonNullable<typeof row>)).toEqual({
      holder: 'Pera Perić',
      account,
    });
  });

  it('a non-seller cannot create a note', async () => {
    const user = asCurrentUser(await createUser());
    const result = await saveNoteCourse(user, { courseId: catalog.courses[0].id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.messageKey).toBe('errors.policy.not_seller');
  });

  it('an unverified email cannot sell', async () => {
    const user = await createUser({ emailVerified: false });
    await becomeSeller(user.id, { accountHolder: 'Ana Anić', accountNumber: account }, 'x');
    const result = await saveNoteCourse(asCurrentUser(user), { courseId: catalog.courses[0].id });
    expect(result.ok).toBe(false);
  });
});

describe('note upload, processing and publication', () => {
  it('runs the whole pipeline and pre-moderates a first note', async () => {
    const seller = await createSeller();
    const draft = await saveNoteCourse(seller, { courseId: catalog.courses[0].id });
    if (!draft.ok) throw new Error('draft');
    const noteId = draft.value.noteId;

    const confirmed = await upload(seller, noteId, await makePdf({ pages: 14, seed: noteId }));
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(await processVersion(confirmed.value.versionId)).toEqual({ status: 'ready' });
    expect(await checkDuplicates(confirmed.value.versionId)).toBeNull();
    expect(await finalizeVersion(confirmed.value.versionId, false)).toBe('draft');

    const status = await getLatestVersionStatus(seller, noteId);
    if (!status.ok || !status.value) throw new Error('status');
    expect(status.value).toMatchObject({ status: 'ready', pageCount: 14 });
    expect(status.value.previews.map((p) => p.blurred)).toEqual([false, true]);
    const image = await fetch(status.value.previews[0]?.url as string);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/webp');

    // Publishing before the description is complete lists what's missing.
    const early = await publishNote(seller, noteId);
    expect(early.ok).toBe(false);
    if (!early.ok)
      expect(early.error.fieldErrors?._form).toEqual(
        expect.arrayContaining([
          'notes.problems.title',
          'notes.problems.howIStudied',
          'notes.problems.declaration',
        ]),
      );

    expect((await saveNoteDescription(seller, { noteId, ...description })).ok).toBe(true);
    expect((await saveNotePrice(seller, { noteId, priceRsd: 800 })).ok).toBe(true);
    expect((await acceptDeclaration(seller, noteId)).ok).toBe(true);
    const published = await publishNote(seller, noteId);
    expect(published).toEqual({
      ok: true,
      value: { status: 'pending_review', slug: 'oet-1-kompletna-teorija' },
    });
    const [note] = await db.select().from(notes).where(eq(notes.id, noteId));
    expect(note?.pricePara).toBe(80000);
    expect(note?.moderationFlags.preModeration).toBe(true);
  });

  it('rejects a non-PDF at confirmation and deletes the object', async () => {
    const seller = await createSeller();
    const draft = await saveNoteCourse(seller, { courseId: catalog.courses[0].id });
    if (!draft.ok) throw new Error('draft');
    const file = makeNotPdf();
    const requested = await requestUpload(seller, {
      noteId: draft.value.noteId,
      fileName: 'x.pdf',
      size: file.length,
      contentType: 'application/pdf',
    });
    if (!requested.ok) throw new Error('upload');
    await fetch(requested.value.url, {
      method: 'PUT',
      body: new Uint8Array(file),
      headers: requested.value.headers,
    });
    const result = await confirmUpload(seller, { uploadId: requested.value.uploadId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.messageKey).toBe('errors.notes.notPdf');
    const key = requested.value.url.split('?')[0]?.split(`/${buckets.private}/`)[1] as string;
    expect(await headObject(buckets.private, decodeURIComponent(key))).toBeNull();
  });

  it('marks an encrypted PDF as failed with a clear error and deletes it', async () => {
    const seller = await createSeller();
    const draft = await saveNoteCourse(seller, { courseId: catalog.courses[0].id });
    if (!draft.ok) throw new Error('draft');
    const confirmed = await upload(seller, draft.value.noteId, await makeEncryptedPdf());
    if (!confirmed.ok) throw new Error('confirm');
    expect(await processVersion(confirmed.value.versionId)).toEqual({
      status: 'failed',
      errorKey: 'notes.processing.encrypted',
    });
    const [version] = await db
      .select()
      .from(noteVersions)
      .where(eq(noteVersions.id, confirmed.value.versionId));
    expect(await headObject(buckets.private, version?.fileKey as string)).toBeNull();
  });

  it('enforces the declared size on the presigned PUT', async () => {
    const seller = await createSeller();
    const draft = await saveNoteCourse(seller, { courseId: catalog.courses[0].id });
    if (!draft.ok) throw new Error('draft');
    const requested = await requestUpload(seller, {
      noteId: draft.value.noteId,
      fileName: 'x.pdf',
      size: 100,
      contentType: 'application/pdf',
    });
    if (!requested.ok) throw new Error('upload');
    const put = await fetch(requested.value.url, {
      method: 'PUT',
      body: new Uint8Array(5000),
      headers: requested.value.headers,
    });
    expect(put.ok).toBe(false);
  });

  it('refuses files over the configured limit before uploading', async () => {
    const seller = await createSeller();
    const draft = await saveNoteCourse(seller, { courseId: catalog.courses[0].id });
    if (!draft.ok) throw new Error('draft');
    const result = await requestUpload(seller, {
      noteId: draft.value.noteId,
      fileName: 'big.pdf',
      size: 51 * 1024 * 1024,
      contentType: 'application/pdf',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.messageKey).toBe('errors.notes.tooLarge');
  });

  it('refuses a price above the maximum', async () => {
    const seller = await createSeller();
    const draft = await saveNoteCourse(seller, { courseId: catalog.courses[0].id });
    if (!draft.ok) throw new Error('draft');
    expect((await saveNotePrice(seller, { noteId: draft.value.noteId, priceRsd: 3001 })).ok).toBe(
      false,
    );
    expect((await saveNotePrice(seller, { noteId: draft.value.noteId, priceRsd: 3000 })).ok).toBe(
      true,
    );
  });
});

describe('ownership (IDOR)', () => {
  it('another seller cannot read status, upload to, edit or publish someone else’s note', async () => {
    const owner = await createSeller();
    const intruder = await createSeller();
    const draft = await saveNoteCourse(owner, { courseId: catalog.courses[0].id });
    if (!draft.ok) throw new Error('draft');
    const noteId = draft.value.noteId;
    for (const result of [
      await getLatestVersionStatus(intruder, noteId),
      await requestUpload(intruder, {
        noteId,
        fileName: 'x.pdf',
        size: 10,
        contentType: 'application/pdf',
      }),
      await saveNoteDescription(intruder, { noteId, ...description }),
      await saveNotePrice(intruder, { noteId, priceRsd: 1 }),
      await saveNoteCourse(intruder, { noteId, courseId: catalog.courses[1].id }),
      await publishNote(intruder, noteId),
    ]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('cannot confirm someone else’s upload session', async () => {
    const owner = await createSeller();
    const intruder = await createSeller();
    const draft = await saveNoteCourse(owner, { courseId: catalog.courses[0].id });
    if (!draft.ok) throw new Error('draft');
    const requested = await requestUpload(owner, {
      noteId: draft.value.noteId,
      fileName: 'x.pdf',
      size: 10,
      contentType: 'application/pdf',
    });
    if (!requested.ok) throw new Error('upload');
    const result = await confirmUpload(intruder, { uploadId: requested.value.uploadId });
    expect(result.ok).toBe(false);
  });
});

describe('duplicate detection', () => {
  it('flags the same file uploaded by another seller', async () => {
    const file = await makePdf({ pages: 10, paragraphs: uniqueParagraphs() });
    const a = await createSeller();
    const b = await createSeller();
    const draftA = await saveNoteCourse(a, { courseId: catalog.courses[0].id });
    const draftB = await saveNoteCourse(b, { courseId: catalog.courses[0].id });
    if (!draftA.ok || !draftB.ok) throw new Error('draft');
    const va = await upload(a, draftA.value.noteId, file);
    const vb = await upload(b, draftB.value.noteId, file);
    if (!va.ok || !vb.ok) throw new Error('upload');
    await processVersion(va.value.versionId);
    await processVersion(vb.value.versionId);
    expect(await checkDuplicates(va.value.versionId)).toBeNull();
    const flag = await checkDuplicates(vb.value.versionId);
    expect(flag).toMatchObject({ noteId: draftA.value.noteId, reason: 'same_hash' });
    const [note] = await db.select().from(notes).where(eq(notes.id, draftB.value.noteId));
    expect(note?.moderationFlags.possibleDuplicate?.reason).toBe('same_hash');
  });

  it('flags a near-identical text (one page edited) by simhash', async () => {
    const paragraphs = uniqueParagraphs(8);
    const original = await makePdf({ pages: 12, paragraphs });
    const edited = await makePdf({
      pages: 12,
      paragraphs,
      pageOverrides: { 0: uniqueParagraphs(8) },
    });
    const a = await createSeller();
    const b = await createSeller();
    const da = await saveNoteCourse(a, { courseId: catalog.courses[0].id });
    const dbb = await saveNoteCourse(b, { courseId: catalog.courses[0].id });
    if (!da.ok || !dbb.ok) throw new Error('draft');
    const va = await upload(a, da.value.noteId, original);
    const vb = await upload(b, dbb.value.noteId, edited);
    if (!va.ok || !vb.ok) throw new Error('upload');
    await processVersion(va.value.versionId);
    await processVersion(vb.value.versionId);
    expect(await checkDuplicates(vb.value.versionId)).toMatchObject({
      noteId: da.value.noteId,
      reason: 'similar_text',
    });
  });

  it('does not flag a seller re-uploading their own file', async () => {
    const file = await makePdf({ pages: 10, paragraphs: uniqueParagraphs() });
    const a = await createSeller();
    const d1 = await saveNoteCourse(a, { courseId: catalog.courses[0].id });
    const d2 = await saveNoteCourse(a, { courseId: catalog.courses[1].id });
    if (!d1.ok || !d2.ok) throw new Error('draft');
    const v1 = await upload(a, d1.value.noteId, file);
    const v2 = await upload(a, d2.value.noteId, file);
    if (!v1.ok || !v2.ok) throw new Error('upload');
    await processVersion(v1.value.versionId);
    await processVersion(v2.value.versionId);
    expect(await checkDuplicates(v2.value.versionId)).toBeNull();
  });
});

it('keeps preview rows idempotent on retries', async () => {
  const seller = await createSeller();
  const draft = await saveNoteCourse(seller, { courseId: catalog.courses[0].id });
  if (!draft.ok) throw new Error('draft');
  const confirmed = await upload(seller, draft.value.noteId, await makePdf({ pages: 3 }));
  if (!confirmed.ok) throw new Error('confirm');
  await processVersion(confirmed.value.versionId);
  await db
    .update(noteVersions)
    .set({ status: 'processing' })
    .where(eq(noteVersions.id, confirmed.value.versionId));
  await processVersion(confirmed.value.versionId);
  const rows = await db
    .select()
    .from(notePreviews)
    .where(eq(notePreviews.noteVersionId, confirmed.value.versionId));
  expect(rows).toHaveLength(1);
  expect((await getSellerProfile(seller.id))?.status).toBe('active');
});
