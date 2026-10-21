import * as z from 'zod'

// Preferences kept in the member's account (#145), found again on every device. The account holds one JSON
// object, key → value as the app saves it. The server only checks the keys and the size: the app parses each
// value (app/utils/preferences.ts), falling back to its default for anything it doesn't know, since the account
// may hold a value saved by an older version. A new setting adds its key here and its entry there.
export const ACCOUNT_PREFERENCES = ['basemap', 'map3d', 'mapOrientation', 'searchScope', 'liveData', 'voice', 'paces', 'startArea', 'defaultSport', 'mapStyle', 'outdoorReadability', 'osmPlaces'] as const
export type AccountPreferenceKey = typeof ACCOUNT_PREFERENCES[number]

// Largest set of changes saved at once, in JSON characters: a few short values. The table caps the whole object.
export const PREFERENCES_MAX_LENGTH = 4000

// PATCH /api/profile/me/preferences: the preferences changed on a device, saved key by key.
export const preferencesPatchSchema = z.partialRecord(z.enum(ACCOUNT_PREFERENCES), z.json())
  .refine(changes => JSON.stringify(changes).length <= PREFERENCES_MAX_LENGTH, 'api.invalidRequest')
