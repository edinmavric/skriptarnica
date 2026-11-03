import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { LogoutIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { signOutAction } from '@/server/auth/actions';

/**
 * Sign-out as a plain form, so it works before hydration. On phones the header's account menu is
 * hidden, so the profile page and settings carry this button.
 */
export async function SignOutButton({ className }: { className?: string }) {
  const t = await getTranslations('layout.userMenu');
  return (
    <form action={signOutAction} className={cn(className)}>
      <Button type="submit" variant="secondary">
        <LogoutIcon /> {t('signOut')}
      </Button>
    </form>
  );
}
