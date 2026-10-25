import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { bankAccountControl } from '@/lib/bank-account';
import { db } from '@/server/db/client';
import {
  auditLog,
  catalogRequests,
  copyrightClaims,
  courses,
  ledgerEntries,
  notes,
  noteVersions,
  reports,
  sessions,
  twoFactors,
  users,
} from '@/server/db/schema';
import { approveNote, rejectNote } from '@/server/services/admin/note-review';
import {
  approveCatalogRequest,
  createCatalogItem,
  deleteCatalogItem,
  importCoursesCsv,
  rejectCatalogRequest,
  setCoursePlacement,
  setCourseProfessor,
  updateCatalogItem,
} from '@/server/services/admin/catalog-admin';
import { adjustSellerBalance, dashboardStats, financeCsv } from '@/server/services/admin/finance';
import {
  decideCopyrightClaim,
  removeNote,
  resolveReport,
} from '@/server/services/admin/moderation-admin';
import { listAuditLog, updatePlatformSettings } from '@/server/services/admin/system';
import {
  banUser,
  endImpersonation,
  resetTwoFactor,
  startImpersonation,
  unbanUser,
} from '@/server/services/admin/users';
import { sellerBalances } from '@/server/services/ledger';
import { becomeSeller } from '@/server/services/sellers';
import { getSettings } from '@/server/services/settings';
import { isAdmin } from '@/server/policies';

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
vi.mock('@/server/email/send', () => ({
  sendNotificationEmail: vi.fn(),
  sendActionEmail: vi.fn(),
  sendDigestEmail: vi.fn(),
}));

const account = `160-0000000012345-${bankAccountControl('160', '0000000012345')}`;
let catalog: Awaited<ReturnType<typeof createCatalog>>;
let admin: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  catalog = await createCatalog();
  admin = await createUser({ role: 'admin', twoFactorEnabled: true });
});

/** Runs an admin operation and returns the audit entries it added (by this admin). */
async function audited<T>(run: () => Promise<T>): Promise<{ result: T; actions: string[] }> {
  const ids = async () =>
    new Map(
      (
        await db
          .select({ id: auditLog.id, action: auditLog.action })
          .from(auditLog)
          .where(eq(auditLog.actorId, admin.id))
      ).map((row) => [row.id, row.action]),
    );
  const before = await ids();
  const result = await run();
  const after = await ids();
  return {
    result,
    actions: [...after].filter(([id]) => !before.has(id)).map(([, action]) => action),
  };
}

async function sellerWithNote(status: 'published' | 'pending_review' = 'published') {
  const seller = await createUser();
  await becomeSeller(seller.id, { accountHolder: 'Pera Perić', accountNumber: account }, 'ip');
  const [note] = await db
    .insert(notes)
    .values({
      sellerId: seller.id,
      courseId: catalog.courses[0].id,
      title: 'Skripta za admin test',
      slug: `a-${randomUUID()}`,
      status,
      publishedAt: new Date(),
      pricePara: 50_000,
      howIStudied: 'x'.repeat(200),
      shortDescription: 'Kratak opis skripte.',
    })
    .returning();
  return { seller, note: note as NonNullable<typeof note> };
}

describe('access', () => {
  it('an admin without 2FA is not an admin', () => {
    expect(isAdmin(asCurrentUser(admin)).allowed).toBe(true);
    expect(isAdmin(asCurrentUser(admin, { twoFactorEnabled: false }))).toEqual({
      allowed: false,
      reason: 'admin_2fa_required',
    });
    expect(isAdmin(asCurrentUser(admin, { role: 'student' })).allowed).toBe(false);
  });
});

