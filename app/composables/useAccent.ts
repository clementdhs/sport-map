import type { Accent } from '#shared/utils/theme'

const ACCENT_COOKIE = 'sport-map-accent'

// The accent color picked by the visitor, kept a year in a cookie so the server renders the page with
// it (no flash of the default color).
export function useAccent() {
  const cookie = useCookie<string | null>(ACCENT_COOKIE, { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  const accent = useState<Accent>('accent', () => toAccent(cookie.value))

  function setAccent(value: Accent) {
    accent.value = value
    cookie.value = value
  }

  return { accent: readonly(accent), setAccent }
}
