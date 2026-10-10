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

// What profiles.username accepts (its check constraint). Usernames are also sign-in names, whatever their case.
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/

// The sign-in page takes a username or an e-mail in one field: only an e-mail can contain an @.
export const isEmailLogin = (identifier: string) => identifier.includes('@')

// POST /api/auth/login. Any username is looked up, even one the pattern rejects: the answer stays "unknown
// username or wrong password", whatever was typed.
export const usernameLoginSchema = z.object({
  username: z.string().trim().min(1, 'auth.identifierRequired').max(100, 'validation.maxChars'),
  password: z.string().min(1, 'auth.passwordRequired').max(200, 'validation.maxChars'),
})

export type UsernameLogin = z.infer<typeof usernameLoginSchema>
