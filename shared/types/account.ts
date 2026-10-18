import type { AccountPreferenceKey } from '../utils/preferences'
import type { SportType } from '../utils/routes'

// GET /api/profile/me/export: the text files of the archive, and the photos the browser downloads (signed
// URLs, valid an hour) to add to it. The archive is zipped in the browser, as photos would exceed the size
// of a server response.
export type AccountExport = {
  username: string
  files: { path: string, content: string }[]
  photos: { path: string, url: string }[]
}

// GET /api/profile/me/preferences: the preferences kept in the member's account (#145), as saved, unparsed
// (shared/utils/preferences.ts). Empty until a device saves the first one.
export type MyPreferences = Partial<Record<AccountPreferenceKey, unknown>>

// GET /api/profile/me/pace-suggestions: the pace on the flat (min/km) each sport's latest GPS outings give, and how
// many outings it comes from (#146, suggestPaces). Sports without such outings are left out.
export type PaceSuggestions = Partial<Record<SportType, { pace: number, outings: number }>>
