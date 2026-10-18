import type { H3Event } from 'h3'
import * as z from 'zod'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '#shared/types/database.types'
import type { ActivityType } from '#shared/utils/routes'

// Shared by the PUT / DELETE handlers of /api/routes/:id/activity/:type.
export async function activityContext(event: H3Event) {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')

  const routeId = getRouteIdParam(event)
  const parsedType = z.enum(ACTIVITY_TYPES).safeParse(getRouterParam(event, 'type'))
  if (!parsedType.success) throw apiError(event, 404, 'api.unknownAction')

  return {
    supabase: await serverSupabaseClient(event),
    userId: user.sub,
    routeId,
    type: parsedType.data as ActivityType,
  }
}

type Supabase = Awaited<ReturnType<typeof serverSupabaseClient<Database>>>

// Doing a route takes it off the "À faire" list (stored as the activity "saved"). A failure only leaves it there.
export async function removeFromTodo(supabase: Supabase, userId: string, routeId: string, caller: string) {
  const { error } = await supabase
    .from('route_activity')
    .delete()
    .match({ user_id: userId, route_id: routeId, activity_type: 'saved' })
  if (error) console.error(`[${caller}] to-do`, error)
}
