'use server';

import { randomUUID } from 'node:crypto';

import { APIError } from 'better-auth/api';
import { and, eq, ne } from 'drizzle-orm';
import { headers } from 'next/headers';
import sharp from 'sharp';
import { z } from 'zod';

import { routes } from '@/config/routes';
import { env } from '@/env';
import {
  accountSchema,
  changePasswordSchema,
  deletionSchema,
  digestSchema,
  notificationPreferenceSchema,
  privacySchema,
} from '@/lib/validation/account';
import { appError, err, ok, type Result } from '@/lib/result';

import { auth } from '../auth/auth';
import { db } from '../db/client';
import { accounts, auditLog, follows, sessions, studentProfiles, users } from '../db/schema';
import { signToken, verifyToken } from '../crypto/signed-token';
import { sendActionEmail } from '../email/send';
import { cancelDeletion, hasPassword, scheduleDeletion } from '../services/account-deletion';
import { requestExport } from '../services/data-export';
import { markRead, setDigestFrequency, setPreference } from '../services/notifications';
import { buckets, deleteObject, publicUrl, writeObject } from '../storage/s3';

import { createAction } from './safe-action';

function apiCode(error: unknown): string | null {
  return error instanceof APIError
    ? ((error.body as { code?: string } | undefined)?.code ?? null)
    : null;
}

export const markNotificationsReadAction = createAction(
  {
    schema: z.object({ ids: z.union([z.array(z.uuid()).max(100), z.literal('all')]) }),
    auth: 'user',
  },
  async (input, { user }) => {
    await markRead(user.id, input.ids);
    return ok(undefined);
  },
);

export const setNotificationPreferenceAction = createAction(
  { schema: notificationPreferenceSchema, auth: 'user' },
  async (input, { user }) => {
    await setPreference(user.id, input.type, input.channel);
    return ok(undefined);
  },
);

export const setDigestAction = createAction(
  { schema: digestSchema, auth: 'user' },
  async (input, { user }) => {
    await setDigestFrequency(user.id, input.digest);
    return ok(undefined);
  },
);

export const updateAccountAction = createAction(
  { schema: accountSchema, auth: 'user', rateLimit: { name: 'generic', by: 'user' } },
  async (input, { user }): Promise<Result<void>> => {
    if (input.username !== user.username) {
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.username, input.username), ne(users.id, user.id)));
      if (taken)
        return err(
          appError('VALIDATION', 'errors.validation', { username: ['validation.usernameTaken'] }),
        );
    }
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ name: input.name, username: input.username, displayUsername: input.username })
        .where(eq(users.id, user.id));
      await tx
        .update(studentProfiles)
        .set({ bio: input.bio || null })
        .where(eq(studentProfiles.userId, user.id));
    });
    return ok(undefined);
  },
);

export const updatePrivacyAction = createAction(
  { schema: privacySchema, auth: 'user' },
  async (input, { user }) => {
    await db.update(studentProfiles).set(input).where(eq(studentProfiles.userId, user.id));
    return ok(undefined);
  },
);

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** Avatar: any common image up to 5 MB → 256×256 WebP (metadata stripped) in the public bucket. */
export async function uploadAvatarAction(formData: FormData): Promise<Result<{ url: string }>> {
  // Validated by the schema (z.instanceof(File)); a missing field fails there.
  return uploadAvatar({ file: formData.get('avatar') as File });
}

