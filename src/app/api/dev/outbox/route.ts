import { NextResponse, type NextRequest } from 'next/server';

import { devRoutesEnabled } from '@/lib/dev';
import { readDevOutbox } from '@/server/email/transport';

export const dynamic = 'force-dynamic';

/** Dev/test only: emails captured instead of being sent (used by e2e tests). */
export async function GET(request: NextRequest) {
  if (!devRoutesEnabled()) return new NextResponse(null, { status: 404 });
  const to = request.nextUrl.searchParams.get('to') ?? undefined;
  const entries = await readDevOutbox(to);
  return NextResponse.json(
    entries.map((entry) => ({
      id: entry.id,
      to: entry.to,
      subject: entry.subject,
      category: entry.category,
      createdAt: entry.createdAt,
      text: entry.text,
      links: [...entry.html.matchAll(/href="([^"]+)"/g)].map((match) =>
        match[1]?.replace(/&amp;/g, '&'),
      ),
      headers: entry.headers ?? {},
    })),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
