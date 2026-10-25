import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

/** Time-ordered UUID v7 primary key (SPEC §3: uuid v7 or cuid2). */
export const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const timestamps = () => ({ createdAt: createdAt(), updatedAt: updatedAt() });

/** Case-insensitive text (Postgres citext extension). */
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

/** Full-text search vector. */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export { uuidv7 };
