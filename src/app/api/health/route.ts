import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/server/db/client';

export const dynamic = 'force-dynamic';

type CheckStatus = 'ok' | 'error';

async function checkDatabase(): Promise<CheckStatus> {
  try {
    await db.execute(sql`select 1`);
    return 'ok';
  } catch (error) {
    console.error('health: database check failed', error instanceof Error ? error.message : error);
    return 'error';
  }
}

/** Liveness/readiness probe (SPEC §11). Redis and R2 checks are added with those services. */
export async function GET() {
  const checks = { database: await checkDatabase() };
  const healthy = Object.values(checks).every((status) => status === 'ok');
  return NextResponse.json(
    { ok: healthy, checks },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
