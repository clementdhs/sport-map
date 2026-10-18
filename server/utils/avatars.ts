import type { serverSupabaseClient } from '#supabase/server'
import type { Database } from '#shared/types/database.types'

type Supabase = Awaited<ReturnType<typeof serverSupabaseClient<Database>>>

// Every file of a member's folder in the "avatars" bucket: the current photo, and any an interrupted change left
// behind. Run with the member's session (storage policies only let them remove their own folder) or the secret
// key before deleting their account. Throws on failure.
export function removeAvatarFiles(supabase: Supabase, userId: string) {
  return emptyStorageFolder(supabase, AVATARS_BUCKET, userId)
}
