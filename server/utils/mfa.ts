import type { H3Event } from 'h3'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '#shared/types/database.types'

// Two-factor authentication (#253): RLS refuses everything to a member with a TOTP app who hasn't typed a code
// in this session (public.mfa_ok). Routes that read or write through the service role bypass RLS, so they call
// this first. An aal2 session passes without a query; otherwise the database says whether a verified factor exists.
export async function requireMfa(event: H3Event): Promise<void> {
  const user = await serverSupabaseUser(event)
  if (!user) throw apiError(event, 401, 'api.signInRequired')
  if (user.aal === 'aal2') return

  const supabase = await serverSupabaseClient<Database>(event)
  const { data, error } = await supabase.rpc('mfa_ok')
  if (error) {
    console.error('[requireMfa]', error)
    throw apiError(event, 500, 'api.mfaCheckFailed')
  }
  if (!data) throw apiError(event, 403, 'api.mfaRequired')
}
