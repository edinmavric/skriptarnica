'use server';

import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { appError, err, ok, type Result } from '@/lib/result';
import {
  adjustmentSchema,
  banSchema,
  catalogEntityTypes,
  catalogFormSchemas,
  copyrightDecisionSchema,
  reportResolutionSchema,
  type CatalogEntityType,
} from '@/lib/validation/admin';

import { auth } from '../auth/auth';
import { enterImpersonation, leaveImpersonation } from '../auth/impersonation-cookies';
import { markReauthenticated } from '../auth/reauth';
import { getCurrentUser } from '../auth/session';
import { db } from '../db/client';
import { sessions } from '../db/schema';
import {
  approveCatalogRequest,
  createCatalogItem,
  deleteCatalogItem,
  importCoursesCsv,
  rejectCatalogRequest,
  setCoursePlacement,
  setCourseProfessor,
  updateCatalogItem,
} from '../services/admin/catalog-admin';
import { adjustSellerBalance } from '../services/admin/finance';
import {
  decideCopyrightClaim,
  linkClaimToNote,
  removeNote,
  resolveReport,
} from '../services/admin/moderation-admin';
import { updatePlatformSettings } from '../services/admin/system';
import {
  banUser,
  endImpersonation,
  resetTwoFactor,
  startImpersonation,
  unbanUser,
} from '../services/admin/users';
import { settingsSchema } from '../services/settings';
import { createAction, zodFieldErrors } from './safe-action';

/** Password confirmation that unlocks sensitive admin actions for 10 minutes on this session. */
export const reauthAction = createAction(
  {
    schema: z.object({ password: z.string().min(1, { error: 'validation.passwordRequired' }) }),
    auth: 'admin',
    rateLimit: { name: 'signIn', by: 'user' },
  },
  async (input, { user }): Promise<Result<void>> => {
    try {
      await auth.api.verifyPassword({
        body: { password: input.password },
        headers: await headers(),
      });
    } catch (error) {
      if (error instanceof APIError)
        return err(
          appError('VALIDATION', 'errors.validation', { password: ['validation.passwordWrong'] }),
        );
      throw error;
    }
    await markReauthenticated(user.sessionId);
    return ok(undefined);
  },
);

// --- Users ----------------------------------------------------------------------------------

export const banUserAction = createAction(
  { schema: banSchema, auth: 'admin', reauth: true },
  async (input, { user, ipHash }) => {
    const result = await banUser(user.id, input.userId, input.reason, ipHash);
    if (result.ok) revalidatePath(`/admin/korisnici/${input.userId}`);
    return result;
  },
);

export const unbanUserAction = createAction(
  { schema: z.object({ userId: z.uuid() }), auth: 'admin', reauth: true },
  async (input, { user, ipHash }) => {
    const result = await unbanUser(user.id, input.userId, ipHash);
    if (result.ok) revalidatePath(`/admin/korisnici/${input.userId}`);
    return result;
  },
);

export const resetTwoFactorAction = createAction(
  { schema: z.object({ userId: z.uuid() }), auth: 'admin', reauth: true },
  async (input, { user, ipHash }) => {
    const result = await resetTwoFactor(user.id, input.userId, ipHash);
    if (result.ok) revalidatePath(`/admin/korisnici/${input.userId}`);
    return result;
  },
);

export const startImpersonationAction = createAction(
  { schema: z.object({ userId: z.uuid() }), auth: 'admin', reauth: true },
  async (input, { user, ipHash }) => {
    const result = await startImpersonation(
      user.id,
      input.userId,
      ipHash,
      (await headers()).get('user-agent'),
    );
    if (!result.ok) return result;
    await enterImpersonation(result.value.token, result.value.expiresAt);
    redirect('/');
  },
);

/** Ends a read-only impersonation. The current "user" is the impersonated one, so no admin check. */
export async function stopImpersonationAction(): Promise<void> {
  const current = await getCurrentUser();
  let targetId: string | null = null;
  if (current?.impersonatedBy) {
    const [session] = await db
      .select({ token: sessions.token })
      .from(sessions)
      .where(eq(sessions.id, current.sessionId));
    if (session) await endImpersonation(session.token);
    targetId = current.id;
  }
  const restored = await leaveImpersonation();
  redirect(restored && targetId ? `/admin/korisnici/${targetId}` : '/');
}

// --- Catalog ----------------------------------------------------------------------------------

const catalogInput = z.object({
  type: z.enum(catalogEntityTypes),
  id: z.uuid().optional(),
  values: z.record(z.string(), z.unknown()),
});

/** Create or update any catalog entity; the per-type schema validates the form values. */
export const saveCatalogItemAction = createAction(
  { schema: catalogInput, auth: 'admin' },
  async (input, { user, ipHash }): Promise<Result<{ id: string }>> => {
    const schema = catalogFormSchemas[input.type];
    const parsed = schema.safeParse(input.values);
    if (!parsed.success)
      return err(appError('VALIDATION', 'errors.validation', zodFieldErrors(parsed.error)));
    const type: CatalogEntityType = input.type;
    if (input.id) {
      const result = await updateCatalogItem(user.id, type, input.id, parsed.data as never, ipHash);
      if (!result.ok) return result;
      revalidatePath('/admin/katalog');
      return ok({ id: input.id });
    }
    const created = await createCatalogItem(user.id, type, parsed.data as never, ipHash);
    if (created.ok) revalidatePath('/admin/katalog');
    return created;
  },
);

