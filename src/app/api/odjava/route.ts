import { NextResponse, type NextRequest } from 'next/server';

import { verifyUnsubscribeToken } from '@/server/email/unsubscribe';
import { applyUnsubscribe } from '@/server/services/unsubscribe';

export const dynamic = 'force-dynamic';

/** RFC 8058 one-click unsubscribe (List-Unsubscribe-Post). GET goes to the confirm page. */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t') ?? '';
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) return new NextResponse(null, { status: 400 });
  await applyUnsubscribe(parsed.userId, parsed.scope);
  return new NextResponse(null, { status: 200 });
}

export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('t') ?? '';
  return NextResponse.redirect(new URL(`/odjava?t=${encodeURIComponent(token)}`, request.url));
}
