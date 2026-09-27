import type { H3Event } from 'h3'
import * as z from 'zod'

// An invalid uuid would otherwise surface as a Postgres error: report it as a missing route.
export function getRouteIdParam(event: H3Event): string {
  const id = getRouterParam(event, 'id')
  if (!z.uuid().safeParse(id).success) {
    throw createError({ statusCode: 404, statusMessage: 'Parcours introuvable' })
  }
  return id!
}
