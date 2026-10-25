import type { UnsubscribeScope } from '../email/unsubscribe';
import { setDigestFrequency, setPreference } from './notifications';

/** Unsubscribing never removes in-app notifications: emails for a type drop to in-app only. */
export async function applyUnsubscribe(userId: string, scope: UnsubscribeScope): Promise<void> {
  if (scope === 'digest') await setDigestFrequency(userId, 'none');
  else await setPreference(userId, scope, 'in_app');
}
