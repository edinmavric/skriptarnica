import { NextResponse, type NextRequest } from 'next/server';

import { routes } from '@/config/routes';
import { getCurrentUser } from '@/server/auth/session';
import { exportDownloadUrl } from '@/server/services/data-export';

export const dynamic = 'force-dynamic';

/** Data export download: only for the signed-in owner, via a 60-second presigned URL. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    const next = encodeURIComponent(request.nextUrl.pathname);
    return NextResponse.redirect(new URL(`${routes.signIn}?next=${next}`, request.url));
  }
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 404 });
  const result = await exportDownloadUrl(user.id, id);
  if (!result.ok) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(result.value, { headers: { 'Cache-Control': 'no-store' } });
}
