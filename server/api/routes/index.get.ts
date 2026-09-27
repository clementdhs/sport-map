import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase
    .from('routes')
    .select('id, name, description, sport_type, distance_m, elevation_gain_m, cover_image_url, created_at')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[GET /api/routes]', error)
    throw createError({ statusCode: 500, statusMessage: 'Impossible de charger les parcours' })
  }
  return data
})
