import { jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { timestamps } from './_common';
import { users } from './auth';

/** Admin-editable platform settings (SPEC §14); defaults live in config/constants.ts. */
export const appSettings = pgTable('app_settings', {
  key: text().primaryKey(),
  value: jsonb().$type<unknown>().notNull(),
  updatedById: uuid().references(() => users.id, { onDelete: 'set null' }),
  ...timestamps(),
});
