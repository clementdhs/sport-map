import { distance } from '@turf/turf'
import type { LngLat } from '#shared/utils/routes'

const SAMPLE_SPACING_M = 50
const MAX_SAMPLES = 200

// PostGIS parses EWKT on geography input, which avoids a dedicated RPC for inserts.
export function toLineStringEwkt(coordinates: LngLat[]): string {
  return `SRID=4326;LINESTRING(${coordinates.map(([lng, lat]) => `${lng} ${lat}`).join(',')})`
}

// Evenly spaced points on a straight segment, so its elevation profile has some resolution.
export function sampleStraightLine(from: LngLat, to: LngLat): LngLat[] {
  const steps = Math.min(MAX_SAMPLES, Math.max(1, Math.ceil(distance(from, to, { units: 'meters' }) / SAMPLE_SPACING_M)))
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
  })
}
