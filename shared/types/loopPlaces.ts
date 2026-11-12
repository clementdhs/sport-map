import type { NamedPlace } from '../utils/loops'
import type { OsmPlace } from '../utils/osmPlaces'

// POST /api/loops/places/lookup (#311): the places kept for a search around the start's cell, whatever their age
// (the app asks Overpass again past LOOP_PLACES_TTL_DAYS, and keeps this answer when Overpass fails); null when none.
export type CachedLoopPlaces = { places: OsmPlace[] | NamedPlace[], fetched_at: string } | null
