import type { H3Event } from 'h3'
import { serverSupabaseUser } from '#supabase/server'
import { apiError } from './messages'

export type SignedInUser = NonNullable<Awaited<ReturnType<typeof serverSupabaseUser>>>

// For routes that need a signed-in member: the JWT claims of the session (the user id is `.sub`), else a 401 in
// the request's language. Routes where signing in is optional keep calling serverSupabaseUser.
export async function requireUser(event: H3Event): Promise<SignedInUser> {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')
  return user
}
