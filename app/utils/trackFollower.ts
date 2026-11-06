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
  // Climb and descent (m) counted when reaching each point, and gain and loss left from each point to the end,
  // when elevations are known
  climbs: number[] | null
  gainLeft: number[] | null
  descents: number[] | null
  lossLeft: number[] | null
  elevations: number[] | null
}

export interface TrackProgress {
  // Closest point of the track
  snapped: LngLat
  doneM: number
  remainingM: number
  remainingGainM: number | null
  remainingLossM: number | null
  // Elevation of the route at the closest point
  altitudeM: number | null
  // Distance between the position and the track
  offTrackM: number
}

export function buildTrackModel(coordinates: LngLat[], elevations: number[] | null): TrackModel {
  const along = [0]
  for (let i = 1; i < coordinates.length; i++) {
    along.push(along[i - 1]! + distance(coordinates[i - 1]!, coordinates[i]!, { units: 'meters' }))
  }

  const totalM = along.at(-1) ?? 0
  if (elevations?.length !== coordinates.length) {
    return { coordinates, along, totalM, climbs: null, gainLeft: null, descents: null, lossLeft: null, elevations: null }
  }
  const steps = elevationSteps(coordinates, elevations)
  const climbs = steps.map(step => Math.max(0, step))
  const descents = steps.map(step => Math.max(0, -step))
  return { coordinates, along, totalM, climbs, gainLeft: leftFrom(climbs), descents, lossLeft: leftFrom(descents), elevations }
}

// What is counted after each point, to the end.
function leftFrom(steps: number[]): number[] {
  const left = Array.from<number>({ length: steps.length }).fill(0)
  for (let i = steps.length - 2; i >= 0; i--) left[i] = left[i + 1]! + steps[i + 1]!
  return left
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
      remainingLossM: null,
      altitudeM: model.elevations?.[0] ?? null,
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

  // What is left of the current segment's climb or descent, plus everything after it.
  const left = (totals: number[] | null, steps: number[] | null) =>
    totals && steps ? totals[chosen.index + 1]! + steps[chosen.index + 1]! * (1 - chosen.t) : null
  const elevations = model.elevations
  return {
    snapped: chosen.snapped,
    doneM: chosen.alongM,
    remainingM: Math.max(0, model.totalM - chosen.alongM),
    remainingGainM: left(model.gainLeft, model.climbs),
    remainingLossM: left(model.lossLeft, model.descents),
    altitudeM: elevations
      ? elevations[chosen.index]! + (elevations[chosen.index + 1]! - elevations[chosen.index]!) * chosen.t
      : null,
    offTrackM: chosen.offTrackM,
  }
}
