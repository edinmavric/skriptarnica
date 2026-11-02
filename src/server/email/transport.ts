import { randomUUID } from 'node:crypto';

import { createTransport } from 'nodemailer';
import { Resend } from 'resend';

import { env } from '@/env';

import { logger } from '../logger';
import { redis } from '../redis';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Category for logs only (never the address). */
  category: string;
}

export interface DevOutboxEntry extends OutgoingEmail {
  id: string;
  createdAt: string;
}

const DEV_OUTBOX_KEY = 'dev:outbox';
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
const smtp =
  env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD
    ? createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      })
    : null;

/**
 * Sends through Resend or SMTP, whichever is configured (env validation allows one, and requires
 * one on preview/production). Without either (local dev/test) the email goes to a Redis-backed
 * dev outbox.
 */
export async function deliver(email: OutgoingEmail): Promise<void> {
  if (smtp) {
    try {
      await smtp.sendMail({
        from: env.EMAIL_FROM,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.headers ? { headers: email.headers } : {}),
      });
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'unknown';
      logger.error({ category: email.category, smtpError: code }, 'email send failed');
      throw new Error(`Email delivery failed: ${code}`);
    }
    logger.info({ category: email.category }, 'email sent');
    return;
  }
  if (resend) {
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.headers ? { headers: email.headers } : {}),
    });
    if (error) {
      logger.error({ category: email.category, resendError: error.name }, 'email send failed');
      throw new Error(`Email delivery failed: ${error.name}`);
    }
    logger.info({ category: email.category }, 'email sent');
    return;
  }
  const entry: DevOutboxEntry = { ...email, id: randomUUID(), createdAt: new Date().toISOString() };
  await redis.lpush(DEV_OUTBOX_KEY, JSON.stringify(entry));
  await redis.ltrim(DEV_OUTBOX_KEY, 0, 499);
  logger.info({ category: email.category }, 'email stored in dev outbox');
}

export async function readDevOutbox(to?: string): Promise<DevOutboxEntry[]> {
  const raw = await redis.lrange<DevOutboxEntry | string>(DEV_OUTBOX_KEY, 0, 499);
  const entries = raw.map((item) =>
    typeof item === 'string' ? (JSON.parse(item) as DevOutboxEntry) : item,
  );
  return to ? entries.filter((entry) => entry.to.toLowerCase() === to.toLowerCase()) : entries;
}
