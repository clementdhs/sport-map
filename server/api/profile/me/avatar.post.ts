import { randomUUID } from 'node:crypto'
import { serverSupabaseClient } from '#supabase/server'
import type { AvatarSaved } from '#shared/types/routes'

// Sets the caller's profile photo (multipart field "photo"), replacing the previous one. The browser has already
// cropped and compressed it; the server checks what it really is. Each photo gets a new file name, so no cache
// keeps showing the previous one.
export default defineEventHandler(async (event): Promise<AvatarSaved> => {
  const user = await requireUser(event)

  const file = (await readMultipartFormData(event))?.find(part => part.name === 'photo')
  if (!file?.data.length) throw apiError(event, 400, 'api.photoMissing')
  if (file.data.length > MAX_AVATAR_BYTES) throw apiError(event, 413, 'api.avatarTooLarge')
  const type = detectPhotoType(file.data)
  if (!type) throw apiError(event, 415, 'api.photoFormat')

  const supabase = await serverSupabaseClient(event)
  const { data: profile } = await supabase.from('profiles').select('avatar_path').eq('id', user.sub).single()

  const path = `${user.sub}/${randomUUID()}.${type === 'image/webp' ? 'webp' : 'jpg'}`
  const bucket = supabase.storage.from(AVATARS_BUCKET)
  // Never changed once written.
  const upload = await bucket.upload(path, file.data, { contentType: type, cacheControl: '31536000' })
  if (upload.error) {
    console.error('[POST /api/profile/me/avatar] upload', upload.error)
    throw apiError(event, 500, 'api.saveAvatarFailed')
  }

  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', user.sub)
  if (error) {
    console.error('[POST /api/profile/me/avatar] update', error)
    await bucket.remove([path])
    throw apiError(event, 500, 'api.saveAvatarFailed')
  }

  // Only the photo replaced: removing the whole folder could take the file of a change sent at the same time.
  if (profile?.avatar_path) {
    const { error: removeError } = await bucket.remove([profile.avatar_path])
    if (removeError) console.error('[POST /api/profile/me/avatar] could not remove the previous photo', removeError)
  }
  setResponseStatus(event, 201)
  return { avatar_path: path }
})
