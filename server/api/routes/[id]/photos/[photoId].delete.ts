import * as z from 'zod'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })

  const id = getRouteIdParam(event)
  const photoId = getRouterParam(event, 'photoId')
  if (!z.uuid().safeParse(photoId).success) throw createError({ statusCode: 404, statusMessage: 'Photo introuvable' })

  const supabase = await serverSupabaseClient(event)
  // RLS only lets the route's owner delete: nothing deleted means the photo is missing or not the caller's.
  const { data, error } = await supabase
    .from('route_photos')
    .delete()
    .eq('id', photoId!)
    .eq('route_id', id)
    .select('storage_path')

  if (error) {
    console.error('[DELETE /api/routes/:id/photos/:photoId]', error)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de supprimer la photo' })
  }
  if (!data.length) throw createError({ statusCode: 404, statusMessage: 'Photo introuvable' })

  const removal = await supabase.storage.from(PHOTOS_BUCKET).remove(data.map(row => row.storage_path))
  if (removal.error) console.error('[DELETE /api/routes/:id/photos/:photoId] file left behind', removal.error)
  setResponseStatus(event, 204)
  return null
})
