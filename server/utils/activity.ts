import type { H3Event } from 'h3'
import * as z from 'zod'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
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
