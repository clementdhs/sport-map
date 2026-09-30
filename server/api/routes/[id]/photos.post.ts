import { randomUUID } from 'node:crypto'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { RoutePhoto } from '#shared/types/routes'

// Adds one photo (multipart field "photo") to a route of the caller. The browser has already resized and
// compressed it; the server checks what it really is.
export default defineEventHandler(async (event): Promise<RoutePhoto> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const id = getRouteIdParam(event)
  const supabase = await serverSupabaseClient(event)

  const { data: route } = await supabase.from('routes').select('owner_id').eq('id', id).maybeSingle()
  if (!route) throw apiError(event, 404, 'api.routeNotFound')
  if (route.owner_id !== user.sub) {
    throw apiError(event, 403, 'api.ownerOnlyPhotos')
  }

  const file = (await readMultipartFormData(event))?.find(part => part.name === 'photo')
  if (!file?.data.length) throw apiError(event, 400, 'api.photoMissing')
  if (file.data.length > MAX_PHOTO_BYTES) {
    throw apiError(event, 413, 'api.photoTooLarge')
  }
  const type = detectPhotoType(file.data)
  if (!type) throw apiError(event, 415, 'api.photoFormat')

  const { count } = await supabase.from('route_photos').select('id', { count: 'exact', head: true }).eq('route_id', id)
  if ((count ?? 0) >= MAX_ROUTE_PHOTOS) {
    throw apiError(event, 400, 'api.maxPhotos', { max: MAX_ROUTE_PHOTOS })
  }

  const path = `${id}/${randomUUID()}.${type === 'image/webp' ? 'webp' : 'jpg'}`
  const upload = await supabase.storage.from(PHOTOS_BUCKET).upload(path, file.data, { contentType: type })
  if (upload.error) {
    console.error('[POST /api/routes/:id/photos] upload', upload.error)
    throw apiError(event, 500, 'api.savePhotoFailed')
  }

  const { data: row, error } = await supabase
    .from('route_photos')
    .insert({ route_id: id, storage_path: path })
    .select('id, storage_path')
    .single()
  if (error) {
    console.error('[POST /api/routes/:id/photos] insert', error)
    await supabase.storage.from(PHOTOS_BUCKET).remove([path])
    throw apiError(event, 500, 'api.savePhotoFailed')
  }

  const [photo] = await signPhotos(supabase, [row])
  if (!photo) throw apiError(event, 500, 'api.photoUnreadable')
  setResponseStatus(event, 201)
  return photo
})
