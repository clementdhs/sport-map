import * as z from 'zod'

// Validation messages are translation keys (i18n/locales), translated where they are shown.

// Supabase only enforces 6 characters: the app asks for more, at sign-up and when changing a password.
export const MIN_PASSWORD_LENGTH = 8

export const newPasswordSchema = z.object({
  password: z.string().min(MIN_PASSWORD_LENGTH, 'validation.minChars'),
  confirm: z.string(),
}).refine(({ password, confirm }) => password === confirm, {
  message: 'validation.passwordsDiffer',
  path: ['confirm'],
})

export type NewPassword = z.infer<typeof newPasswordSchema>
