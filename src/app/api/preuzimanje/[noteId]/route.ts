import { NextResponse, type NextRequest } from 'next/server';

import { routes } from '@/config/routes';
import { env } from '@/env';
import { getCurrentUser } from '@/server/auth/session';
import { logger } from '@/server/logger';
import { canMutate } from '@/server/policies';
import { clientIpHash } from '@/server/request';
import { prepareDownload } from '@/server/services/downloads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Download (SPEC §4.3): checks the entitlement, prepares the watermarked copy and redirects to
 * a 60-second presigned URL. GET because it's a navigation; it changes nothing but the log.
 * Not rate limited by design.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const { noteId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(noteId)) return new NextResponse(null, { status: 404 });
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.redirect(
      new URL(
        `${routes.signIn}?next=${encodeURIComponent(routes.library)}`,
        env.NEXT_PUBLIC_APP_URL,
      ),
    );
  // Read-only impersonation must not create download events or watermarked copies.
  if (!canMutate(user).allowed) return new NextResponse(null, { status: 403 });
  try {
    const result = await prepareDownload(user.id, noteId, {
      ipHash: await clientIpHash(),
      userAgent: request.headers.get('user-agent'),
    });
    if (!result.ok) {
      return NextResponse.redirect(
        new URL(
          `${routes.library}?greska=${result.error.code === 'FORBIDDEN' ? 'pristup' : 'fajl'}`,
          env.NEXT_PUBLIC_APP_URL,
        ),
      );
    }
    return NextResponse.redirect(result.value.url, {
      status: 303,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    logger.error(
      { noteId, err: error instanceof Error ? error.message : String(error) },
      'download failed',
    );
    return NextResponse.redirect(new URL(`${routes.library}?greska=fajl`, env.NEXT_PUBLIC_APP_URL));
  }
}
