import type { serverSupabaseClient } from '#supabase/server'
import type { Database } from '#shared/types/database.types'
import type { RoutePhoto } from '#shared/types/routes'
import type { PhotoType } from '#shared/utils/routes'

type Supabase = Awaited<ReturnType<typeof serverSupabaseClient<Database>>>

export const PHOTOS_BUCKET = 'route-photos'

// Signed URLs are needed because the bucket is private (photos of private routes must stay private).
const SIGNED_URL_TTL_S = 3600

// The file type from its first bytes, rather than trusting the declared content type.
export function detectPhotoType(bytes: Uint8Array): PhotoType | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg'
  return null
}

// URLs of the given photos, for the current user: storage policies only sign files of routes they can read.
// The account export also signs the profile photo with it (AVATARS_BUCKET).
export async function signPhotos(supabase: Supabase, rows: { id: string, storage_path: string }[], bucket = PHOTOS_BUCKET): Promise<RoutePhoto[]> {
  if (!rows.length) return []
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(rows.map(row => row.storage_path), SIGNED_URL_TTL_S)
  if (error) {
    console.error('[photos] signing failed', error)
    return []
  }
  return rows.flatMap((row, i) => (data[i]?.signedUrl ? [{ id: row.id, url: data[i].signedUrl }] : []))
}

// Before deleting an account (with the secret key: its session is about to go). Storage files aren't tied
// to users, so each of their routes' folders is emptied, including files an interrupted upload may have
// left without a row. Any failure stops the deletion rather than leave files behind.
export async function removeUserPhotoFiles(admin: Supabase, userId: string) {
  const { data: routes, error } = await admin.from('routes').select('id').eq('owner_id', userId)
  if (error) throw error
  for (const { id } of routes) await emptyStorageFolder(admin, PHOTOS_BUCKET, id)
}

// Removes every file of a folder (route photos, a member's profile photos). Throws on failure.
export async function emptyStorageFolder(supabase: Supabase, bucketId: string, folder: string) {
  const bucket = supabase.storage.from(bucketId)
  const { data: files, error } = await bucket.list(folder, { limit: 1000 })
  if (error) throw error
  if (!files.length) return
  const { error: removeError } = await bucket.remove(files.map(file => `${folder}/${file.name}`))
  if (removeError) throw removeError
}

// Deleting a route deletes its photo rows (cascade) but not the files: they are removed first, while the
// storage policies can still check that the caller owns the route.
export async function removeRoutePhotoFiles(supabase: Supabase, routeId: string) {
  const { data } = await supabase.from('route_photos').select('storage_path').eq('route_id', routeId)
  if (!data?.length) return
  const { error } = await supabase.storage.from(PHOTOS_BUCKET).remove(data.map(row => row.storage_path))
  if (error) console.error('[photos] could not remove the files of route', routeId, error)
}
