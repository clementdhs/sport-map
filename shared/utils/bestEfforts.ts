import { distance } from '@turf/turf'
import type { LngLat, OutingTrackPoint, SportKind } from './routes'

// Best efforts of an outing (#140): its fastest moving time over set distances, worked out from its GPS points
// (#57) with a sliding window, and for cyclists the longest distance covered in an hour. The server computes
// them once and keeps them with the outing (`route_outings.best_efforts`), so the profile's records never load
// a track. Times are moving times, like the outing's splits: pauses and stops don't count.

// Bump it when the computation changes: outings computed before are computed again.
export const BEST_EFFORTS_VERSION = 1

export interface DistanceEffort {
  id: string
  meters: number
}

// Hikers get no best times: their records are the longest outing, the biggest gain and the longest duration.
export const DISTANCE_EFFORTS: Record<SportKind, DistanceEffort[]> = {
  run: [
    { id: '1k', meters: 1000 },
    { id: '5k', meters: 5000 },
    { id: '10k', meters: 10_000 },
    { id: 'half', meters: 21_097.5 },
    { id: 'marathon', meters: 42_195 },
  ],
  walk: [],
  ride: [
    { id: '10k', meters: 10_000 },
    { id: '20k', meters: 20_000 },
    { id: '40k', meters: 40_000 },
  ],
}

// Cyclists also get their best hour.
export const HOUR_EFFORT_KINDS: readonly SportKind[] = ['ride']
const HOUR_S = 3600

// A type rather than an interface, so that it can be stored as JSON as it is.
export type BestEfforts = {
  v: number
  // The kind of sport they were computed for: thresholds differ, so a route whose sport changes kind gets its
  // outings computed again.
  kind: SportKind
  // Best moving time (s) over each distance of DISTANCE_EFFORTS[kind] the outing covered, by effort id
  times: Record<string, number>
  // Longest distance (m) covered in an hour of moving time, for cyclists who moved that long
  hour_m?: number
}

// Faster than this between two points is a GPS jump, not a move. The recorder already drops fixes past 45 m/s,
// which is far too fast for a runner.
const MAX_SPEED_MS: Record<SportKind, number> = { run: 9, walk: 5, ride: 25 }
// A step without moving time and longer than this is a move during a pause (a lift in a car, a train).
const MAX_STILL_STEP_M = 20
// Positions are averaged over this many points on each side: GPS zigzags lengthen a track, which would make it
// look faster. Averaging only ever shortens it.
const SMOOTHING_RADIUS = 2
const ANCHOR_M = 25

interface Piece {
  // Distance covered (m) and time spent moving (s) at each point
  along: number[]
  moving: number[]
}

// The track cut before every point where `breaks(i)` holds.
function splitAt(track: OutingTrackPoint[], breaks: (i: number) => boolean): OutingTrackPoint[][] {
  const stretches: OutingTrackPoint[][] = []
  let current: OutingTrackPoint[] = [track[0]!]
  for (let i = 1; i < track.length; i++) {
    if (breaks(i)) {
      stretches.push(current)
      current = []
    }
    current.push(track[i]!)
  }
  stretches.push(current)
  return stretches.filter(stretch => stretch.length >= 2)
}

const metersBetween = (from: LngLat, to: LngLat) => distance(from, to, { units: 'meters' })

// The stretches of track between moves during pauses and GPS jumps: no effort spans one. Jumps are found on
// the smoothed positions, where noise alone never goes that fast; each stretch is then smoothed on its own.
function pieces(track: OutingTrackPoint[], kind: SportKind): Piece[] {
  return splitAt(track, i => track[i]![4] <= track[i - 1]![4]
    && metersBetween([track[i - 1]![0], track[i - 1]![1]], [track[i]![0], track[i]![1]]) > MAX_STILL_STEP_M)
    .flatMap((stretch) => {
      const smoothed = smooth(stretch)
      return splitAt(stretch, (i) => {
        const elapsedS = stretch[i]![3] - stretch[i - 1]![3]
        const stepM = metersBetween(smoothed[i - 1]!, smoothed[i]!)
        return elapsedS > 0 ? stepM / elapsedS > MAX_SPEED_MS[kind] : stepM > 0
      })
    })
    .map(measure)
}

