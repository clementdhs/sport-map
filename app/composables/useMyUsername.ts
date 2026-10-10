import type { ProfileInfo } from '#shared/types/routes'

// The signed-in member's username, for the account menu. Not in the session: accounts made in the dashboard
// have none in their metadata, and it changes in the settings. Fetched once per member and kept across pages
// (refresh() fetches it again); null when signed out or unreachable (offline), where the menu shows the e-mail.
export function useMyUsername() {
  const user = useSupabaseUser()
  // Forwards the session cookie when rendered on the server.
  const requestFetch = useRequestFetch()
  return useAsyncData(
    () => `my-username:${user.value?.sub ?? ''}`,
    async () => {
      if (!user.value) return null
      try {
        return (await requestFetch<ProfileInfo>('/api/profile/me/info')).username
      }
      catch {
        return null
      }
    },
    {
      getCachedData: (key, nuxtApp, { cause }) =>
        cause === 'refresh:manual' || cause === 'refresh:hook' ? undefined : nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
    },
  )
}
