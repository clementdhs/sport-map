import { distance } from '@turf/turf'
import { elevationSteps, type LngLat } from '#shared/utils/routes'

// Where a GPS position is on a route, for the "follow the route" mode.

// Beyond this distance from the track (or the GPS accuracy, when worse), the walker is off track.
export const OFF_TRACK_M = 50
// Segments passing within this distance of the best one are equally likely (e.g. both legs of an
// out-and-back): the one closest to the previous progress wins.
const AMBIGUITY_M = 25

export interface TrackModel {
  coordinates: LngLat[]
  // Distance from the start (m) at each point
  along: number[]
  totalM: number
  // Climb (m) counted when reaching each point, and gain left from each point to the end, when
  // elevations are known
  climbs: number[] | null
  gainLeft: number[] | null
}

export interface TrackProgress {
  // Closest point of the track
  snapped: LngLat
  doneM: number
  remainingM: number
  remainingGainM: number | null
  // Distance between the position and the track
  offTrackM: number
}

export function buildTrackModel(coordinates: LngLat[], elevations: number[] | null): TrackModel {
  const along = [0]
  for (let i = 1; i < coordinates.length; i++) {
    along.push(along[i - 1]! + distance(coordinates[i - 1]!, coordinates[i]!, { units: 'meters' }))
  }

  let climbs: number[] | null = null
  let gainLeft: number[] | null = null
  if (elevations?.length === coordinates.length) {
    climbs = elevationSteps(coordinates, elevations).map(step => Math.max(0, step))
    gainLeft = Array.from<number>({ length: climbs.length }).fill(0)
    for (let i = climbs.length - 2; i >= 0; i--) gainLeft[i] = gainLeft[i + 1]! + climbs[i + 1]!
  }
  return { coordinates, along, totalM: along.at(-1) ?? 0, climbs, gainLeft }
}

// Projection of `position` on each segment, in a local flat frame (meters): precise enough at the scale of
// a GPS fix, and much cheaper than geodesic computations on thousands of segments every few seconds.
function projections(model: TrackModel, [lng, lat]: LngLat) {
  const mPerDegLat = 110_574
  const mPerDegLng = 111_320 * Math.cos((lat * Math.PI) / 180)
  const toXY = ([pLng, pLat]: LngLat) => [(pLng - lng) * mPerDegLng, (pLat - lat) * mPerDegLat] as const

  return model.coordinates.slice(0, -1).map((start, i) => {
    const [ax, ay] = toXY(start)
    const [bx, by] = toXY(model.coordinates[i + 1]!)
    const dx = bx - ax
    const dy = by - ay
    const lengthSq = dx * dx + dy * dy
    // Position of the closest point on the segment, from 0 (start) to 1 (end); the position is the origin.
    const t = lengthSq ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq)) : 0
    const x = ax + t * dx
    const y = ay + t * dy
    const segmentM = model.along[i + 1]! - model.along[i]!
    return {
      index: i,
      t,
      offTrackM: Math.hypot(x, y),
      alongM: model.along[i]! + t * segmentM,
      snapped: [lng + x / mPerDegLng, lat + y / mPerDegLat] as LngLat,
    }
  })
}

// previousDoneM: progress at the previous fix, to follow the right leg where the track passes twice (loops,
// out-and-backs). Without it, the earliest passage wins.
export function locateOnTrack(model: TrackModel, position: LngLat, previousDoneM: number | null = null): TrackProgress {
  if (model.coordinates.length < 2) {
    const start = model.coordinates[0] ?? position
    return {
      snapped: start,
      doneM: 0,
      remainingM: 0,
      remainingGainM: null,
      offTrackM: distance(start, position, { units: 'meters' }),
    }
  }

  const all = projections(model, position)
  const best = Math.min(...all.map(p => p.offTrackM))
  // Each run of consecutive nearby segments is one passage of the track near the position: keep its closest
  // point, then pick the passage.
  type Projection = typeof all[number]
  const passages: Projection[] = []
  let previousIndex = -2
  for (const p of all.filter(p => p.offTrackM <= best + AMBIGUITY_M)) {
    const last = passages.at(-1)
    if (last && p.index === previousIndex + 1) {
      if (p.offTrackM < last.offTrackM) passages[passages.length - 1] = p
    }
    else passages.push(p)
    previousIndex = p.index
  }
  const score = (p: Projection) => (previousDoneM === null ? p.alongM : Math.abs(p.alongM - previousDoneM))
  const chosen = passages.reduce((a, b) => (score(b) < score(a) ? b : a))

  return {
    snapped: chosen.snapped,
    doneM: chosen.alongM,
    remainingM: Math.max(0, model.totalM - chosen.alongM),
    // What is left of the current segment's climb, plus everything after it.
    remainingGainM: model.gainLeft && model.climbs
      ? model.gainLeft[chosen.index + 1]! + model.climbs[chosen.index + 1]! * (1 - chosen.t)
      : null,
    offTrackM: chosen.offTrackM,
  }
}
