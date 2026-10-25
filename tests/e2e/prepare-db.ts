import 'dotenv/config';

import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/** E2E runs against its own `<db>_e2e` database, so test data never lands in the dev database. */
export function e2eDatabaseUrl(): string {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL or E2E_DATABASE_URL must be set for E2E tests');
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, '');
  url.pathname = name.endsWith('_e2e') ? name : `${name}_e2e`;
  return url.toString();
}

/**
 * Recreates, migrates and seeds the E2E database. Playwright runs this as part of the web
 * server command (`webServer` starts before `globalSetup`, and its health check needs the DB).
 */
async function prepare() {
  const target = new URL(e2eDatabaseUrl());
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

  // Next's data cache (unstable_cache) lives on disk and outlives the database; recreated rows
  // get new IDs, so a stale entry would point pages at courses that no longer exist.
  rmSync('.next/cache/fetch-cache', { recursive: true, force: true });
  execFileSync('npx', ['tsx', 'src/server/db/seed/index.ts', 'all'], {
    stdio: 'inherit',
    // Demo accounts share a published password; checking it against HIBP only adds a network hop.
    env: { ...process.env, DATABASE_URL: target.toString(), HIBP_ENABLED: 'false' },
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  prepare().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
