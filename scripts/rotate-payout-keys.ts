import 'dotenv/config';

import { eq, isNotNull } from 'drizzle-orm';

import { keyVersionOf, rotate } from '@/server/crypto/encryption';
import { payoutKeyRing } from '@/server/crypto/payout-keys';
import { db } from '@/server/db/client';
import { auditLog, sellerProfiles } from '@/server/db/schema';

/**
 * Re-encrypts every seller's payout details with the active key version (see RUNBOOK.md,
 * "Secret rotation"). Run after adding a new version to PAYOUT_ENCRYPTION_KEYS and switching
 * PAYOUT_ENCRYPTION_ACTIVE_VERSION; when it reports 0 rows left on old versions, the old key
 * can be removed. Idempotent. Usage: npm run payout-keys:rotate
 */
async function main() {
  const ring = payoutKeyRing();
  const rows = await db
    .select({
      userId: sellerProfiles.userId,
      holder: sellerProfiles.payoutHolderEnc,
      account: sellerProfiles.payoutAccountEnc,
    })
    .from(sellerProfiles)
    .where(isNotNull(sellerProfiles.payoutAccountEnc));
  let rotated = 0;
  for (const row of rows) {
    if (!row.holder || !row.account) continue;
    if (keyVersionOf(row.holder) === ring.active && keyVersionOf(row.account) === ring.active)
      continue;
    await db
      .update(sellerProfiles)
      .set({
        payoutHolderEnc: rotate(row.holder, ring, `${row.userId}:holder`),
        payoutAccountEnc: rotate(row.account, ring, `${row.userId}:account`),
      })
      .where(eq(sellerProfiles.userId, row.userId));
    rotated += 1;
  }
  await db.insert(auditLog).values({
    actorId: null,
    action: 'security.payout_keys_rotated',
    targetType: 'system',
    details: { rotated, active: ring.active },
  });
  console.log(`re-encrypted ${rotated} of ${rows.length} sellers with key ${ring.active}`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
