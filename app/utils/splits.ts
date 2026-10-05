import type { LngLat, OutingTrackPoint } from '#shared/utils/routes'
import { elevationSteps, smoothByDistance, trackDistances } from '#shared/utils/routes'

// Splits per kilometre and speed along an outing, from its GPS points (#57). Times are moving times, like the
// outing's: pauses and stops don't count, since the moving time kept with each point doesn't grow during them.

const SPLIT_M = 1000
// A last split shorter than this is left out: its pace would mean nothing.
const MIN_LAST_SPLIT_M = 50
// Speed is measured over this stretch of track around each point: GPS steps of a few meters are too noisy.
const SPEED_WINDOW_M = 200

export interface Split {
  // 1000 m, except for the last one
  distanceM: number
  movingS: number
  // Elevation gained and lost (m), null when the phone gave no altitude
  gainM: number | null
  lossM: number | null
}

export interface SpeedSample {
  // From the start (m)
  distanceM: number
  position: LngLat
  // Moving speed over SPEED_WINDOW_M around this point (m/s), null where no moving time passed
  speedMs: number | null
  // Smoothed GPS altitude (m), null when the phone gave none
  elevationM: number | null
}

interface MeasuredTrack {
  coordinates: LngLat[]
  along: number[]
  moving: number[]
  elevations: number[] | null
}

function measure(track: OutingTrackPoint[]): MeasuredTrack {
  const coordinates = track.map(([lng, lat]) => [lng, lat] as LngLat)
  return {
    coordinates,
    along: trackDistances(coordinates),
    moving: track.map(point => point[4]),
    elevations: track.every(point => point[2] !== null) ? track.map(point => point[2]!) : null,
  }
}

// Where `meters` falls on the track: between points i and i + 1, at fraction f of the way.
function locate(along: number[], meters: number): { i: number, f: number } {
  let low = 0
  let high = along.length - 1
  while (high - low > 1) {
    const mid = (low + high) >> 1
    if (along[mid]! <= meters) low = mid
    else high = mid
  }
  const span = along[high]! - along[low]!
  return { i: low, f: span > 0 ? Math.min(1, Math.max(0, (meters - along[low]!) / span)) : 0 }
}

function valueAt(values: number[], { i, f }: { i: number, f: number }): number {
  return values[i]! + (values[i + 1]! - values[i]!) * f
}

export function outingSplits(track: OutingTrackPoint[]): Split[] {
  const { coordinates, along, moving, elevations } = measure(track)
  const totalM = along.at(-1)!
  const count = Math.floor(totalM / SPLIT_M) + (totalM % SPLIT_M >= MIN_LAST_SPLIT_M ? 1 : 0)
  const movingAt = (meters: number) => valueAt(moving, locate(along, meters))

  const splits: Split[] = Array.from({ length: count }, (_, k) => {
    const fromM = k * SPLIT_M
    const toM = Math.min(totalM, fromM + SPLIT_M)
    return {
      distanceM: toM - fromM,
      movingS: Math.max(0, movingAt(toM) - movingAt(fromM)),
      gainM: elevations ? 0 : null,
      lossM: elevations ? 0 : null,
    }
  })
  if (elevations && count) {
    // Each climb or descent is counted where it ends; a dropped last stretch goes to the last split.
    elevationSteps(coordinates, elevations).forEach((step, i) => {
      const split = splits[Math.min(count - 1, Math.max(0, Math.ceil(along[i]! / SPLIT_M) - 1))]!
      if (step > 0) split.gainM! += step
      else split.lossM! -= step
    })
  }
  return splits
}

// Index of the fastest full kilometre, when there are at least two to compare.
export function fastestSplit(splits: Split[]): number | null {
  const full = splits.flatMap((split, i) => (split.distanceM === SPLIT_M && split.movingS > 0 ? [i] : []))
  if (full.length < 2) return null
  return full.reduce((best, i) => (splits[i]!.movingS < splits[best]!.movingS ? i : best))
}

// `samples` points spread evenly along the outing, for its speed chart.
export function speedProfile(track: OutingTrackPoint[], samples = 200): SpeedSample[] {
  const { coordinates, along, moving, elevations } = measure(track)
  const totalM = along.at(-1)!
  const smoothed = elevations ? smoothByDistance(coordinates, elevations) : null
  const windowM = Math.min(SPEED_WINDOW_M, totalM)
  const movingAt = (meters: number) => valueAt(moving, locate(along, meters))
  const lngs = coordinates.map(([lng]) => lng)
  const lats = coordinates.map(([, lat]) => lat)

  return Array.from({ length: samples }, (_, n) => {
    const distanceM = (totalM * n) / (samples - 1)
    const at = locate(along, distanceM)
    // Near the ends, the window slides inwards so that it keeps its length.
    const fromM = Math.min(Math.max(0, distanceM - windowM / 2), totalM - windowM)
    const movingS = movingAt(fromM + windowM) - movingAt(fromM)
    return {
      distanceM,
      position: [valueAt(lngs, at), valueAt(lats, at)],
      speedMs: movingS > 0 ? windowM / movingS : null,
      elevationM: smoothed ? valueAt(smoothed, at) : null,
    }
  })
}
