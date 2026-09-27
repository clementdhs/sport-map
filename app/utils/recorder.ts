import { distance } from '@turf/turf'
import type { LngLat, RouteCreatePayload } from '#shared/utils/routes'
import { resampleTrack } from '~/utils/gpx'

// Recording an outing with the phone's GPS. Pure functions over a plain, serializable state, so that the
// recording can be saved on the phone after every point and resumed if the page closes.

// Fixes less accurate than this are ignored (indoors, under dense cover, first seconds after start).
export const MAX_ACCURACY_M = 35
// Moves shorter than this (or than half the fix's accuracy) are GPS jitter, not progress.
const MIN_STEP_M = 5
// Faster than this is a GPS jump, not a move (160 km/h).
const MAX_SPEED_MS = 45
// Slower than this between two fixes is standing still (1 km/h).
const MIN_MOVING_SPEED_MS = 0.3
// No fix for this long: the screen was probably off, the track has a straight gap.
export const GAP_MS = 60_000

export interface RecordedPoint {
  lng: number
  lat: number
  // GPS altitude (m), when the phone provides it
  alt: number | null
  // Time (ms since epoch)
  t: number
}

export interface Recording {
  startedAt: number
  points: RecordedPoint[]
  distanceM: number
  movingMs: number
  // Periods without any fix longer than GAP_MS
  gaps: number
  pausedAt: number | null
  // Set on resume: the move spanning the pause adds distance but no moving time
  afterPause: boolean
}

export interface Fix {
  position: LngLat
  accuracyM: number
  altitudeM: number | null
}

export function startRecording(now: number): Recording {
  return { startedAt: now, points: [], distanceM: 0, movingMs: 0, gaps: 0, pausedAt: null, afterPause: false }
}

// The recording with the fix added, or unchanged when the fix is ignored.
export function addFix(recording: Recording, fix: Fix, now: number): Recording {
  if (recording.pausedAt !== null || fix.accuracyM > MAX_ACCURACY_M) return recording
  const point: RecordedPoint = { lng: fix.position[0], lat: fix.position[1], alt: fix.altitudeM, t: now }
  const last = recording.points.at(-1)
  if (!last) return { ...recording, points: [point] }

  const stepM = distance([last.lng, last.lat], fix.position, { units: 'meters' })
  if (stepM < Math.max(MIN_STEP_M, fix.accuracyM / 2)) return recording
  const dt = now - last.t
  if (dt > 0 && stepM / (dt / 1000) > MAX_SPEED_MS) return recording

  const moving = !recording.afterPause && dt > 0 && stepM / (dt / 1000) >= MIN_MOVING_SPEED_MS
  return {
    ...recording,
    points: [...recording.points, point],
    distanceM: recording.distanceM + stepM,
    movingMs: recording.movingMs + (moving ? dt : 0),
    gaps: recording.gaps + (dt > GAP_MS ? 1 : 0),
    afterPause: false,
  }
}

export function pauseRecording(recording: Recording, now: number): Recording {
  return recording.pausedAt === null ? { ...recording, pausedAt: now } : recording
}

export function resumeRecording(recording: Recording): Recording {
  return recording.pausedAt === null ? recording : { ...recording, pausedAt: null, afterPause: true }
}

// Time since the start, pauses included, like a watch (ms).
export function elapsedMs(recording: Recording, now: number): number {
  return now - recording.startedAt
}

// The recorded track as a route payload: resampled under the point limit, with the GPS altitudes when every
// point has one. null when there are not enough points for a route.
export function recordingTrack(recording: Recording): Pick<RouteCreatePayload, 'coordinates' | 'elevations'> | null {
  if (recording.points.length < 2) return null
  const withAltitude = recording.points.every(p => p.alt !== null)
  const positions = recording.points.map(p => (withAltitude ? [p.lng, p.lat, p.alt!] : [p.lng, p.lat]))
  const kept = positions.length > 2 ? resampleTrack(positions) : positions
  const round = (value: number) => Math.round(value * 1e6) / 1e6
  return {
    coordinates: kept.map(([lng, lat]) => [round(lng!), round(lat!)] as LngLat),
    elevations: withAltitude ? kept.map(p => Math.round(p[2]! * 10) / 10) : undefined,
  }
}
