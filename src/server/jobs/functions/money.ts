import { reconcilePendingOrders } from '../../services/orders';
import { releaseMaturedFunds } from '../../services/wallet';
import { alertOps } from '../alerts';
import { inngest } from '../client';

/** SPEC §5.3.5: pending orders older than 10 minutes are checked at the provider every 15 min. */
export const reconcilePayments = inngest.createFunction(
  {
    id: 'reconcile-payments',
    triggers: [{ cron: 'TZ=Europe/Belgrade */15 * * * *' }],
    concurrency: { limit: 1 },
    onFailure: async ({ error }) => alertOps('Payment reconciliation failed', error.message),
  },
  async ({ step }) => step.run('reconcile', () => reconcilePendingOrders(10)),
);

/** SPEC §5.3.6: daily release of seller earnings whose hold period has passed. */
export const releaseFunds = inngest.createFunction(
  {
    id: 'release-funds',
    triggers: [{ cron: 'TZ=Europe/Belgrade 0 3 * * *' }],
    concurrency: { limit: 1 },
    onFailure: async ({ error }) => alertOps('Funds release failed', error.message),
  },
  async ({ step }) => step.run('release', () => releaseMaturedFunds()),
);
