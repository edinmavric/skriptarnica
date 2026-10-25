import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { bankAccountControl } from '@/lib/bank-account';
import { db } from '@/server/db/client';
import {
  comments,
  communities,
  communityMembers,
  entitlements,
  notes,
  notifications,
  orders,
  posts,
  sessions,
  users,
} from '@/server/db/schema';
import { verifyUnsubscribeToken, unsubscribeToken } from '@/server/email/unsubscribe';
import {
  cancelDeletion,
  executeDeletion,
  executeDueDeletions,
  scheduleDeletion,
} from '@/server/services/account-deletion';
import { joinCommunity } from '@/server/services/communities';
import { buildExportZip, collectUserData } from '@/server/services/data-export';
import { runDigests } from '@/server/services/digest';
import { createComment, createPost } from '@/server/services/forum';
import { onForumReply, onOrderPaid, onReviewCreated } from '@/server/services/notification-events';
import {
  listNotifications,
  markRead,
  notify,
  setPreference,
  unreadCount,
} from '@/server/services/notifications';
import { createOrder, handlePaymentEvent } from '@/server/services/orders';
import { completeMockSession } from '@/server/payments/mock';
import { createReview } from '@/server/services/reviews';
import { becomeSeller } from '@/server/services/sellers';

import { asCurrentUser, createCatalog, createUser } from './factories';

const sent = vi.hoisted(() => ({
  notification: [] as unknown[],
  action: [] as unknown[],
  digest: [] as unknown[],
}));

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
  sendNotificationEmail: vi.fn(async (input: unknown) => void sent.notification.push(input)),
  sendActionEmail: vi.fn(async (...args: unknown[]) => void sent.action.push(args)),
  sendDigestEmail: vi.fn(async (input: unknown) => void sent.digest.push(input)),
}));

const account = `160-0000000012345-${bankAccountControl('160', '0000000012345')}`;
let catalog: Awaited<ReturnType<typeof createCatalog>>;
let community: { id: string; slug: string };

beforeAll(async () => {
  catalog = await createCatalog();
  const [row] = await db
    .select({ id: communities.id, slug: communities.slug })
    .from(communities)
    .where(eq(communities.courseId, catalog.courses[0].id));
  if (!row) throw new Error('no course community');
  community = row;
});

beforeEach(() => {
  sent.notification.length = 0;
  sent.action.length = 0;
  sent.digest.length = 0;
});

async function sellerWithNote(pricePara = 50_000) {
  const seller = await createUser();
  await becomeSeller(seller.id, { accountHolder: 'Pera Perić', accountNumber: account }, 'ip');
  const [note] = await db
    .insert(notes)
    .values({
      sellerId: seller.id,
      courseId: catalog.courses[0].id,
      title: `Skripta ${randomUUID().slice(0, 6)}`,
      slug: `n-${randomUUID()}`,
      status: 'published',
      publishedAt: new Date(),
      pricePara,
      howIStudied: 'x'.repeat(200),
      shortDescription: 'Kratak opis skripte za test.',
    })
    .returning();
  return { seller, note: note as NonNullable<typeof note> };
}

async function purchase(noteId: string, buyer: Awaited<ReturnType<typeof createUser>>) {
  const created = await createOrder(asCurrentUser(buyer), {
    noteId,
    idempotencyKey: randomUUID(),
    withdrawalWaiver: true,
  });
  if (!created.ok) throw new Error(JSON.stringify(created.error));
  const [order] = await db.select().from(orders).where(eq(orders.buyerId, buyer.id));
  if (!order?.providerRef) throw new Error('no order');
  await completeMockSession(order.providerRef, 'succeeded');
  await handlePaymentEvent('mock', {
    id: `evt_${randomUUID()}`,
    type: 'payment.succeeded',
    providerRef: order.providerRef,
    amountPara: order.totalPara,
    occurredAt: new Date(),
  });
  return order.id;
}

async function memberOf() {
  const user = await createUser();
  await joinCommunity(asCurrentUser(user), community.slug);
  return user;
}

