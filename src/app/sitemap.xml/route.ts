import { renderIndex, sitemapSegmentNames } from '@/server/seo/sitemap';
import '@/server/seo/sitemap-segments';

export const revalidate = 3600;

export function GET() {
  return new Response(renderIndex(sitemapSegmentNames()), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
