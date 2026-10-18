import type { ProfileInfo } from '#shared/types/routes'

// The signed-in member's username and profile photo, for the account menu and the tab bar. Not in the session:
// accounts made in the dashboard have no username in their metadata, and both change in the settings. Fetched once
// per member and kept across pages (refresh() fetches it again); null when signed out or unreachable (offline),
// where the menu shows the e-mail.
export function useMyProfile() {
  const user = useSupabaseUser()
  // Forwards the session cookie when rendered on the server.
  const requestFetch = useRequestFetch()
  return useAsyncData(
    () => `my-profile:${user.value?.sub ?? ''}`,
    async (): Promise<Pick<ProfileInfo, 'username' | 'display_name' | 'avatar_path'> | null> => {
      if (!user.value) return null
      try {
        const { username, display_name, avatar_path } = await requestFetch<ProfileInfo>('/api/profile/me/info')
        return { username, display_name, avatar_path }
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
