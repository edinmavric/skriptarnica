import type { AbstractIntlMessages } from 'next-intl';
import { getMessages } from 'next-intl/server';

/** Rendered only on the server (long legal texts, emails, OG cards): never sent to browsers. */
const SERVER_ONLY = ['legal', 'info', 'email', 'imprint', 'og'];

/** Namespaces only client components of one area use. */
const AREA_ONLY = {
  app: ['seller', 'settings'],
  admin: ['admin'],
  dev: ['devUi', 'devOutbox', 'devCheckout'],
} as const;

export type MessageArea = 'public' | 'app' | 'admin' | 'dev';

/**
 * Messages for a NextIntlClientProvider (SPEC §8.2 performance): every page used to inline the
 * whole catalog (~100 KB) into its HTML. Public pages get the common set; the signed-in area,
 * admin and dev layouts add their own namespaces through nested providers.
 */
export async function clientMessages(area: MessageArea): Promise<AbstractIntlMessages> {
  const all = (await getMessages()) as unknown as AbstractIntlMessages;
  const allowed = new Set<string>(
    area === 'admin'
      ? [...AREA_ONLY.app, ...AREA_ONLY.admin]
      : area === 'public'
        ? []
        : AREA_ONLY[area],
  );
  const areaOnly = new Set<string>(Object.values(AREA_ONLY).flat());
  return Object.fromEntries(
    Object.entries(all).filter(
      ([key]) => !SERVER_ONLY.includes(key) && (!areaOnly.has(key) || allowed.has(key)),
    ),
  );
}
