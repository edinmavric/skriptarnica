import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';

import { env } from '@/env';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { executeDueDeletions } from '@/server/services/account-deletion';

export const dynamic = 'force-dynamic';

/**
 * Dev/test only: ends the grace period of a pending deletion and runs the daily job, so e2e
 * tests can check what happens after 14 days.
 */
export async function POST(request: NextRequest) {
  // Destructive: development and test only (not even preview).
  if (env.APP_ENV !== 'development' && env.APP_ENV !== 'test')
    return new NextResponse(null, { status: 404 });
  const email = request.nextUrl.searchParams.get('email');
  if (!email) return new NextResponse(null, { status: 400 });
  const [user] = await db
    .select({ id: users.id, scheduled: users.deletionScheduledFor })
    .from(users)
    .where(eq(users.email, email));
  if (!user?.scheduled) return NextResponse.json({ deleted: 0 }, { status: 409 });
  await db
    .update(users)
    .set({ deletionScheduledFor: new Date(Date.now() - 1000) })
    .where(eq(users.id, user.id));
  return NextResponse.json({ deleted: await executeDueDeletions() });
}
