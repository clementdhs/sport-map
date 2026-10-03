import { distance } from '@turf/turf'
import { formatStopwatch } from '#shared/utils/format'
import type { RecordedPoint } from '~/utils/recorder'

// The big values of the "data" screen of follow mode and outing recording, read at a glance while moving.

// Instant speed is the speed over this last stretch of time: a single GPS step is too noisy.
const SPEED_WINDOW_MS = 30_000
// Slower than this, a pace (min/km) means nothing: shown as a dash (1 km/h).
const MIN_PACE_SPEED_MS = 0.28

export const LIVE_FIELDS = [
  'elapsed',
  'distance',
  'remaining',
  'gain',
  'remainingGain',
  'speed',
  'averageSpeed',
  'arrival',
  'time',
] as const
export type LiveField = typeof LIVE_FIELDS[number]
export type LiveMode = 'follow' | 'record'

// What is left of the route only exists when following one.
export const MODE_FIELDS: Record<LiveMode, readonly LiveField[]> = {
  follow: LIVE_FIELDS,
  record: ['elapsed', 'distance', 'gain', 'speed', 'averageSpeed', 'time'],
}

export const DEFAULT_FIELDS: Record<LiveMode, LiveField[]> = {
  follow: ['distance', 'remaining', 'speed', 'remainingGain', 'arrival', 'time'],
  record: ['elapsed', 'distance', 'speed', 'averageSpeed', 'gain', 'time'],
}

export interface LiveStats {
  now: number
  elapsedS: number | null
  distanceM: number | null
  remainingM: number | null
  gainM: number | null
  remainingGainM: number | null
  speedMs: number | null
  averageSpeedMs: number | null
  arrivalAt: number | null
}

// Choice of values saved on the device, one list per mode, plus pace (min/km) rather than speed (km/h).
export interface LiveDataPrefs {
  follow?: LiveField[]
  record?: LiveField[]
  pace?: boolean
}

// Saved preferences, ignoring anything unknown (an older or damaged value).
export function parseLiveDataPrefs(raw: string | null): LiveDataPrefs {
  let value: unknown
  try {
    value = raw ? JSON.parse(raw) : null
  }
  catch {
    return {}
  }
  if (!value || typeof value !== 'object') return {}
  const saved = value as Record<string, unknown>
  const prefs: LiveDataPrefs = {}
  for (const mode of ['follow', 'record'] as const) {
    const fields = saved[mode]
    if (Array.isArray(fields)) {
      prefs[mode] = MODE_FIELDS[mode].filter(field => fields.includes(field))
    }
  }
  if (typeof saved.pace === 'boolean') prefs.pace = saved.pace
  return prefs
}

// Speed (m/s) over the last SPEED_WINDOW_MS, from the last point recorded before the window to now: it drops
// to 0 when standing still, since no point is recorded then. null for the first seconds.
export function currentSpeed(points: RecordedPoint[], now: number): number | null {
  if (!points.length) return null
  let from = points.length - 1
  while (from > 0 && points[from]!.t > now - SPEED_WINDOW_MS) from--
  const spanMs = now - points[from]!.t
  if (spanMs < 5_000) return null
  let meters = 0
  for (let i = from + 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    meters += distance([a.lng, a.lat], [b.lng, b.lat], { units: 'meters' })
  }
  return meters / (spanMs / 1000)
}

// Average moving speed (m/s), once there was a minute of moving: earlier, it would swing wildly.
export function averageSpeed(distanceM: number, movingMs: number): number | null {
  return movingMs >= 60_000 ? distanceM / (movingMs / 1000) : null
}

// Time of arrival at the average moving speed (ms since epoch).
export function estimatedArrival(now: number, remainingM: number, speedMs: number | null): number | null {
  if (!speedMs || speedMs < MIN_PACE_SPEED_MS) return null
  return now + (remainingM / speedMs) * 1000
}

export interface LiveValue {
  value: string
  unit?: string
}

const DASH: LiveValue = { value: '—' }

function number(value: number, locale: string, digits = 0) {
  return value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function clock(time: number, locale: string) {
  return new Date(time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

function distanceValue(meters: number | null, locale: string): LiveValue {
  if (meters === null) return DASH
  if (meters < 1000) return { value: number(Math.round(meters), locale), unit: 'm' }
  return { value: number(meters / 1000, locale, 2), unit: 'km' }
}

function speedValue(speedMs: number | null, pace: boolean, locale: string): LiveValue {
  if (speedMs === null) return DASH
  if (!pace) return { value: number(speedMs * 3.6, locale, 1), unit: 'km/h' }
  if (speedMs < MIN_PACE_SPEED_MS) return { value: '—', unit: '/km' }
  const secondsPerKm = Math.round(1000 / speedMs)
  return { value: `${Math.floor(secondsPerKm / 60)}:${String(secondsPerKm % 60).padStart(2, '0')}`, unit: '/km' }
}

// A field's value, split from its unit so that the number can be shown much bigger.
export function liveValue(field: LiveField, stats: LiveStats, pace: boolean, locale: string): LiveValue {
  switch (field) {
    case 'elapsed': return stats.elapsedS === null ? DASH : { value: formatStopwatch(stats.elapsedS) }
    case 'distance': return distanceValue(stats.distanceM, locale)
    case 'remaining': return distanceValue(stats.remainingM, locale)
    case 'gain': return stats.gainM === null ? DASH : { value: number(Math.round(stats.gainM), locale), unit: 'm' }
    case 'remainingGain':
      return stats.remainingGainM === null ? DASH : { value: number(Math.round(stats.remainingGainM), locale), unit: 'm' }
    case 'speed': return speedValue(stats.speedMs, pace, locale)
    case 'averageSpeed': return speedValue(stats.averageSpeedMs, pace, locale)
    case 'arrival': return stats.arrivalAt === null ? DASH : { value: clock(stats.arrivalAt, locale) }
    case 'time': return { value: clock(stats.now, locale) }
  }
}
