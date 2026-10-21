import * as z from 'zod'
import { coordinateSchema, type LngLat, MAX_ROUTE_POINTS, trackDistances } from './routes'

// Elevations of tracks that have none (#71: OpenStreetMap routes, GPX files without <ele>). The IGN's altimetry
// service (RGE ALTI, 1 to 5 m in France) gives every point in one request, but nothing outside France. The points it
// doesn't cover are asked to Open-Meteo (90 m model), which counts each point as a call (600 a minute, 10,000 a
// day): they are sampled, then the elevations are spread along the track. The discover page and the editor both
// compute a route's gain from the same points this way, so they show the same figure.

export interface ElevationSources {
  // One elevation per point, null where it has none (outside France). At most MAX_ROUTE_POINTS points.
  precise: (points: LngLat[]) => Promise<(number | null)[]>
  // At most FALLBACK_POINTS_PER_CALL points.
  fallback: (points: LngLat[]) => Promise<number[]>
}

// Points asked to the fallback at least this far apart, further on long stretches to stay well within its limits.
export const FALLBACK_SPACING_M = 100
export const MAX_FALLBACK_POINTS = 300
export const FALLBACK_POINTS_PER_CALL = 100

// Which of the points (given by their distance along the track) are asked: the first, the last, and the first
// point past every `spacing` meters in between. Aiming at regular distances rather than at the spacing from the
// last kept point keeps the number of samples close to the limit on long stretches.
export function elevationSampleIndices(along: number[], maxSamples = MAX_FALLBACK_POINTS, minSpacing = FALLBACK_SPACING_M): number[] {
  const last = along.length - 1
  if (last < 1) return last === 0 ? [0] : []
  const spacing = Math.max(minSpacing, (along[last]! - along[0]!) / (maxSamples - 1))
  const indices = [0]
  let target = along[0]! + spacing
  for (let i = 1; i < last; i++) {
    // Not too close to the end either, which is always kept.
    if (along[i]! >= target && along[last]! - along[i]! >= spacing / 2) {
      indices.push(i)
      // After a long gap between two points (a stretch in France between two abroad), the next targets start
      // again from this one.
      target = along[i]! - target > spacing ? along[i]! + spacing : target + spacing
    }
  }
  indices.push(last)
  return indices
}

const round1 = (value: number) => Math.round(value * 10) / 10

// Every point's elevation, to 10 cm: the known ones as they are, the others linear along the track between their
// known neighbours (the nearest one before the first or after the last).
export function fillElevations(along: number[], known: (number | null)[]): number[] {
  const filled: number[] = []
  let before = -1
  for (let i = 0; i < known.length; i++) {
    if (known[i] !== null) {
      before = i
      filled.push(round1(known[i]!))
      continue
    }
    let after = i + 1
    while (after < known.length && known[after] === null) after++
    const from = before >= 0 ? known[before]! : known[after]!
    const to = after < known.length ? known[after]! : from
    const span = before >= 0 && after < known.length ? along[after]! - along[before]! : 0
    const share = span > 0 ? (along[i]! - along[before]!) / span : 0
    filled.push(round1(from + share * (to - from)))
  }
  return filled
}

// OpenRouteService directions give an elevation of exactly 0 m where its terrain model has no data (#172: 27 points
// out of 1,157 on a mountain bike loop near Grenoble, 200 to 677 m high, whose D+ grew from a few hundred meters to
// 2,119 m). Those count as unknown and are filled from their known neighbours along the track; a track with no other
// elevation keeps its zeros.
export function withoutZeroElevations(coordinates: LngLat[], elevations: number[]): number[] {
  const known = elevations.map(elevation => elevation === 0 ? null : elevation)
  if (known.every(elevation => elevation !== null) || known.every(elevation => elevation === null)) return elevations
  return fillElevations(trackDistances(coordinates), known)
}

// Elevations of a track, one per point.
export async function trackElevationsFrom(coordinates: LngLat[], sources: ElevationSources): Promise<number[]> {
  const known = await sources.precise(coordinates)
  const missing = known.flatMap((elevation, i) => elevation === null ? [i] : [])
  const along = trackDistances(coordinates)
  if (missing.length) {
    const asked = elevationSampleIndices(missing.map(i => along[i]!)).map(k => missing[k]!)
    for (let k = 0; k < asked.length; k += FALLBACK_POINTS_PER_CALL) {
      const batch = asked.slice(k, k + FALLBACK_POINTS_PER_CALL)
      const answers = await sources.fallback(batch.map(i => coordinates[i]!))
      batch.forEach((i, n) => (known[i] = answers[n]!))
    }
  }
  return fillElevations(along, known)
}

export const trackElevationsSchema = z.object({
  coordinates: z.array(coordinateSchema).min(2).max(MAX_ROUTE_POINTS),
})

// Cached figures of the routes found (`ids`), whatever their version: the page compares it to the one it has.
export const MAX_OSM_ELEVATION_LOOKUP = 500

export const osmElevationLookupSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(MAX_OSM_ELEVATION_LOOKUP),
})

// A route's gain, from the same points as its import into the editor (`osmRouteTrack`).
export const osmElevationComputeSchema = trackElevationsSchema.extend({
  relation_id: z.number().int().positive(),
  version: z.number().int().positive(),
})
