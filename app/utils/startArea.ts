import type { LngLat } from '#shared/utils/routes'
import type { Bounds, MapFocus } from '~/stores/routeSearch'

// "Ma zone de dÃ©part" (#147): where the maps open (home, editor, /discover) when they have no view of their own
// yet, rather than the whole of France. Kept in the member's account (app/utils/preferences.ts) as the bounds to
// frame, so a phone and a computer show the same area, with the name of the place it was picked from (none when
// taken from a map view).
export interface StartArea {
  bounds: Bounds
  name: string | null
}

// A place without its own extent (a peak, an address) is framed this far around, in kilometres.
const PLACE_HALF_SIZE_KM = 3
const KM_PER_DEGREE = 111.32
const MAX_NAME_LENGTH = 200

// A point (whose bbox may be a point too) or a place across the antimeridian is framed around its centre.
export function startAreaFromPlace(focus: MapFocus, name: string): StartArea {
  const bbox = focus.bbox
  if (bbox && bbox[0] < bbox[2] && bbox[1] < bbox[3]) return { bounds: bbox, name: name.trim().slice(0, MAX_NAME_LENGTH) }
  const [lng, lat] = focus.center
  const dLat = PLACE_HALF_SIZE_KM / KM_PER_DEGREE
  const dLng = dLat / Math.max(Math.cos(lat * Math.PI / 180), 0.01)
  return {
    bounds: [Math.max(-180, lng - dLng), Math.max(-90, lat - dLat), Math.min(180, lng + dLng), Math.min(90, lat + dLat)],
    name: name.trim().slice(0, MAX_NAME_LENGTH),
  }
}

// None by default, and for anything that isn't an area of the world (a value from an older version or damaged).
export function parseStartArea(value: unknown): StartArea | null {
  if (!value || typeof value !== 'object') return null
  const { bounds, name } = value as Record<string, unknown>
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) return null
  const [west, south, east, north] = bounds as Bounds
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return null
  return {
    bounds: [west, south, east, north],
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, MAX_NAME_LENGTH) : null,
  }
}

// The "you are here" plate of /discover (#232): the first named area holding the map's centre (the member's start
// area), null when the view is elsewhere. No reverse geocoding: MapTiler's quota is for the tiles.
export function placeAt(center: LngLat, areas: (StartArea | null | undefined)[]): StartArea | null {
  const [lng, lat] = center
  return areas.find((area): area is StartArea => !!area?.name
    && lng >= area.bounds[0] && lng <= area.bounds[2] && lat >= area.bounds[1] && lat <= area.bounds[3]) ?? null
}
