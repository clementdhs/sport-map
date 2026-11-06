import { distance } from '@turf/turf'
import { MAX_OUTING_POINTS } from '#shared/utils/routes'
import type { LngLat, OutingPayload, OutingTrackPoint, RouteCreatePayload } from '#shared/utils/routes'
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
  // Time spent moving since the start (ms); missing from drafts recorded before it existed
  movingMs?: number
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
  // Last fix showing the GPS was alive, even one that added no point (standing still, paused), noted at most
  // every GAP_MS / 2; missing from drafts recorded before it existed
  lastFixAt?: number
  // Start of each lap after the first one ("Tour" button of the data screen); missing until the first press
  laps?: LapStart[]
}

export interface LapStart {
  // Time (ms since epoch) and distance (m) of the outing when the lap started
  at: number
  distanceM: number
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
  if (fix.accuracyM > MAX_ACCURACY_M) return recording
  if (recording.pausedAt !== null) return noteFix(recording, now)
  const point: RecordedPoint = { lng: fix.position[0], lat: fix.position[1], alt: fix.altitudeM, t: now, movingMs: recording.movingMs }
  const last = recording.points.at(-1)
  if (!last) return { ...recording, points: [point], lastFixAt: now }

  const stepM = distance([last.lng, last.lat], fix.position, { units: 'meters' })
  if (stepM < Math.max(MIN_STEP_M, fix.accuracyM / 2)) return noteFix(recording, now)
  const dt = now - last.t
  if (dt > 0 && stepM / (dt / 1000) > MAX_SPEED_MS) return recording

  const moving = !recording.afterPause && dt > 0 && stepM / (dt / 1000) >= MIN_MOVING_SPEED_MS
  const movingMs = recording.movingMs + (moving ? dt : 0)
  return {
    ...recording,
    points: [...recording.points, { ...point, movingMs }],
    distanceM: recording.distanceM + stepM,
    movingMs,
    // A stop or a pause isn't a gap: fixes kept coming, only the track had nothing to add.
    gaps: recording.gaps + (now - lastFixTime(recording) > GAP_MS ? 1 : 0),
    afterPause: false,
    lastFixAt: now,
  }
}

function lastFixTime(recording: Recording): number {
  return recording.lastFixAt ?? recording.points.at(-1)?.t ?? recording.startedAt
}

// A fix that adds no point still shows the GPS is alive. Noted at most every GAP_MS / 2, which is enough to
// tell a stop from a gap, so that standing still doesn't write the draft on the phone at every fix.
function noteFix(recording: Recording, now: number): Recording {
  return now - lastFixTime(recording) > GAP_MS / 2 ? { ...recording, lastFixAt: now } : recording
}

export function pauseRecording(recording: Recording, now: number): Recording {
  return recording.pausedAt === null ? { ...recording, pausedAt: now } : recording
}

export function resumeRecording(recording: Recording): Recording {
  return recording.pausedAt === null ? recording : { ...recording, pausedAt: null, afterPause: true }
}

// A new lap starting now, where the outing is.
export function markLap(recording: Recording, now: number): Recording {
  return { ...recording, laps: [...(recording.laps ?? []), { at: now, distanceM: recording.distanceM }] }
}

// Time since the start, pauses included, like a watch (ms).
export function elapsedMs(recording: Recording, now: number): number {
  return now - recording.startedAt
}

// The times and distance of a recording ended now, as the server stores an outing (s, m).
export function outingTimes(recording: Recording, now: number): OutingPayload {
  const durationS = Math.round(elapsedMs(recording, now) / 1000)
  return {
    started_at: new Date(recording.startedAt).toISOString(),
    duration_s: durationS,
    moving_s: Math.min(Math.round(recording.movingMs / 1000), durationS),
    distance_m: Math.round(recording.distanceM),
  }
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

// The outing's GPS points with their times, kept for its splits and speed chart. Long outings are thinned out
// like a route's track; each kept point keeps its own times, so the totals don't change. null for drafts
// recorded before the moving time was kept per point.
export function outingTrack(recording: Recording): OutingTrackPoint[] | null {
  const { points } = recording
  if (points.length < 2 || points.some(p => p.movingMs === undefined)) return null
  // The index rides along as a third coordinate, which distances ignore.
  const kept = points.length > MAX_OUTING_POINTS
    ? resampleTrack(points.map((p, i) => [p.lng, p.lat, i]), MAX_OUTING_POINTS).map(([, , i]) => points[i!]!)
    : points
  const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits
  return kept.map(p => [
    round(p.lng, 6),
    round(p.lat, 6),
    p.alt === null ? null : round(p.alt, 1),
    round((p.t - recording.startedAt) / 1000, 1),
    round(p.movingMs! / 1000, 1),
  ])
}
