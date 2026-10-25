import 'dotenv/config';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Integration tests run against a real Postgres database (SPEC §12): a dedicated
 * `<db>_test` database is (re)created and migrated once per run.
 */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL or TEST_DATABASE_URL must be set for integration tests');
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, '');
  url.pathname = name.endsWith('_test') ? name : `${name}_test`;
  return url.toString();
}

export default async function setup() {
  const target = new URL(testDatabaseUrl());
  const dbName = target.pathname.replace(/^\//, '');
  const admin = new URL(target);
  admin.pathname = '/postgres';
  const adminSql = postgres(admin.toString(), { max: 1, onnotice: () => undefined });
  await adminSql.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await adminSql.unsafe(`CREATE DATABASE "${dbName}"`);
  await adminSql.end();

  const sql = postgres(target.toString(), { max: 1, onnotice: () => undefined });
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  await sql.end();
}
