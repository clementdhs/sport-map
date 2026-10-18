import type { SearchScope } from '#shared/utils/routes'

// Routes searched on the home page (#130): the member's own by default, the app being first a personal one.
// Kept in the member's account (app/utils/preferences.ts).
export function parseSearchScope(value: unknown): SearchScope {
  return value === 'all' ? 'all' : 'mine'
}
