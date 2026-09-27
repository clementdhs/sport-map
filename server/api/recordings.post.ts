import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

// Saves an outing recorded with the phone's GPS: its track as a new route of the caller, marked as
// completed with the outing's times.
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })

  const body = await readValidatedBody(event, payload => recordingSchema.parse(payload))
  const supabase = await serverSupabaseClient(event)

  const { data: route, error } = await supabase
    .from('routes')
    .insert({ owner_id: user.sub, ...routeRowFromPayload({ ...body.route, source: 'recorded' }) })
    .select('id')
    .single()
  if (error) {
    console.error('[POST /api/recordings] route', error)
    throw createError({ statusCode: 500, statusMessage: "Impossible d'enregistrer la sortie" })
  }

  const startedAt = new Date(body.started_at)
  const activity = await supabase.from('route_activity').insert({
    user_id: user.sub,
    route_id: route.id,
    activity_type: 'completed',
    started_at: startedAt.toISOString(),
    completed_at: new Date(startedAt.getTime() + body.duration_s * 1000).toISOString(),
    duration_s: body.duration_s,
    moving_s: body.moving_s,
  })
  if (activity.error) {
    // No half-saved outing: the route goes too.
    console.error('[POST /api/recordings] activity', activity.error)
    await supabase.from('routes').delete().eq('id', route.id)
    throw createError({ statusCode: 500, statusMessage: "Impossible d'enregistrer la sortie" })
  }

  setResponseStatus(event, 201)
  return { id: route.id }
})
