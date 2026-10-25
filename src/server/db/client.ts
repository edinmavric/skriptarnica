import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '@/env';

import * as schema from './schema';

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as { __sql?: Sql };

// Reuse one connection pool across hot reloads in development.
const sql: Sql =
  globalForDb.__sql ??
  postgres(env.DATABASE_URL, {
    max: env.NODE_ENV === 'production' ? 10 : 5,
    // Neon's pooler (PgBouncer, transaction mode) does not support prepared statements.
    prepare: false,
  });

if (env.NODE_ENV !== 'production') {
  globalForDb.__sql = sql;
}

export const db = drizzle(sql, { schema, casing: 'snake_case' });
export type Db = typeof db;
