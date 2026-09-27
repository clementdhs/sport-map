import type { LineString } from 'geojson'
import * as z from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { RouteDetail } from '#shared/types/routes'

export default defineEventHandler(async (event): Promise<RouteDetail> => {
  const id = getRouterParam(event, 'id')
  // An invalid uuid would otherwise surface as a Postgres error.
  if (!z.uuid().safeParse(id).success) {
    throw createError({ statusCode: 404, statusMessage: 'Parcours introuvable' })
  }

  const supabase = await serverSupabaseClient(event)
  const { data, error } = await supabase
    .from('routes')
    .select(`
      id, name, description, sport_type, distance_m, elevation_gain_m, elevation_loss_m,
      is_public, source, created_at, owner_id,
      geometry:route_geojson,
      owner:profiles(username, display_name)
    `)
    .eq('id', id!)
    .maybeSingle()

  if (error) {
    console.error('[GET /api/routes/:id]', error)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de charger le parcours' })
  }
  // RLS hides private routes of other users: they are reported as missing too.
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Parcours introuvable' })
  return { ...data, geometry: data.geometry as unknown as LineString }
})
