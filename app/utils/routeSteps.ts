import { type LngLat, snapToTrack, trackDistances } from '#shared/utils/routes'

// The steps of the route page (#233): the author's points of interest in the order they come along the track,
// with where one passes them and the climbing done by then, for a passing time from the paces (#146).
export type RouteStep<T> = T & {
  // Metres along the track
  distanceM: number
  // Metres climbed from the start, null when the route has no climbing figure
  gainM: number | null
}

// The climbing from the start at each point of the track, scaled so that it ends on the route's stored gain
// (raw sums of elevation differences run higher than the smoothed figure the cartouche shows). Without
// elevations, the gain is spread evenly along the distance.
export function gainAlong(along: number[], elevations: number[] | null | undefined, totalGainM: number | null): (number | null)[] {
  if (totalGainM == null) return along.map(() => null)
  const totalM = along.at(-1) ?? 0
  if (!elevations || elevations.length !== along.length) {
    return along.map(m => (totalM ? (totalGainM * m) / totalM : 0))
  }
  const raw = [0]
  for (let i = 1; i < elevations.length; i++) raw.push(raw[i - 1]! + Math.max(0, elevations[i]! - elevations[i - 1]!))
  const rawTotal = raw.at(-1)!
  return raw.map(value => (rawTotal ? (value / rawTotal) * totalGainM : 0))
}

export function routeSteps<T extends { coordinates: LngLat }>(
  coordinates: LngLat[],
  elevations: number[] | null | undefined,
  totalGainM: number | null,
  points: T[],
): RouteStep<T>[] {
  if (coordinates.length < 2) return []
  const along = trackDistances(coordinates)
  const gains = gainAlong(along, elevations, totalGainM)
  return points
    .map((point) => {
      const { distanceM } = snapToTrack(coordinates, point.coordinates)
      return { ...point, distanceM, gainM: valueAt(along, gains, distanceM) }
    })
    .sort((a, b) => a.distanceM - b.distanceM)
}

// `values` (one per track point) at `meters` along the track, linearly between two points.
function valueAt(along: number[], values: (number | null)[], meters: number): number | null {
  let i = along.findIndex(m => m >= meters)
  if (i < 0) i = along.length - 1
  if (i === 0) return values[0] ?? null
  const [m0, m1, v0, v1] = [along[i - 1]!, along[i]!, values[i - 1], values[i]]
  if (v0 == null || v1 == null) return null
  const ratio = m1 > m0 ? Math.min(1, Math.max(0, (meters - m0) / (m1 - m0))) : 1
  return v0 + (v1 - v0) * ratio
}

// useFetch key of a route's reviews, shared by the Avis tab and the overview's quotes (#233).
export function routeReviewsKey(routeId: string): string {
  return `route-reviews-${routeId}`
}
