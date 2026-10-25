import { randomUUID } from 'node:crypto';

import { eq, inArray } from 'drizzle-orm';

import { completeMockSession } from '../../payments/mock';
import { createOrder, handlePaymentEvent, hasActiveEntitlement } from '../../services/orders';
import { createReview } from '../../services/reviews';
import { db } from '../client';
import { faculties, notes, orders, studentProfiles, users } from '../schema';

import { ensureUser } from './demo-content';
import { asCurrentUser } from './demo-forum';

export const buyers = [
  { email: 'nikola.demo@example.com', name: 'Nikola Stanković', username: 'nikola_demo' },
  { email: 'jovana.demo@example.com', name: 'Jovana Marković', username: 'jovana_demo' },
  { email: 'luka.demo@example.com', name: 'Luka Popović', username: 'luka_demo' },
  { email: 'teodora.demo@example.com', name: 'Teodora Nikolić', username: 'teodora_demo' },
];

/** [buyer index, note slug, rating, passed grade, review text]. */
const purchases: [number, string, number, number | null, string][] = [
  [
    0,
    'oet-1-teorija-i-zadaci-demo',
    5,
    8,
    'Zadaci su skoro isti kao na roku. Teorija je kratka, ali dovoljna za usmeni.',
  ],
  [
    1,
    'oet-1-teorija-i-zadaci-demo',
    4,
    7,
    'Dobra skripta, fali mi malo više objašnjenja kod kondenzatora.',
  ],
  [
    2,
    'oet-1-teorija-i-zadaci-demo',
    5,
    9,
    'Učio sam samo iz ovoga nedelju dana i položio. Preporuka.',
  ],
  [
    3,
    'oet-1-kolokvijumi-demo',
    5,
    8,
    'Rešenja su korak po korak, lako se prati čak i bez predavanja.',
  ],
  [0, 'oet-1-kolokvijumi-demo', 4, null, 'Korisno za kolokvijume, ispit je ipak malo teži.'],
  [
    1,
    'matematika-1-formule-demo',
    5,
    9,
    'Odštampala sam i nosila svuda. Sve formule na jednom mestu.',
  ],
  [2, 'matematika-1-formule-demo', 5, 8, 'Besplatna, a bolja od mnogih plaćenih. Hvala!'],
  [
    3,
    'matematika-1-zadaci-sa-rokova-demo',
    4,
    8,
    'Zadaci su dobro grupisani, samo bi dobro došlo još primera za redove.',
  ],
  [
    0,
    'programiranje-1-c-demo',
    5,
    10,
    'Pokazivači konačno imaju smisla. Zadaci sa rokova su odlično izabrani.',
  ],
  [
    2,
    'fizika-1-mehanika-demo',
    4,
    7,
    'Dobar pregled mehanike, oscilacije su malo kratko obrađene.',
  ],
  [1, 'oet-2-magnetizam-demo', 5, 9, 'Fazori su objašnjeni bolje nego na vežbama.'],
  [
    3,
    'asp-grafovi-i-stabla-demo',
    5,
    10,
    'Slike stabala i grafova mnogo pomažu. Najbolja skripta za ASP.',
  ],
  [
    0,
    'asp-grafovi-i-stabla-demo',
    5,
    9,
    'Pseudokod je čist i lako se prevodi u C. Položio iz prve.',
  ],
  [1, 'baze-podataka-sql-demo', 4, 8, 'SQL deo je odličan, normalizacija može detaljnije.'],
  [2, 'vis-podsetnik-demo', 5, 8, 'Kratko i jasno, idealno za poslednji dan pred ispit.'],
];

/**
 * Demo buyers who buy notes through the real order, mock payment and webhook path, then review
 * them, so notes show ratings and sellers have sales. Idempotent: skips purchases already made.
 */
export async function seedDemoActivity(): Promise<void> {
  const [etf] = await db.select().from(faculties).where(eq(faculties.slug, 'etf-bg'));
  if (!etf) throw new Error('demo: run the catalog seed first');
  const buyerRows = [];
  for (const buyer of buyers) {
    const id = await ensureUser(buyer);
    await db
      .update(studentProfiles)
      .set({
        facultyId: etf.id,
        universityId: etf.universityId,
        year: 2,
        onboardingStep: 'done',
        onboardingCompletedAt: new Date(),
        isAdult: true,
      })
      .where(eq(studentProfiles.userId, id));
    const [row] = await db.select().from(users).where(eq(users.id, id));
    if (row) buyerRows.push(asCurrentUser(row));
  }
  const noteRows = await db
    .select({ id: notes.id, slug: notes.slug })
    .from(notes)
    .where(inArray(notes.slug, [...new Set(purchases.map(([, slug]) => slug))]));
  const noteBySlug = new Map(noteRows.map((note) => [note.slug, note.id]));

  let bought = 0;
  for (const [buyerIndex, slug, rating, passedGrade, text] of purchases) {
    const buyer = buyerRows[buyerIndex];
    const noteId = noteBySlug.get(slug);
    if (!buyer || !noteId || (await hasActiveEntitlement(buyer.id, noteId))) continue;
    const created = await createOrder(buyer, {
      noteId,
      idempotencyKey: randomUUID(),
      withdrawalWaiver: true,
    });
    if (!created.ok) throw new Error(`demo purchase ${slug}: ${created.error.messageKey}`);
    const orderId = created.value.orderId;
    if (created.value.kind === 'redirect') {
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order?.providerRef) throw new Error(`demo purchase ${slug}: no provider reference`);
      await completeMockSession(order.providerRef, 'succeeded');
      await handlePaymentEvent('mock', {
        id: `evt_demo_${randomUUID()}`,
        type: 'payment.succeeded',
        providerRef: order.providerRef,
        amountPara: order.totalPara,
        occurredAt: new Date(),
      });
    }
    const review = await createReview(buyer.id, { orderId, rating, text, passedGrade });
    if (!review.ok) throw new Error(`demo review ${slug}: ${review.error.messageKey}`);
    bought += 1;
  }
  console.log(`demo: ${bought} purchases with reviews`);
}
