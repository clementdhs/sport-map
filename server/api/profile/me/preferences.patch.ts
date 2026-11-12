import { serverSupabaseClient } from '#supabase/server'
import type { Json } from '#shared/types/database.types'

// Saves the preferences changed on a device (#145), key by key: the others stay as another device left them.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  const changes = await readLocalizedBody(event, preferencesPatchSchema)
  if (Object.keys(changes).length) {
    const supabase = await serverSupabaseClient(event)
    const { error } = await supabase.rpc('update_my_preferences', { changes: changes as Json })
    if (error) {
      // The whole object over the table's size limit (user_preferences_size), only reached on purpose.
      if (error.code === '23514') throw apiError(event, 400, 'api.invalidRequest')
      console.error('[PATCH /api/profile/me/preferences]', error)
      throw apiError(event, 500, 'api.savePreferencesFailed')
    }
  }
  setResponseStatus(event, 204)
  return null
})
