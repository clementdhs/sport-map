import * as z from 'zod'
import { coordinateSchema } from './routes'
import type { EditorState, LngLat, OutingTrackPoint, Poi, WayInfo, WayRange } from './routes'

// Privacy zones (#254): circles around a member's home, work… Tracks starting or ending in one are shown to the
// rest of the team from the point where they leave the zone and up to the point where they enter it again, like
// Strava's. A passage through a zone in the middle of a track stays visible: it says nothing of where someone
// starts from, and keeps every track in one piece (profile, steps, follow mode).

export const PRIVACY_ZONE_RADII = [200, 500, 1000] as const
export type PrivacyZoneRadius = typeof PRIVACY_ZONE_RADII[number]
export const MAX_PRIVACY_ZONES = 5
export const MAX_PRIVACY_ZONE_LABEL = 60

// Every track leaves a zone on its circle, so the cut points of three routes would give its centre away. The circle
// used to cut is moved from the point placed by up to this share of the radius, in a random direction drawn once
// when the zone is created: crossing routes leads to that moved centre, and the place itself stays at least
// (1 - share) × radius inside the circle.
export const PRIVACY_OFFSET_SHARE = 0.4

export const privacyZoneSchema = z.object({
  center: coordinateSchema,
  radius_m: z.literal(PRIVACY_ZONE_RADII),
  label: z.string().trim().max(MAX_PRIVACY_ZONE_LABEL, 'validation.maxChars').optional(),
})

export type PrivacyZonePayload = z.infer<typeof privacyZoneSchema>

// The circle a zone cuts tracks with: its moved centre, never shown to anyone.
export interface MaskCircle {
  center: LngLat
  radiusM: number
}

const EARTH_RADIUS_M = 6_371_008.8
const RAD = Math.PI / 180

// Metres east and north of `origin`. Zones are at most a kilometre wide: a flat projection around their centre is
// accurate to well under a metre.
function project([lng, lat]: LngLat, [lng0, lat0]: LngLat): [number, number] {
  return [(lng - lng0) * RAD * EARTH_RADIUS_M * Math.cos(lat0 * RAD), (lat - lat0) * RAD * EARTH_RADIUS_M]
}

function unproject([x, y]: [number, number], [lng0, lat0]: LngLat): LngLat {
  return [lng0 + x / (RAD * EARTH_RADIUS_M * Math.cos(lat0 * RAD)), lat0 + y / (RAD * EARTH_RADIUS_M)]
}

export function insideCircle(point: LngLat, { center, radiusM }: MaskCircle): boolean {
  const [x, y] = project(point, center)
  return x * x + y * y <= radiusM * radiusM
}

export function insideZones(point: LngLat, circles: MaskCircle[]): boolean {
  return circles.some(circle => insideCircle(point, circle))
}

// The part of the segment a → b inside the circle, as fractions [from, to] of the segment (0 at a, 1 at b), or
// null when the segment doesn't cross it.
export function segmentInCircle(a: LngLat, b: LngLat, { center, radiusM }: MaskCircle): [number, number] | null {
  const [ax, ay] = project(a, center)
  const [bx, by] = project(b, center)
  const dx = bx - ax
  const dy = by - ay
  const qa = dx * dx + dy * dy
  const qb = 2 * (ax * dx + ay * dy)
  const qc = ax * ax + ay * ay - radiusM * radiusM
  if (qa === 0) return qc <= 0 ? [0, 1] : null
  const discriminant = qb * qb - 4 * qa * qc
  if (discriminant < 0) return null
  const root = Math.sqrt(discriminant)
  const from = Math.max(0, (-qb - root) / (2 * qa))
  const to = Math.min(1, (-qb + root) / (2 * qa))
  return from <= to ? [from, to] : null
}

// What the team sees of a track: points `first` to `last`, after the point where it leaves the zones (at `from`
// of the way from point first - 1 to point first) and before the one where it enters them again (at `to` of the
// way from point last to point last + 1).
export type TrackMask
  = | { kind: 'visible' }
    | { kind: 'hidden' }
    | { kind: 'trimmed', first: number, last: number, from: number | null, to: number | null }

export function trackMask(coordinates: LngLat[], circles: MaskCircle[]): TrackMask {
  if (!circles.length || coordinates.length < 2) return { kind: 'visible' }
  const first = coordinates.findIndex(point => !insideZones(point, circles))
  if (first === -1) return { kind: 'hidden' }
  let last = coordinates.length - 1
  while (insideZones(coordinates[last]!, circles)) last--
  if (first === 0 && last === coordinates.length - 1) return { kind: 'visible' }

  // Leaving: the last moment the segment is in any zone. Entering: the first one.
  let from: number | null = null
  if (first > 0) {
    from = 0
    for (const circle of circles) {
      const part = segmentInCircle(coordinates[first - 1]!, coordinates[first]!, circle)
      if (part) from = Math.max(from, part[1])
    }
  }
  let to: number | null = null
  if (last < coordinates.length - 1) {
    to = 1
    for (const circle of circles) {
      const part = segmentInCircle(coordinates[last]!, coordinates[last + 1]!, circle)
      if (part) to = Math.min(to, part[0])
    }
  }
  return { kind: 'trimmed', first, last, from, to }
}

