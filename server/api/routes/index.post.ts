import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })

  const body = await readValidatedBody(event, payload => routeCreateSchema.parse(payload))
  const supabase = await serverSupabaseClient(event)
  const elevation = body.elevations ? elevationStats(body.coordinates, body.elevations) : null

  const { data, error } = await supabase
    .from('routes')
    .insert({
      owner_id: user.sub,
      name: body.name,
      description: body.description || null,
      sport_type: body.sport_type,
      is_public: body.is_public,
      geom: toLineStringEwkt(body.coordinates),
      elevation_profile: body.elevations ?? null,
      elevation_gain_m: elevation?.gain ?? null,
      elevation_loss_m: elevation?.loss ?? null,
      source: body.source,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[POST /api/routes]', error)
    throw createError({ statusCode: 500, statusMessage: "Impossible d'enregistrer le parcours" })
  }
  setResponseStatus(event, 201)
  return data
})
