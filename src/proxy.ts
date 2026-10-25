import { NextResponse, type NextRequest } from 'next/server';

import { env } from '@/env';
import { buildCsp, originOf } from '@/lib/security/csp';

/**
 * Runs before every page request: generates a CSP nonce (Next.js applies it to its scripts),
 * and a request ID for structured logs (SPEC §11).
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const csp = buildCsp({
    nonce,
    isDev: env.NODE_ENV === 'development',
    imgOrigins: [...originOf(env.NEXT_PUBLIC_STORAGE_PUBLIC_URL)],
    connectOrigins: [
      ...originOf(env.NEXT_PUBLIC_STORAGE_UPLOAD_ORIGIN),
      ...originOf(env.NEXT_PUBLIC_SENTRY_DSN),
      ...originOf(env.NEXT_PUBLIC_POSTHOG_HOST),
      'https://challenges.cloudflare.com',
    ],
    frameOrigins: ['https://challenges.cloudflare.com'],
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-request-id', requestId);
  requestHeaders.set('Content-Security-Policy', csp);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        '/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|robots.txt|sitemap).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
