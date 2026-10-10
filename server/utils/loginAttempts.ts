import { getRequestIP, type H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

// Sign-ins with a username go through Vercel's IPs, so Supabase's limit per IP can't tell visitors apart:
// attempts are counted here, per typed username and per caller IP, over a 10-minute window.
const WINDOW_SECONDS = 600
const USERNAME_LIMIT = 5
// Higher: a household shares its IP.
const IP_LIMIT = 30

// The key of a typed username: usernames are case-insensitive.
const usernameKey = (username: string) => `user:${username.toLowerCase()}`

// Counts one attempt, or answers 429 once the username or the IP went over its limit.
export async function consumeLoginAttempt(event: H3Event, username: string): Promise<void> {
  // Vercel sets x-forwarded-for itself, replacing what the caller sent.
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const { data: allowed, error } = await serverSupabaseServiceRole(event).rpc('consume_login_attempt', {
    username_key: usernameKey(username),
    ip_key: `ip:${ip}`,
    username_limit: USERNAME_LIMIT,
    ip_limit: IP_LIMIT,
    window_seconds: WINDOW_SECONDS,
  })
  if (error) {
    console.error('[login attempts]', error)
    throw apiError(event, 500, 'api.loginFailed')
  }
  if (!allowed) throw apiError(event, 429, 'api.tooManyLogins')
}

// After a successful sign-in, the username's earlier typos no longer count.
export async function clearLoginAttempts(event: H3Event, username: string): Promise<void> {
  const { error } = await serverSupabaseServiceRole(event).from('login_attempts').delete().eq('key', usernameKey(username))
  if (error) console.error('[login attempts]', error)
}
