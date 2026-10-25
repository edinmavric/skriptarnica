import 'dotenv/config';

import { execFileSync } from 'node:child_process';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Drops and recreates the local database, applies migrations and seeds the catalog and demo
 * content. Development only: refuses to run unless APP_ENV is development and the database is
 * on localhost. Usage: npm run db:reset
 */
async function main() {
  const appEnv = process.env.APP_ENV ?? 'development';
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (appEnv !== 'development' || !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('db:reset only runs with APP_ENV=development against a localhost database');
  }
  const name = url.pathname.replace(/^\//, '');
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const adminSql = postgres(admin.toString(), { max: 1, onnotice: () => undefined });
  await adminSql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await adminSql.unsafe(`CREATE DATABASE "${name}"`);
  await adminSql.end();

  const sql = postgres(url.toString(), { max: 1, onnotice: () => undefined });
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  await sql.end();

  // Demo accounts share a published password; checking it against HIBP only adds a network hop.
  execFileSync('npx', ['tsx', 'src/server/db/seed/index.ts', 'all'], {
    stdio: 'inherit',
    env: { ...process.env, HIBP_ENABLED: 'false' },
  });
  console.log(`db:reset: ${name} recreated, migrated and seeded`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
