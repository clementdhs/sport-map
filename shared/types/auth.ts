// POST /api/auth/login: the tokens of the new session, which the page hands to supabase.auth.setSession.
export interface LoginSession {
  access_token: string
  refresh_token: string
}
