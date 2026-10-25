'use client';

import dynamic from 'next/dynamic';

/**
 * The account menu (Radix dropdown) in its own chunk: guests never download it. Server
 * rendered as usual for signed-in users (SPEC §8.2).
 */
export const UserMenu = dynamic(() => import('./user-menu').then((module) => module.UserMenu));
