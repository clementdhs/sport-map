import { distance } from '@turf/turf'
import { MIN_PACE_SPEED_MS, formatPace, formatStopwatch } from '#shared/utils/format'
import type { RecordedPoint, Recording } from '~/utils/recorder'

// The big values of the "data" screen of follow mode and outing recording, read at a glance while moving.

// Instant speed is the speed over this last stretch of time: a single GPS step is too noisy.
const SPEED_WINDOW_MS = 30_000

// In the order of the settings' list.
export const LIVE_FIELDS = [
  'elapsed',
  'movingTime',
  'distance',
  'remaining',
  'lapTime',
  'lapDistance',
  'gain',
  'remainingGain',
  'loss',
  'altitude',
  'speed',
  'averageSpeed',
  'maxSpeed',
  'arrival',
  'time',
  'battery',
] as const
export type LiveField = typeof LIVE_FIELDS[number]
export type LiveMode = 'follow' | 'record'

// What is left of the route only exists when following one.
const FOLLOW_ONLY: readonly LiveField[] = ['remaining', 'remainingGain', 'arrival']
export const MODE_FIELDS: Record<LiveMode, readonly LiveField[]> = {
  follow: LIVE_FIELDS,
  record: LIVE_FIELDS.filter(field => !FOLLOW_ONLY.includes(field)),
}

export const DEFAULT_FIELDS: Record<LiveMode, LiveField[]> = {
  follow: ['distance', 'remaining', 'speed', 'remainingGain', 'arrival', 'time'],
  record: ['elapsed', 'distance', 'speed', 'averageSpeed', 'gain', 'time'],
}

export interface LiveStats {
  now: number
  elapsedS: number | null
  // Time spent moving: pauses and stops left out
  movingS: number | null
  // Since the start of the current lap ("Tour" button), or of the outing
  lapElapsedS: number | null
  lapDistanceM: number | null
  distanceM: number | null
  remainingM: number | null
  gainM: number | null
  remainingGainM: number | null
  lossM: number | null
  altitudeM: number | null
  speedMs: number | null
  averageSpeedMs: number | null
  maxSpeedMs: number | null
  arrivalAt: number | null
  // Current lap, from 1
  lapNumber: number | null
  // From 0 to 1, read by the data screen itself where the browser tells it
  batteryLevel: number | null
}
// What the pages measure.
export type MeasuredStats = Omit<LiveStats, 'batteryLevel'>

// Choice of values kept in the member's account (app/utils/preferences.ts), one list per mode in the order
// shown, plus pace (min/km) rather than speed (km/h).
export interface LiveDataPrefs {
  follow?: LiveField[]
  record?: LiveField[]
  pace?: boolean
}

// Saved preferences in their saved order, ignoring anything unknown or repeated (an older or damaged value).
export function parseLiveDataPrefs(value: unknown): LiveDataPrefs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const saved = value as Record<string, unknown>
  const prefs: LiveDataPrefs = {}
  for (const mode of ['follow', 'record'] as const) {
    const fields = saved[mode]
    if (Array.isArray(fields)) {
      prefs[mode] = [...new Set(fields)].filter((field): field is LiveField => MODE_FIELDS[mode].includes(field))
    }
  }
  if (typeof saved.pace === 'boolean') prefs.pace = saved.pace
  return prefs
}

// The chosen values with `field` checked or unchecked: a value checked goes last, the others keep their place.
export function toggleField(fields: readonly LiveField[], field: LiveField, on: boolean): LiveField[] {
  const others = fields.filter(f => f !== field)
  return on ? [...others, field] : others
}

