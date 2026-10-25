import { render, toPlainText } from '@react-email/render';
import type { ReactElement } from 'react';

import { env } from '@/env';

import { emailTranslator } from './i18n';
import type { NotificationType } from '@/config/notifications';

import { ActionEmail } from './templates/action-email';
import { DigestEmail, type DigestItem } from './templates/digest-email';
import { listUnsubscribeHeaders, unsubscribeUrls } from './unsubscribe';
import { deliver } from './transport';

async function send(
  to: string,
  subject: string,
  element: ReactElement,
  category: string,
  headers?: Record<string, string>,
) {
  const html = await render(element);
  const text = toPlainText(html);
  await deliver({ to, subject, html, text, category, ...(headers ? { headers } : {}) });
}

type ActionKind =
  | 'verifyEmail'
  | 'magicLink'
  | 'resetPassword'
  | 'studentEmail'
  | 'welcome'
  | 'changeEmail'
  | 'purchase'
  | 'exportReady'
  | 'deletionScheduled'
  | 'deletionConfirm'
  | 'copyrightReceived'
  | 'deletionCancelled';

/**
 * Sends a single-action email whose copy lives in messages under `email.<kind>`:
 * subject, preview, heading, body (1 paragraph), cta, note.
 */
export async function sendActionEmail(
  kind: ActionKind,
  to: string,
  url: string | undefined,
  values: Record<string, string | number> = {},
): Promise<void> {
  const t = emailTranslator();
  const element = (
    <ActionEmail
      preview={t(`${kind}.preview`, values)}
      heading={t(`${kind}.heading`, values)}
      paragraphs={[t(`${kind}.body`, values)]}
      {...(url ? { cta: t(`${kind}.cta`, values), url } : {})}
      fallbackLabel={t('common.fallbackLink')}
      note={t(`${kind}.note`, values)}
      footer={t('common.footer')}
      appUrl={env.NEXT_PUBLIC_APP_URL}
    />
  );
  await send(to, t(`${kind}.subject`, values), element, kind);
}

/**
 * A notification email (SPEC §4.9). Copy lives under `email.notification.<type>`; every one
 * carries a one-click unsubscribe for that type.
 */
export async function sendNotificationEmail(input: {
  to: string;
  userId: string;
  type: NotificationType;
  values: Record<string, string | number>;
  url: string;
}): Promise<void> {
  const t = emailTranslator();
  const tn = (key: string) =>
    (t as unknown as (k: string, v: Record<string, string | number>) => string)(
      `notification.${input.type}.${key}`,
      input.values,
    );
  const unsubscribe = unsubscribeUrls(input.userId, input.type);
  const element = (
    <ActionEmail
      preview={tn('body')}
      heading={tn('heading')}
      paragraphs={[tn('body')]}
      cta={tn('cta')}
      url={input.url}
      fallbackLabel={t('common.fallbackLink')}
      note={t('common.unsubscribeType', { url: unsubscribe.page })}
      footer={t('common.footer')}
      appUrl={env.NEXT_PUBLIC_APP_URL}
    />
  );
  await send(
    input.to,
    tn('subject'),
    element,
    `notification.${input.type}`,
    listUnsubscribeHeaders(input.userId, input.type),
  );
}

export async function sendDigestEmail(input: {
  to: string;
  userId: string;
  frequency: 'daily' | 'weekly';
  items: DigestItem[];
  unread: number;
}): Promise<void> {
  const t = emailTranslator();
  const unsubscribe = unsubscribeUrls(input.userId, 'digest');
  const element = (
    <DigestEmail
      preview={t('digest.preview', { count: input.items.length })}
      heading={t(`digest.heading.${input.frequency}`)}
      intro={t('digest.intro', { count: input.items.length, unread: input.unread })}
      items={input.items}
      cta={t('digest.cta')}
      url={`${env.NEXT_PUBLIC_APP_URL}/zajednice`}
      unsubscribeLabel={t('digest.unsubscribe')}
      unsubscribeUrl={unsubscribe.page}
      footer={t('common.footer')}
      appUrl={env.NEXT_PUBLIC_APP_URL}
    />
  );
  await send(
    input.to,
    t(`digest.subject.${input.frequency}`, { count: input.items.length }),
    element,
    'digest',
    listUnsubscribeHeaders(input.userId, 'digest'),
  );
}

export { send as sendRenderedEmail };