describe('notifications', () => {
  it('is idempotent per dedupe key, respects "none" and emails only for in_app_email', async () => {
    const user = await createUser();
    const input = {
      userId: user.id,
      type: 'sale' as const,
      dedupeKey: 'k1',
      payload: { href: '/prodaja', noteTitle: 'X', amount: '400 RSD' },
    };
    expect(await notify(input)).toBe(true);
    expect(await notify(input)).toBe(false);
    expect(sent.notification).toHaveLength(1);
    await setPreference(user.id, 'sale', 'in_app');
    expect(await notify({ ...input, dedupeKey: 'k2' })).toBe(true);
    expect(sent.notification).toHaveLength(1);
    await setPreference(user.id, 'sale', 'none');
    expect(await notify({ ...input, dedupeKey: 'k3' })).toBe(false);
    expect(await unreadCount(user.id)).toBe(2);
  });

  it("marks only the owner's notifications as read", async () => {
    const [a, b] = [await createUser(), await createUser()];
    await notify({
      userId: a.id,
      type: 'mention',
      dedupeKey: 'm',
      payload: { href: '/', actor: 'x', postTitle: 'p' },
    });
    await notify({
      userId: b.id,
      type: 'mention',
      dedupeKey: 'm',
      payload: { href: '/', actor: 'x', postTitle: 'p' },
    });
    const bItem = (await listNotifications(b.id)).items[0];
    await markRead(a.id, [bItem?.id ?? '']);
    expect(await unreadCount(b.id)).toBe(1);
    await markRead(a.id, 'all');
    expect(await unreadCount(a.id)).toBe(0);
    expect(await unreadCount(b.id)).toBe(1);
  });

  it('a sale notifies the seller and emails the buyer a purchase confirmation', async () => {
    const { seller, note } = await sellerWithNote(80_000);
    const buyer = await createUser();
    const orderId = await purchase(note.id, buyer);
    await onOrderPaid({ orderId });
    await onOrderPaid({ orderId }); // a retried job doesn't double-notify
    const items = (await listNotifications(seller.id)).items;
    expect(items).toHaveLength(1);
    expect(items[0]?.payload).toMatchObject({ noteTitle: note.title, amount: '640 RSD' });
    expect(sent.action.filter((args) => (args as string[])[0] === 'purchase')).toHaveLength(1);

    const review = await createReview(buyer.id, {
      orderId,
      rating: 5,
      text: 'Odlična skripta, sve jasno.',
      passedGrade: null,
    });
    if (!review.ok) throw new Error(JSON.stringify(review.error));
    await onReviewCreated({ reviewId: review.value.id });
    expect((await listNotifications(seller.id)).items.map((item) => item.type)).toContain(
      'review_new',
    );
  });

  it('replies notify the parent author; anonymous actors stay anonymous; mentions respect self', async () => {
    const author = await memberOf();
    const replier = await memberOf();
    const mentioned = await memberOf();
    const post = await createPost(asCurrentUser(author), {
      communityId: community.id,
      type: 'text',
      title: 'Pitanje o kolokvijumu',
      body: 'Ko zna?',
      isAnonymous: false,
    });
    if (!post.ok) throw new Error('post');
    const comment = await createComment(asCurrentUser(replier), {
      postId: post.value.id,
      parentId: null,
      body: `Pitaj @${mentioned.username} ili @${replier.username}`,
      isAnonymous: true,
    });
    if (!comment.ok) throw new Error('comment');
    await onForumReply({ kind: 'comment', id: comment.value.id });
    const [reply] = (await listNotifications(author.id)).items;
    expect(reply?.type).toBe('forum_reply');
    expect(reply?.payload.actor).toBeNull();
    expect(JSON.stringify(reply)).not.toContain(replier.username ?? '-');
    const mentions = (await listNotifications(mentioned.id)).items;
    expect(mentions.map((item) => item.type)).toEqual(['mention']);
    expect((await listNotifications(replier.id)).items).toHaveLength(0);
  });
});

