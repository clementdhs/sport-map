const READABILITY_COOKIE = 'sport-map-readability'

// Outdoor readability (#149): larger text and stronger contrast, set on <html> by plugins/readability.ts. The
// member's account keeps it (preference `outdoorReadability`, found again on every device); a cookie mirrors it
// so that the server renders the page with it, with no flash of the small text. Unlike usePreference(), the
// value is right from the server render: components can show it before they are mounted.
export function useOutdoorReadability() {
  const cookie = useCookie<boolean | null>(READABILITY_COOKIE, { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  const outdoor = useState<boolean>('outdoor-readability', () => cookie.value === true)
  const preferences = usePreferencesStore()

  // `save`: also keep it in the account; false when following the account (the plugin).
  function setOutdoor(on: boolean, save = true) {
    outdoor.value = on
    cookie.value = on || null
    if (save) preferences.set('outdoorReadability', on)
  }

  return { outdoor: readonly(outdoor), setOutdoor }
}
