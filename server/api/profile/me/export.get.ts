import type { LineString } from 'geojson'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { AccountExport } from '#shared/types/account'
import type { Poi } from '#shared/utils/routes'

// Everything the caller put on sport-map, for the "download my data" archive (RGPD). Read with the
// caller's session: RLS already lets them read all their own rows.
export default defineEventHandler(async (event): Promise<AccountExport> => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })
  const supabase = await serverSupabaseClient(event)

  const [profile, routes, reviews, activity, collections, reports] = await Promise.all([
    supabase.from('profiles').select('username, display_name, bio, created_at').eq('id', user.sub).single(),
    supabase
      .from('routes')
      .select('id, name, description, sport_type, is_public, source, distance_m, elevation_gain_m, elevation_loss_m, elevation_profile, pois, created_at, updated_at, geometry:route_geojson')
      .eq('owner_id', user.sub)
      .order('created_at'),
    supabase
      .from('route_reviews')
      .select('route_id, rating, comment, created_at, updated_at, hidden_at, hidden_reason, route:routes(name)')
      .eq('user_id', user.sub)
      .order('created_at'),
    supabase
      .from('route_activity')
      .select('route_id, activity_type, completed_at, started_at, duration_s, moving_s, created_at, route:routes(name)')
      .eq('user_id', user.sub)
      .order('created_at'),
    supabase
      .from('collections')
      .select('id, name, description, is_public, created_at, updated_at, routes:collection_routes(route_id, added_at)')
      .eq('owner_id', user.sub)
      .order('created_at'),
    supabase.from('review_reports').select('review_id, created_at').eq('reporter_id', user.sub).order('created_at'),
  ])
  const failed = [profile, routes, reviews, activity, collections, reports].find(result => result.error)
  if (failed || !profile.data || !routes.data) {
    console.error('[GET /api/profile/me/export]', failed?.error)
    throw createError({ statusCode: 500, statusMessage: "Impossible de préparer l'export" })
  }

  const photos = routes.data.length
    ? await supabase
        .from('route_photos')
        .select('route_id, storage_path, created_at')
        .in('route_id', routes.data.map(route => route.id))
        .order('created_at')
    : { data: [], error: null }
  if (photos.error) {
    console.error('[GET /api/profile/me/export] photos', photos.error)
    throw createError({ statusCode: 500, statusMessage: "Impossible de préparer l'export" })
  }

  const archive = accountArchive({
    exportedAt: new Date().toISOString(),
    profile: { ...profile.data, email: user.email ?? null },
    routes: routes.data.map(route => ({
      ...route,
      elevation_profile: route.elevation_profile as number[] | null,
      pois: route.pois as Poi[],
      geometry: route.geometry as unknown as LineString,
    })),
    photos: photos.data,
    reviews: reviews.data!,
    activity: activity.data!,
    collections: collections.data!,
    reports: reports.data!,
  })

  // Signed with the caller's session: storage policies let owners read their route photos.
  const signed = await signPhotos(supabase, archive.photos.map(photo => ({ id: photo.path, storage_path: photo.storage_path })))
  if (signed.length !== archive.photos.length) {
    throw createError({ statusCode: 500, statusMessage: "Impossible de préparer l'export des photos" })
  }
  return {
    username: profile.data.username,
    files: archive.files,
    photos: signed.map(photo => ({ path: photo.id, url: photo.url })),
  }
})
