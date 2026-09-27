import type { LngLat } from '#shared/utils/routes'

// PostGIS parses EWKT on geography input, which avoids a dedicated RPC for inserts.
export function toLineStringEwkt(coordinates: LngLat[]): string {
  return `SRID=4326;LINESTRING(${coordinates.map(([lng, lat]) => `${lng} ${lat}`).join(',')})`
}
