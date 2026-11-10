import type { Json } from '#shared/types/database.types'
import type { RouteTrack } from '#shared/utils/privacyZones'
import type { RouteCreatePayload } from '#shared/utils/routes'

// The columns of routes (and route_originals) that follow the track.
export function trackColumns(track: RouteTrack) {
  const elevation = track.elevations ? elevationStats(track.coordinates, track.elevations) : null
  return {
    geom: toLineStringEwkt(track.coordinates),
    elevation_profile: track.elevations,
    elevation_gain_m: elevation?.gain ?? null,
    elevation_loss_m: elevation?.loss ?? null,
    editor_state: track.editor_state as Json | null,
    pois: track.pois as Json,
    way_info: track.way_info as Json | null,
  }
}

export type TrackColumns = ReturnType<typeof trackColumns>

export function trackFromPayload(body: RouteCreatePayload): RouteTrack {
  return {
    coordinates: body.coordinates,
    elevations: body.elevations ?? null,
    pois: body.pois ?? [],
    way_info: body.way_info ?? null,
    editor_state: body.editor_state ?? null,
  }
}

// The routes columns of a validated create/update payload that don't follow the track (owner excluded): the track
// columns come from maskedRouteColumns, cut by the owner's privacy zones.
export function routeDetailsFromPayload(body: RouteCreatePayload) {
  return {
    name: body.name,
    description: body.description || null,
    sport_type: body.sport_type,
    is_public: body.is_public,
    source: body.source,
  }
}
