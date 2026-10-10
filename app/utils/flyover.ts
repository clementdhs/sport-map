import { bearing } from '@turf/turf'
import type { LngLat, OutingTrackPoint } from '#shared/utils/routes'
import { smoothByDistance } from '#shared/utils/routes'
import { measureLine, pointAlong, type MeasuredLine } from '#shared/utils/lineSection'

// Animated 3D flyover of a route or of a recorded outing (#74): a point moves along the line and the camera
// follows it from behind and above. The animation loop is in useFlyover; everything it computes is here.

export interface FlyoverTrack {
  line: MeasuredLine
  // When the moving point passes each point: metres along for a route (steady pace), moving seconds for an outing
  // (its real pace, pauses left out).
  timeline: number[]
  // Elevation at each point (m), for the controls' profile; null when unknown
  elevations: number[] | null
}

// Base duration of a flyover at ×1: 30 s up to 10 km, then 0.75 s more per km, at most 60 s (from 50 km).
const MIN_DURATION_S = 30
const MAX_DURATION_S = 60
const SHORT_ROUTE_KM = 10
const SECONDS_PER_KM = 0.75

// Speed at which the ground under the camera crosses the screen at ×1 (px/s), and the zoom range it may pick.
const SCREEN_SPEED_PX_S = 200
const MIN_ZOOM = 12
const MAX_ZOOM = 15
const EARTH_CIRCUMFERENCE_M = 40_075_016.686

export function routeFlyover(coordinates: LngLat[], elevations?: number[] | null): FlyoverTrack {
  const line = measureLine(coordinates)
  return { line, timeline: line.along, elevations: elevations?.length === coordinates.length ? elevations : null }
}

// An outing replayed at its own pace. Its GPS altitudes are smoothed like the routes'; none when one is missing.
export function outingFlyover(track: OutingTrackPoint[]): FlyoverTrack {
  const coordinates = track.map(([lng, lat]): LngLat => [lng, lat])
  const line = measureLine(coordinates)
  let latest = 0
  const timeline = track.map(([, , , , movingS]) => (latest = Math.max(latest, movingS)))
  const altitudes = track.map(([, , altitude]) => altitude)
  const elevations = altitudes.every(altitude => altitude !== null)
    ? smoothByDistance(coordinates, altitudes as number[])
    : null
  // Without any moving time (never saved that way), it goes at a steady pace.
  return { line, timeline: latest > 0 ? timeline : line.along, elevations }
}

export function flyoverDurationS(lengthM: number): number {
  const km = lengthM / 1000
  return Math.min(MAX_DURATION_S, Math.max(MIN_DURATION_S, MIN_DURATION_S + (km - SHORT_ROUTE_KM) * SECONDS_PER_KM))
}

// Closer for short routes, further for long ones (which also loads fewer tiles): the ground moves at about the same
// speed on screen whatever the length.
export function flyoverZoom(groundSpeedMps: number, latitude: number): number {
  const metersPerPixelAtZoom0 = (EARTH_CIRCUMFERENCE_M * Math.cos((latitude * Math.PI) / 180)) / 512
  const zoom = Math.log2((metersPerPixelAtZoom0 * SCREEN_SPEED_PX_S) / Math.max(groundSpeedMps, 1e-6))
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

// Last index i with values[i] <= value, between 0 and the one before last.
function lastAtOrBefore(values: number[], value: number): number {
  let low = 0
  let high = values.length - 2
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (values[middle]! <= value) low = middle
    else high = middle - 1
  }
  return Math.max(0, low)
}

function interpolate(from: number[], to: number[], value: number): number {
  if (from.length < 2) return to[0] ?? 0
  const i = lastAtOrBefore(from, value)
  const span = from[i + 1]! - from[i]!
  const ratio = span > 0 ? Math.min(1, Math.max(0, (value - from[i]!) / span)) : 0
  return to[i]! + (to[i + 1]! - to[i]!) * ratio
}

// Metres along the line reached at `progress` (0 to 1) of the flyover.
export function flyoverAlong({ line, timeline }: FlyoverTrack, progress: number): number {
  return interpolate(timeline, line.along, Math.min(1, Math.max(0, progress)) * timeline.at(-1)!)
}

// The flyover's progress (0 to 1) when the moving point is `alongM` metres along, to jump there.
export function flyoverProgress({ line, timeline }: FlyoverTrack, alongM: number): number {
  const total = timeline.at(-1)!
  return total > 0 ? interpolate(line.along, timeline, alongM) / total : 0
}

// Moving time (s) of an outing when its point is at `progress`; for a route, metres along.
export function flyoverTime({ timeline }: FlyoverTrack, progress: number): number {
  return Math.min(1, Math.max(0, progress)) * timeline.at(-1)!
}

export function flyoverPoint({ line }: FlyoverTrack, alongM: number): LngLat {
  return pointAlong(line, Math.min(line.length, Math.max(0, alongM)))
}

// Direction of travel (degrees, -180 to 180) around `alongM`, from `spanM` behind to `spanM` ahead: a bend or a GPS
// zigzag shorter than that doesn't turn the camera. Null on a line that doesn't go anywhere.
export function flyoverHeading(track: FlyoverTrack, alongM: number, spanM: number): number | null {
  const from = flyoverPoint(track, alongM - spanM)
  const to = flyoverPoint(track, alongM + spanM)
  if (from[0] === to[0] && from[1] === to[1]) return null
  return bearing(from, to)
}

const normalize = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180

// Turns `current` towards `target` (degrees), the short way round, closing the gap by 63 % every `tauS` seconds:
// the camera turns smoothly, as fast whatever the frame rate.
export function smoothBearing(current: number, target: number, dtS: number, tauS: number): number {
  const delta = normalize(target - current)
  return normalize(current + delta * (1 - Math.exp(-dtS / tauS)))
}

// Up to `count` points of the elevation profile spread along the line, for the controls' small profile: [m along, m].
export function profileSamples({ line, elevations }: FlyoverTrack, count = 300): [number, number][] {
  if (!elevations) return []
  const step = Math.max(1, Math.ceil(elevations.length / count))
  const samples: [number, number][] = []
  for (let i = 0; i < elevations.length; i += step) samples.push([line.along[i]!, elevations[i]!])
  if ((elevations.length - 1) % step) samples.push([line.length, elevations.at(-1)!])
  return samples
}
