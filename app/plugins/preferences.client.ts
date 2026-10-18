// Preferences that follow the member's account (#145): the account is loaded once a session is known, and
// changes made offline are sent when the network returns.
export default defineNuxtPlugin(() => {
  const preferences = usePreferencesStore()
  const user = useSupabaseUser()

  watch(() => user.value?.sub ?? null, id => preferences.setMember(id), { immediate: true })
  window.addEventListener('online', () => void preferences.save())
})
