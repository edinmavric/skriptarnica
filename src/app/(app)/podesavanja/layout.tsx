import type { ReactNode } from 'react';

import { SettingsNav } from '@/components/features/settings/settings-nav';
import { SignOutButton } from '@/components/layout/sign-out-button';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-6 md:grid-cols-[12rem_1fr] md:gap-10">
      <SettingsNav />
      <div className="min-w-0">
        {children}
        {/* Phones have no account menu in the header. */}
        <SignOutButton className="mt-10 border-t border-rule pt-6 md:hidden" />
      </div>
    </div>
  );
}
