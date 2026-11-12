import { type NamedPlace, namedPlaceAt, namedPlaceBox, namedPlaceCore, namedPlaceKind, type NamedPlaceKind, namedPlaceKindHint } from './loops'
import type { LngLat } from './routes'

// Where a place the member names is looked for (#310). Overpass alone was too fragile: on 2026-11-11 every instance
// was down and « vers Seyssinet » went through no place. Towns, villages, hamlets and localities come from MapTiler's
// geocoding (fast, already used for a named start); peaks, lakes, rivers and massifs from Overpass, and from
// Nominatim (OpenStreetMap's geocoder, other servers) when Overpass doesn't answer. The place's role stays
// pickNamedPlace's, whatever the source.

// 'geocoder': MapTiler; 'osm': Overpass, else Nominatim.
export type NamedPlaceSource = 'geocoder' | 'osm'

const NATURE_KINDS: NamedPlaceKind[] = ['massif', 'river', 'lake', 'peak']

// A name said with « village » or « ville » is a settlement, one said with « lac », « mont », « rivière » or
// « massif » is not; a bare name may be either (« Chartreuse » is a massif and seven villages around Grenoble).
export function namedPlaceSources(name: string): NamedPlaceSource[] {
  const hint = namedPlaceKindHint(name)
  if (hint === 'village') return ['geocoder']
  if (hint && NATURE_KINDS.includes(hint)) return ['osm']
  return ['geocoder', 'osm']
}

export interface NamedPlaceSearchers {
  geocoder: () => Promise<NamedPlace[]>
  overpass: () => Promise<NamedPlace[]>
  nominatim: () => Promise<NamedPlace[]>
}

// The places of that name found by the sources the name calls for, merged for pickNamedPlace. Nominatim is asked
// at most once, only when the source it stands in for failed. Throws when no source answered (the member is then
// told OpenStreetMap is down); an answer without the place is an empty list.
export async function searchNamedPlacesWith(name: string, searchers: NamedPlaceSearchers): Promise<NamedPlace[]> {
  const sources = namedPlaceSources(name)
  let nominatim: Promise<NamedPlace[]> | null = null
  const fallback = () => (nominatim ??= searchers.nominatim())
  const searches: Promise<NamedPlace[]>[] = []
  if (sources.includes('osm')) searches.push(searchers.overpass().catch(fallback))
  if (sources.includes('geocoder')) {
    // With OpenStreetMap asked too, it covers villages: no need for Nominatim when only the geocoder failed.
    searches.push(sources.includes('osm') ? searchers.geocoder() : searchers.geocoder().catch(fallback))
  }
  const results = await Promise.allSettled(searches)
  const answers = results.filter(result => result.status === 'fulfilled')
  if (!answers.length) throw (results[0] as PromiseRejectedResult).reason
  return answers.flatMap(answer => answer.value)
}

function inBox([lng, lat]: LngLat, start: LngLat): boolean {
  const [west, south, east, north] = namedPlaceBox(start)
  return lng >= west && lng <= east && lat >= south && lat <= north
}

// MapTiler's geocoding (https://docs.maptiler.com/cloud/api/geocoding/): only settlements.
export interface MaptilerFeature {
  id: string
  text: string
  place_type: string[]
  center: LngLat
  properties?: { ref?: string }
}

const MAPTILER_PLACE_TYPES = ['municipality', 'municipal_district', 'locality', 'neighbourhood', 'place']

// The query's parameters besides the key and the language: settlements in the search box, nearest first.
export function maptilerNamedPlaceQuery(start: LngLat) {
  return {
    types: MAPTILER_PLACE_TYPES.join(','),
    bbox: namedPlaceBox(start).join(','),
    proximity: start.join(','),
    limit: 5,
  }
}

