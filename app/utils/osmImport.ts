import type { OsmRoute } from '#shared/utils/osmRoutes'
import type { LngLat } from '#shared/utils/routes'
import { type ImportedTrack, resampleTrack } from '~/utils/gpx'

// A complete marked route as the editor imports it (#69): resampled like a GPX track, without elevations, which
// OpenStreetMap doesn't have.
export function osmRouteTrack(route: OsmRoute): ImportedTrack {
  return {
    name: route.name ?? route.ref,
    coordinates: resampleTrack(route.lines[0]!).map(([lng, lat]): LngLat => [lng!, lat!]),
    elevations: null,
  }
}
