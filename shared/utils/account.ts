import * as z from 'zod'

// Deleting an account asks for its username, typed again.
export const accountDeletionSchema = z.object({
  username: z.string().trim().min(1, "Saisis ton nom d'utilisateur"),
})

export type AccountDeletion = z.infer<typeof accountDeletionSchema>
