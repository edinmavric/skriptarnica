import { NextResponse } from 'next/server';

import { devRoutesEnabled } from '@/lib/dev';

export const dynamic = 'force-dynamic';

/**
 * Dev/test stand-in for the PostHog API (NEXT_PUBLIC_POSTHOG_HOST points here locally and in
 * CI), so consent-gated analytics can be tested end to end without sending anything out.
 * Answers like PostHog does for the endpoints posthog-js calls; stores nothing.
 */
function answer() {
  if (!devRoutesEnabled()) return new NextResponse(null, { status: 404 });
  return NextResponse.json({
    status: 1,
    featureFlags: {},
    flags: {},
    featureFlagPayloads: {},
    errorsWhileComputingFlags: false,
  });
}

export const GET = answer;
export const POST = answer;
