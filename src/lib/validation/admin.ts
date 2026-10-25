import { z } from 'zod';

const name = z
  .string()
  .trim()
  .min(2, { error: 'validation.nameTooShort' })
  .max(200, { error: 'validation.nameTooLong' });
const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: 'validation.slugInvalid' })
  .max(80)
  .optional()
  .or(z.literal('').transform(() => undefined));
const domains = z
  .string()
  .trim()
  .transform((value) =>
    value
      .split(/[\s,]+/)
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(
    z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, { error: 'validation.domainInvalid' })),
  );

export const catalogEntityTypes = [
  'university',
  'faculty',
  'program',
  'course',
  'professor',
] as const;
export type CatalogEntityType = (typeof catalogEntityTypes)[number];

export const universityFormSchema = z.object({
  name,
  shortName: z.string().trim().min(2).max(20),
  city: z.string().trim().min(2).max(60),
  slug,
  emailDomains: domains,
});
export const facultyFormSchema = universityFormSchema.extend({
  universityId: z.uuid({ error: 'validation.required' }),
});
export const programFormSchema = z.object({
  facultyId: z.uuid({ error: 'validation.required' }),
  name,
  level: z.enum(['oas', 'mas', 'das', 'oss']),
  durationYears: z.coerce.number().int().min(1).max(6),
  slug,
});
export const courseFormSchema = z.object({
  facultyId: z.uuid({ error: 'validation.required' }),
  name,
  code: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((value) => value || null),
  ects: z.coerce
    .number()
    .int()
    .min(0)
    .max(60)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  slug,
});
export const professorFormSchema = z.object({
  facultyId: z.uuid({ error: 'validation.required' }),
  name,
  title: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((value) => value || null),
  slug,
});

export const catalogFormSchemas = {
  university: universityFormSchema,
  faculty: facultyFormSchema,
  program: programFormSchema,
  course: courseFormSchema,
  professor: professorFormSchema,
} as const;

export const banSchema = z.object({
  userId: z.uuid(),
  reason: z.string().trim().min(5, { error: 'validation.reasonTooShort' }).max(500),
});

export const adjustmentSchema = z.object({
  sellerId: z.uuid(),
  /** Signed amount in para: positive credits the seller, negative debits. */
  amountPara: z.coerce
    .number()
    .int()
    .refine((value) => value !== 0, { error: 'validation.amountNonZero' })
    .refine((value) => Math.abs(value) <= 10_000_000, { error: 'validation.amountTooLarge' }),
  reason: z.string().trim().min(10, { error: 'validation.reasonTooShort' }).max(500),
  /** Second confirmation: the admin retypes the amount (SPEC §4.10 "double confirmation"). */
  confirmAmountPara: z.coerce.number().int(),
});

export const reportResolutionSchema = z.object({
  reportId: z.uuid(),
  resolution: z.enum(['resolved', 'dismissed']),
  /** What to do with the reported content when resolving. */
  action: z.enum(['none', 'remove_content', 'ban_user']).default('none'),
  note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => value || null),
});

export const copyrightDecisionSchema = z.object({
  claimId: z.uuid(),
  decision: z.enum(['accepted', 'rejected']),
  note: z.string().trim().min(5, { error: 'validation.reasonTooShort' }).max(2000),
});
