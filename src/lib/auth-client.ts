'use client';

import { createAuthClient } from 'better-auth/react';

/** Browser auth client: used only for the Google OAuth redirect; everything else is Server Actions. */
export const authClient = createAuthClient();
