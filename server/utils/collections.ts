import type { H3Event } from 'h3'
import * as z from 'zod'

// Shared by the /api/collections handlers.

export async function requireUserId(event: H3Event): Promise<string> {
  const user = await requireUser(event)
  return user.sub
}

// An invalid uuid would otherwise surface as a Postgres error: report it as missing (`missing`: a message key).
export function getUuidParam(event: H3Event, name: string, missing: string): string {
  const id = getRouterParam(event, name)
  if (!z.uuid().safeParse(id).success) throw apiError(event, 404, missing)
  return id!
}

export const getCollectionIdParam = (event: H3Event) => getUuidParam(event, 'id', 'api.collectionNotFound')