// The items of a list aligned with the track's points (coordinates, elevations, GPS points), as the team sees
// them; `between` gives the value at a cut point.
export function applyTrackMask<T>(items: T[], mask: TrackMask, between: (a: T, b: T, t: number) => T): T[] {
  if (mask.kind === 'visible') return items
  if (mask.kind === 'hidden') return []
  const { first, last, from, to } = mask
  return [
    ...(from === null ? [] : [between(items[first - 1]!, items[first]!, from)]),
    ...items.slice(first, last + 1),
    ...(to === null ? [] : [between(items[last]!, items[last + 1]!, to)]),
  ]
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

// Coordinates keep 6 decimals (about 10 cm), like route_geojson.
export function lngLatBetween(a: LngLat, b: LngLat, t: number): LngLat {
  return [round(lerp(a[0], b[0], t), 6), round(lerp(a[1], b[1], t), 6)]
}

export function elevationBetween(a: number, b: number, t: number): number {
  return round(lerp(a, b, t), 1)
}

export function outingPointBetween(a: OutingTrackPoint, b: OutingTrackPoint, t: number): OutingTrackPoint {
  const [lng, lat] = lngLatBetween([a[0], a[1]], [b[0], b[1]], t)
  return [
    lng,
    lat,
    a[2] === null || b[2] === null ? null : elevationBetween(a[2], b[2], t),
    round(lerp(a[3], b[3], t), 1),
    round(lerp(a[4], b[4], t), 1),
  ]
}

// Way ranges [start, end, value] of point indices, moved onto the visible points; ranges left with nothing to
// cover are dropped.
export function maskWayInfo(wayInfo: WayInfo, mask: TrackMask): WayInfo {
  if (mask.kind === 'visible') return wayInfo
  let move = (_ranges: WayRange[]): WayRange[] => []
  if (mask.kind === 'trimmed') {
    const { first, last, from, to } = mask
    const offset = from === null ? 0 : 1
    const lastIndex = last - first + offset + (to === null ? 0 : 1)
    // The cut points sit on the segments ending at `first` and starting at `last`: the point before `first` stands
    // for the first visible one, the one after `last` for the last one.
    const index = (i: number) => Math.min(lastIndex, Math.max(0, i < first ? i - first + 1 : i - first + offset))
    move = ranges => ranges
      .map(([start, end, value]): WayRange => [index(start), index(end), value])
      .filter(([start, end]) => start < end)
  }
  return {
    surface: move(wayInfo.surface),
    waytype: move(wayInfo.waytype),
    sac_scale: move(wayInfo.sac_scale),
    mtb_scale: move(wayInfo.mtb_scale),
  }
}

// What a route's track looks like to the team, from its full data.
export interface RouteTrack {
  coordinates: LngLat[]
  elevations: number[] | null
  pois: Poi[]
  way_info: WayInfo | null
  editor_state: EditorState | null
}

export type MaskedRouteTrack
  = | { kind: 'visible' }
    | { kind: 'hidden' }
    | { kind: 'trimmed', track: RouteTrack }

export function maskRouteTrack(track: RouteTrack, circles: MaskCircle[]): MaskedRouteTrack {
  const mask = trackMask(track.coordinates, circles)
  if (mask.kind !== 'trimmed') return mask
  return {
    kind: 'trimmed',
    track: {
      coordinates: applyTrackMask(track.coordinates, mask, lngLatBetween),
      elevations: track.elevations?.length === track.coordinates.length
        ? applyTrackMask(track.elevations, mask, elevationBetween)
        : null,
      // Steps placed in a zone would show what the track hides.
      pois: track.pois.filter(poi => !insideZones(poi.coordinates, circles)),
      way_info: track.way_info && maskWayInfo(track.way_info, mask),
      // Its waypoints and segments follow the full track: only the owner edits it.
      editor_state: null,
    },
  }
}

export type MaskedOutingTrack
  = | { kind: 'visible' }
    | { kind: 'hidden' }
    | { kind: 'trimmed', track: OutingTrackPoint[] }

export function maskOutingTrack(track: OutingTrackPoint[], circles: MaskCircle[]): MaskedOutingTrack {
  const mask = trackMask(track.map(([lng, lat]): LngLat => [lng, lat]), circles)
  if (mask.kind !== 'trimmed') return mask
  return { kind: 'trimmed', track: applyTrackMask(track, mask, outingPointBetween) }
}

// The centre of the circle that cuts tracks, moved from the place picked by up to PRIVACY_OFFSET_SHARE of the
// radius (uniform over that disc). `random` gives two numbers in [0, 1).
export function offsetCenter(center: LngLat, radiusM: number, random: () => number = Math.random): LngLat {
  const distance = PRIVACY_OFFSET_SHARE * radiusM * Math.sqrt(random())
  const angle = 2 * Math.PI * random()
  const moved = unproject([distance * Math.cos(angle), distance * Math.sin(angle)], center)
  return [round(moved[0], 6), round(moved[1], 6)]
}