const uploadAvatar = createAction(
  {
    schema: z.object({ file: z.instanceof(File, { error: 'validation.imageRequired' }) }),
    auth: 'user',
    rateLimit: { name: 'upload', by: 'user' },
  },
  async ({ file }, { user }): Promise<Result<{ url: string }>> => {
    if (file.size === 0 || file.size > AVATAR_MAX_BYTES)
      return err(
        appError('VALIDATION', 'errors.validation', { avatar: ['validation.imageTooLarge'] }),
      );
    let webp: Buffer;
    try {
      const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 });
      const meta = await image.metadata();
      if (!meta.format || !['jpeg', 'png', 'webp', 'gif', 'heif', 'avif'].includes(meta.format))
        throw new Error('format');
      webp = await image
        .rotate()
        .resize(256, 256, { fit: 'cover' })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      return err(
        appError('VALIDATION', 'errors.validation', { avatar: ['validation.imageInvalid'] }),
      );
    }
    const key = `avatars/${user.id}/${randomUUID()}.webp`;
    await writeObject(
      buckets.public,
      key,
      webp,
      'image/webp',
      'public, max-age=31536000, immutable',
    );
    const url = publicUrl(key);
    await db.update(users).set({ image: url }).where(eq(users.id, user.id));
    await removeOldAvatar(user.image);
    return ok({ url });
  },
);

async function removeOldAvatar(image: string | null) {
  const prefix = `${env.NEXT_PUBLIC_STORAGE_PUBLIC_URL}/`;
  if (image?.startsWith(prefix))
    await deleteObject(buckets.public, image.slice(prefix.length)).catch(() => undefined);
}

export const removeAvatarAction = createAction(
  { schema: z.object({}), auth: 'user' },
  async (_input, { user }) => {
    await db.update(users).set({ image: null }).where(eq(users.id, user.id));
    await removeOldAvatar(user.image);
    return ok(undefined);
  },
);

export const changePasswordAction = createAction(
  { schema: changePasswordSchema, auth: 'user', rateLimit: { name: 'signIn', by: 'user' } },
  async (input, { user, ipHash }): Promise<Result<void>> => {
    try {
      await auth.api.changePassword({
        body: {
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
          revokeOtherSessions: true,
        },
        headers: await headers(),
      });
    } catch (error) {
      const code = apiCode(error);
      if (code === 'INVALID_PASSWORD')
        return err(
          appError('VALIDATION', 'errors.validation', {
            currentPassword: ['validation.passwordWrong'],
          }),
        );
      if (code === 'PASSWORD_COMPROMISED')
        return err(
          appError('VALIDATION', 'errors.validation', {
            newPassword: ['validation.passwordCompromised'],
          }),
        );
      if (code === 'PASSWORD_TOO_SHORT')
        return err(
          appError('VALIDATION', 'errors.validation', {
            newPassword: ['validation.passwordTooShort'],
          }),
        );
      throw error;
    }
    await db.insert(auditLog).values({
      actorId: user.id,
      action: 'security.password_changed',
      targetType: 'user',
      targetId: user.id,
      ipHash,
    });
    return ok(undefined);
  },
);

/** Signs out one of the user's own sessions (never someone else's: the user id is in the filter). */
export const revokeSessionAction = createAction(
  { schema: z.object({ sessionId: z.uuid() }), auth: 'user' },
  async (input, { user }): Promise<Result<void>> => {
    if (input.sessionId === user.sessionId)
      return err(appError('CONFLICT', 'errors.account.currentSession'));
    await db
      .delete(sessions)
      .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, user.id)));
    return ok(undefined);
  },
);

export const revokeOtherSessionsAction = createAction(
  { schema: z.object({}), auth: 'user' },
  async (_input, { user, ipHash }) => {
    await db
      .delete(sessions)
      .where(and(eq(sessions.userId, user.id), ne(sessions.id, user.sessionId)));
    await db.insert(auditLog).values({
      actorId: user.id,
      action: 'security.sessions_revoked',
      targetType: 'user',
      targetId: user.id,
      ipHash,
    });
    return ok(undefined);
  },
);

export const unlinkGoogleAction = createAction(
  { schema: z.object({}), auth: 'user' },
  async (_input, { user }): Promise<Result<void>> => {
    // Keep at least one way to sign in.
    if (!(await hasPassword(user.id)))
      return err(appError('CONFLICT', 'errors.account.lastSignInMethod'));
    await db
      .delete(accounts)
      .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, 'google')));
    return ok(undefined);
  },
);

