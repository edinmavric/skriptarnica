import type { Metadata } from 'next';

import { CopyrightClaimForm } from '@/components/features/legal/copyright-claim-form';
import { LegalDocument, legalMetadata } from '@/components/features/legal/legal-document';
import { routes } from '@/config/routes';
import { env } from '@/env';
import { getNonce } from '@/server/nonce';

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata('copyright', routes.legal.copyright);
}

export default async function CopyrightPage() {
  return (
    <div className="flex flex-col gap-10">
      <LegalDocument doc="copyright" />
      <CopyrightClaimForm siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} nonce={await getNonce()} />
    </div>
  );
}
