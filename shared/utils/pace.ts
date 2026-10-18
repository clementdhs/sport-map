import type { PaceSuggestions } from '../types/account'
import { formatNumber } from './format'
import { flatPaceMinPerKm, SPORT_KINDS, SPORT_TYPES, type SportKind, type SportType } from './routes'

// The member's pace on the flat per sport (#146), in min/km whatever the sport: the estimated durations of every
// route they look at use it (estimateDurationMin). A sport left out keeps DEFAULT_PACES. Kept in the member's
// account (app/utils/preferences.ts).
export type SportPaces = Partial<Record<SportType, number>>

// A pace is written as such (min/km) for runners, as a speed (km/h) for the others, within these bounds.
export const PACE_SETTING_LIMITS: Record<SportKind, { min: number, max: number }> = {
  run: { min: 2, max: 20 },
  walk: { min: 1, max: 10 },
  ride: { min: 4, max: 60 },
}

export function isPaceSetting(sport: SportType): boolean {
  return SPORT_KINDS[sport] === 'run'
}

// The value written for a pace: itself for runners, the speed for the others.
export function paceSettingValue(sport: SportType, paceMinPerKm: number): number {
  return isPaceSetting(sport) ? paceMinPerKm : 60 / paceMinPerKm
}

function inSettingLimits(sport: SportType, paceMinPerKm: number): boolean {
  const { min, max } = PACE_SETTING_LIMITS[SPORT_KINDS[sport]]
  const value = paceSettingValue(sport, paceMinPerKm)
  // Speeds come back from min/km with rounding errors.
  return Number.isFinite(value) && value >= min - 1e-9 && value <= max + 1e-9
}

// The paces saved in the account, without the unknown sports and the values out of bounds.
export function parseSportPaces(value: unknown): SportPaces {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const saved = value as Record<string, unknown>
  return Object.fromEntries(SPORT_TYPES.flatMap((sport) => {
    const pace = saved[sport]
    return typeof pace === 'number' && inSettingLimits(sport, pace) ? [[sport, pace]] : []
  }))
}

// A pace as typed in its field, in min/km: "5:30" or "5" for runners, "4.5" or "4,5" (km/h, one decimal as
// shown) for the others.
// Null when it isn't one, or is out of bounds.
export function parsePaceSetting(sport: SportType, text: string): number | null {
  const typed = text.trim()
  let pace: number | null = null
  if (isPaceSetting(sport)) {
    const match = /^(\d{1,2})(?:\s*[:'’]\s*(\d{2}))?$/.exec(typed)
    const seconds = Number(match?.[2] ?? 0)
    if (match && seconds < 60) pace = Number(match[1]) + seconds / 60
  }
  else if (/^\d{1,2}(?:[.,]\d)?$/.test(typed)) {
    pace = 60 / Number(typed.replace(',', '.'))
  }
  return pace !== null && inSettingLimits(sport, pace) ? pace : null
}

// A pace as its field shows it: "5:30" for runners, "4.5" or "4,5" (km/h, in the language's decimals) for the
// others.
export function formatPaceSetting(sport: SportType, paceMinPerKm: number, locale?: string): string {
  if (!isPaceSetting(sport)) return formatNumber(Math.round(60 / paceMinPerKm * 10) / 10, locale, { maximumFractionDigits: 1 })
  const seconds = Math.round(paceMinPerKm * 60)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

// Rounded as the member would write it: to 5 s for a pace, to 0.1 km/h for a speed.
function roundPaceSetting(sport: SportType, paceMinPerKm: number): number {
  return isPaceSetting(sport) ? Math.round(paceMinPerKm * 12) / 12 : 60 / (Math.round(60 / paceMinPerKm * 10) / 10)
}

// An outing of the member, with the route it was on.
export interface PaceOuting {
  sport: SportType
  // Its GPS points were kept (#57): older outings only have their times.
  hasTrack: boolean
  // GPS distance (m) and moving time (s)
  distanceM: number
  movingS: number
  // The route's, whose gain stands for the outing's: GPS altitudes are too noisy.
  routeDistanceM: number
  routeGainM: number | null
}

// Shorter outings say little about a pace: a warm-up, a recording stopped at once.
export const PACE_OUTING_MIN_M = 1000
export const PACE_OUTING_MIN_S = 5 * 60
// A suggestion is made from the latest outings of the sport.
export const PACE_SUGGESTION_OUTINGS = 10

// The pace on the flat that gives the outing's moving time, so that the estimates find it again. The route's
// gain counts in proportion to the part covered: an outing stopped halfway didn't climb it all.
export function outingFlatPace(outing: PaceOuting): number | null {
  const share = outing.routeDistanceM > 0 ? Math.min(1, outing.distanceM / outing.routeDistanceM) : 0
  const gain = outing.routeGainM === null ? null : outing.routeGainM * share
  return flatPaceMinPerKm(outing.sport, outing.distanceM, gain, outing.movingS / 60)
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

// The median pace of each sport over its latest outings (given most recent first), leaving out the ones without
// GPS points, the short ones and the ones whose pace no member could set (a recording left on in a car).
export function suggestPaces(outings: PaceOuting[]): PaceSuggestions {
  const paces: Partial<Record<SportType, number[]>> = {}
  for (const outing of outings) {
    if (!outing.hasTrack || outing.distanceM < PACE_OUTING_MIN_M || outing.movingS < PACE_OUTING_MIN_S) continue
    const pace = outingFlatPace(outing)
    const sport = (paces[outing.sport] ??= [])
    if (pace !== null && inSettingLimits(outing.sport, pace) && sport.length < PACE_SUGGESTION_OUTINGS) sport.push(pace)
  }
  return Object.fromEntries(SPORT_TYPES.flatMap((sport) => {
    const found = paces[sport]
    return found?.length ? [[sport, { pace: roundPaceSetting(sport, median(found)), outings: found.length }]] : []
  }))
}
