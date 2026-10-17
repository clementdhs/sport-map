import { distance, lineString, nearestPointOnLine } from '@turf/turf'
import * as z from 'zod'
import { USERNAME_PATTERN } from './auth'

export type LngLat = [lng: number, lat: number]

// 'running' is road running and 'cycling' leisure cycling: both kept their value from before the other sports
// existed, so routes saved then didn't need migrating.
export const SPORT_TYPES = ['running', 'trail', 'hiking', 'cycling', 'road_cycling', 'mountain_biking'] as const
export type SportType = typeof SPORT_TYPES[number]

export const SPORT_ICONS: Record<SportType, string> = {
  running: 'i-lucide-footprints',
  trail: 'i-lucide-mountain-snow',
  hiking: 'i-lucide-mountain',
  cycling: 'i-lucide-bike',
  road_cycling: 'i-lucide-gauge',
  mountain_biking: 'i-lucide-trees',
}

// The OpenRouteService profile each sport is routed with. Trail and hiking share theirs: switching between them
// leaves the editor's track as it is.
export const ROUTING_PROFILES: Record<SportType, string> = {
  running: 'foot-walking',
  trail: 'foot-hiking',
  hiking: 'foot-hiking',
  cycling: 'cycling-regular',
  road_cycling: 'cycling-road',
  mountain_biking: 'cycling-mountain',
}

// How a sport moves: runners follow their pace, cyclists their speed.
export type SportKind = 'run' | 'walk' | 'ride'

export const SPORT_KINDS: Record<SportType, SportKind> = {
  running: 'run',
  trail: 'run',
  hiking: 'walk',
  cycling: 'ride',
  road_cycling: 'ride',
  mountain_biking: 'ride',
}

// Estimated moving time. Elevation gain is ignored when unknown.
// - running, trail: "km-effort" (100 m of gain = 1 km), at 6 min/km on the road and 8 min/km on trails
// - hiking: Naismith's rule, 5 km/h plus 1 h per 600 m of gain
// - cycling: 15 km/h plus 1 h per 500 m of gain; road cycling 25 km/h plus 1 h per 600 m; mountain biking
//   12 km/h plus 1 h per 500 m
export function estimateDurationMin(sport: SportType, distanceM: number, elevationGainM: number | null): number {
  const km = distanceM / 1000
  const gain = elevationGainM ?? 0
  switch (sport) {
    case 'running': return (km + gain / 100) * 6
    case 'trail': return (km + gain / 100) * 8
    case 'hiking': return (km / 5) * 60 + (gain / 600) * 60
    case 'cycling': return (km / 15) * 60 + (gain / 500) * 60
    case 'road_cycling': return (km / 25) * 60 + (gain / 600) * 60
    case 'mountain_biking': return (km / 12) * 60 + (gain / 500) * 60
  }
}

export const MAX_ROUTE_POINTS = 5000

export const coordinateSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
])

export const routeDetailsSchema = z.object({
  name: z.string().trim().min(1, 'validation.nameRequired').max(120, 'validation.maxChars'),
  description: z.string().trim().max(2000, 'validation.maxChars').optional(),
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
  message: 'validation.segmentsMismatch',
})

export type EditorState = z.infer<typeof editorStateSchema>

// Points of interest placed on the track.
export const POI_TYPES = ['water', 'viewpoint', 'parking', 'danger'] as const
export type PoiType = typeof POI_TYPES[number]

export const POI_ICONS: Record<PoiType, string> = {
  water: 'i-lucide-droplet',
  viewpoint: 'i-lucide-binoculars',
  parking: 'i-lucide-square-parking',
  danger: 'i-lucide-triangle-alert',
}

export const POI_COLORS: Record<PoiType, string> = {
  water: '#0284c7',
  viewpoint: '#7c3aed',
  parking: '#475569',
  danger: '#dc2626',
}

export const MAX_POIS = 50
export const MAX_POI_NOTE_LENGTH = 140

export const poiSchema = z.object({
  type: z.enum(POI_TYPES),
  coordinates: coordinateSchema,
  note: z.string().trim().max(MAX_POI_NOTE_LENGTH, 'validation.maxChars').optional(),
})

export type Poi = z.infer<typeof poiSchema>

// What OpenRouteService knows of the ways along the parts of a track snapped to paths ("extra info"): ranges
// [start, end, value] of point indices, where consecutive ranges share their boundary point. Trail difficulty
// comes on the SAC scale from walking profiles and on the MTB scale from cycling ones. Values and classes are
// in shared/utils/wayInfo.ts.
export type WayRange = [start: number, end: number, value: number]

const wayRangesSchema = z.array(z.tuple([
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(0).max(99),
])).max(MAX_ROUTE_POINTS)

export const wayInfoSchema = z.object({
  surface: wayRangesSchema,
  waytype: wayRangesSchema,
  sac_scale: wayRangesSchema,
  mtb_scale: wayRangesSchema,
})

