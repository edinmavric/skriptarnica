import { and, eq, gte, sql } from 'drizzle-orm';

import { db } from '../db/client';
import { orderItems, orders } from '../db/schema';

export interface DailySales {
  /** YYYY-MM-DD in Europe/Belgrade */
  day: string;
  count: number;
  sellerPara: number;
}

/** Paid sales per day for the last `days` days (Belgrade calendar days), zero-filled. */
export async function salesPerDay(sellerId: string, days = 30): Promise<DailySales[]> {
  const since = new Date(Date.now() - (days + 1) * 86_400_000);
  const rows = await db
    .select({
      day: sql<string>`to_char(${orders.paidAt} AT TIME ZONE 'Europe/Belgrade', 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
      sellerPara: sql<number>`coalesce(sum(${orderItems.sellerPara}), 0)::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(eq(orderItems.sellerId, sellerId), eq(orders.status, 'paid'), gte(orders.paidAt, since)),
    )
    .groupBy(sql`1`);
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Belgrade',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const result: DailySales[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = formatter.format(new Date(Date.now() - i * 86_400_000));
    const row = byDay.get(day);
    result.push({ day, count: row?.count ?? 0, sellerPara: row?.sellerPara ?? 0 });
  }
  return result;
}
