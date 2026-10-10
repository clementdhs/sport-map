import { createClient } from '@supabase/supabase-js'
import { serverSupabaseServiceRole } from '#supabase/server'
import type { LoginSession } from '#shared/types/auth'

// Signs in with a username (an e-mail goes straight to Supabase from the page). The account's e-mail stays on
// the server: the page gets the new session's tokens and hands them to supabase.auth.setSession. An unknown
// username and a wrong password get the same answer.
export default defineEventHandler(async (event): Promise<LoginSession> => {
  const { username, password } = await readLocalizedBody(event, usernameLoginSchema)
  await consumeLoginAttempt(event, username)

  const { data: email, error } = await serverSupabaseServiceRole(event).rpc('login_email', { login_username: username })
  if (error) {
    console.error('[POST /api/auth/login]', error)
    throw apiError(event, 500, 'api.loginFailed')
  }
  if (!email) throw apiError(event, 401, 'api.invalidLogin')

  // A client of its own, without storage: the session only goes back to the page.
  const { url, key } = useRuntimeConfig(event).public.supabase
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
  if (signInError) {
    if (signInError.code === 'invalid_credentials') throw apiError(event, 401, 'api.invalidLogin')
    // Supabase's own limit, counted for all of Vercel's IPs.
    if (signInError.status === 429) throw apiError(event, 429, 'api.tooManyLogins')
    console.error('[POST /api/auth/login]', signInError)
    throw apiError(event, 500, 'api.loginFailed')
  }

  await clearLoginAttempts(event, username)
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token }
})
