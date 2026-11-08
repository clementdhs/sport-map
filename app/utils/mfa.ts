// Two-factor authentication (#253): true when the signed-in member turned on an authenticator app and hasn't typed
// a code in this session yet (aal1). An aal2 session needs nothing more, without a request.
export async function needsMfaCode(): Promise<boolean> {
  const user = useSupabaseUser()
  if (!user.value || user.value.aal === 'aal2') return false
  const auth = useSupabaseClient().auth
  // On the server the session's user comes from a cookie Supabase doesn't vouch for (it warns at each read): the
  // auth server says which factors are verified. Once per page load, client-side navigation doesn't come here.
  if (import.meta.server) {
    const { data } = await auth.getUser()
    return !!data.user?.factors?.some(factor => factor.status === 'verified')
  }
  // In the browser, from the session's own factors.
  const { data, error } = await auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data) return false
  return data.currentLevel === 'aal1' && data.nextLevel === 'aal2'
}
