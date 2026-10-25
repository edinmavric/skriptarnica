import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { assertDevRoutes } from '@/lib/dev';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function DevLayout({ children }: { children: ReactNode }) {
  assertDevRoutes();
  return children;
}
