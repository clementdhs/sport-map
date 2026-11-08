import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const id = getRouteIdParam(event)
  const body = await readLocalizedBody(event, routeCreateSchema)
  const supabase = await serverSupabaseClient(event)

  // RLS only lets owners update: nothing updated means the route is missing or not the caller's.
  const { data: owned, error: ownerError } = await supabase.from('routes').select('id').eq('id', id).eq('owner_id', user.sub).maybeSingle()
  if (ownerError) {
    console.error('[PUT /api/routes/:id]', ownerError)
    throw apiError(event, 500, 'api.saveChangesFailed')
  }
  if (!owned) throw apiError(event, 404, 'api.routeNotFound')

  try {
    const { route, original } = maskedRouteColumns(trackFromPayload(body), await loadMaskCircles(supabase, user.sub))
    // Full data first: should the routes update fail, the owner keeps it all and the team the previous cut.
    if (original) await saveRouteOriginal(supabase, id, original)
    const { data, error } = await supabase
      .from('routes')
      .update({ ...routeDetailsFromPayload(body), ...route })
      .eq('id', id)
      .select('id')
    if (error) throw error
    if (!data.length) throw apiError(event, 404, 'api.routeNotFound')
    if (!original) await saveRouteOriginal(supabase, id, null)
  }
  catch (error) {
    if (isError(error)) throw error
    console.error('[PUT /api/routes/:id]', error)
    throw apiError(event, 500, 'api.saveChangesFailed')
  }
  return { id }
})
