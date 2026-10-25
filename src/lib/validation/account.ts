import { z } from 'zod';

import { notificationTypes } from '@/config/notifications';

export const accountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'validation.nameTooShort' })
    .max(80, { error: 'validation.nameTooLong' }),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.]{3,30}$/, { error: 'validation.usernameInvalid' }),
  bio: z.string().trim().max(300, { error: 'validation.bioTooLong' }),
});
export type AccountInput = z.input<typeof accountSchema>;

export const privacySchema = z.object({
  showFaculty: z.boolean(),
  showProgram: z.boolean(),
  showActivity: z.boolean(),
});

export const notificationPreferenceSchema = z.object({
  type: z.enum(notificationTypes),
  channel: z.enum(['in_app_email', 'in_app', 'none']),
});

export const digestSchema = z.object({ digest: z.enum(['daily', 'weekly', 'none']) });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, { error: 'validation.passwordRequired' }),
  newPassword: z.string().min(10, { error: 'validation.passwordTooShort' }).max(128),
});
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

export const deletionSchema = z.object({
  password: z.string().optional(),
  deleteContent: z.boolean(),
  waiveBalance: z.boolean(),
});
