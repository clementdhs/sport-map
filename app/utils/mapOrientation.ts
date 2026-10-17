import { smoothBearing } from '~/utils/flyover'
import type { HeadingState } from '~/utils/heading'

// How the map of follow mode and outing recording is turned (#98): north up (the default) or turned with the
// direction of travel, which then points up the screen. The direction is the GPS course while moving, the phone
// compass otherwise. Pure functions; RouteFollow applies them. Thresholds chosen before the field test.

export type MapOrientation = 'north' | 'heading'

const STORAGE_KEY = 'sport-map:map-orientation'

// From this speed, the GPS course gives the direction rather than the compass (3.6 km/h).
const COURSE_MIN_SPEED_MPS = 1
// A course measured longer ago than this is a walker who stopped: the compass takes over.
export const COURSE_FRESH_MS = 10_000
// The map's bearing closes 63 % of the gap to the direction every MAP_SMOOTHING_S seconds: a GPS course swinging from
// one fix to the next, or the switch between course and compass, turns it gently.
const MAP_SMOOTHING_S = 1
// The map only turns once the direction is this far from its bearing, so that it doesn't shake.
export const MIN_ROTATION_DEG = 5

export function parseMapOrientation(value: string | null): MapOrientation {
  return value === 'heading' ? 'heading' : 'north'
}

export function loadMapOrientation(): MapOrientation {
  try {
    return parseMapOrientation(localStorage.getItem(STORAGE_KEY))
  }
  catch {
    return 'north'
  }
}

export function saveMapOrientation(orientation: MapOrientation) {
  try {
    localStorage.setItem(STORAGE_KEY, orientation)
  }
  catch { /* storage blocked: kept until the page closes */ }
}

// Direction shown by the GPS arrow and followed by a heading-up map (degrees clockwise from north): the GPS course
// while moving, else the compass, else the last course kept by nextHeading. Null when none is known.
export function travelDirection(course: HeadingState, speedMps: number | null, compassDeg: number | null, now: number): number | null {
  const moving = course.headingDeg !== null
    && now - course.measuredAt <= COURSE_FRESH_MS
    && (speedMps === null || speedMps >= COURSE_MIN_SPEED_MPS)
  if (moving) return course.headingDeg
  return compassDeg ?? course.headingDeg
}

export interface MapBearingState {
  // Bearing the map aims at (degrees clockwise from north), and when it was updated
  deg: number
  at: number
}

// The bearing aimed at once the direction is `directionDeg`: smoothed from the previous one, or the direction
// itself when following (re)starts.
export function nextMapBearing(state: MapBearingState | null, directionDeg: number, now: number): MapBearingState {
  if (!state) return { deg: directionDeg, at: now }
  return { deg: smoothBearing(state.deg, directionDeg, Math.max(0, now - state.at) / 1000, MAP_SMOOTHING_S), at: now }
}

// Smallest angle between two bearings (0 to 180).
export function angleBetween(a: number, b: number): number {
  const delta = Math.abs((((a - b) % 360) + 360) % 360)
  return Math.min(delta, 360 - delta)
}

// Whether the map, at `mapDeg`, should turn to `aimedDeg`.
export function shouldRotate(mapDeg: number, aimedDeg: number): boolean {
  return angleBetween(mapDeg, aimedDeg) >= MIN_ROTATION_DEG
}
