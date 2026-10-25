import type { Metadata } from 'next';

import { LegalDocument, legalMetadata } from '@/components/features/legal/legal-document';
import { routes } from '@/config/routes';
import { legalVersions } from '@/config/legal';

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata('terms', routes.legal.terms);
}

export default function Page() {
  return <LegalDocument doc="terms" version={legalVersions.terms} />;
}
