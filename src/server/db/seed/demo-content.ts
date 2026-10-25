import { and, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

import { normalizeForSearch } from '@/lib/search/normalize';

import { auth } from '../../auth/auth';
import { processVersion } from '../../services/note-processing';
import { buckets, writeObject } from '../../storage/s3';
import { db } from '../client';
import { legalVersions } from '@/config/legal';

import {
  consents,
  courses,
  examPeriods,
  faculties,
  notes,
  noteVersions,
  sellerProfiles,
  studentProfiles,
  userCourseStatus,
  users,
} from '../schema';

import { demoPdf } from './demo-pdf';

/**
 * Demo users, notes (real PDFs through the real processing pipeline) for dev and preview.
 * Idempotent. Demo accounts share the password printed at the end (never used in production:
 * the seed refuses to run there).
 */
export const DEMO_PASSWORD = 'demo-skripta-2026';

const sellers = [
  { email: 'milica.demo@example.com', name: 'Milica Jovanović', username: 'milica_demo' },
  { email: 'djordje.demo@example.com', name: 'Đorđe Ćirić', username: 'djordje_demo' },
];

const demoNotes = [
  {
    seller: 0,
    course: 'Osnovi elektrotehnike 1',
    slug: 'oet-1-teorija-i-zadaci-demo',
    title: 'OET 1 — teorija i rešeni zadaci',
    price: 80_000,
    grade: 9,
    pages: 24,
    topics: ['Kulonov zakon', 'Električno polje', 'Kondenzatori', 'Kirhofovi zakoni'],
  },
  {
    seller: 1,
    course: 'Osnovi elektrotehnike 1',
    slug: 'oet-1-kolokvijumi-demo',
    title: 'OET 1 — rešeni kolokvijumi 2020–2025',
    price: 50_000,
    grade: 8,
    pages: 16,
    topics: ['Prvi kolokvijum', 'Drugi kolokvijum', 'Popravni'],
  },
  {
    seller: 0,
    course: 'Matematika 1',
    slug: 'matematika-1-formule-demo',
    title: 'Matematika 1 — sve formule na 10 strana',
    price: 0,
    grade: 10,
    pages: 10,
    topics: ['Limesi', 'Izvodi', 'Integrali'],
  },
  {
    seller: 1,
    course: 'Programiranje 1',
    slug: 'programiranje-1-c-demo',
    title: 'Programiranje 1 — C od nule do ispita',
    price: 120_000,
    grade: 9,
    pages: 32,
    topics: ['Petlje', 'Nizovi', 'Pokazivaci', 'Strukture', 'Datoteke'],
  },
];

const howIStudied = (course: string) =>
  `## Kako sam učio\n\nZa **${course}** sam učio oko dve nedelje, po 4–5 sati dnevno.\n\n1. Prvo sam prošao teoriju sa predavanja i napravio ove beleške.\n2. Zatim sam radio zadatke sa starih rokova, od najnovijih ka starijim.\n3. Poslednja dva dana samo ponavljanje formula i tipičnih zadataka.\n\n> Na ispitu su bili zadaci vrlo slični onima sa poslednja tri roka.\n\nDanas bih ranije počeo sa zadacima, a manje vremena trošio na prepisivanje teorije.`;

async function ensureUser(input: {
  email: string;
  name: string;
  username: string;
}): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email));
  const id =
    existing?.id ??
    (
      await auth.api.signUpEmail({
        body: {
          email: input.email,
          name: input.name,
          password: DEMO_PASSWORD,
          username: input.username,
        },
      })
    ).user.id;
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, id));
  const [consented] = await db
    .select({ id: consents.id })
    .from(consents)
    .where(
      and(
        eq(consents.userId, id),
        eq(consents.type, 'terms'),
        eq(consents.documentVersion, legalVersions.terms),
      ),
    );
  if (!consented) {
    await db.insert(consents).values([
      { userId: id, type: 'terms', documentVersion: legalVersions.terms, value: true },
      { userId: id, type: 'privacy', documentVersion: legalVersions.privacy, value: true },
      { userId: id, type: 'age_15', documentVersion: legalVersions.terms, value: true },
      { userId: id, type: 'seller_terms', documentVersion: legalVersions.sellerTerms, value: true },
      { userId: id, type: 'age_18', documentVersion: legalVersions.sellerTerms, value: true },
    ]);
  }
  return id;
}

