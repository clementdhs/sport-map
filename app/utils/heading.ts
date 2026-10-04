import { bearing, distance } from '@turf/turf'
import type { LngLat } from '#shared/utils/routes'
import { MAX_ACCURACY_M } from '~/utils/recorder'

// Direction of travel shown by the GPS arrow in follow mode and outing recording. Pure functions over a
// small state updated with each fix. The GPS course is used when the device gives one while moving;
// otherwise the direction is measured between fixes far enough apart. Without a new direction (stopped,
// poor GPS), the last one is kept for a while, so the arrow doesn't spin around a walker standing still.

// Slower than this, the device's course is noise and the walker is taken as stopped (1.8 km/h).
const MIN_SPEED_MPS = 0.5
// Without a GPS course, the direction is measured over at least this distance (or the fix's accuracy, if larger).
const MIN_COURSE_M = 10
// Faster than this between two fixes is a GPS jump, not a move (160 km/h, as in the recorder).
const MAX_SPEED_MPS = 45
// With no new direction for this long, the arrow goes back to a dot.
export const HEADING_STALE_MS = 120_000

export interface HeadingFix {
  position: LngLat
  accuracyM: number
  // Course and speed given by the device, if any
  headingDeg: number | null
  speedMps: number | null
}

export interface HeadingState {
  // Degrees clockwise from north, or null when unknown
  headingDeg: number | null
  // When headingDeg was measured
  measuredAt: number
  // Where the next measured direction starts from
  anchor: { position: LngLat, at: number } | null
}

export const NO_HEADING: HeadingState = { headingDeg: null, measuredAt: 0, anchor: null }

// Browsers give NaN as the course of a device standing still.
export function finiteOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null
}

function normalize(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

export function nextHeading(state: HeadingState, fix: HeadingFix, now: number): HeadingState {
  const held = state.headingDeg !== null && now - state.measuredAt > HEADING_STALE_MS
    ? { ...state, headingDeg: null }
    : state
  if (fix.accuracyM > MAX_ACCURACY_M) return held

  const anchor = { position: fix.position, at: now }
  if (fix.speedMps !== null && fix.speedMps < MIN_SPEED_MPS) return held
  if (fix.headingDeg !== null && fix.speedMps !== null) {
    return { headingDeg: normalize(fix.headingDeg), measuredAt: now, anchor }
  }

  if (!held.anchor) return { ...held, anchor }
  const stepM = distance(held.anchor.position, fix.position, { units: 'meters' })
  if (stepM < Math.max(MIN_COURSE_M, fix.accuracyM)) return held
  const dt = (now - held.anchor.at) / 1000
  if (dt > 0 && stepM / dt > MAX_SPEED_MPS) return held
  return { headingDeg: normalize(bearing(held.anchor.position, fix.position)), measuredAt: now, anchor }
}