function smooth(stretch: OutingTrackPoint[]): LngLat[] {
  return stretch.map((_, i): LngLat => {
    const from = Math.max(0, i - SMOOTHING_RADIUS)
    const to = Math.min(stretch.length - 1, i + SMOOTHING_RADIUS)
    let lng = 0
    let lat = 0
    for (let j = from; j <= to; j++) {
      lng += stretch[j]![0]
      lat += stretch[j]![1]
    }
    return [lng / (to - from + 1), lat / (to - from + 1)]
  })
}

function measure(stretch: OutingTrackPoint[]): Piece {
  const smoothed = smooth(stretch)
  // Distances are measured between points ANCHOR_M apart: what noise is left across the track then adds next
  // to nothing.
  const along = [0]
  const moving = [stretch[0]![4]]
  let anchor = 0
  for (let i = 1; i < stretch.length; i++) {
    const stepM = metersBetween(smoothed[anchor]!, smoothed[i]!)
    if (stepM < ANCHOR_M && i < stretch.length - 1) continue
    // GPS drift while standing still adds steps without moving time: they cover no distance either.
    const moved = stretch[i]![4] > stretch[anchor]![4]
    along.push(along.at(-1)! + (moved ? stepM : 0))
    moving.push(stretch[i]![4])
    anchor = i
  }
  return { along, moving }
}

// Where `target` falls between values[j - 1] and values[j], as a fraction of the way.
function fraction(values: number[], j: number, target: number): number {
  const span = values[j]! - values[j - 1]!
  return span > 0 ? (target - values[j - 1]!) / span : 1
}

// Fastest moving time over `meters`, from any point of the piece: null when it is shorter.
function bestTime({ along, moving }: Piece, meters: number, maxSpeedMs: number): number | null {
  const total = along.at(-1)!
  let best = Infinity
  let j = 1
  for (let i = 0; i < along.length - 1 && along[i]! + meters <= total; i++) {
    const target = along[i]! + meters
    j = Math.max(j, i + 1)
    while (along[j]! < target) j++
    const end = moving[j - 1]! + (moving[j]! - moving[j - 1]!) * fraction(along, j, target)
    const time = end - moving[i]!
    // A window of steps without moving time could look impossibly fast.
    if (time > 0 && meters / time <= maxSpeedMs && time < best) best = time
  }
  return Number.isFinite(best) ? best : null
}

// Longest distance covered in `seconds` of moving time: null when the piece moved for less.
function bestDistance({ along, moving }: Piece, seconds: number, maxSpeedMs: number): number | null {
  const total = moving.at(-1)!
  let best = 0
  let j = 1
  for (let i = 0; i < moving.length - 1 && moving[i]! + seconds <= total; i++) {
    const target = moving[i]! + seconds
    j = Math.max(j, i + 1)
    while (moving[j]! < target) j++
    const meters = along[j - 1]! + (along[j]! - along[j - 1]!) * fraction(moving, j, target) - along[i]!
    if (meters / seconds <= maxSpeedMs && meters > best) best = meters
  }
  return best > 0 ? best : null
}

export function bestEfforts(track: OutingTrackPoint[], kind: SportKind): BestEfforts {
  const parts = track.length >= 2 ? pieces(track, kind) : []
  const maxSpeedMs = MAX_SPEED_MS[kind]
  const efforts: BestEfforts = { v: BEST_EFFORTS_VERSION, kind, times: {} }
  for (const { id, meters } of DISTANCE_EFFORTS[kind]) {
    const times = parts.map(part => bestTime(part, meters, maxSpeedMs)).filter(time => time !== null)
    if (times.length) efforts.times[id] = Math.round(Math.min(...times) * 10) / 10
  }
  if (HOUR_EFFORT_KINDS.includes(kind)) {
    const distances = parts.map(part => bestDistance(part, HOUR_S, maxSpeedMs)).filter(meters => meters !== null)
    if (distances.length) efforts.hour_m = Math.round(Math.max(...distances))
  }
  return efforts
}

// Whether stored best efforts can be used as they are for a route of this kind of sport.
export function bestEffortsAreFresh(stored: unknown, kind: SportKind): stored is BestEfforts {
  if (!stored || typeof stored !== 'object') return false
  const efforts = stored as Partial<BestEfforts>
  return efforts.v === BEST_EFFORTS_VERSION && efforts.kind === kind && typeof efforts.times === 'object'
}
