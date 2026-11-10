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

// The [lng, lat] of a PostGIS point as PostgREST returns a geography column: hex (E)WKB, e.g. routes.start_point.
// null for anything else.
export function pointFromWkb(hex: unknown): LngLat | null {
  if (typeof hex !== 'string' || !/^[0-9a-f]+$/i.test(hex) || hex.length % 2) return null
  const bytes = new DataView(new Uint8Array(hex.match(/../g)!.map(byte => Number.parseInt(byte, 16))).buffer)
  if (bytes.byteLength < 21) return null
  const little = bytes.getUint8(0) === 1
  const type = bytes.getUint32(1, little)
  // 0x20000000: an SRID follows the type (EWKB)
  const offset = 5 + (type & 0x20000000 ? 4 : 0)
  if ((type & 0xffff) !== 1 || bytes.byteLength < offset + 16) return null
  return [bytes.getFloat64(offset, little), bytes.getFloat64(offset + 8, little)]
}
