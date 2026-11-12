import type { LngLat } from '#shared/utils/routes'
import { namedPlaceCore, type NamedPlace } from '#shared/utils/loops'
import {
  maptilerNamedPlaceQuery,
  maptilerNamedPlaces,
  type MaptilerFeature,
  nominatimNamedPlaceQuery,
  nominatimNamedPlaces,
  nominatimRetryName,
  type NamedPlaceSource,
  namedPlaceSources,
  type NominatimResult,
  searchNamedPlacesWith,
} from '#shared/utils/namedPlaces'
import { namedPlacesFromCell } from '#shared/utils/loopPlacesCache'
import { cachedLoopPlaces, type LiveLoopPlaces } from '~/utils/loopPlacesCache'
import { searchOverpassNamedPlaces } from '~/utils/overpass'

const MAPTILER_GEOCODING = 'https://api.maptiler.com/geocoding'
// OpenStreetMap's own Nominatim (OSMF servers): no key, 1 request a second at most per app.
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'
const NOMINATIM_INTERVAL_MS = 1000
const GEOCODER_TIMEOUT_MS = 10_000

let lastNominatimAt = 0

async function geocoderPlaces(name: string, start: LngLat, language: string): Promise<NamedPlace[]> {
  const { maptilerKey } = useRuntimeConfig().public
  if (!maptilerKey) throw new Error('No MapTiler key')
  const { features } = await $fetch<{ features: MaptilerFeature[] }>(
    `${MAPTILER_GEOCODING}/${encodeURIComponent(name.trim())}.json`,
    { query: { key: maptilerKey, language, ...maptilerNamedPlaceQuery(start) }, timeout: GEOCODER_TIMEOUT_MS },
  )
  return maptilerNamedPlaces(features ?? [], start)
}

// Spaced by NOMINATIM_INTERVAL_MS in this tab, as its usage policy asks; the browser's Referer names the app.
async function askNominatim(q: string, start: LngLat, language: string): Promise<NamedPlace[]> {
  const wait = lastNominatimAt + NOMINATIM_INTERVAL_MS - Date.now()
  lastNominatimAt = Date.now() + Math.max(wait, 0)
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
  const results = await $fetch<NominatimResult[]>(NOMINATIM_SEARCH, {
    query: nominatimNamedPlaceQuery(q, start, language),
    timeout: GEOCODER_TIMEOUT_MS,
  })
  return nominatimNamedPlaces(Array.isArray(results) ? results : [], start)
}

// The name as said, then its core when that found nothing (`nominatimRetryName`): two requests at most.
async function nominatimPlaces(name: string, start: LngLat, language: string): Promise<NamedPlace[]> {
  const places = await askNominatim(name, start, language)
  const retry = places.length ? null : nominatimRetryName(name)
  return retry ? askNominatim(retry, start, language) : places
}

// The places of that name searched from `centre`, and whether every source the name calls for answered (MapTiler,
// and Overpass or Nominatim in its place): only then is the answer kept (#311), so that a massif missed while
// OpenStreetMap was down isn't missed for a month.
async function liveNamedPlaces(name: string, centre: LngLat, language: string): Promise<LiveLoopPlaces<NamedPlace>> {
  const answered = new Set<NamedPlaceSource>()
  const from = (source: NamedPlaceSource, search: () => Promise<NamedPlace[]>) => async () => {
    const places = await search()
    answered.add(source)
    return places
  }
  const places = await searchNamedPlacesWith(name, {
    geocoder: from('geocoder', () => geocoderPlaces(name, centre, language)),
    overpass: from('osm', () => searchOverpassNamedPlaces(name, centre)),
    nominatim: from('osm', () => nominatimPlaces(name, centre, language)),
  })
  return { places, complete: namedPlaceSources(name).every(source => answered.has(source)) }
}

// The places of that name around a loop's start (#293, #310), from MapTiler, Overpass and Nominatim as the name
// calls for (`namedPlaceSources`), searched from the start's cell and kept for the family (#311), measured from the
// start. None for a place said by its kind only (« le lac »); throws when no source answered and nothing is kept.
export async function searchNamedPlaces(name: string, start: LngLat, language: string): Promise<NamedPlace[]> {
  if (!namedPlaceCore(name)) return []
  const places = await cachedLoopPlaces({ kind: 'named', name, language }, start, centre => liveNamedPlaces(name, centre, language))
  return namedPlacesFromCell(places, start)
}
