import { render, toPlainText } from '@react-email/render';
import type { ReactElement } from 'react';

import { env } from '@/env';

import { emailTranslator } from './i18n';
import { ActionEmail } from './templates/action-email';
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
  'verifyEmail' | 'magicLink' | 'resetPassword' | 'studentEmail' | 'welcome' | 'changeEmail';

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

export { send as sendRenderedEmail };
