import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AuthShell } from '@/components/layout/auth-shell';

export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
