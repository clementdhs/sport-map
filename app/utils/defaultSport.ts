import { SPORT_TYPES, type SportType } from '#shared/utils/routes'

// The sport the member mostly practises (#148), preselected in the editor and when saving an outing, and offered
// as a quick filter on the home page; null when they chose none, which leaves each screen's own default. Kept in
// the member's account (app/utils/preferences.ts).
export function parseDefaultSport(value: unknown): SportType | null {
  return SPORT_TYPES.find(sport => sport === value) ?? null
}
