import { eq, like } from 'drizzle-orm';
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
  {
    community: 'oet1-etf-bg',
    author: 'nikola.demo@example.com',
    title: 'Da li se na usmenom traže izvođenja?',
    body: 'Profesor je na predavanju rekao da je dovoljno znati formule, ali čujem da na usmenom ipak traži izvođenje za kondenzator. Ko je skoro polagao?',
    comment: 'Traži, ali samo za pločasti kondenzator i Gausovu teoremu. Ostalo su definicije.',
  },
  {
    community: 'mat1-etf-bg',
    author: 'jovana.demo@example.com',
    title: 'Koliko zadataka treba za prolaz na pismenom?',
    body: 'Na pismenom ima pet zadataka. Da li je za prolaz dovoljno uraditi dva i po, ili se gledaju i poeni sa kolokvijuma?',
    comment:
      'Dva cela zadatka i delovi trećeg obično budu dovoljni. Kolokvijumi se računaju samo u junu.',
  },
  {
    community: 'p1-etf-bg',
    author: 'luka.demo@example.com',
    title: 'Koji kompajler koristite za domaće?',
    body: 'Na vežbama se koristi Code::Blocks, ali meni se ne sviđa. Može li VS Code sa gcc-om, ili na ispitu insistiraju na Code::Blocks?',
    comment:
      'Na ispitu je Code::Blocks na računarima u učionici, pa je dobro da ga probaš bar par puta pre roka.',
  },
  {
    community: 'asp-etf-bg',
    author: 'teodora.demo@example.com',
    title: 'Ima li neko dobar vizuelni prikaz AVL rotacija?',
    body: 'Sa slajdova mi nikako nisu jasne dvostruke rotacije. Ako neko zna dobar sajt ili video, neka podeli.',
    comment:
      'VisuAlgo ima AVL stablo gde možeš da ubacuješ elemente i gledaš rotacije korak po korak.',
  },
  {
    community: 'etf-bg',
    author: 'ana.demo@example.com',
    title: 'Raspored konsultacija za zimski semestar',
    body: 'Da li neko ima ažuran raspored konsultacija? Na sajtu katedre je i dalje prošlogodišnji.',
    comment:
      'Okačen je na oglasnoj tabli kod studentske službe, slikaću ga sutra i postaviti ovde.',
  },
  {
    community: 'bp-etf-bg',
    author: 'stefan.demo@example.com',
    title: 'Projekat iz Baza: koliko je strogo bodovanje dokumentacije?',
    body: 'Imam bazu i aplikaciju gotovu, ali dokumentacija je kratka. Koliko se gubi poena na tome?',
    comment:
      'Prošle godine je dokumentacija nosila 5 od 30 poena. Bitno je da ima ER dijagram i opis tabela.',
  },
] as const;

export function asCurrentUser(row: typeof users.$inferSelect): CurrentUser {
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
  const authors = await db.select().from(users).where(like(users.email, '%.demo@example.com'));
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
    const others = [...byEmail.values()].filter((user) => user.id !== author.id);
    // A different handful of upvotes per post, so popular sorting has something to sort.
    for (const voter of others.slice(0, 1 + (item.title.length % others.length))) {
      await vote(voter, { targetType: 'post', targetId: post.value.id, value: 1 });
    }
    const other = others[item.title.length % others.length];
    if (other) {
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
