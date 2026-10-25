import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { getCurrentUser } from '@/server/auth/session';
import { logger } from '@/server/logger';
import { rateLimit } from '@/server/rate-limit';
import { clientIpHash } from '@/server/request';
import { search, SEARCH_GROUP_ORDER } from '@/server/services/search';

const querySchema = z.object({
  q: z.string().trim().max(120),
  f: z
    .string()
    .regex(/^[a-z0-9-]{1,80}$/)
    .optional(),
  types: z
    .string()
    .optional()
    .transform((value) =>
      value
        ?.split(',')
        .filter((type): type is (typeof SEARCH_GROUP_ORDER)[number] =>
          (SEARCH_GROUP_ORDER as string[]).includes(type),
        ),
    ),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

/** Global search API for the header combobox (debounced on the client, rate limited per IP). */
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  const limited = await rateLimit('search', `ip:${await clientIpHash()}`);
  if (!limited.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  try {
    const user = await getCurrentUser();
    const result = await search(parsed.data.q, {
      limitPerType: parsed.data.limit,
      viewerId: user?.id ?? null,
      facultySlug: parsed.data.f ?? null,
      ...(parsed.data.types?.length ? { types: parsed.data.types } : {}),
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'search failed');
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