export type WayInfo = z.infer<typeof wayInfoSchema>

// drawn in the editor, imported from a GPX file, or recorded with the phone's GPS
export const ROUTE_SOURCES = ['drawn', 'gpx_import', 'recorded'] as const
export type RouteSource = typeof ROUTE_SOURCES[number]

export const routeCreateSchema = routeDetailsSchema.extend({
  coordinates: z.array(coordinateSchema)
    .min(2, 'Un parcours doit contenir au moins 2 points')
    .max(MAX_ROUTE_POINTS, `${MAX_ROUTE_POINTS} points maximum`),
  // One elevation per coordinate, in meters.
  elevations: z.array(z.number().min(-500).max(9000)).optional(),
  source: z.enum(ROUTE_SOURCES).default('drawn'),
  editor_state: editorStateSchema.optional(),
  pois: z.array(poiSchema).max(MAX_POIS, 'validation.maxPois').optional(),
  way_info: wayInfoSchema.optional(),
}).refine(route => !route.elevations || route.elevations.length === route.coordinates.length, {
  message: 'validation.elevationsMismatch',
  path: ['elevations'],
}).refine(route => !route.editor_state || route.editor_state.segments.every(segment =>
  segment.start <= segment.end && segment.end < route.coordinates.length), {
  message: 'validation.editorMismatch',
  path: ['editor_state'],
}).refine(route => !route.way_info || Object.values(route.way_info).every(ranges => ranges.every(([start, end]) =>
  start <= end && end < route.coordinates.length)), {
  message: 'validation.wayInfoMismatch',
  path: ['way_info'],
})

export type RouteDetails = z.infer<typeof routeDetailsSchema>
export type RouteCreatePayload = z.infer<typeof routeCreateSchema>

export const ACTIVITY_TYPES = ['saved', 'completed'] as const
export type ActivityType = typeof ACTIVITY_TYPES[number]

export const profileUpdateSchema = z.object({
  username: z.string().trim().regex(USERNAME_PATTERN, 'validation.usernameFormat'),
  display_name: z.string().trim().max(60, 'validation.maxChars'),
  bio: z.string().trim().max(500, 'validation.maxChars'),
})

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>

export const MAX_SEARCH_RESULTS = 50

export const SEARCH_SORTS = ['nearest', 'recent', 'shortest', 'longest', 'best_rated'] as const
export type SearchSort = typeof SEARCH_SORTS[number]

export const routeSearchSchema = z.object({
  minLng: z.coerce.number().min(-180).max(180),
  minLat: z.coerce.number().min(-90).max(90),
  maxLng: z.coerce.number().min(-180).max(180),
  maxLat: z.coerce.number().min(-90).max(90),
  sport: z.enum(SPORT_TYPES).optional(),
  minKm: z.coerce.number().min(0).optional(),
  maxKm: z.coerce.number().min(0).optional(),
  minGain: z.coerce.number().min(0).optional(),
  maxGain: z.coerce.number().min(0).optional(),
  // "true" / "false" in the query string (z.coerce.boolean would read "false" as true).
  loops: z.stringbool().optional(),
  // Routes whose track crosses the view, not only those starting in it.
  through: z.stringbool().optional(),
  sort: z.enum(SEARCH_SORTS).default('nearest'),
  // Words of the name or description, wherever the route is: the view then only serves the "nearest" sort.
  q: z.string().trim().max(100).optional(),
})

// Shorter texts would match too many routes to be useful.
export const MIN_SEARCH_TEXT_LENGTH = 2

export type RouteSearchQuery = z.input<typeof routeSearchSchema>

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
  // Ways along a snapped segment, indexed in its coordinates
  way_info?: WayInfo
  // Routing requests the user has left today.
  quota_remaining?: number
}

// Automatic loops (#50), OpenRouteService round trips: 100 km at most.
export const LOOP_MIN_M = 1000
export const LOOP_MAX_M = 100_000

export const routingLoopSchema = z.object({
  start: coordinateSchema,
  length_m: z.number().int().min(LOOP_MIN_M).max(LOOP_MAX_M),
  sport_type: z.enum(SPORT_TYPES),
  // Picks the loop's direction: one seed per proposal.
  seed: z.number().int().min(0).max(1_000_000),
})

export type RoutingLoopRequest = z.infer<typeof routingLoopSchema>

export type RoutingLoopResponse = {
  coordinates: LngLat[]
  elevations: number[]
  way_info?: WayInfo
  quota_remaining: number
}

// Reason given with the 429 of /api/routing/segment once the user's daily quota is used up (a 429 without
// it is OpenRouteService's own per-minute limit).
export const ROUTING_QUOTA_REASON = 'daily_quota'

// The editor warns when this few requests are left.
export const ROUTING_QUOTA_WARNING = 30

