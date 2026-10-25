'use server';

import { randomUUID } from 'node:crypto';

import { cookies } from 'next/headers';
import { z } from 'zod';

import { legalVersions } from '@/config/legal';
import { env } from '@/env';
import { CONSENT_COOKIE, CONSENT_MAX_AGE, serializeConsent } from '@/lib/consent';
import { ok } from '@/lib/result';

import { db } from '../db/client';
import { consents } from '../db/schema';

import { createAction } from './safe-action';

const ANON_COOKIE = 'skr_anon';

/**
 * Stores the cookie choice in the browser and as consent history (SPEC §3.2: never overwritten):
 * per user when signed in, otherwise under a random anonymous ID kept in a necessary cookie.
 */
export const saveCookieConsentAction = createAction(
  {
    schema: z.object({ analytics: z.boolean() }),
    auth: 'none',
    rateLimit: { name: 'generic', by: 'ip' },
  },
  async (input, { user, ipHash }) => {
    const jar = await cookies();
    const secure = env.NEXT_PUBLIC_APP_URL.startsWith('https://');
    jar.set(CONSENT_COOKIE, serializeConsent(input), {
      maxAge: CONSENT_MAX_AGE,
      sameSite: 'lax',
      secure,
      path: '/',
    });
    let anonymousId: string | null = null;
    if (!user) {
      anonymousId = jar.get(ANON_COOKIE)?.value ?? randomUUID();
      jar.set(ANON_COOKIE, anonymousId, {
        maxAge: CONSENT_MAX_AGE,
        sameSite: 'lax',
        secure,
        httpOnly: true,
        path: '/',
      });
    }
    await db.insert(consents).values({
      userId: user?.id ?? null,
      anonymousId,
      type: 'analytics_cookies',
      documentVersion: legalVersions.cookies,
      value: input.analytics,
      ipHash,
    });
    return ok(undefined);
  },
);