// The chosen values with the one at `index` moved one place up (-1) or down (+1).
export function moveField(fields: readonly LiveField[], index: number, step: -1 | 1): LiveField[] {
  const target = index + step
  if (index < 0 || index >= fields.length || target < 0 || target >= fields.length) return [...fields]
  const next = [...fields]
  ;[next[index], next[target]] = [next[target]!, next[index]!]
  return next
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

// Highest speed (m/s) over SPEED_WINDOW_MS reached during an outing, measured like currentSpeed between
// recorded points, so that a single GPS step can't make it. The tracker only measures the points added since
// its last call, as the outing grows by one point at a time; another outing (other first point, fewer points)
// starts it over. null until the outing has lasted SPEED_WINDOW_MS.
export function maxSpeedTracker() {
  let first: RecordedPoint | undefined
  let along: number[] = []
  let from = 0
  let max: number | null = null

  return (points: readonly RecordedPoint[]): number | null => {
    if (points[0] !== first || points.length < along.length) {
      first = points[0]
      along = []
      from = 0
      max = null
    }
    for (let i = along.length; i < points.length; i++) {
      const a = points[i - 1]
      const b = points[i]!
      along.push(a ? along[i - 1]! + distance([a.lng, a.lat], [b.lng, b.lat], { units: 'meters' }) : 0)
      // The last point recorded before the window ending at b.
      while (from + 1 < i && points[from + 1]!.t <= b.t - SPEED_WINDOW_MS) from++
      const spanMs = b.t - points[from]!.t
      if (spanMs < SPEED_WINDOW_MS) continue
      const speed = (along[i]! - along[from]!) / (spanMs / 1000)
      if (max === null || speed > max) max = speed
    }
    return max
  }
}

// Time and distance of the current lap: since the last press on "Tour", or since the start.
export interface LapProgress {
  // From 1
  number: number
  elapsedS: number
  distanceM: number
}

export function currentLap(recording: Recording, now: number): LapProgress {
  const laps = recording.laps ?? []
  const start = laps.at(-1) ?? { at: recording.startedAt, distanceM: 0 }
  return {
    number: laps.length + 1,
    elapsedS: Math.max(0, now - start.at) / 1000,
    distanceM: Math.max(0, recording.distanceM - start.distanceM),
  }
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

function metersValue(meters: number | null, locale: string): LiveValue {
  return meters === null ? DASH : { value: number(Math.round(meters), locale), unit: 'm' }
}

function stopwatchValue(seconds: number | null): LiveValue {
  return seconds === null ? DASH : { value: formatStopwatch(seconds) }
}

function speedValue(speedMs: number | null, pace: boolean, locale: string): LiveValue {
  if (speedMs === null) return DASH
  if (!pace) return { value: number(speedMs * 3.6, locale, 1), unit: 'km/h' }
  return { value: formatPace(speedMs), unit: '/km' }
}

// A field's value, split from its unit so that the number can be shown much bigger.
export function liveValue(field: LiveField, stats: LiveStats, pace: boolean, locale: string): LiveValue {
  switch (field) {
    case 'elapsed': return stopwatchValue(stats.elapsedS)
    case 'movingTime': return stopwatchValue(stats.movingS)
    case 'lapTime': return stopwatchValue(stats.lapElapsedS)
    case 'distance': return distanceValue(stats.distanceM, locale)
    case 'lapDistance': return distanceValue(stats.lapDistanceM, locale)
    case 'remaining': return distanceValue(stats.remainingM, locale)
    case 'gain': return metersValue(stats.gainM, locale)
    case 'remainingGain': return metersValue(stats.remainingGainM, locale)
    case 'loss': return metersValue(stats.lossM, locale)
    case 'altitude': return metersValue(stats.altitudeM, locale)
    case 'speed': return speedValue(stats.speedMs, pace, locale)
    case 'averageSpeed': return speedValue(stats.averageSpeedMs, pace, locale)
    case 'maxSpeed': return speedValue(stats.maxSpeedMs, pace, locale)
    case 'arrival': return stats.arrivalAt === null ? DASH : { value: clock(stats.arrivalAt, locale) }
    case 'time': return { value: clock(stats.now, locale) }
    case 'battery':
      return stats.batteryLevel === null ? DASH : { value: number(Math.round(stats.batteryLevel * 100), locale), unit: '%' }
  }
}
