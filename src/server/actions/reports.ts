'use server';

import { reportSchema } from '@/lib/validation/reports';

import { createReport } from '../services/reports';

import { createAction } from './safe-action';

export const reportAction = createAction(
  { schema: reportSchema, auth: 'user', rateLimit: { name: 'report', by: 'user' } },
  async (input, { user }) => createReport(user.id, input),
);
