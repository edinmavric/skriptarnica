import type { CommentNode } from '@/components/ui/comment-tree';
import type { NoteCardData } from '@/components/ui/note-card';
import type { PostCardData } from '@/components/ui/post-card';

/** Demo content for the internal component catalog only (never shown in production). */
export const demoNotes: NoteCardData[] = [
  {
    slug: 'oet-1-kompletna-teorija',
    title: 'OET 1 — kompletna teorija sa rešenim zadacima',
    courseName: 'Osnovi elektrotehnike 1',
    facultyShortName: 'ETF',
    coverUrl: null,
    sellerName: 'Milica J.',
    averageRating: 4.7,
    reviewCount: 23,
    pricePara: 80000,
    grade: 9,
    gradeVerifiedByCourseStatus: true,
    pageCount: 64,
  },
  {
    slug: 'matematika-1-ispitni-zadaci',
    title: 'Matematika 1: ispitni zadaci po rokovima',
    courseName: 'Matematika 1',
    facultyShortName: 'ETF',
    coverUrl: null,
    sellerName: 'Đorđe Č.',
    averageRating: null,
    reviewCount: 0,
    pricePara: 0,
    grade: null,
    pageCount: 1,
  },
  {
    slug: 'fizika-beleske',
    title: 'Fizika — beleške sa predavanja',
    courseName: 'Fizika',
    facultyShortName: 'ETF',
    coverUrl: null,
    sellerName: 'Nikola P.',
    averageRating: 3.5,
    reviewCount: 4,
    pricePara: 125050,
    grade: 8,
    pageCount: 22,
    owned: true,
  },
];

export const demoPosts: PostCardData[] = [
  {
    href: '#',
    title: 'Šta je bilo na januarskom roku iz OET-a?',
    excerpt:
      'Neko ko je izašao u četvrtak — da li su bila kola sa kondenzatorima ili samo teorija?',
    communityName: 'z/oet-etf',
    communityHref: '#',
    authorName: 'stefan_m',
    authorHref: '#',
    flair: 'Rok',
    commentCount: 14,
    createdAt: '2026-10-20T07:00:00Z',
    pinned: true,
  },
  {
    href: '#',
    title: 'Kako ste učili za usmeni kod profesora iz Fizike?',
    excerpt: null,
    communityName: 'z/fizika-etf',
    communityHref: '#',
    authorName: null,
    authorHref: null,
    flair: 'Pitanje',
    commentCount: 1,
    createdAt: '2026-10-12T08:00:00Z',
    locked: true,
  },
];

function comment(
  id: string,
  author: string | null,
  text: string,
  children: CommentNode[] = [],
  extra: Partial<CommentNode> = {},
): CommentNode {
  return {
    id,
    authorName: author,
    authorHref: author ? '#' : null,
    body: text,
    createdAt: '2026-10-21T08:00:00Z',
    editedAt: null,
    deleted: false,
    removed: false,
    children,
    ...extra,
  };
}

let deep: CommentNode[] = [comment('d8', 'ana', 'Osmi nivo.')];
for (let level = 7; level >= 2; level -= 1) {
  deep = [comment(`d${level}`, level % 2 ? 'marko' : 'ana', `Odgovor na nivou ${level}.`, deep)];
}

export const demoComments: CommentNode[] = [
  comment(
    'c1',
    'jelena',
    'Bila su kola sa kondenzatorima, plus jedno pitanje iz teorije o Kirhofovim zakonima.',
    [
      comment('c2', 'stefan_m', 'Hvala! Da li je bilo i prelaznih režima?', [], {
        isOp: true,
        editedAt: '2026-10-21T09:00:00Z',
      }),
      comment('c3', null, 'Nije, samo stacionarno stanje.'),
    ],
  ),
  comment('c4', null, '', [], { deleted: true }),
  comment('c5', 'marko', '', [], { removed: true }),
  comment('c6', 'ana', 'Duga diskusija:', deep),
];

export const demoMarkdown = `## Kako sam učio

Učio sam **12 dana**, po 4–5 sati dnevno. Redosled:

1. Prvo teorija iz skripte (3 dana)
2. Zatim zadaci sa starih rokova, *od najnovijih ka starijim*
3. Poslednja dva dana samo ponavljanje formula

> Na januarskom roku su bila dva zadatka sa kondenzatorima.

Link ka [rasporedu ispita](https://www.etf.bg.ac.rs).`;

export const demoOptions = [
  {
    value: 'etf',
    label: 'Elektrotehnički fakultet',
    description: 'Univerzitet u Beogradu',
    keywords: 'ETF',
  },
  {
    value: 'elfak',
    label: 'Elektronski fakultet',
    description: 'Univerzitet u Nišu',
    keywords: 'Elfak Niš',
  },
  {
    value: 'ftn',
    label: 'Fakultet tehničkih nauka',
    description: 'Univerzitet u Novom Sadu',
    keywords: 'FTN',
  },
  {
    value: 'ftn-cacak',
    label: 'Fakultet tehničkih nauka u Čačku',
    description: 'Univerzitet u Kragujevcu',
    keywords: 'FTN Čačak',
  },
  { value: 'mf', label: 'Mašinski fakultet', description: 'Univerzitet u Beogradu' },
];
