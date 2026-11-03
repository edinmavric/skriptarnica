import { z } from 'zod';

import { emailSchema, usernameSchema } from './auth';

export const usernameStepSchema = z.object({ username: usernameSchema });

export const programStepSchema = z.object({
  universityId: z.uuid({ error: 'validation.universityRequired' }),
  facultyId: z.uuid({ error: 'validation.facultyRequired' }),
  programId: z.uuid({ error: 'validation.programRequired' }),
  year: z.coerce
    .number()
    .int()
    .min(1, { error: 'validation.yearRequired' })
    .max(6, { error: 'validation.yearRequired' }),
});
export type ProgramStepInput = z.input<typeof programStepSchema>;

export const coursesStepSchema = z.object({
  enrolled: z.array(z.uuid()).max(60),
  passed: z
    .array(z.object({ courseId: z.uuid(), grade: z.number().int().min(6).max(10).nullable() }))
    .max(120),
});
export type CoursesStepInput = z.input<typeof coursesStepSchema>;

export const studentEmailSchema = z.object({ email: emailSchema });
export type StudentEmailInput = z.input<typeof studentEmailSchema>;

export const catalogRequestSchema = z.object({
  type: z.enum(['university', 'faculty', 'program', 'course', 'professor']),
  name: z.string().trim().min(2, { error: 'validation.nameTooShort' }).max(160),
  note: z.string().trim().max(500).optional(),
  universityId: z.uuid().optional(),
  facultyId: z.uuid().optional(),
  programId: z.uuid().optional(),
  city: z.string().trim().max(80).optional(),
});
export type CatalogRequestInput = z.input<typeof catalogRequestSchema>;

/** A student proposes a course for their own program (year + winter/summer term). */
export const courseProposalSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'validation.nameTooShort' })
    .max(160, { error: 'validation.courseNameTooLong' }),
  code: z.string().trim().max(30).optional(),
  year: z.coerce.number().int().min(1).max(6),
  term: z.enum(['winter', 'summer']),
  note: z.string().trim().max(500).optional(),
});
export type CourseProposalInput = z.output<typeof courseProposalSchema>;
export type CourseProposalFormInput = z.input<typeof courseProposalSchema>;
