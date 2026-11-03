import { NextResponse } from 'next/server';

import { logger } from '@/server/logger';
import { listProgramsForSearch } from '@/server/services/catalog-pages';

/**
 * Every undergraduate program with its faculty and university, for the onboarding search.
 * Public catalog data: the browser downloads it once (about 30 KB gzip) and searches locally, so
 * typing never waits on the network. The CDN keeps it for 10 minutes; an empty catalog (not yet
 * seeded) is never cached.
 */
export async function GET() {
  try {
    const programs = await listProgramsForSearch();
    return NextResponse.json(programs, {
      headers: {
        'Cache-Control':
          programs.length > 0
            ? 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400'
            : 'no-store',
      },
    });
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      'program list failed',
    );
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
