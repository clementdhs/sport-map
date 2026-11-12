import { distance, lineString, simplify } from '@turf/turf'
import * as z from 'zod'
import { coordinateSchema, type LngLat, snapToTrack } from './routes'

// Useful places near a route (#52), found in OpenStreetMap through Overpass: drinking water, huts and shelters,
// parkings, toilets and peaks within OSM_PLACES_RADIUS_M of the track. The browser asks Overpass once, then saves
// the answer with the route (route_osm_places) for the route page and follow mode.

export const OSM_PLACE_TYPES = ['water', 'hut', 'shelter', 'parking', 'toilets', 'peak'] as const
export type OsmPlaceType = typeof OSM_PLACE_TYPES[number]

export const OSM_PLACE_ICONS: Record<OsmPlaceType, string> = {
  water: 'i-lucide-droplet',
  hut: 'i-lucide-house',
  shelter: 'i-lucide-tent',
  parking: 'i-lucide-square-parking',
  toilets: 'i-lucide-toilet',
  peak: 'i-lucide-mountain',
}

export const OSM_PLACES_RADIUS_M = 200
// A town crossed by the route can hold dozens of parkings: the nearest ones are kept.
export const MAX_OSM_PLACES = 300
const MAX_NAME_LENGTH = 120

export const osmPlaceSchema = z.object({
  // OSM element: n, w or r, then its id.
  id: z.string().regex(/^[nwr]\d{1,15}$/),
  type: z.enum(OSM_PLACE_TYPES),
  coordinates: coordinateSchema,
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
  // Elevation of a peak (m), from its `ele` tag.
  ele: z.number().int().min(-500).max(9000).optional(),
})

export type OsmPlace = z.infer<typeof osmPlaceSchema>

// PUT /api/routes/:id/osm-places
export const osmPlacesPayloadSchema = z.object({
  places: z.array(osmPlaceSchema).max(MAX_OSM_PLACES),
})

export interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  // Ways and relations (areas: parkings, huts mapped as buildings), with `out center`
  center?: { lat: number, lon: number }
  tags?: Record<string, string>
}

const NO_ACCESS = new Set(['private', 'no', 'customers', 'permit', 'delivery'])
// Bus stops and shelters for cattle are no help on a hike.
const IGNORED_SHELTERS = new Set(['public_transport', 'field_shelter'])
// Parking lanes along streets are many in towns, and are not where one leaves a car for an outing.
const IGNORED_PARKINGS = new Set(['street_side', 'lane'])
const WATER_SOURCES: [key: string, values: string[]][] = [
  ['amenity', ['fountain']],
  ['man_made', ['water_tap', 'water_well']],
  ['natural', ['spring']],
]

