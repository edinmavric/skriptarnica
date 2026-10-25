import { and, desc, eq, inArray } from 'drizzle-orm';

import { env } from '@/env';
import { appError, err, ok, type Result } from '@/lib/result';

import { db } from '../db/client';
import { copyrightClaims, notes } from '../db/schema';
import { sendActionEmail } from '../email/send';
import { audit } from './admin/audit';

/** /skripta/{slug} on our own domain → the note it points to (claims about other URLs stay unlinked). */
export async function noteIdFromUrl(raw: string): Promise<string | null> {
  try {
    const url = new URL(raw);
    if (url.origin !== new URL(env.NEXT_PUBLIC_APP_URL).origin) return null;
    const slug = /^\/skripta\/([a-z0-9-]+)\/?$/.exec(url.pathname)?.[1];
    if (!slug) return null;
    const [note] = await db.select({ id: notes.id }).from(notes).where(eq(notes.slug, slug));
    return note?.id ?? null;
  } catch {
    return null;
  }
}

/** Public claim (SPEC §7.4): no account needed; the claimant gets a receipt by email. */
export async function submitCopyrightClaim(input: {
  claimantName: string;
  claimantEmail: string;
  organization: string | null;
  contentUrl: string;
  ownershipProof: string;
}): Promise<Result<{ id: string }>> {
  const noteId = await noteIdFromUrl(input.contentUrl);
  const [claim] = await db
    .insert(copyrightClaims)
    .values({ ...input, noteId, statementAcceptedAt: new Date() })
    .returning({ id: copyrightClaims.id });
  if (!claim) return err(appError('INTERNAL', 'errors.internal'));
  await sendActionEmail('copyrightReceived', input.claimantEmail, undefined, {
    reference: claim.id.slice(0, 8),
  });
  return ok({ id: claim.id });
}

/** Claims the seller can answer: accepted (note removed) and not yet countered. */
export async function claimsForSellerNote(sellerId: string, noteId: string) {
  const [note] = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.sellerId, sellerId)));
  if (!note) return null;
  return db
    .select({
      id: copyrightClaims.id,
      status: copyrightClaims.status,
      decisionNote: copyrightClaims.decisionNote,
      decidedAt: copyrightClaims.decidedAt,
      counterNotice: copyrightClaims.counterNotice,
    })
    .from(copyrightClaims)
    .where(
      and(
        eq(copyrightClaims.noteId, noteId),
        inArray(copyrightClaims.status, ['accepted', 'countered']),
      ),
    )
    .orderBy(desc(copyrightClaims.createdAt));
}

/** Counter-notice: the claim goes back to the admin queue ("countered") with the seller's case. */
export async function submitCounterNotice(
  sellerId: string,
  noteId: string,
  text: string,
): Promise<Result<void>> {
  const claims = await claimsForSellerNote(sellerId, noteId);
  if (!claims) return err(appError('NOT_FOUND', 'errors.notFound'));
  const open = claims.find((claim) => claim.status === 'accepted');
  if (!open) return err(appError('CONFLICT', 'errors.copyright.nothingToCounter'));
  await db.transaction(async (tx) => {
    await tx
      .update(copyrightClaims)
      .set({ status: 'countered', counterNotice: text, counterNoticeAt: new Date() })
      .where(eq(copyrightClaims.id, open.id));
    await audit(tx, {
      actorId: sellerId,
      action: 'copyright.counter_notice',
      targetType: 'copyright_claim',
      targetId: open.id,
      details: { noteId },
    });
  });
  return ok(undefined);
}
