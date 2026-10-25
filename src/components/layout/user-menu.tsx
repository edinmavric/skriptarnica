'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Avatar } from '@/components/ui/avatar';
import {
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import {
  BookmarkIcon,
  ChartIcon,
  LibraryIcon,
  LogoutIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
} from '@/components/ui/icons';
import { routes } from '@/config/routes';

import type { LayoutUser } from './types';

export function UserMenu({
  user,
  signOutAction,
}: {
  user: LayoutUser;
  signOutAction: () => Promise<void>;
}) {
  const t = useTranslations('layout.userMenu');
  return (
    <DropdownRoot>
      <DropdownTrigger
        className="grid size-11 place-items-center rounded-full hover:bg-paper-sunk"
        aria-label={t('open', { name: user.name })}
      >
        <Avatar name={user.name} src={user.image} size="sm" />
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>{user.name}</DropdownLabel>
        {user.username ? (
          <DropdownItem asChild>
            <Link href={routes.user(user.username)}>
              <UserIcon /> {t('profile')}
            </Link>
          </DropdownItem>
        ) : null}
        <DropdownItem asChild>
          <Link href={routes.library}>
            <LibraryIcon /> {t('library')}
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href={routes.saved}>
            <BookmarkIcon /> {t('saved')}
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href={user.isSeller ? routes.sell : routes.becomeSeller}>
            <ChartIcon /> {user.isSeller ? t('sellerDashboard') : t('becomeSeller')}
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href={routes.settings}>
            <SettingsIcon /> {t('settings')}
          </Link>
        </DropdownItem>
        {user.isAdmin ? (
          <DropdownItem asChild>
            <Link href={routes.admin}>
              <ShieldIcon /> {t('admin')}
            </Link>
          </DropdownItem>
        ) : null}
        <DropdownSeparator />
        <DropdownItem onSelect={() => void signOutAction()}>
          <LogoutIcon /> {t('signOut')}
        </DropdownItem>
      </DropdownContent>
    </DropdownRoot>
  );
}
