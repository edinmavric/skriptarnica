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

import { seedDemoActivity } from './demo-activity';
import { seedDemoForum } from './demo-forum';
import { demoPdf } from './demo-pdf';

/**
 * Demo users, notes (real PDFs through the real processing pipeline) for dev and preview.
 * Idempotent. Demo accounts share the password printed at the end (never used in production:
 * the seed refuses to run there).
 */
export const DEMO_PASSWORD = 'demo-skripta-2026';

export const sellers = [
  { email: 'milica.demo@example.com', name: 'Milica Jovanović', username: 'milica_demo' },
  { email: 'djordje.demo@example.com', name: 'Đorđe Ćirić', username: 'djordje_demo' },
  { email: 'ana.demo@example.com', name: 'Ana Petrović', username: 'ana_demo' },
  { email: 'stefan.demo@example.com', name: 'Stefan Ilić', username: 'stefan_demo' },
];

/** How-I-studied texts (the note page puts its own heading above them). */
const studied = [
  (course: string) =>
    `Za **${course}** sam učio oko dve nedelje, po 4–5 sati dnevno.\n\n1. Prvo sam prošao teoriju sa predavanja i napravio ove beleške.\n2. Zatim sam radio zadatke sa starih rokova, od najnovijih ka starijim.\n3. Poslednja dva dana samo ponavljanje formula i tipičnih zadataka.\n\n> Na ispitu su bili zadaci vrlo slični onima sa poslednja tri roka.\n\nDanas bih ranije počeo sa zadacima, a manje vremena trošio na prepisivanje teorije.`,
  (course: string) =>
    `${course} sam spremala tri nedelje uz kolokvijume. Svaki zadatak iz ove skripte sam rešila sama, pa proverila sa rešenjima asistenata.\n\n- Teoriju sam učila sa slajdova, a ovde je skraćena na ono što se stvarno pita.\n- Zadatke sam poređala od lakših ka težim.\n- Na kraju je spisak grešaka koje sam pravila na probnim kolokvijumima.\n\nNajviše mi je pomoglo da zadatke radim sa štopericom, kao na ispitu.`,
  (course: string) =>
    `Iz predmeta ${course} sam pao jednom, pa sam drugi put krenuo ozbiljno: mesec dana, sat-dva dnevno.\n\n1. Prvo sam sredio formule na jednom mestu.\n2. Onda sam prešao sve rokove iz poslednje četiri godine.\n3. Nedelju pred ispit sam išao na konsultacije sa pitanjima koja su mi ostala.\n\n> Usmeni je kratak ako znaš definicije napamet, one su na prve dve strane.`,
  (course: string) =>
    `Ovo su moje beleške sa vežbi iz predmeta ${course}, prepisane i dopunjene posle ispita. Učila sam oko 10 dana.\n\nSvaka oblast ima kratak rezime, rešen primer i dva zadatka za vežbu sa rešenjima na kraju. Ako imaš malo vremena, kreni od poglavlja označenih zvezdicom, ona dolaze na skoro svakom roku.`,
];

