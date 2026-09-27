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

// snap / straight: routed by the editor; imported: from a GPX file; locked: track of a route saved before the
// editor state was stored. imported and locked segments cannot be edited.
export const SEGMENT_MODES = ['snap', 'straight', 'imported', 'locked'] as const
export type SegmentMode = typeof SEGMENT_MODES[number]

// How the editor built the track, so a saved route can be edited again. Each segment covers
// coordinates[start..end] of the saved track (consecutive segments usually share their junction point).
export const editorStateSchema = z.object({
  waypoints: z.array(coordinateSchema).max(MAX_ROUTE_POINTS),
  segments: z.array(z.object({
    mode: z.enum(SEGMENT_MODES),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
  })).max(MAX_ROUTE_POINTS),
}).refine(state => state.segments.length === Math.max(0, state.waypoints.length - 1), {
  message: 'Il doit y avoir un segment entre chaque paire de points',
})

export type EditorState = z.infer<typeof editorStateSchema>

export const routeCreateSchema = routeDetailsSchema.extend({
  coordinates: z.array(coordinateSchema)
    .min(2, 'Un parcours doit contenir au moins 2 points')
    .max(MAX_ROUTE_POINTS, `${MAX_ROUTE_POINTS} points maximum`),
  // One elevation per coordinate, in meters.
  elevations: z.array(z.number().min(-500).max(9000)).optional(),
  source: z.enum(['drawn', 'gpx_import']).default('drawn'),
  editor_state: editorStateSchema.optional(),
}).refine(route => !route.elevations || route.elevations.length === route.coordinates.length, {
  message: 'Il doit y avoir une altitude par point',
  path: ['elevations'],
}).refine(route => !route.editor_state || route.editor_state.segments.every(segment =>
  segment.start <= segment.end && segment.end < route.coordinates.length), {
  message: "L'état de l'éditeur ne correspond pas au tracé",
  path: ['editor_state'],
})

export type RouteDetails = z.infer<typeof routeDetailsSchema>
export type RouteCreatePayload = z.infer<typeof routeCreateSchema>

export const ACTIVITY_TYPES = ['saved', 'completed'] as const
export type ActivityType = typeof ACTIVITY_TYPES[number]

export const profileUpdateSchema = z.object({
  display_name: z.string().trim().max(60, '60 caractères maximum'),
  bio: z.string().trim().max(500, '500 caractères maximum'),
})

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>

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
