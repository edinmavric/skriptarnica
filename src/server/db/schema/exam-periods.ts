import { date, index, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { examPeriodKeys } from '@/config/exam-periods';

import { id, timestamps } from './_common';
import { users } from './auth';
import { courses } from './catalog';

export const examPeriodKey = pgEnum('exam_period_key', examPeriodKeys);

/** Exam periods per course and academic year (SPEC §3.5); dates in Europe/Belgrade. */
export const examPeriods = pgTable(
  'exam_periods',
  {
    id: id(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    /** "2025/26" */
    academicYear: text().notNull(),
    period: examPeriodKey().notNull(),
    startsOn: date({ mode: 'string' }).notNull(),
    endsOn: date({ mode: 'string' }),
    createdById: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('exam_periods_course_year_period_uq').on(t.courseId, t.academicYear, t.period),
    index('exam_periods_starts_idx').on(t.startsOn),
  ],
);