// The elevation model (SRTM) has spikes of tens of meters around bridges and valley floors: summing raw
// values inflated gains by about 20% on test routes. Averaging over a distance window, then ignoring small
// variations, removes most of it without flattening real climbs.
const SMOOTHING_WINDOW_M = 100
const ELEVATION_NOISE_M = 3

// Distance from the start (m) at each point of a track.
export function trackDistances(coordinates: LngLat[]): number[] {
  const along = [0]
  for (let i = 1; i < coordinates.length; i++) {
    along.push(along[i - 1]! + distance(coordinates[i - 1]!, coordinates[i]!, { units: 'meters' }))
  }
  return along
}

export function smoothByDistance(coordinates: LngLat[], elevations: number[]): number[] {
  const along = trackDistances(coordinates)
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

// The climb (> 0) or descent (< 0) counted at each point, 0 where the variation is too small to count.
// Summing the positive ones from a point on gives the gain left from there.
export function elevationSteps(coordinates: LngLat[], elevations: number[]): number[] {
  const smoothed = smoothByDistance(coordinates, elevations)
  let reference = smoothed[0] ?? 0
  return smoothed.map((elevation) => {
    const delta = elevation - reference
    if (Math.abs(delta) < ELEVATION_NOISE_M) return 0
    reference = elevation
    return delta
  })
}

export function elevationStats(coordinates: LngLat[], elevations: number[]): { gain: number, loss: number } {
  let gain = 0
  let loss = 0
  for (const step of elevationSteps(coordinates, elevations)) {
    if (step > 0) gain += step
    else loss -= step
  }
  return { gain, loss }
}

// The point of the track closest to `point`, and how far along the track it is.
export function snapToTrack(track: LngLat[], point: LngLat): { coordinates: LngLat, distanceM: number } {
  const snapped = nearestPointOnLine(lineString(track), point, { units: 'meters' })
  const [lng, lat] = snapped.geometry.coordinates as LngLat
  // ~10 cm precision, like the rest of the track.
  const round = (value: number) => Math.round(value * 1e6) / 1e6
  return { coordinates: [round(lng), round(lat)], distanceM: snapped.properties.totalDistance }
}

// Photos are resized and compressed in the browser before upload (the free storage quota is 1 GB).
export const MAX_ROUTE_PHOTOS = 10
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024
export const PHOTO_MAX_SIDE_PX = 1600
export const PHOTO_TYPES = ['image/webp', 'image/jpeg'] as const
export type PhotoType = typeof PHOTO_TYPES[number]

export const MAX_REVIEW_COMMENT_LENGTH = 1000

// A user's rating (1 to 5 stars) and optional comment on someone else's route.
export const reviewSchema = z.object({
  rating: z.number().int().min(1, 'validation.chooseRating').max(5),
  comment: z.string().trim().max(MAX_REVIEW_COMMENT_LENGTH, 'validation.maxChars').optional(),
})

export type ReviewInput = z.infer<typeof reviewSchema>

// The times of an outing recorded with the GPS (s): duration_s is the elapsed time, pauses included; moving_s
// only counts time spent moving. distance_m is the distance covered according to the GPS.
const outingFields = {
  started_at: z.iso.datetime({ offset: true }),
  duration_s: z.number().int().min(0).max(7 * 24 * 3600),
  moving_s: z.number().int().min(0),
  distance_m: z.number().min(0).max(2_000_000),
}
const movingWithinDuration = (outing: { duration_s: number, moving_s: number }) => outing.moving_s <= outing.duration_s
const movingExceedsDuration = { message: 'validation.movingExceedsDuration', path: ['moving_s'] }

// One GPS point of an outing: position, GPS altitude (m, null when the phone gives none), time since the start
// (s, pauses included) and time spent moving so far (s), from which its splits and speed are worked out.
export type OutingTrackPoint = [lng: number, lat: number, altitude: number | null, elapsedS: number, movingS: number]

// About 3 h of cycling with a fix every second; longer outings are thinned out.
export const MAX_OUTING_POINTS = 10_000

const outingTrackSchema = z.array(z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
  z.number().min(-500).max(9000).nullable(),
  z.number().min(0),
  z.number().min(0),
])).min(2).max(MAX_OUTING_POINTS)

// Optional: pages loaded before the track was kept, and drafts recorded by them, send times only.
const outingTrackField = { track: outingTrackSchema.optional() }

// An outing recorded on an existing route, while following it.
export const outingSchema = z.object({ ...outingFields, ...outingTrackField }).refine(movingWithinDuration, movingExceedsDuration)

export type OutingPayload = z.infer<typeof outingSchema>

// An outing recorded from /record: its track, saved as a new route, and its times and GPS points. distance_m is
// optional for pages loaded before it existed (the route's distance is used instead).
export const recordingSchema = z.object({
  route: routeCreateSchema,
  ...outingFields,
  ...outingTrackField,
  distance_m: outingFields.distance_m.optional(),
}).refine(movingWithinDuration, movingExceedsDuration)

export type RecordingPayload = z.infer<typeof recordingSchema>