describe('unsubscribe tokens', () => {
  it('round-trips and rejects tampering', () => {
    const userId = randomUUID();
    const token = unsubscribeToken(userId, 'digest');
    expect(verifyUnsubscribeToken(token)).toEqual({ userId, scope: 'digest' });
    const [body, signature] = token.split('.');
    const forged = `${Buffer.from(`${randomUUID()}:digest`).toString('base64url')}.${signature}`;
    expect(verifyUnsubscribeToken(forged)).toBeNull();
    expect(verifyUnsubscribeToken(`${body}.x${signature?.slice(1)}`)).toBeNull();
  });
});

describe('digest', () => {
  it("sends new posts from the user's communities, never their own, and only when there is news", async () => {
    const reader = await memberOf();
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, reader.id));
    const writer = await memberOf();
    const title = `Digest objava ${randomUUID().slice(0, 6)}`;
    await createPost(asCurrentUser(writer), {
      communityId: community.id,
      type: 'text',
      title,
      body: 'Tekst objave.',
      isAnonymous: false,
    });
    await createPost(asCurrentUser(reader), {
      communityId: community.id,
      type: 'text',
      title: 'Moja objava u digestu',
      body: 'Tekst.',
      isAnonymous: false,
    });
    const monday = new Date('2026-10-26T07:00:00+01:00');
    expect(await runDigests(new Date(Math.max(Date.now(), monday.getTime())), reader.id)).toBe(1);
    const email = sent.digest[0] as { items: { title: string }[] };
    expect(email.items.map((item) => item.title)).toContain(title);
    expect(email.items.map((item) => item.title)).not.toContain('Moja objava u digestu');
    // Nothing new since the last digest → nothing sent.
    expect(
      await runDigests(new Date(Math.max(Date.now(), monday.getTime()) + 1000), reader.id),
    ).toBe(0);
  });
});

describe('data export', () => {
  it("contains all of the user's data and nothing that belongs to others", async () => {
    const { seller, note } = await sellerWithNote();
    const buyer = await createUser();
    const other = await memberOf();
    await joinCommunity(asCurrentUser(buyer), community.slug);
    await purchase(note.id, buyer);
    const myPost = await createPost(asCurrentUser(buyer), {
      communityId: community.id,
      type: 'text',
      title: 'Moje anonimno pitanje',
      body: 'Tajni tekst kupca',
      isAnonymous: true,
    });
    if (!myPost.ok) throw new Error('post');
    await createComment(asCurrentUser(other), {
      postId: myPost.value.id,
      parentId: null,
      body: 'Tuđi komentar drugog korisnika',
      isAnonymous: false,
    });

    const data = await collectUserData(buyer.id);
    const json = JSON.stringify(data);
    expect(json).toContain(buyer.email);
    expect(json).toContain('Tajni tekst kupca');
    expect(json).toContain(note.title);
    expect((data.purchases as unknown[]).length).toBe(1);
    // Nobody else's identity or content.
    for (const foreign of [
      seller.email,
      seller.username,
      other.email,
      other.username,
      'Tuđi komentar drugog korisnika',
    ]) {
      expect(json).not.toContain(foreign);
    }
    // No secrets.
    expect(json).not.toMatch(/"(password|token|secret|accessToken|payoutAccountEnc)"/);

    const sellerData = JSON.stringify(await collectUserData(seller.id));
    expect(sellerData).toContain('"sellerPara":40000');
    expect(sellerData).not.toContain(buyer.email);
    expect(sellerData).not.toContain(buyer.id);

    const files = unzipSync(buildExportZip(data));
    expect(Object.keys(files).sort()).toEqual(['README.txt', 'podaci.json']);
    expect(JSON.parse(strFromU8(files['podaci.json'] as Uint8Array)).account.email).toBe(
      buyer.email,
    );
  });
});

