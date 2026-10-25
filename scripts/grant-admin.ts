import 'dotenv/config';

import { eq } from 'drizzle-orm';

import { db } from '@/server/db/client';
import { auditLog, users } from '@/server/db/schema';

/**
 * Grants the admin role to an existing account (ops only; see RUNBOOK.md). The account must
 * then enable 2FA before /admin opens. Usage: npm run admin:grant -- someone@example.com
 */
async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('usage: npm run admin:grant -- <email>');
  const [user] = await db
    .update(users)
    .set({ role: 'admin' })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  if (!user) throw new Error(`no user with email ${email}`);
  await db.insert(auditLog).values({
    actorId: null,
    action: 'admin.role_granted_via_cli',
    targetType: 'user',
    targetId: user.id,
  });
  console.log(`granted admin to ${user.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
