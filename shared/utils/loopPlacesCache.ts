import { distance } from '@turf/turf'
import * as z from 'zod'
import { LOOP_VIA_TYPES, NAMED_PLACE_KINDS, type LoopViaType, type NamedPlace, namedPlaceCore, VIA_SEARCH_MAX_M } from './loops'
import { namedPlaceSources } from './namedPlaces'
import { osmPlaceSchema } from './osmPlaces'
import { coordinateSchema, type LngLat } from './routes'

// Overpass answers kept for the loop panel (#311, table loop_place_searches): the peaks and water points around a
// start (#214) and the places of a name (#293, #310). The same starts come back (home, the club), and Overpass is
// often busy or down. A search is made around the centre of a cell of the grid, so that every start in that cell
// shares it, then measured from the actual start.

// Cells of 0.02° (2.2 km north–south, 1.6 km east–west around 45° N).
export const LOOP_PLACES_CELL_DEG = 0.02
// A cell's centre is at most this far from any start in it (its half diagonal at the equator, 1.57 km).
const CELL_REACH_M = 1600
// Peaks and water points are searched this far around the cell centre: whatever the start in the cell, its
// VIA_SEARCH_MAX_M reach is covered. pickLoopVia then keeps those within the loop's own radius from the start.
export const LOOP_VIA_CACHE_RADIUS_M = VIA_SEARCH_MAX_M + CELL_REACH_M
export const LOOP_PLACES_TTL_DAYS = 30
// More than that is not kept (a big town's fountains): the next search asks Overpass again.
export const MAX_LOOP_CACHED_PLACES = 2000

export type LoopPlacesSearch = { kind: LoopViaType } | { kind: 'named', name: string, language: string }

function cellIndex(degrees: number): number {
  return Math.floor(degrees / LOOP_PLACES_CELL_DEG)
}

// The centre of the start's cell, where its searches are made.
export function loopPlacesCell([lng, lat]: LngLat): LngLat {
  const centre = (index: number) => Math.round((index + 0.5) * LOOP_PLACES_CELL_DEG * 1e6) / 1e6
  return [centre(cellIndex(lng)), centre(cellIndex(lat))]
}

// The kind of search, the name's core (#293) and language for a named place, then the cell. Null for a place said
// by its kind only (« le lac »), which is never searched.
export function loopPlacesCacheKey(search: LoopPlacesSearch, [lng, lat]: LngLat): string | null {
  const cell = `${cellIndex(lng)}:${cellIndex(lat)}`
  if (search.kind !== 'named') return `${search.kind}:${cell}`
  const core = namedPlaceCore(search.name)
  if (!core) return null
  // « village Chartreuse » only asks MapTiler, « massif de la Chartreuse » only OpenStreetMap: not the same answer.
  return `named:${search.language}:${namedPlaceSources(search.name).join('+')}:${core}:${cell}`
}

export function isLoopPlacesFresh(fetchedAt: string, now = Date.now()): boolean {
  const time = Date.parse(fetchedAt)
  return Number.isFinite(time) && now - time < LOOP_PLACES_TTL_DAYS * 24 * 3600_000
}

// Places of a name found from the cell centre, measured again from the start (pickNamedPlace compares distances).
export function namedPlacesFromCell(places: NamedPlace[], start: LngLat): NamedPlace[] {
  return places.map(place => ({ ...place, distanceM: Math.round(distance(start, place.coordinates, { units: 'meters' })) }))
}

// At most MAX_LOOP_CACHED_PLACES, the nearest to the cell centre (a big town's fountains), so the answer is kept:
// the loop's own radius only ever keeps the nearer ones.
export function nearestLoopPlaces<T extends { coordinates: LngLat }>(places: T[], centre: LngLat): T[] {
  if (places.length <= MAX_LOOP_CACHED_PLACES) return places
  const metres = (place: T) => distance(centre, place.coordinates, { units: 'meters' })
  return places.map(place => ({ place, m: metres(place) })).sort((a, b) => a.m - b.m)
    .slice(0, MAX_LOOP_CACHED_PLACES).map(({ place }) => place)
}

export const namedPlaceSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  kind: z.enum(NAMED_PLACE_KINDS),
  coordinates: coordinateSchema,
  distanceM: z.number().int().min(0),
})

const viaSearchSchema = z.object({ kind: z.enum(LOOP_VIA_TYPES) })
const namedSearchSchema = z.object({
  kind: z.literal('named'),
  name: z.string().trim().min(1).max(200),
  language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
})

// POST /api/loops/places/lookup
export const loopPlacesLookupSchema = z.object({
  search: z.discriminatedUnion('kind', [viaSearchSchema, namedSearchSchema]),
  start: coordinateSchema,
})

// POST /api/loops/places: peaks and water points are OsmPlaces, named places NamedPlaces.
export const loopPlacesSaveSchema = z.union([
  z.object({ search: viaSearchSchema, start: coordinateSchema, places: z.array(osmPlaceSchema).max(MAX_LOOP_CACHED_PLACES) }),
  z.object({ search: namedSearchSchema, start: coordinateSchema, places: z.array(namedPlaceSchema).max(MAX_LOOP_CACHED_PLACES) }),
])
