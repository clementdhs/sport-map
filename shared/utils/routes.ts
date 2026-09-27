import { distance } from '@turf/turf'
import * as z from 'zod'

export type LngLat = [lng: number, lat: number]

export const SPORT_TYPES = ['running', 'hiking', 'cycling'] as const
export type SportType = typeof SPORT_TYPES[number]

export const SPORT_LABELS: Record<SportType, string> = {
  running: 'Course à pied',
  hiking: 'Randonnée',
  cycling: 'Vélo',
}

export const SPORT_ICONS: Record<SportType, string> = {
  running: 'i-lucide-footprints',
  hiking: 'i-lucide-mountain',
  cycling: 'i-lucide-bike',
}

export const MAX_ROUTE_POINTS = 5000

const coordinateSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
])

export const routeDetailsSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(120, '120 caractères maximum'),
  description: z.string().trim().max(2000, '2000 caractères maximum').optional(),
  sport_type: z.enum(SPORT_TYPES),
  is_public: z.boolean(),
})

export const routeCreateSchema = routeDetailsSchema.extend({
  coordinates: z.array(coordinateSchema)
    .min(2, 'Un parcours doit contenir au moins 2 points')
    .max(MAX_ROUTE_POINTS, `${MAX_ROUTE_POINTS} points maximum`),
  // One elevation per coordinate, in meters.
  elevations: z.array(z.number().min(-500).max(9000)).optional(),
  source: z.enum(['drawn', 'gpx_import']).default('drawn'),
}).refine(route => !route.elevations || route.elevations.length === route.coordinates.length, {
  message: 'Il doit y avoir une altitude par point',
  path: ['elevations'],
})

export type RouteDetails = z.infer<typeof routeDetailsSchema>
export type RouteCreatePayload = z.infer<typeof routeCreateSchema>

export const MAX_SEARCH_RESULTS = 50

export const routeSearchSchema = z.object({
  minLng: z.coerce.number().min(-180).max(180),
  minLat: z.coerce.number().min(-90).max(90),
  maxLng: z.coerce.number().min(-180).max(180),
  maxLat: z.coerce.number().min(-90).max(90),
  sport: z.enum(SPORT_TYPES).optional(),
  minKm: z.coerce.number().min(0).optional(),
  maxKm: z.coerce.number().min(0).optional(),
})

export type RouteSearchQuery = z.infer<typeof routeSearchSchema>

export const ROUTING_MODES = ['snap', 'straight'] as const
export type RoutingMode = typeof ROUTING_MODES[number]

export const routingSegmentSchema = z.object({
  from: coordinateSchema,
  to: coordinateSchema,
  mode: z.enum(ROUTING_MODES),
  sport_type: z.enum(SPORT_TYPES),
})

export type RoutingSegmentRequest = z.infer<typeof routingSegmentSchema>

export type RoutingSegmentResponse = {
  coordinates: LngLat[]
  elevations: number[]
  // false when snapping was requested but no path was found, so a straight line was used instead
  snapped: boolean
}

// The elevation model (SRTM) has spikes of tens of meters around bridges and valley floors: summing raw
// values inflated gains by about 20% on test routes. Averaging over a distance window, then ignoring small
// variations, removes most of it without flattening real climbs.
const SMOOTHING_WINDOW_M = 100
const ELEVATION_NOISE_M = 3

function smoothByDistance(coordinates: LngLat[], elevations: number[]): number[] {
  const along = [0]
  for (let i = 1; i < coordinates.length; i++) {
    along.push(along[i - 1]! + distance(coordinates[i - 1]!, coordinates[i]!, { units: 'meters' }))
  }
  const half = SMOOTHING_WINDOW_M / 2
  let start = 0
  let end = 0
  let sum = 0
  return elevations.map((_, i) => {
    while (end < elevations.length && along[end]! <= along[i]! + half) sum += elevations[end++]!
    while (along[start]! < along[i]! - half) sum -= elevations[start++]!
    return sum / (end - start)
  })
}

export function elevationStats(coordinates: LngLat[], elevations: number[]): { gain: number, loss: number } {
  const smoothed = smoothByDistance(coordinates, elevations)
  let gain = 0
  let loss = 0
  let reference = smoothed[0] ?? 0
  for (const elevation of smoothed) {
    const delta = elevation - reference
    if (delta >= ELEVATION_NOISE_M) {
      gain += delta
      reference = elevation
    }
    else if (delta <= -ELEVATION_NOISE_M) {
      loss -= delta
      reference = elevation
    }
  }
  return { gain, loss }
}
