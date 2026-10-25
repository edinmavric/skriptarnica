import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { db } from '@/server/db/client';
import { entitlements, notes, orders, userCourseStatus } from '@/server/db/schema';
import { upsertCourse } from '@/server/services/catalog';
import { saveProgramStep } from '@/server/services/onboarding';
import { invalidateRecommendations } from '@/server/services/recommendations-cache';
import { getRecommendedNoteIds, getRecommendations } from '@/server/services/recommendations';

import { createCatalog, createUser } from './factories';

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));

async function publishNote(
  sellerId: string,
  courseId: string,
  title: string,
  extra: Partial<typeof notes.$inferInsert> = {},
) {
  const [row] = await db
    .insert(notes)
    .values({
      sellerId,
      courseId,
      title,
      slug: `rec-${randomUUID()}`,
      status: 'published',
      publishedAt: new Date(),
      pricePara: 50_000,
      ...extra,
    })
    .returning({ id: notes.id });
  return (row as { id: string }).id;
}

describe('recommendations (Phase 6 acceptance)', () => {
  it('a new year-1 student sees only notes for their program’s current and next-year courses', async () => {
    const catalog = await createCatalog();
    const other = await createCatalog();
    const [yearOne, yearOneB, yearTwo] = catalog.courses;
    const notInProgram = await upsertCourse(db, {
      facultyId: catalog.faculty.id,
      name: `Izborni ${catalog.suffix}`,
    });
    const seller = await createUser();
    const n1 = await publishNote(seller.id, yearOne.id, 'Godina 1, A');
    const n2 = await publishNote(seller.id, yearOneB.id, 'Godina 1, B');
    const n3 = await publishNote(seller.id, yearTwo.id, 'Godina 2');
    const nOtherFaculty = await publishNote(seller.id, other.courses[0].id, 'Drugi fakultet');
    const nNotInProgram = await publishNote(seller.id, notInProgram.id, 'Izborni van smera');
    const nDraft = await publishNote(seller.id, yearOne.id, 'Nacrt', {
      status: 'draft',
      publishedAt: null,
    });

    const student = await createUser();
    await saveProgramStep(student.id, {
      universityId: catalog.university.id,
      facultyId: catalog.faculty.id,
      programId: catalog.program.id,
      year: 1,
    });
    const ids = await getRecommendedNoteIds(student.id);
    expect(new Set(ids)).toEqual(new Set([n1, n2, n3]));
    expect(ids).not.toContain(nOtherFaculty);
    expect(ids).not.toContain(nNotInProgram);
    expect(ids).not.toContain(nDraft);
    // Next-year notes rank below current-year ones.
    expect(ids.indexOf(n3)).toBe(2);

    const cards = await getRecommendations(student.id);
    expect(cards.map((card) => card.title)).toEqual(
      expect.arrayContaining(['Godina 1, A', 'Godina 1, B', 'Godina 2']),
    );
  });

  it('passed courses drop out, enrolled courses rise, owned and own notes are excluded', async () => {
    const catalog = await createCatalog();
    const [yearOne, yearOneB, yearTwo] = catalog.courses;
    const seller = await createUser();
    const a = await publishNote(seller.id, yearOne.id, 'A', { ratingSum: 50, reviewCount: 10 });
    const b = await publishNote(seller.id, yearOneB.id, 'B');
    const c = await publishNote(seller.id, yearTwo.id, 'C');
    const student = await createUser();
    await saveProgramStep(student.id, {
      universityId: catalog.university.id,
      facultyId: catalog.faculty.id,
      programId: catalog.program.id,
      year: 1,
    });
    const ownNote = await publishNote(student.id, yearOneB.id, 'Moja skripta');

    await db.insert(userCourseStatus).values([
      { userId: student.id, courseId: yearOne.id, status: 'passed', grade: 9 },
      { userId: student.id, courseId: yearTwo.id, status: 'enrolled' },
    ]);
    await invalidateRecommendations(student.id);
    let ids = await getRecommendedNoteIds(student.id);
    expect(ids).not.toContain(a);
    expect(ids).not.toContain(ownNote);
    expect(ids[0]).toBe(c);

    // Owning a note removes it.
    const [order] = await db
      .insert(orders)
      .values({
        buyerId: student.id,
        totalPara: 0,
        idempotencyKey: randomUUID(),
        provider: 'free',
        status: 'paid',
        paidAt: new Date(),
        withdrawalWaiverAcceptedAt: new Date(),
      })
      .returning({ id: orders.id });
    await db
      .insert(entitlements)
      .values({ userId: student.id, noteId: b, orderId: (order as { id: string }).id });
    await invalidateRecommendations(student.id);
    ids = await getRecommendedNoteIds(student.id);
    expect(ids).toEqual([c]);
  });

  it('returns nothing for a user without a program or courses', async () => {
    const student = await createUser();
    expect(await getRecommendedNoteIds(student.id)).toEqual([]);
  });

  it('serves the cached ranking until invalidated', async () => {
    const catalog = await createCatalog();
    const seller = await createUser();
    const student = await createUser();
    await saveProgramStep(student.id, {
      universityId: catalog.university.id,
      facultyId: catalog.faculty.id,
      programId: catalog.program.id,
      year: 1,
    });
    expect(await getRecommendedNoteIds(student.id)).toEqual([]);
    const fresh = await publishNote(seller.id, catalog.courses[0].id, 'Nova');
    expect(await getRecommendedNoteIds(student.id)).toEqual([]);
    await invalidateRecommendations(student.id);
    expect(await getRecommendedNoteIds(student.id)).toEqual([fresh]);
    await db.delete(userCourseStatus).where(eq(userCourseStatus.userId, student.id));
  });
});