const demoNotes = [
  {
    seller: 0,
    course: 'Osnovi elektrotehnike 1',
    slug: 'oet-1-teorija-i-zadaci-demo',
    title: 'OET 1 — teorija i rešeni zadaci',
    description:
      'Kompletne beleške za Osnovi elektrotehnike 1: teorija, formule i rešeni zadaci sa rokova.',
    price: 80_000,
    grade: 9,
    pages: 24,
    period: 'januarski',
    studied: 0,
    topics: ['Kulonov zakon', 'Električno polje', 'Kondenzatori', 'Kirhofovi zakoni'],
  },
  {
    seller: 1,
    course: 'Osnovi elektrotehnike 1',
    slug: 'oet-1-kolokvijumi-demo',
    title: 'OET 1 — rešeni kolokvijumi 2020–2025',
    description: 'Svi kolokvijumi iz poslednjih pet godina, rešeni korak po korak.',
    price: 50_000,
    grade: 8,
    pages: 16,
    period: 'junski',
    studied: 2,
    topics: ['Prvi kolokvijum', 'Drugi kolokvijum', 'Popravni'],
  },
  {
    seller: 0,
    course: 'Matematika 1',
    slug: 'matematika-1-formule-demo',
    title: 'Matematika 1 — sve formule na 10 strana',
    description: 'Podsetnik sa svim formulama i teoremama koje trebaju za pismeni i usmeni.',
    price: 0,
    grade: 10,
    pages: 10,
    period: 'januarski',
    studied: 1,
    topics: ['Limesi', 'Izvodi', 'Integrali'],
  },
  {
    seller: 1,
    course: 'Programiranje 1',
    slug: 'programiranje-1-c-demo',
    title: 'Programiranje 1 — C od nule do ispita',
    description: 'C od prvog programa do datoteka, sa 40 rešenih zadataka sa rokova.',
    price: 120_000,
    grade: 9,
    pages: 32,
    period: 'januarski',
    studied: 0,
    topics: ['Petlje', 'Nizovi', 'Pokazivaci', 'Strukture', 'Datoteke'],
  },
  {
    seller: 2,
    course: 'Matematika 1',
    slug: 'matematika-1-zadaci-sa-rokova-demo',
    title: 'Matematika 1 — rešeni zadaci sa rokova',
    description:
      'Pismeni iz poslednje tri godine, grupisani po oblastima, sa objašnjenim postupkom.',
    price: 60_000,
    grade: 9,
    pages: 28,
    period: 'februarski',
    studied: 1,
    topics: ['Nizovi', 'Funkcije', 'Izvodi', 'Integrali', 'Redovi'],
  },
  {
    seller: 3,
    course: 'Fizika 1',
    slug: 'fizika-1-mehanika-demo',
    title: 'Fizika 1 — mehanika i oscilacije',
    description: 'Teorija u kratkim crtama i 30 zadataka iz mehanike, rada i oscilacija.',
    price: 70_000,
    grade: 8,
    pages: 22,
    period: 'januarski',
    studied: 2,
    topics: ['Kinematika', 'Njutnovi zakoni', 'Rad i energija', 'Oscilacije'],
  },
  {
    seller: 2,
    course: 'Osnovi elektrotehnike 2',
    slug: 'oet-2-magnetizam-demo',
    title: 'OET 2 — magnetizam i naizmenične struje',
    description: 'Beleške sa vežbi za OET 2, sa rešenim zadacima iz magnetnih kola i fazora.',
    price: 90_000,
    grade: 10,
    pages: 30,
    period: 'junski',
    studied: 3,
    topics: ['Magnetno polje', 'Indukcija', 'Magnetna kola', 'Fazori'],
  },
  {
    seller: 3,
    course: 'Programiranje 2',
    slug: 'programiranje-2-oop-demo',
    title: 'Programiranje 2 — OOP i C++ kroz zadatke',
    description: 'Klase, nasleđivanje i šabloni u C++ kroz zadatke sa laboratorijskih vežbi.',
    price: 100_000,
    grade: 9,
    pages: 36,
    period: 'junski',
    studied: 0,
    topics: ['Klase', 'Nasleđivanje', 'Polimorfizam', 'Šabloni', 'Izuzeci'],
  },
  {
    seller: 0,
    course: 'Algoritmi i strukture podataka',
    slug: 'asp-grafovi-i-stabla-demo',
    title: 'ASP — stabla, grafovi i sortiranje',
    description: 'Sve strukture sa slikama i pseudokodom, plus rešeni ispitni zadaci.',
    price: 110_000,
    grade: 10,
    pages: 40,
    period: 'septembarski',
    studied: 3,
    topics: ['Liste', 'Stabla', 'Hesiranje', 'Grafovi', 'Sortiranje'],
  },
  {
    seller: 1,
    course: 'Električna kola',
    slug: 'elektricna-kola-zadaci-demo',
    title: 'Električna kola — 50 rešenih zadataka',
    description: 'Zadaci iz prelaznih procesa i mreža, rešeni detaljno, sa skicama kola.',
    price: 80_000,
    grade: 8,
    pages: 26,
    period: 'januarski',
    studied: 2,
    topics: ['Prelazni procesi', 'Mreže', 'Rezonancija', 'Četvoropoli'],
  },
  {
    seller: 2,
    course: 'Verovatnoća i statistika',
    slug: 'vis-podsetnik-demo',
    title: 'Verovatnoća i statistika — podsetnik za ispit',
    description: 'Raspodele, testovi i formule na jednom mestu, sa primerima za svaku.',
    price: 0,
    grade: 9,
    pages: 12,
    period: 'junski',
    studied: 1,
    topics: ['Raspodele', 'Očekivanje', 'Ocene parametara', 'Testovi'],
  },
  {
    seller: 3,
    course: 'Baze podataka',
    slug: 'baze-podataka-sql-demo',
    title: 'Baze podataka — SQL i normalizacija',
    description: 'SQL upiti od osnovnih do ugnježdenih, ER modelovanje i normalne forme.',
    price: 90_000,
    grade: 10,
    pages: 34,
    period: 'januarski',
    studied: 3,
    topics: ['ER model', 'Relaciona algebra', 'SQL', 'Normalizacija', 'Transakcije'],
  },
] as const;

export async function ensureUser(input: {
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
    const pdf = await demoPdf(item.title, [...item.topics], item.pages);
    await writeObject(buckets.private, fileKey, pdf, 'application/pdf');
    await db.insert(notes).values({
      id: noteId,
      sellerId,
      courseId: course.id,
      title: item.title,
      slug: item.slug,
      shortDescription: item.description,
      howIStudied: (studied[item.studied] as (course: string) => string)(item.course),
      grade: item.grade,
      academicYear: '2024/25',
      examPeriod: item.period,
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
  await seedDemoActivity();
  await seedDemoForum();
}