// A commune (« Seyssinet-Pariset »), a hamlet or a locality is a village; keyed by its OpenStreetMap id when MapTiler
// gives one (`osm:r191039` is Overpass' `r191039`).
export function maptilerNamedPlaces(features: MaptilerFeature[], start: LngLat): NamedPlace[] {
  const places: NamedPlace[] = []
  for (const feature of features) {
    const name = feature.text?.trim()
    if (!name || !feature.place_type?.some(type => MAPTILER_PLACE_TYPES.includes(type))) continue
    if (!feature.center || !inBox(feature.center, start)) continue
    const ref = feature.properties?.ref
    const id = ref?.startsWith('osm:') ? ref.slice(4) : feature.id
    const place = namedPlaceAt(id, name, 'village', start, feature.center)
    if (place) places.push(place)
  }
  return places
}

// Nominatim's search (https://nominatim.org/release-docs/latest/api/Search/), `format=jsonv2`.
export interface NominatimResult {
  osm_type: 'node' | 'way' | 'relation'
  osm_id: number
  lat: string
  lon: string
  category: string
  type: string
  addresstype?: string
  name?: string
  geojson?: { type: string, coordinates: unknown }
}

// Usage policy (https://operations.osmfoundation.org/policies/nominatim/): one search per named place, never in
// bulk; the browser's Referer identifies the app. Bounded to the search box; lines simplified to about 50 m.
export function nominatimNamedPlaceQuery(name: string, start: LngLat, language: string) {
  const [west, south, east, north] = namedPlaceBox(start)
  return {
    'q': name.trim(),
    'format': 'jsonv2',
    'viewbox': [west, north, east, south].join(','),
    'bounded': 1,
    'limit': 10,
    'polygon_geojson': 1,
    'polygon_threshold': 0.0005,
    'accept-language': language,
  }
}

// Nominatim matches every word: it finds « l'Isère » as said (« isere » only gives the département) but nothing for
// « le mont Moucherotte », which « moucherotte » finds. The name as said first, then its core when that found
// nothing usable; null when the core is the name already.
export function nominatimRetryName(name: string): string | null {
  const core = namedPlaceCore(name)
  const asSaid = name.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  return core && core !== asSaid ? core : null
}

// The lines of a GeoJSON geometry: a river's, a lake's outline. None for a point.
function geometryLines(geojson: NominatimResult['geojson']): LngLat[][] {
  if (!geojson) return []
  const coordinates = geojson.coordinates as LngLat[] | LngLat[][] | LngLat[][][]
  switch (geojson.type) {
    case 'LineString': return [coordinates as LngLat[]]
    case 'MultiLineString':
    case 'Polygon': return coordinates as LngLat[][]
    case 'MultiPolygon': return (coordinates as LngLat[][][]).flat()
    default: return []
  }
}

// What OpenStreetMap tags the result has, for namedPlaceKind: a commune is its boundary in Nominatim, a village
// only when its address type says so (never a département).
export function nominatimNamedPlaces(results: NominatimResult[], start: LngLat): NamedPlace[] {
  const places: NamedPlace[] = []
  for (const result of results) {
    const name = result.name?.trim()
    if (!name) continue
    const settlement = result.category === 'boundary' && result.type === 'administrative'
      && ['city', 'town', 'village', 'hamlet'].includes(result.addresstype ?? '')
    // « Massif de la Chartreuse » is a `boundary=natural` there (with `place=region` in Overpass).
    const kind = settlement ? 'village' : result.category === 'boundary' && result.type === 'natural' ? 'massif' : namedPlaceKind({ [result.category]: result.type })
    if (!kind) continue
    const point: LngLat = [Number(result.lon), Number(result.lat)]
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1]) || !inBox(point, start)) continue
    // Lines only for rivers and lakes, like Overpass' `out geom`: a commune or a massif is at its centre.
    const lines = kind === 'river' || kind === 'lake' ? geometryLines(result.geojson) : []
    const place = namedPlaceAt(`${result.osm_type[0]}${result.osm_id}`, name, kind, start, point, lines)
    if (place) places.push(place)
  }
  return places
}
