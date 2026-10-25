import { z } from 'zod';

export const reportSchema = z.object({
  targetType: z.enum(['note', 'review', 'post', 'comment', 'user', 'community']),
  targetId: z.uuid(),
  reason: z.enum(['spam', 'abuse', 'plagiarism', 'exam_material', 'personal_data', 'other']),
  text: z.string().trim().max(1000).optional(),
});
export type ReportInput = z.input<typeof reportSchema>;
