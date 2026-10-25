import type { ReactNode } from 'react';

import { SettingsNav } from '@/components/features/settings/settings-nav';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-6 md:grid-cols-[12rem_1fr] md:gap-10">
      <SettingsNav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
