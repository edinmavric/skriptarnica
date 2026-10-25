import { renderUrlset, sitemapSegment } from '@/server/seo/sitemap';
import '@/server/seo/sitemap-segments';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ segment: string }> }) {
  const name = (await params).segment.replace(/\.xml$/, '');
  const urls = await sitemapSegment(name);
  if (!urls) return new Response('Not found', { status: 404 });
  return new Response(renderUrlset(urls), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
