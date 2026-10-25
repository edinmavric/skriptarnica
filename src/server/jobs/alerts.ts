import { env } from '@/env';

import { sendRenderedEmail } from '../email/send';
import { ActionEmail } from '../email/templates/action-email';
import { logger } from '../logger';

/** Operational alert to ALERT_EMAIL (dead jobs, webhook failures, queue size — SPEC §11). */
export async function alertOps(subject: string, details: string): Promise<void> {
  logger.error({ alert: subject }, details);
  if (!env.ALERT_EMAIL) return;
  try {
    await sendRenderedEmail(
      env.ALERT_EMAIL,
      `[ops] ${subject}`,
      ActionEmail({
        preview: subject,
        heading: subject,
        paragraphs: [details],
        fallbackLabel: '',
        footer: env.APP_ENV,
        appUrl: env.NEXT_PUBLIC_APP_URL,
      }),
      'ops-alert',
    );
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      'ops alert email failed',
    );
  }
}
