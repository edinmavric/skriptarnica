import { serve } from 'inngest/next';

import { inngest } from '@/server/jobs/client';
import { functions } from '@/server/jobs/functions';

// PDF processing needs the Node runtime and time.
export const runtime = 'nodejs';
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({ client: inngest, functions });