describe('every admin action lands in the audit log', () => {
  it('users: ban, unban, 2FA reset, impersonation', async () => {
    const user = await createUser({ twoFactorEnabled: true });
    await db.insert(twoFactors).values({ userId: user.id, secret: 'x', backupCodes: 'y' });
    await db.insert(sessions).values({
      token: randomUUID(),
      userId: user.id,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    expect(
      (await audited(() => banUser(admin.id, user.id, 'Spam u zajednicama', 'ip'))).actions,
    ).toEqual(['user.banned']);
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
    expect((await audited(() => unbanUser(admin.id, user.id, 'ip'))).actions).toEqual([
      'user.unbanned',
    ]);
    expect((await audited(() => resetTwoFactor(admin.id, user.id, 'ip'))).actions).toEqual([
      'user.2fa_reset',
    ]);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.twoFactorEnabled).toBe(false);
    const started = await audited(() => startImpersonation(admin.id, user.id, 'ip', null));
    expect(started.actions).toEqual(['user.impersonation_started']);
    if (!started.result.ok) throw new Error('impersonation');
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, started.result.value.token));
    expect(session?.impersonatedBy).toBe(admin.id);
    expect(
      (await audited(() => endImpersonation(started.result.ok ? started.result.value.token : '')))
        .actions,
    ).toEqual(['user.impersonation_ended']);
  });

  it('refuses to ban or impersonate admins, and to act on itself', async () => {
    const other = await createUser({ role: 'admin', twoFactorEnabled: true });
    expect((await banUser(admin.id, other.id, 'razlog nekakav', 'ip')).ok).toBe(false);
    expect((await startImpersonation(admin.id, other.id, 'ip', null)).ok).toBe(false);
    expect((await resetTwoFactor(admin.id, admin.id, 'ip')).ok).toBe(false);
  });

  it('catalog: create, update (slug stable), links, delete only when unused', async () => {
    const created = await audited(() =>
      createCatalogItem(
        admin.id,
        'course',
        {
          facultyId: catalog.faculty.id,
          name: `Admin predmet ${randomUUID().slice(0, 4)}`,
          code: 'AP1',
          ects: 6,
          slug: undefined,
        },
        'ip',
      ),
    );
    expect(created.actions).toEqual(['catalog.course_created']);
    if (!created.result.ok) throw new Error('create');
    const id = created.result.value.id;
    const [before] = await db.select().from(courses).where(eq(courses.id, id));
    const updated = await audited(() =>
      updateCatalogItem(
        admin.id,
        'course',
        id,
        {
          facultyId: catalog.faculty.id,
          name: 'Novo ime predmeta',
          code: 'AP1',
          ects: 6,
          slug: undefined,
        },
        'ip',
      ),
    );
    expect(updated.actions).toEqual(['catalog.course_updated']);
    const [after] = await db.select().from(courses).where(eq(courses.id, id));
    expect(after?.slug).toBe(before?.slug);
    expect(after?.name).toBe('Novo ime predmeta');
    expect(
      (
        await audited(() =>
          setCoursePlacement(
            admin.id,
            {
              courseId: id,
              programId: catalog.program.id,
              year: 1,
              semester: 2,
              mandatory: true,
              remove: false,
            },
            'ip',
          ),
        )
      ).actions,
    ).toEqual(['catalog.placement_set']);
    const professor = await createCatalogItem(
      admin.id,
      'professor',
      { facultyId: catalog.faculty.id, name: 'Prof. Admin Testić', title: null, slug: undefined },
      'ip',
    );
    if (!professor.ok) throw new Error('prof');
    expect(
      (
        await audited(() =>
          setCourseProfessor(
            admin.id,
            { courseId: id, professorId: professor.value.id, remove: false },
            'ip',
          ),
        )
      ).actions,
    ).toEqual(['catalog.professor_linked']);
    // In use by a note → refused.
    const { note } = await sellerWithNote();
    await db.update(notes).set({ courseId: id }).where(eq(notes.id, note.id));
    const blocked = await deleteCatalogItem(admin.id, 'course', id, 'ip');
    expect(blocked.ok ? null : blocked.error.messageKey).toBe('errors.admin.inUse');
    await db.update(notes).set({ courseId: catalog.courses[0].id }).where(eq(notes.id, note.id));
    expect((await audited(() => deleteCatalogItem(admin.id, 'course', id, 'ip'))).actions).toEqual([
      'catalog.course_deleted',
    ]);
  });

  it('catalog: duplicate slugs are refused', async () => {
    const name = `Duplikat ${randomUUID().slice(0, 4)}`;
    expect(
      (
        await createCatalogItem(
          admin.id,
          'course',
          { facultyId: catalog.faculty.id, name, code: null, ects: undefined, slug: undefined },
          'ip',
        )
      ).ok,
    ).toBe(true);
    const again = await createCatalogItem(
      admin.id,
      'course',
      { facultyId: catalog.faculty.id, name, code: null, ects: undefined, slug: undefined },
      'ip',
    );
    expect(again.ok ? null : again.error.fieldErrors?.slug).toEqual(['validation.slugTaken']);
  });

  it('CSV import: dry run writes nothing; the real run is audited once', async () => {
    const suffix = randomUUID().slice(0, 4);
    const csv = `fakultet;smer;predmet;sifra;espb;godina;semestar;obavezan;profesori\n${catalog.faculty.slug};${catalog.program.slug};Uvoz ${suffix};U1;5;2;3;da;Prof. Uvoz ${suffix}\nnepostoji;;Loš red;;;;;;\n${catalog.faculty.slug};;Bez smera ${suffix};;;;;;`;
    const dry = await audited(() => importCoursesCsv(admin.id, csv, true, 'ip'));
    expect(dry.actions).toEqual([]);
    expect(dry.result.ok && dry.result.value.rows.map((row) => row.status)).toEqual([
      'created',
      'error',
      'created',
    ]);
    expect(
      await db
        .select()
        .from(courses)
        .where(eq(courses.name, `Uvoz ${suffix}`)),
    ).toHaveLength(0);
    const real = await audited(() => importCoursesCsv(admin.id, csv, false, 'ip'));
    expect(real.actions).toEqual(['catalog.csv_imported']);
    expect(
      await db
        .select()
        .from(courses)
        .where(eq(courses.name, `Uvoz ${suffix}`)),
    ).toHaveLength(1);
  });

  it('catalog requests: approve creates the entity; reject records the reason', async () => {
    const requester = await createUser();
    const [approveMe, rejectMe] = await db
      .insert(catalogRequests)
      .values([
        {
          userId: requester.id,
          type: 'professor',
          payload: { name: 'Prof. Zahtev', facultyId: catalog.faculty.id },
        },
        {
          userId: requester.id,
          type: 'course',
          payload: { name: 'Nepostojeći predmet', facultyId: catalog.faculty.id },
        },
      ])
      .returning();
    const approved = await audited(() =>
      approveCatalogRequest(
        admin.id,
        approveMe?.id ?? '',
        'professor',
        {
          facultyId: catalog.faculty.id,
          name: `Prof. Zahtev ${randomUUID().slice(0, 4)}`,
          title: null,
          slug: undefined,
        },
        'ip',
      ),
    );
    expect(approved.actions.sort()).toEqual([
      'catalog.professor_created',
      'catalog.request_approved',
    ]);
    expect(
      (
        await audited(() =>
          rejectCatalogRequest(admin.id, rejectMe?.id ?? '', 'Predmet ne postoji u planu.', 'ip'),
        )
      ).actions,
    ).toEqual(['catalog.request_rejected']);
    expect((await rejectCatalogRequest(admin.id, rejectMe?.id ?? '', 'ponovo', 'ip')).ok).toBe(
      false,
    );
  });

  it('notes: approve, reject, remove', async () => {
    const pendingA = await sellerWithNote('pending_review');
    const pendingB = await sellerWithNote('pending_review');
    const live = await sellerWithNote();
    await db.insert(noteVersions).values({
      noteId: pendingA.note.id,
      versionNumber: 1,
      fileKey: `k/${randomUUID()}`,
      sha256: randomUUID(),
      sizeBytes: 1000,
      status: 'ready',
    });
    expect((await audited(() => approveNote(admin.id, pendingA.note.id, 'ip'))).actions).toContain(
      'note.approved',
    );
    expect(
      (await audited(() => rejectNote(admin.id, pendingB.note.id, 'Nečitljivo skenirano.', 'ip')))
        .actions,
    ).toEqual(['note.rejected']);
    expect(
      (await audited(() => removeNote(admin.id, live.note.id, 'Povreda autorskih prava', 'ip')))
        .actions,
    ).toEqual(['note.removed']);
  });

  it('reports: resolve with content removal, dismiss', async () => {
    const reporter = await createUser();
    const { note } = await sellerWithNote();
    const [report, other] = await db
      .insert(reports)
      .values([
        { reporterId: reporter.id, targetType: 'note', targetId: note.id, reason: 'plagiarism' },
        { reporterId: reporter.id, targetType: 'note', targetId: note.id, reason: 'other' },
      ])
      .returning();
    const resolved = await audited(() =>
      resolveReport(
        asCurrentUser(admin),
        {
          reportId: report?.id ?? '',
          resolution: 'resolved',
          action: 'remove_content',
          note: 'Kopirano iz udžbenika',
        },
        'ip',
      ),
    );
    expect(resolved.actions.sort()).toEqual(['note.removed', 'report.resolved']);
    const [removed] = await db.select().from(notes).where(eq(notes.id, note.id));
    expect(removed?.status).toBe('removed');
    expect(
      (
        await audited(() =>
          resolveReport(
            asCurrentUser(admin),
            { reportId: other?.id ?? '', resolution: 'dismissed', action: 'none', note: null },
            'ip',
          ),
        )
      ).actions,
    ).toEqual(['report.dismissed']);
  });

  it('copyright: accept removes the note; decisions are final', async () => {
    const { note } = await sellerWithNote();
    const [claim] = await db
      .insert(copyrightClaims)
      .values({
        claimantName: 'Izdavač d.o.o.',
        claimantEmail: 'pravno@example.com',
        ownershipProof: 'Autorska prava na udžbenik.',
        contentUrl: `https://skriptarnica.rs/skripta/${note.slug}`,
        noteId: note.id,
        statementAcceptedAt: new Date(),
      })
      .returning();
    expect(
      (
        await audited(() =>
          decideCopyrightClaim(
            admin.id,
            { claimId: claim?.id ?? '', decision: 'accepted', note: 'Dokaz je validan.' },
            'ip',
          ),
        )
      ).actions.sort(),
    ).toEqual(['copyright.accepted', 'note.removed']);
    expect(
      (
        await decideCopyrightClaim(
          admin.id,
          { claimId: claim?.id ?? '', decision: 'rejected', note: 'ponovo' },
          'ip',
        )
      ).ok,
    ).toBe(false);
  });

  it('money: a balanced adjustment needs the amount twice', async () => {
    const { seller } = await sellerWithNote();
    const mismatch = await adjustSellerBalance(
      admin.id,
      {
        sellerId: seller.id,
        amountPara: 5_000,
        confirmAmountPara: 500,
        reason: 'Ispravka greške u proviziji',
      },
      'ip',
    );
    expect(mismatch.ok).toBe(false);
    const done = await audited(() =>
      adjustSellerBalance(
        admin.id,
        {
          sellerId: seller.id,
          amountPara: 5_000,
          confirmAmountPara: 5_000,
          reason: 'Ispravka greške u proviziji',
        },
        'ip',
      ),
    );
    expect(done.actions).toEqual(['ledger.adjustment']);
    expect((await sellerBalances(seller.id)).availablePara).toBe(5_000);
    if (!done.result.ok) throw new Error('adjust');
    const entries = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.transactionId, done.result.value.transactionId));
    expect(entries.reduce((sum, entry) => sum + entry.amountPara, 0)).toBe(0);
  });

  it('settings: changes are audited with a diff; no-op saves are not', async () => {
    const current = await getSettings();
    const changed = await audited(() =>
      updatePlatformSettings(
        admin.id,
        { ...current, minPayoutPara: current.minPayoutPara + 10_000 },
        'ip',
      ),
    );
    expect(changed.actions).toEqual(['settings.updated']);
    const [entry] = (await listAuditLog({ action: 'settings.updated' })).rows;
    expect(entry?.entry.details).toMatchObject({
      minPayoutPara: { from: current.minPayoutPara, to: current.minPayoutPara + 10_000 },
    });
    expect(
      (
        await audited(() =>
          updatePlatformSettings(
            admin.id,
            { ...current, minPayoutPara: current.minPayoutPara + 10_000 },
            'ip',
          ),
        )
      ).actions,
    ).toEqual([]);
    await updatePlatformSettings(admin.id, current, 'ip');
  });
});

describe('reports and dashboard', () => {
  it('dashboard has 30 days and CSV exports are well-formed', async () => {
    const stats = await dashboardStats();
    expect(stats.salesPerDay).toHaveLength(30);
    for (const kind of ['porudzbine', 'isplate', 'knjizenja'] as const) {
      const csv = await financeCsv(
        kind,
        new Date(Date.now() - 86_400_000 * 365),
        new Date(Date.now() + 86_400_000),
      );
      expect(csv.startsWith('﻿')).toBe(true);
      expect(csv.split('\r\n')[0]).toMatch(/_id/);
    }
  });
});