export const deleteCatalogItemAction = createAction(
  {
    schema: z.object({ type: z.enum(catalogEntityTypes), id: z.uuid() }),
    auth: 'admin',
    reauth: true,
  },
  async (input, { user, ipHash }) => {
    const result = await deleteCatalogItem(user.id, input.type, input.id, ipHash);
    if (result.ok) revalidatePath('/admin/katalog');
    return result;
  },
);

export const setCoursePlacementAction = createAction(
  {
    schema: z.object({
      courseId: z.uuid(),
      programId: z.uuid(),
      year: z.coerce.number().int().min(1).max(6),
      semester: z.coerce.number().int().min(1).max(12),
      mandatory: z.boolean(),
      remove: z.boolean(),
    }),
    auth: 'admin',
  },
  async (input, { user, ipHash }) => {
    const result = await setCoursePlacement(user.id, input, ipHash);
    revalidatePath(`/admin/katalog/course/${input.courseId}`);
    return result;
  },
);

export const setCourseProfessorAction = createAction(
  {
    schema: z.object({ courseId: z.uuid(), professorId: z.uuid(), remove: z.boolean() }),
    auth: 'admin',
  },
  async (input, { user, ipHash }) => {
    const result = await setCourseProfessor(user.id, input, ipHash);
    revalidatePath(`/admin/katalog/course/${input.courseId}`);
    return result;
  },
);

export const importCoursesAction = createAction(
  {
    schema: z.object({
      csv: z.string().min(1, { error: 'validation.required' }).max(2_000_000),
      dryRun: z.boolean(),
    }),
    auth: 'admin',
    reauth: true,
  },
  async (input, { user, ipHash }) => importCoursesCsv(user.id, input.csv, input.dryRun, ipHash),
);

export const approveCatalogRequestAction = createAction(
  {
    schema: z.object({
      requestId: z.uuid(),
      type: z.enum(catalogEntityTypes),
      values: z.record(z.string(), z.unknown()),
    }),
    auth: 'admin',
  },
  async (input, { user, ipHash }): Promise<Result<{ id: string }>> => {
    const parsed = catalogFormSchemas[input.type].safeParse(input.values);
    if (!parsed.success)
      return err(appError('VALIDATION', 'errors.validation', zodFieldErrors(parsed.error)));
    const result = await approveCatalogRequest(
      user.id,
      input.requestId,
      input.type,
      parsed.data as never,
      ipHash,
    );
    if (result.ok) revalidatePath('/admin/katalog/zahtevi');
    return result;
  },
);

export const rejectCatalogRequestAction = createAction(
  {
    schema: z.object({
      requestId: z.uuid(),
      reason: z.string().trim().min(5, { error: 'validation.reasonTooShort' }).max(500),
    }),
    auth: 'admin',
  },
  async (input, { user, ipHash }) => {
    const result = await rejectCatalogRequest(user.id, input.requestId, input.reason, ipHash);
    if (result.ok) revalidatePath('/admin/katalog/zahtevi');
    return result;
  },
);

// --- Reports and claims -------------------------------------------------------------------------

export const resolveReportAdminAction = createAction(
  { schema: reportResolutionSchema, auth: 'admin' },
  async (input, { user, ipHash }) => {
    const result = await resolveReport(user, input, ipHash);
    if (result.ok) revalidatePath('/admin/prijave');
    return result;
  },
);

export const removeNoteAction = createAction(
  {
    schema: z.object({
      noteId: z.uuid(),
      reason: z.string().trim().min(5, { error: 'validation.reasonTooShort' }).max(1000),
    }),
    auth: 'admin',
    reauth: true,
  },
  async (input, { user, ipHash }) => removeNote(user.id, input.noteId, input.reason, ipHash),
);

export const decideCopyrightClaimAction = createAction(
  { schema: copyrightDecisionSchema, auth: 'admin', reauth: true },
  async (input, { user, ipHash }) => {
    const result = await decideCopyrightClaim(user.id, input, ipHash);
    if (result.ok) revalidatePath('/admin/autorska-prava');
    return result;
  },
);

export const linkClaimToNoteAction = createAction(
  { schema: z.object({ claimId: z.uuid(), noteId: z.uuid() }), auth: 'admin' },
  async (input, { user, ipHash }) => {
    const result = await linkClaimToNote(user.id, input.claimId, input.noteId, ipHash);
    if (result.ok) revalidatePath('/admin/autorska-prava');
    return result;
  },
);

// --- Money and settings ---------------------------------------------------------------------------

export const adjustBalanceAction = createAction(
  { schema: adjustmentSchema, auth: 'admin', reauth: true },
  async (input, { user, ipHash }) => {
    const result = await adjustSellerBalance(user.id, input, ipHash);
    if (result.ok) revalidatePath(`/admin/korisnici/${input.sellerId}`);
    return result;
  },
);

export const saveSettingsAction = createAction(
  { schema: settingsSchema, auth: 'admin', reauth: true },
  async (input, { user, ipHash }) => {
    const result = await updatePlatformSettings(user.id, input, ipHash);
    if (result.ok) revalidatePath('/admin/podesavanja');
    return result;
  },
);
