import { z } from 'zod';

/**
 * Shared client/server schemas. Messages are i18n keys under `validation.*`, translated in
 * the form (SPEC §0.5).
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, { error: 'validation.emailRequired' })
  .pipe(z.email({ error: 'validation.emailInvalid' }));

export const passwordSchema = z
  .string()
  .min(10, { error: 'validation.passwordTooShort' })
  .max(128, { error: 'validation.passwordTooLong' });

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,30}$/, { error: 'validation.usernameInvalid' });

export const signUpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'validation.nameTooShort' })
    .max(60, { error: 'validation.nameTooLong' }),
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { error: 'validation.acceptTermsRequired' }),
  confirmAge: z.literal(true, { error: 'validation.ageRequired' }),
  marketingEmails: z.boolean().default(false),
  turnstileToken: z.string().min(1, { error: 'validation.captchaRequired' }),
});
export type SignUpInput = z.input<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'validation.passwordRequired' }),
  next: z.string().optional(),
});
export type SignInInput = z.input<typeof signInSchema>;

export const magicLinkSchema = z.object({
  email: emailSchema,
  turnstileToken: z.string().min(1, { error: 'validation.captchaRequired' }),
  next: z.string().optional(),
});
export type MagicLinkInput = z.input<typeof magicLinkSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({ token: z.string().min(1), password: passwordSchema, confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, {
    error: 'validation.passwordsDontMatch',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

export const twoFactorSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^(\d{6}|[A-Za-z0-9-]{8,12})$/, { error: 'validation.codeInvalid' }),
  trustDevice: z.boolean().default(false),
  next: z.string().optional(),
});
export type TwoFactorInput = z.input<typeof twoFactorSchema>;

export const acceptTermsSchema = z.object({
  acceptTerms: z.literal(true, { error: 'validation.acceptTermsRequired' }),
  confirmAge: z.literal(true, { error: 'validation.ageRequired' }),
  next: z.string().optional(),
});
export type AcceptTermsInput = z.input<typeof acceptTermsSchema>;

/** Only same-site relative paths are allowed as post-login redirects (open redirect guard). */
export function safeNextPath(next: string | undefined | null, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\'))
    return fallback;
  return next;
}
