import * as z from 'zod'

// Supabase only enforces 6 characters: the app asks for more, at sign-up and when changing a password.
export const MIN_PASSWORD_LENGTH = 8

export const newPasswordSchema = z.object({
  password: z.string().min(MIN_PASSWORD_LENGTH, `${MIN_PASSWORD_LENGTH} caractères minimum`),
  confirm: z.string(),
}).refine(({ password, confirm }) => password === confirm, {
  message: 'Les deux mots de passe sont différents',
  path: ['confirm'],
})

export type NewPassword = z.infer<typeof newPasswordSchema>
