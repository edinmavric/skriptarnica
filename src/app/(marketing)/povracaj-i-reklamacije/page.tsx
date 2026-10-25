import type { Metadata } from 'next';

import { LegalDocument, legalMetadata } from '@/components/features/legal/legal-document';
import { routes } from '@/config/routes';

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata('refunds', routes.legal.refunds);
}

export default function Page() {
  return <LegalDocument doc="refunds" />;
}
