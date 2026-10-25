import { env } from '@/env';

import { parseKeyRing, type KeyRing } from './encryption';

let ring: KeyRing | null = null;

/** Key ring for payout details, from PAYOUT_ENCRYPTION_KEYS / _ACTIVE_VERSION. */
export function payoutKeyRing(): KeyRing {
  ring ??= parseKeyRing(env.PAYOUT_ENCRYPTION_KEYS, env.PAYOUT_ENCRYPTION_ACTIVE_VERSION);
  return ring;
}