describe('account deletion', () => {
  it('schedules with a 14-day grace period, can be cancelled, and signs out other sessions', async () => {
    const user = await createUser();
    const keep = randomUUID();
    await db.insert(sessions).values([
      {
        id: keep,
        token: randomUUID(),
        userId: user.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
      {
        id: randomUUID(),
        token: randomUUID(),
        userId: user.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    ]);
    const result = await scheduleDeletion({
      userId: user.id,
      currentSessionId: keep,
      deleteContent: false,
      waiveBalance: false,
      ipHash: null,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const days = (result.value.scheduledFor.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.99);
    expect(days).toBeLessThan(14.01);
    expect(
      (await db.select().from(sessions).where(eq(sessions.userId, user.id))).map((s) => s.id),
    ).toEqual([keep]);
    // Not due yet: nothing happens.
    expect(await executeDeletion(user.id)).toBe(false);
    await cancelDeletion(user.id, null);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.deletionScheduledFor).toBeNull();
  });

  it('a seller with a balance must waive it; deletion anonymizes, keeps threads and buyer access', async () => {
    const { seller, note } = await sellerWithNote();
    await joinCommunity(asCurrentUser(seller), community.slug);
    const buyer = await createUser();
    await purchase(note.id, buyer);
    const post = await createPost(asCurrentUser(seller), {
      communityId: community.id,
      type: 'text',
      title: 'Objava prodavca',
      body: 'Ostaje u diskusiji',
      isAnonymous: false,
    });
    if (!post.ok) throw new Error('post');

    const blocked = await scheduleDeletion({
      userId: seller.id,
      currentSessionId: null,
      deleteContent: false,
      waiveBalance: false,
      ipHash: null,
    });
    expect(blocked.ok ? null : blocked.error.messageKey).toBe('errors.account.balance');
    const scheduled = await scheduleDeletion({
      userId: seller.id,
      currentSessionId: null,
      deleteContent: false,
      waiveBalance: true,
      ipHash: null,
    });
    expect(scheduled.ok).toBe(true);
    await db
      .update(users)
      .set({ deletionScheduledFor: new Date(Date.now() - 1000) })
      .where(eq(users.id, seller.id));
    expect(await executeDueDeletions()).toBeGreaterThanOrEqual(1);

    const [row] = await db.select().from(users).where(eq(users.id, seller.id));
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.email).not.toBe(seller.email);
    expect(row?.username).toBeNull();
    const [kept] = await db.select().from(posts).where(eq(posts.id, post.value.id));
    expect(kept?.deletedAt).toBeNull();
    const [unlisted] = await db.select().from(notes).where(eq(notes.id, note.id));
    expect(unlisted?.status).toBe('unlisted');
    const access = await db
      .select()
      .from(entitlements)
      .where(and(eq(entitlements.userId, buyer.id), eq(entitlements.noteId, note.id)));
    expect(access[0]?.revokedAt).toBeNull();
    expect(
      await db.select().from(communityMembers).where(eq(communityMembers.userId, seller.id)),
    ).toHaveLength(0);
    // The data export of the deleted account is empty of personal data.
    expect(JSON.stringify(await collectUserData(seller.id))).not.toContain(seller.email);
  });

  it('deletes posts and comments when the user chooses so', async () => {
    const user = await memberOf();
    const post = await createPost(asCurrentUser(user), {
      communityId: community.id,
      type: 'text',
      title: 'Obrisaće se',
      body: 'Tekst koji nestaje',
      isAnonymous: false,
    });
    if (!post.ok) throw new Error('post');
    const comment = await createComment(asCurrentUser(user), {
      postId: post.value.id,
      parentId: null,
      body: 'Komentar koji nestaje',
      isAnonymous: false,
    });
    if (!comment.ok) throw new Error('comment');
    await scheduleDeletion({
      userId: user.id,
      currentSessionId: null,
      deleteContent: true,
      waiveBalance: false,
      ipHash: null,
    });
    await db
      .update(users)
      .set({ deletionScheduledFor: new Date(Date.now() - 1000) })
      .where(eq(users.id, user.id));
    expect(await executeDeletion(user.id)).toBe(true);
    const [p] = await db.select().from(posts).where(eq(posts.id, post.value.id));
    const [c] = await db.select().from(comments).where(eq(comments.id, comment.value.id));
    expect(p?.deletedAt).not.toBeNull();
    expect(c?.deletedAt).not.toBeNull();
    expect(c?.body).toBe('');
    expect(
      await db.select().from(notifications).where(eq(notifications.userId, user.id)),
    ).toHaveLength(0);
  });
});
