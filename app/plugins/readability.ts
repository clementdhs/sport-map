// Outdoor readability (#149) on <html>, which main.css reads: from the cookie on the server render, then
// following the member's preference once the page is hydrated (the device's value at once, the account's once
// loaded), so that a change made on another device or a lost cookie catches up. Not before: a component still
// hydrating would keep the server's markup (attributes aren't patched), e.g. the settings switch unchecked.
export default defineNuxtPlugin(() => {
  const { outdoor, setOutdoor } = useOutdoorReadability()

  useHead({ htmlAttrs: { 'data-readability': () => (outdoor.value ? 'outdoor' : undefined) } })

  if (import.meta.client) {
    const preferences = usePreferencesStore()
    onNuxtReady(() => {
      watch(() => preferences.values.outdoorReadability, (on) => {
        if (on !== outdoor.value) setOutdoor(on, false)
      }, { immediate: true })
    })
  }
})
