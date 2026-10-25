import { routes } from '@/config/routes';
import { env } from '@/env';

import { listCatalogSitemapEntries } from '../services/catalog-pages';

/**
 * Segmented sitemap (SPEC §8.3). Each segment is a provider; marketplace and community phases
 * register theirs.
 */
export interface SitemapUrl {
  path: string;
  lastModified?: Date;
  changeFrequency?: 'daily' | 'weekly' | 'monthly';
  priority?: number;
}

type SegmentProvider = () => Promise<SitemapUrl[]>;

const segments = new Map<string, SegmentProvider>();

export function registerSitemapSegment(name: string, provider: SegmentProvider): void {
  segments.set(name, provider);
}

registerSitemapSegment('pages', async () =>
  [
    routes.home,
    routes.howItWorks,
    routes.commission,
    routes.faq,
    routes.contact,
    ...Object.values(routes.legal),
  ].map((path) => ({
    path,
    changeFrequency: 'monthly' as const,
    priority: path === routes.home ? 1 : 0.4,
  })),
);

registerSitemapSegment('faculties', async () => {
  const data = await listCatalogSitemapEntries();
  return [
    ...data.universities.map((u) => ({
      path: routes.university(u.slug),
      lastModified: u.updatedAt,
      priority: 0.5,
    })),
    ...data.faculties.map((f) => ({
      path: routes.faculty(f.slug),
      lastModified: f.updatedAt,
      priority: 0.7,
    })),
  ];
});

registerSitemapSegment('courses', async () => {
  const data = await listCatalogSitemapEntries();
  return [
    ...data.courses.map((c) => ({
      path: routes.course(c.facultySlug, c.slug),
      lastModified: c.updatedAt,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    ...data.professors.map((p) => ({
      path: routes.professor(p.facultySlug, p.slug),
      lastModified: p.updatedAt,
      priority: 0.4,
    })),
  ];
});

export function sitemapSegmentNames(): string[] {
  return [...segments.keys()];
}

export async function sitemapSegment(name: string): Promise<SitemapUrl[] | null> {
  const provider = segments.get(name);
  return provider ? provider() : null;
}

const xmlEscape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export function renderUrlset(urls: SitemapUrl[]): string {
  const body = urls
    .map((url) => {
      const parts = [`<loc>${xmlEscape(`${env.NEXT_PUBLIC_APP_URL}${url.path}`)}</loc>`];
      if (url.lastModified) parts.push(`<lastmod>${url.lastModified.toISOString()}</lastmod>`);
      if (url.changeFrequency) parts.push(`<changefreq>${url.changeFrequency}</changefreq>`);
      if (url.priority !== undefined) parts.push(`<priority>${url.priority.toFixed(1)}</priority>`);
      return `<url>${parts.join('')}</url>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

export function renderIndex(names: string[]): string {
  const body = names
    .map(
      (name) =>
        `<sitemap><loc>${xmlEscape(`${env.NEXT_PUBLIC_APP_URL}/sitemaps/${name}.xml`)}</loc></sitemap>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`;
}