export const requestExportAction = createAction(
  { schema: z.object({}), auth: 'user', rateLimit: { name: 'sendEmail', by: 'user' } },
  async (_input, { user }) => requestExport(user.id),
);

const DELETION_TOKEN_TTL = 60 * 60;

/**
 * Starts account deletion (SPEC §7.3). With a password it is confirmed immediately; accounts
 * without one (Google, magic link) get an email link that confirms it.
 */
export const requestDeletionAction = createAction(
  { schema: deletionSchema, auth: 'user', rateLimit: { name: 'signIn', by: 'user' } },
  async (input, { user, ipHash }): Promise<Result<{ emailSent: boolean }>> => {
    if (user.impersonatedBy) return err(appError('FORBIDDEN', 'errors.impersonating'));
    if (await hasPassword(user.id)) {
      if (!input.password)
        return err(
          appError('VALIDATION', 'errors.validation', {
            password: ['validation.passwordRequired'],
          }),
        );
      try {
        await auth.api.verifyPassword({
          body: { password: input.password },
          headers: await headers(),
        });
      } catch (error) {
        if (apiCode(error) === 'INVALID_PASSWORD')
          return err(
            appError('VALIDATION', 'errors.validation', { password: ['validation.passwordWrong'] }),
          );
        throw error;
      }
      const result = await scheduleDeletion({
        userId: user.id,
        currentSessionId: user.sessionId,
        deleteContent: input.deleteContent,
        waiveBalance: input.waiveBalance,
        ipHash,
      });
      return result.ok ? ok({ emailSent: false }) : result;
    }
    const token = signToken(
      'account-deletion',
      { userId: user.id, deleteContent: input.deleteContent, waiveBalance: input.waiveBalance },
      DELETION_TOKEN_TTL,
    );
    await sendDeletionConfirmation(
      user.email,
      `${env.NEXT_PUBLIC_APP_URL}${routes.settings}/podaci/potvrdi-brisanje?t=${token}`,
    );
    return ok({ emailSent: true });
  },
);

async function sendDeletionConfirmation(to: string, url: string) {
  await sendActionEmail('deletionConfirm', to, url);
}

export const confirmDeletionByTokenAction = createAction(
  { schema: z.object({ token: z.string().min(10).max(2000) }), auth: 'user' },
  async (input, { user, ipHash }): Promise<Result<{ scheduledFor: string }>> => {
    const payload = verifyToken<{ userId: string; deleteContent: boolean; waiveBalance: boolean }>(
      'account-deletion',
      input.token,
    );
    if (!payload || payload.userId !== user.id)
      return err(appError('VALIDATION', 'errors.account.linkInvalid'));
    const result = await scheduleDeletion({
      userId: user.id,
      currentSessionId: user.sessionId,
      deleteContent: payload.deleteContent,
      waiveBalance: payload.waiveBalance,
      ipHash,
    });
    return result.ok ? ok({ scheduledFor: result.value.scheduledFor.toISOString() }) : result;
  },
);

export const cancelDeletionAction = createAction(
  { schema: z.object({}), auth: 'user' },
  async (_input, { user, ipHash }) => cancelDeletion(user.id, ipHash),
);

export const followAction = createAction(
  {
    schema: z.object({
      targetType: z.enum(['seller', 'community']),
      targetId: z.uuid(),
      follow: z.boolean(),
    }),
    auth: 'participant',
  },
  async (input, { user }): Promise<Result<void>> => {
    if (input.targetType === 'seller' && input.targetId === user.id)
      return err(appError('CONFLICT', 'errors.account.followSelf'));
    if (input.follow)
      await db
        .insert(follows)
        .values({ userId: user.id, targetType: input.targetType, targetId: input.targetId })
        .onConflictDoNothing();
    else
      await db
        .delete(follows)
        .where(
          and(
            eq(follows.userId, user.id),
            eq(follows.targetType, input.targetType),
            eq(follows.targetId, input.targetId),
          ),
        );
    return ok(undefined);
  },
);
