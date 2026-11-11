import type { AccountPreferenceKey } from '../utils/preferences'
import type { SportType } from '../utils/routes'
import type { SlotForecast } from '../utils/weatherSlot'

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

// GET /api/profile/me/privacy-zones (#254): the member's zones as they placed them (the moved centre that cuts
// tracks stays in the database).
export type PrivacyZone = {
  id: string
  label: string | null
  center: [lng: number, lat: number]
  radius_m: number
}

// POST and DELETE /api/profile/me/privacy-zones: the zones, and whether every route and outing could be cut again
// (false: some kept their previous cut, POST /api/profile/me/privacy-zones/apply tries again).
export type PrivacyZonesResult = {
  zones: PrivacyZone[]
  applied: boolean
}

// GET and PUT /api/profile/me/coach-goal (#264): what the member trains for, null on GET until they pick one. The
// race fields are set for a race only (its gain may be unknown).
export type CoachGoal = {
  kind: 'resume' | 'progress' | 'race'
  race_date: string | null
  race_distance_m: number | null
  race_gain_m: number | null
  // The member's week (#283): outings a week (2 to 6), the days they run (ISO weekdays, 1 = Monday, sorted; none
  // or as many as outings) and the day of the long run
  outings_per_week: number
  preferred_days: number[]
  long_run_day: number | null
}

// GET /api/profile/me/coach-weather (#265): the hourly forecast of the next days where the member runs, for the
// best slot of the coach's session, worked out in the browser (bestSlot) as the duration changes. null without
// a place: no position given and no outing yet.
export type CoachWeather = SlotForecast & {
  utcOffsetSeconds: number
}
