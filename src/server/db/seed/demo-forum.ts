import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import type { CurrentUser } from '../../auth/session';
import { joinCommunity } from '../../services/communities';
import { createComment, createPost, vote } from '../../services/forum';
import { db } from '../client';
import { communities, posts, users } from '../schema';

const DEMO_POSTS = [
  {
    community: 'oet1-etf-bg',
    author: 'milica.demo@example.com',
    title: 'Šta je bilo na prošlom oktobarskom roku iz OET 1?',
    body: 'Imali smo **dva zadatka** sa kondenzatorima i jedno teorijsko pitanje o Kulonovom zakonu. Ko je izlazio, kako ste prošli?',
    comment:
      'Ja sam izlazio, zadaci su bili kao na kolokvijumu, samo duži. Teorija je bila lagana.',
  },
  {
    community: 'etf-bg',
    author: 'djordje.demo@example.com',
    title: 'Gde se najbolje uči tokom ispitnog roka?',
    body: 'Čitaonica na fakultetu je pretrpana. Ima li predloga za mirno mesto blizu fakulteta?',
    comment: 'Biblioteka grada na Knez Mihailovoj, jutrom je skoro prazna.',
  },
] as const;

function asCurrentUser(row: typeof users.$inferSelect): CurrentUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    username: row.username,
    image: row.image,
    role: row.role,
    twoFactorEnabled: row.twoFactorEnabled,
    bannedAt: row.bannedAt,
    sessionId: randomUUID(),
    impersonatedBy: null,
  };
}

/** A couple of demo discussions through the real forum services. Idempotent by title. */
export async function seedDemoForum(): Promise<void> {
  const authors = await db
    .select()
    .from(users)
    .where(inArray(users.email, [...new Set(DEMO_POSTS.map((p) => p.author))]));
  const byEmail = new Map(authors.map((row) => [row.email, asCurrentUser(row)]));
  let created = 0;
  for (const item of DEMO_POSTS) {
    const author = byEmail.get(item.author);
    const [community] = await db
      .select()
      .from(communities)
      .where(eq(communities.slug, item.community));
    if (!author || !community) continue;
    const [existing] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.title, item.title));
    if (existing) continue;
    for (const member of byEmail.values()) await joinCommunity(member, community.slug);
    const post = await createPost(author, {
      communityId: community.id,
      type: 'text',
      title: item.title,
      body: item.body,
      isAnonymous: false,
    });
    if (!post.ok) throw new Error(`demo forum: ${post.error.messageKey}`);
    const other = [...byEmail.values()].find((user) => user.id !== author.id);
    if (other) {
      await vote(other, { targetType: 'post', targetId: post.value.id, value: 1 });
      await createComment(other, {
        postId: post.value.id,
        parentId: null,
        body: item.comment,
        isAnonymous: false,
      });
    }
    created += 1;
  }
  console.log(`demo: ${created} forum posts created`);
}
