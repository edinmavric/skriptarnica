import { z } from 'zod';

import { examPeriodKeys } from '@/config/exam-periods';

export const MIN_HOW_I_STUDIED = 200;

export const noteCourseSchema = z.object({
  noteId: z.uuid().optional(),
  courseId: z.uuid({ error: 'validation.courseRequired' }),
  professorId: z.uuid().nullable().optional(),
});
export type NoteCourseInput = z.input<typeof noteCourseSchema>;

export const uploadRequestSchema = z.object({
  noteId: z.uuid(),
  fileName: z.string().trim().min(1).max(200),
  size: z.number().int().positive(),
  contentType: z.literal('application/pdf', { error: 'validation.notPdf' }),
});

export const uploadConfirmSchema = z.object({
  uploadId: z.uuid(),
  changelog: z.string().trim().max(1000).optional(),
});

export const noteDescriptionSchema = z.object({
  noteId: z.uuid(),
  title: z
    .string()
    .trim()
    .min(5, { error: 'validation.titleTooShort' })
    .max(120, { error: 'validation.titleTooLong' }),
  shortDescription: z
    .string()
    .trim()
    .min(20, { error: 'validation.shortDescriptionTooShort' })
    .max(300, { error: 'validation.shortDescriptionTooLong' }),
  howIStudied: z
    .string()
    .trim()
    .min(MIN_HOW_I_STUDIED, { error: 'validation.howIStudiedTooShort' })
    .max(20_000, { error: 'validation.howIStudiedTooLong' }),
  grade: z.number().int().min(5).max(10).nullable(),
  academicYear: z
    .string()
    .trim()
    .regex(/^\d{4}\/\d{2}$/, { error: 'validation.academicYearInvalid' })
    .nullable(),
  examPeriod: z.enum(examPeriodKeys).nullable(),
  language: z.enum(['sr_latn', 'sr_cyrl', 'en', 'other']),
  tags: z.array(z.string().trim().min(2).max(30)).max(8),
});
export type NoteDescriptionInput = z.input<typeof noteDescriptionSchema>;

export const notePriceSchema = z.object({
  noteId: z.uuid(),
  priceRsd: z
    .number({ error: 'validation.priceInvalid' })
    .int({ error: 'validation.priceWhole' })
    .min(0, { error: 'validation.priceInvalid' }),
});
export type NotePriceInput = z.input<typeof notePriceSchema>;

export const noteDeclarationSchema = z.object({
  noteId: z.uuid(),
  declaration: z.literal(true, { error: 'validation.declarationRequired' }),
});

export const noteIdSchema = z.object({ noteId: z.uuid() });

export const courseNotesQuerySchema = z.object({
  profesor: z.string().optional(),
  cena: z.enum(['besplatne', 'do500', 'do1000', 'sve']).optional(),
  ocena: z.enum(['4', '4.5']).optional(),
  godina: z
    .string()
    .regex(/^\d{4}\/\d{2}$/)
    .optional(),
  sort: z
    .enum(['preporuceno', 'ocena', 'prodaja', 'najnovije', 'cena-rastuce', 'cena-opadajuce'])
    .optional(),
  strana: z.coerce.number().int().min(1).max(500).optional(),
});
export type CourseNotesQuery = z.infer<typeof courseNotesQuerySchema>;
