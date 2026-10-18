import type { SearchScope } from '#shared/utils/routes'

// Routes searched on the home page (#130): the member's own by default, the app being first a personal one.
// Remembered on the device.
const STORAGE_KEY = 'sport-map:search-scope'

export function parseSearchScope(value: string | null): SearchScope {
  return value === 'all' ? 'all' : 'mine'
}

export function loadSearchScope(): SearchScope {
  try {
    return parseSearchScope(localStorage.getItem(STORAGE_KEY))
  }
  catch {
    return 'mine'
  }
}

export function saveSearchScope(scope: SearchScope) {
  try {
    localStorage.setItem(STORAGE_KEY, scope)
  }
  catch { /* storage blocked: kept until the page closes */ }
}
