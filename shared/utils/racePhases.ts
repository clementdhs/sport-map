import type { CoachGoal } from '../types/account'
import { daysUntil } from './coachGoal'
import type { SessionKind } from './coachSessions'

// The preparation for a race (#286): the time left before it cut into phases, so the member sees where they stand
// and the coach weighs the sessions and the week's volume. Worked out from the race date alone: nothing records
// when the preparation started, so a phase counts its own weeks and the earliest one, the base, has no length.
//   base: endurance and hills, the volume growing;
//   build: the key sessions of the race (fast ones on the road, hills on a trail) and the long run towards the
//     race's distance (raceLongRunKm);
//   taper: the volume going down, then the last 7 days of easy outings (#264).

export type RacePhaseName = 'base' | 'build' | 'taper'

export type RacePhase = {
  name: RacePhaseName
  // Days to the race from the day looked at (1 the day before)
  daysLeft: number
  // The week of the phase (1 first) and how many it has; null for the base, open-ended
  week: number
  weeks: number | null
  // Weeks until the next phase, the base only
  untilNext: number | null
}

export const BUILD_WEEKS = 6
// From a half marathon on, two weeks of taper; one for shorter races
export const LONG_RACE_M = 21_000
// A trail race: at least this gain per km (coachSessions' TRAIL_GAIN_PER_KM)
const TRAIL_GAIN_PER_KM = 15
// The week's volume during the taper, against the usual week
export const TAPER_WEEK = 0.7

export const taperWeeks = (goal: CoachGoal) => ((goal.race_distance_m ?? 0) >= LONG_RACE_M ? 2 : 1)

export function isTrailRace(goal: CoachGoal): boolean {
  return !!goal.race_gain_m && !!goal.race_distance_m && goal.race_gain_m / (goal.race_distance_m / 1000) >= TRAIL_GAIN_PER_KM
}

// The phase of `day` (a French local date) for a race goal ahead, null otherwise (no race, race day, past race).
export function racePhase(goal: CoachGoal | null, day: string): RacePhase | null {
  if (goal?.kind !== 'race' || !goal.race_date || !goal.race_distance_m) return null
  const daysLeft = daysUntil(goal.race_date, day)
  if (daysLeft <= 0) return null
  // Weeks left, the race's week included: 1 within its last 7 days
  const weeksLeft = Math.ceil(daysLeft / 7)
  const taper = taperWeeks(goal)
  if (weeksLeft <= taper) return { name: 'taper', daysLeft, week: taper - weeksLeft + 1, weeks: taper, untilNext: null }
  if (weeksLeft <= taper + BUILD_WEEKS) {
    return { name: 'build', daysLeft, week: taper + BUILD_WEEKS - weeksLeft + 1, weeks: BUILD_WEEKS, untilNext: null }
  }
  return { name: 'base', daysLeft, week: 1, weeks: null, untilNext: weeksLeft - taper - BUILD_WEEKS }
}

// The key sessions of a phase among those that fit the time available (KEY_BY_DURATION, first = the day's
// default): no intervals in the base, the race's own first while building. Never empty.
export function phaseKeySessions(kinds: SessionKind[], phase: RacePhase | null, goal: CoachGoal | null): SessionKind[] {
  if (!phase || !goal) return kinds
  const hills = (kind: SessionKind) => kind === 'shortHills' || kind === 'longHills' || kind === 'longHilly'
  if (phase.name === 'base') {
    const kept = kinds.filter(kind => kind !== 'intervals')
    return kept.length ? kept : ['shortHills']
  }
  if (phase.name === 'build') {
    const first = isTrailRace(goal) ? hills : (kind: SessionKind) => kind === 'intervals' || kind === 'long'
    return [...kinds.filter(first), ...kinds.filter(kind => !first(kind))]
  }
  return kinds
}
