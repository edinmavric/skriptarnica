import { NextResponse, type NextRequest } from 'next/server';

import { belgradeDayStart } from '@/lib/time';
import { getCurrentUser } from '@/server/auth/session';
import { isAdmin } from '@/server/policies';
import { clientIpHash } from '@/server/request';
import { audit } from '@/server/services/admin/audit';
import { financeCsv, type ReportKind } from '@/server/services/admin/finance';
import { db } from '@/server/db/client';

export const dynamic = 'force-dynamic';

const KINDS: ReportKind[] = ['porudzbine', 'isplate', 'knjizenja'];

/** Admin-only CSV download; dates are inclusive Belgrade calendar days. Exports are audited. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isAdmin(user).allowed || !user) return new NextResponse(null, { status: 404 });
  const params = request.nextUrl.searchParams;
  const kind = params.get('vrsta') as ReportKind;
  const from = params.get('od') ?? '';
  const to = params.get('do') ?? '';
  if (!KINDS.includes(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    return new NextResponse(null, { status: 400 });
  const start = belgradeDayStart(from);
  // Inclusive end day: up to the start of the following Belgrade day.
  const next = new Date(`${to}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = belgradeDayStart(next.toISOString().slice(0, 10));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start)
    return new NextResponse(null, { status: 400 });
  const csv = await financeCsv(kind, start, end);
  await audit(db, {
    actorId: user.id,
    action: 'finance.csv_exported',
    targetType: 'report',
    targetId: kind,
    details: { from, to },
    ipHash: await clientIpHash(),
  });
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="skriptarnica-${kind}-${from}-${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
