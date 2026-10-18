import type { AccountPreferenceKey } from '../utils/preferences'

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