export async function seedDemoContent(): Promise<void> {
  const [etf] = await db.select().from(faculties).where(eq(faculties.slug, 'etf-bg'));
  if (!etf) throw new Error('demo: run the catalog seed first');
  const sellerIds: string[] = [];
  for (const seller of sellers) {
    const id = await ensureUser(seller);
    sellerIds.push(id);
    await db
      .insert(sellerProfiles)
      .values({
        userId: id,
        status: 'active',
        sellerTermsVersion: 'demo',
        sellerTermsAcceptedAt: new Date(),
        payoutAccountLast4: '0000',
      })
      .onConflictDoNothing();
    await db
      .update(studentProfiles)
      .set({
        facultyId: etf.id,
        universityId: etf.universityId,
        year: 3,
        onboardingStep: 'done',
        onboardingCompletedAt: new Date(),
        isAdult: true,
      })
      .where(eq(studentProfiles.userId, id));
  }

  let created = 0;
  for (const item of demoNotes) {
    const [exists] = await db.select({ id: notes.id }).from(notes).where(eq(notes.slug, item.slug));
    if (exists) continue;
    const [course] = await db
      .select()
      .from(courses)
      .where(and(eq(courses.facultyId, etf.id), eq(courses.name, item.course)));
    if (!course) continue;
    const sellerId = sellerIds[item.seller] as string;
    await db
      .insert(userCourseStatus)
      .values({ userId: sellerId, courseId: course.id, status: 'passed', grade: item.grade })
      .onConflictDoNothing();
    const noteId = uuidv7();
    const versionId = uuidv7();
    const fileKey = `notes/${noteId}/${versionId}.pdf`;
    const pdf = await demoPdf(item.title, item.topics, item.pages);
    await writeObject(buckets.private, fileKey, pdf, 'application/pdf');
    await db.insert(notes).values({
      id: noteId,
      sellerId,
      courseId: course.id,
      title: item.title,
      slug: item.slug,
      shortDescription: `Kompletne beleške za ${item.course}: teorija, formule i rešeni zadaci sa rokova.`,
      howIStudied: howIStudied(item.course),
      grade: item.grade,
      academicYear: '2024/25',
      examPeriod: 'januarski',
      pricePara: item.price,
      tags: ['teorija', 'zadaci'],
      declarationAcceptedAt: new Date(),
      wizardStep: 7,
      searchText: normalizeForSearch(`${item.title} ${item.course} ${course.code ?? ''}`),
    });
    await db.insert(noteVersions).values({
      id: versionId,
      noteId,
      versionNumber: 1,
      fileKey,
      sizeBytes: pdf.length,
      status: 'uploaded',
    });
    const processed = await processVersion(versionId);
    if (processed.status !== 'ready')
      throw new Error(`demo note ${item.slug} failed: ${processed.errorKey}`);
    const now = new Date();
    await db.update(noteVersions).set({ publishedAt: now }).where(eq(noteVersions.id, versionId));
    await db
      .update(notes)
      .set({ status: 'published', publishedAt: now, currentVersionId: versionId })
      .where(eq(notes.id, noteId));
    created += 1;
  }
  // Upcoming exam periods relative to today, so the feed's "exam period coming up" block shows.
  const belgradeDate = (offsetDays: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(
      new Date(Date.now() + offsetDays * 86_400_000),
    );
  const now = new Date();
  const startYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  const academicYear = `${startYear}/${String(startYear + 1).slice(-2)}`;
  for (const [name, offset] of [
    ['Osnovi elektrotehnike 1', 10],
    ['Matematika 1', 14],
    ['Programiranje 1', 40],
  ] as const) {
    const [course] = await db
      .select()
      .from(courses)
      .where(and(eq(courses.facultyId, etf.id), eq(courses.name, name)));
    if (!course) continue;
    await db
      .insert(examPeriods)
      .values({
        courseId: course.id,
        academicYear,
        period: 'oktobarski2',
        startsOn: belgradeDate(offset),
      })
      .onConflictDoUpdate({
        target: [examPeriods.courseId, examPeriods.academicYear, examPeriods.period],
        set: { startsOn: belgradeDate(offset) },
      });
  }
  console.log(
    `demo: ${created} notes created; demo sellers sign in with password "${DEMO_PASSWORD}"`,
  );
}