// What a place is for the app, or null when it is none of the useful places (or not open to all).
export function osmPlaceType(tags: Record<string, string>): OsmPlaceType | null {
  if (NO_ACCESS.has(tags.access ?? '')) return null
  if (tags.tourism === 'alpine_hut' || tags.tourism === 'wilderness_hut') return 'hut'
  if (tags.amenity === 'shelter') return IGNORED_SHELTERS.has(tags.shelter_type ?? '') ? null : 'shelter'
  if (tags.amenity === 'toilets') return 'toilets'
  if (tags.amenity === 'parking') return IGNORED_PARKINGS.has(tags.parking ?? '') ? null : 'parking'
  if (tags.natural === 'peak') return 'peak'
  if (tags.drinking_water === 'no') return null
  if (tags.amenity === 'drinking_water') return 'water'
  if (tags.drinking_water === 'yes' && WATER_SOURCES.some(([key, values]) => values.includes(tags[key] ?? ''))) return 'water'
  return null
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6

// `ele` is in metres, sometimes written with a unit, spaces or a decimal comma.
function parseEle(ele: string | undefined): number | undefined {
  const value = Number.parseFloat((ele ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(value) && value >= -500 && value <= 9000 ? Math.round(value) : undefined
}

export function toOsmPlace(element: OverpassElement): OsmPlace | null {
  const tags = element.tags ?? {}
  const type = osmPlaceType(tags)
  const lat = element.lat ?? element.center?.lat
  const lon = element.lon ?? element.center?.lon
  if (!type || lat === undefined || lon === undefined) return null
  const name = tags.name?.trim().slice(0, MAX_NAME_LENGTH)
  const ele = type === 'peak' ? parseEle(tags.ele) : undefined
  return {
    id: `${element.type[0]}${element.id}`,
    type,
    coordinates: [round6(lon), round6(lat)],
    ...(name ? { name } : {}),
    ...(ele !== undefined ? { ele } : {}),
  }
}

// The same place mapped twice (a node and its area, two taps of one fountain): one is enough.
const SAME_PLACE_M = 20

// The places found, without duplicates, the MAX_OSM_PLACES nearest to the track if there are more.
export function osmPlacesFrom(elements: OverpassElement[], track: LngLat[]): OsmPlace[] {
  const kept: OsmPlace[] = []
  for (const element of elements) {
    const place = toOsmPlace(element)
    if (!place) continue
    const twin = kept.findIndex(other => other.id === place.id
      || (other.type === place.type && distance(other.coordinates, place.coordinates, { units: 'meters' }) < SAME_PLACE_M))
    if (twin >= 0) {
      // Keep the named one.
      if (!kept[twin]!.name && place.name) kept[twin] = place
      continue
    }
    kept.push(place)
  }
  // Snapping to the whole track costs: only when some must go.
  if (kept.length <= MAX_OSM_PLACES) return kept
  return kept
    .map(place => ({ place, offsetM: placeOnTrack(track, place.coordinates).offsetM }))
    .sort((a, b) => a.offsetM - b.offsetM)
    .slice(0, MAX_OSM_PLACES)
    .map(({ place }) => place)
}

// How far along the track a place comes (m), and how far from it.
export function placeOnTrack(track: LngLat[], point: LngLat): { alongM: number, offsetM: number } {
  const snapped = snapToTrack(track, point)
  return { alongM: snapped.distanceM, offsetM: distance(snapped.coordinates, point, { units: 'meters' }) }
}

export type PlacedOsmPlace = OsmPlace & { alongM: number, offsetM: number }

// In the order they come along the track.
export function placesAlongTrack(track: LngLat[], places: OsmPlace[]): PlacedOsmPlace[] {
  if (track.length < 2) return []
  return places
    .map(place => ({ ...place, ...placeOnTrack(track, place.coordinates) }))
    .sort((a, b) => a.alongM - b.alongM)
}

// The track sent to Overpass: simplified (~10 m, nothing next to a 200 m radius), and further for long routes so
// that the query stays small.
const LINE_TOLERANCE = 0.0001
const MAX_LINE_POINTS = 800

export function queryLine(track: LngLat[]): LngLat[] {
  if (track.length < 3) return track
  let tolerance = LINE_TOLERANCE
  let line: LngLat[]
  do {
    line = simplify(lineString(track), { tolerance }).geometry.coordinates as LngLat[]
    tolerance *= 2
  } while (line.length > MAX_LINE_POINTS)
  return line
}

// Overpass takes latitude before longitude. Regular expressions on keys keep it to two filters, each repeating the
// line, instead of one per tag.
export function osmPlacesQuery(track: LngLat[], timeoutS: number): string {
  const line = queryLine(track).map(([lng, lat]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(',')
  const around = `(around:${OSM_PLACES_RADIUS_M},${line})`
  const sourceKeys = WATER_SOURCES.map(([key]) => key).join('|')
  const sourceValues = WATER_SOURCES.flatMap(([, values]) => values).join('|')
  return `[out:json][timeout:${timeoutS}];(`
    + `nwr[~"^(amenity|tourism|natural)$"~"^(drinking_water|alpine_hut|wilderness_hut|shelter|parking|toilets|peak)$"]${around};`
    + `nwr["drinking_water"="yes"][~"^(${sourceKeys})$"~"^(${sourceValues})$"]${around};`
    + ');out center;'
}
