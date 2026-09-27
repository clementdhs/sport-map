import type { RouteCreatePayload } from '#shared/utils/routes'

// The routes columns derived from a validated create/update payload (owner excluded).
export function routeRowFromPayload(body: RouteCreatePayload) {
  const elevation = body.elevations ? elevationStats(body.coordinates, body.elevations) : null
  return {
    name: body.name,
    description: body.description || null,
    sport_type: body.sport_type,
    is_public: body.is_public,
    geom: toLineStringEwkt(body.coordinates),
    elevation_profile: body.elevations ?? null,
    elevation_gain_m: elevation?.gain ?? null,
    elevation_loss_m: elevation?.loss ?? null,
    source: body.source,
    editor_state: body.editor_state ?? null,
  }
}
