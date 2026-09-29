import type { H3Event } from 'h3'
import * as z from 'zod'
import { serverSupabaseUser } from '#supabase/server'

// Shared by the /api/collections handlers.

export async function requireUserId(event: H3Event): Promise<string> {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })
  return user.sub
}

// An invalid uuid would otherwise surface as a Postgres error: report it as missing.
export function getUuidParam(event: H3Event, name: string, missing: string): string {
  const id = getRouterParam(event, name)
  if (!z.uuid().safeParse(id).success) throw createError({ statusCode: 404, statusMessage: missing })
  return id!
}

export const getCollectionIdParam = (event: H3Event) => getUuidParam(event, 'id', 'Collection introuvable')
