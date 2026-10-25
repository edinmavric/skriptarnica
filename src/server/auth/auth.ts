import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { haveIBeenPwned, magicLink, twoFactor, username } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';

import { siteConfig } from '@/config/site';
import { env } from '@/env';
import { routes } from '@/config/routes';

import { db } from '../db/client';
import {
  accounts,
  sessions,
  studentProfiles,
  twoFactors,
  users,
  verifications,
} from '../db/schema';
import { uuidv7 } from '../db/schema/_common';
import { sendActionEmail } from '../email/send';
import { logger } from '../logger';

export const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;

/**
 * Better Auth (SPEC §2, §4.1): email+password, magic link, Google, email verification, DB
 * sessions, TOTP 2FA. Sign-up/sign-in/reset run through Server Actions (Turnstile, rate limit,
 * lockout), so their raw HTTP endpoints are disabled; only link callbacks and OAuth stay open.
 */
export const auth = betterAuth({
  appName: siteConfig.name,
  baseURL: env.NEXT_PUBLIC_APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
      twoFactor: twoFactors,
    },
  }),
  disabledPaths: [
    '/sign-up/email',
    '/sign-in/email',
    '/sign-in/username',
    '/sign-in/magic-link',
    '/request-password-reset',
    '/reset-password',
    '/send-verification-email',
    '/change-password',
    '/change-email',
    '/update-user',
    '/delete-user',
    '/two-factor/enable',
    '/two-factor/disable',
    '/two-factor/verify-totp',
    '/two-factor/verify-backup-code',
    '/two-factor/generate-backup-codes',
    '/two-factor/get-totp-uri',
    '/revoke-session',
    '/revoke-sessions',
    '/revoke-other-sessions',
    '/verify-password',
  ],
  rateLimit: { enabled: false },
  advanced: {
    database: { generateId: () => uuidv7() },
    // Raw IPs are not stored with sessions (SPEC §7.2 minimization).
    ipAddress: { disableIpTracking: true },
    useSecureCookies: env.NEXT_PUBLIC_APP_URL.startsWith('https://'),
    cookiePrefix: 'skr',
  },
  user: {
    additionalFields: {
      role: { type: 'string', input: false, defaultValue: 'student', required: false },
      bannedAt: { type: 'date', input: false, required: false },
      deletionRequestedAt: { type: 'date', input: false, required: false },
    },
  },
  session: {
    // Read-only admin impersonation marker (SPEC §4.10); set only by the admin service.
    additionalFields: {
      impersonatedBy: { type: 'string', input: false, required: false },
    },
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 15,
  },
  account: {
    accountLinking: { enabled: true, trustedProviders: ['google'] },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    // Sign-in is allowed before verification; buying, selling and posting are gated by policies.
    requireEmailVerification: false,
    autoSignIn: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendActionEmail('resetPassword', user.email, url);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      const callback = new URL(url);
      callback.searchParams.set('callbackURL', routes.onboarding);
      await sendActionEmail('verifyEmail', user.email, callback.toString());
    },
  },
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        socialProviders: {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            prompt: 'select_account' as const,
          },
        },
      }
    : {}),
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await db.insert(studentProfiles).values({ userId: user.id }).onConflictDoNothing();
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const [row] = await db
            .select({ bannedAt: users.bannedAt, deletedAt: users.deletedAt })
            .from(users)
            .where(eq(users.id, session.userId));
          if (row?.bannedAt || row?.deletedAt) {
            logger.info({ userId: session.userId }, 'session blocked for banned/deleted user');
            return false;
          }
          return undefined;
        },
      },
    },
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 30,
      usernameValidator: (value) => USERNAME_PATTERN.test(value),
      usernameNormalization: (value) => value.toLowerCase(),
    }),
    twoFactor({ issuer: siteConfig.name, skipVerificationOnEnable: false }),
    magicLink({
      expiresIn: 60 * 15,
      sendMagicLink: async ({ email, url }) => {
        await sendActionEmail('magicLink', email, url);
      },
    }),
    haveIBeenPwned({
      enabled: env.HIBP_ENABLED,
      customPasswordCompromisedMessage: 'PASSWORD_COMPROMISED',
    }),
    // Must be last: lets auth.api calls in Server Actions set cookies.
    nextCookies(),
  ],
});

export type Auth = typeof auth;
export type AuthSession = typeof auth.$Infer.Session;
