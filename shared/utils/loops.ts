import { bearing, destination, distance } from '@turf/turf'
import { type OsmPlace, toOsmPlace, type OverpassElement } from './osmPlaces'
import {
  estimateDurationMin, type LngLat, type LngLatEle, LOOP_MAX_M, LOOP_MIN_M, type LoopPrecision, type LoopShape,
  type SportType, trackDistances, type WayInfo, type WayRange,
} from './routes'

// Automatic loops (#50): OpenRouteService round trips only aim at the length they are given. Detours around
// rivers, hills and dead ends made test loops up to 2.5 times too long, so a loop is asked again, with a
// corrected length, until it is close enough.

// A loop is kept when its length is within 10 % of the one asked for, 20 % for a "Fourchette" (#214): fewer tries
// refused, more varied loops.
export const LOOP_TOLERANCE = 0.1
export const LOOP_TOLERANCES: Record<LoopPrecision, number> = { precise: LOOP_TOLERANCE, range: 0.2 }
// OpenRouteService calls for one proposal, each counted in the routing quota. Three calls gave a loop on target
// for 8 directions out of 10 around Grenoble, and every time in flat country.
export const LOOP_ATTEMPTS = 3
export const LOOP_PROPOSALS = 3

// Waypoints of a chosen loop: about every 2 km, 4 to 10 segments.
const LOOP_SEGMENT_M = 2000
const LOOP_MIN_SEGMENTS = 4
const LOOP_MAX_SEGMENTS = 10

export interface LoopTry {
  requestedM: number
  lengthM: number
}

export function isOnTarget(lengthM: number, targetM: number, tolerance = LOOP_TOLERANCE): boolean {
  return Math.abs(lengthM - targetM) <= tolerance * targetM
}

// The length to ask for next: the target first, then the last length scaled by how far off its loop was, or,
// after two tries, the line through them (when longer requests did give longer loops).
export function nextLoopLength(targetM: number, tries: LoopTry[]): number {
  const last = tries.at(-1)
  if (!last) return targetM
  let next = last.requestedM * targetM / last.lengthM
  const before = tries.at(-2)
  if (before) {
    const slope = (last.lengthM - before.lengthM) / (last.requestedM - before.requestedM)
    if (Number.isFinite(slope) && slope > 0) next = last.requestedM + (targetM - last.lengthM) / slope
  }
  const bounded = Math.min(Math.max(next, targetM / 4), targetM * 2)
  return Math.round(Math.min(Math.max(bounded, LOOP_MIN_M), LOOP_MAX_M))
}

// Distance covered in that time at the member's pace (#146) or the sport's default one, climbing gainPerKmM metres
// per km (#214; 0 on the flat).
export function loopLengthForDuration(sport: SportType, minutes: number, paceMinPerKm?: number, gainPerKmM = 0): number {
  return Math.round(minutes / estimateDurationMin(sport, 1000, gainPerKmM, paceMinPerKm) * 1000)
}

// Climbing wanted (#214): "Plat", "Vallonné" or "Costaud".
export const LOOP_CLIMBS = ['flat', 'rolling', 'hilly'] as const
export type LoopClimb = typeof LOOP_CLIMBS[number]

// Gain per km (m) up to which an outing is flat, and from which it is hilly. Road runners and cyclists climb less
// than trail runners and hikers: 10 km with 80 m is a flat run, 15 km with 600 m a hilly trail, 60 km with 300 m
// a flat ride.
export const CLIMB_THRESHOLDS: Record<SportType, [flatMax: number, hillyMin: number]> = {
  running: [8, 20],
  trail: [15, 40],
  hiking: [15, 40],
  cycling: [6, 15],
  road_cycling: [5, 12],
  mountain_biking: [10, 25],
}

export function gainPerKm(distanceM: number, gainM: number | null): number {
  return distanceM > 0 ? (gainM ?? 0) / (distanceM / 1000) : 0
}

export function climbOf(sport: SportType, distanceM: number, gainM: number | null): LoopClimb {
  const [flatMax, hillyMin] = CLIMB_THRESHOLDS[sport]
  const perKm = gainPerKm(distanceM, gainM)
  return perKm <= flatMax ? 'flat' : perKm >= hillyMin ? 'hilly' : 'rolling'
}

// The gain per km a duration is turned into a distance with.
export function typicalGainPerKm(sport: SportType, climb: LoopClimb): number {
  const [flatMax, hillyMin] = CLIMB_THRESHOLDS[sport]
  return climb === 'flat' ? flatMax / 2 : climb === 'hilly' ? hillyMin * 1.25 : (flatMax + hillyMin) / 2
}

// Named: an inline type would hide the next export from the auto-imports (see CLAUDE.md).
type RankedProposal = { status: string, distanceM: number, gainM: number | null }

// Proposals by score, lowest first; the missing ones last, in their order.
function rankBy<T extends RankedProposal>(proposals: T[], score: (perKm: number) => number): T[] {
  return proposals.map((proposal, index) => ({
    proposal,
    index,
    score: proposal.status === 'ready' ? score(gainPerKm(proposal.distanceM, proposal.gainM)) : Number.POSITIVE_INFINITY,
  }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ proposal }) => proposal)
}

// Proposals in the order of the climbing asked for: the flattest first for a flat outing, the hilliest for a
// hilly one, the closest to the middle otherwise.
export function rankByClimb<T extends RankedProposal>(proposals: T[], sport: SportType, climb: LoopClimb): T[] {
  if (climb === 'flat') return rankBy(proposals, perKm => perKm)
  if (climb === 'hilly') return rankBy(proposals, perKm => -perKm)
  return rankByGain(proposals, typicalGainPerKm(sport, 'rolling'))
}

// Proposals closest first to a gain per km (m), e.g. a planned session's gain over its distance.
export function rankByGain<T extends RankedProposal>(proposals: T[], targetPerKmM: number): T[] {
  return rankBy(proposals, perKm => Math.abs(perKm - targetPerKmM))
}

// Paths wind: a point this far as the crow flies is about PATH_DETOUR times as far along paths.
export const PATH_DETOUR = 1.3
const GOLDEN_ANGLE = 137.508
// Snapping of the routed points: OpenRouteService's usual 350 m for the start, 1 km for a place to go through (a
// peak is often off the paths), the largest radius (-1) for the points placed by the app.
const START_RADIUS_M = 350
const VIA_RADIUS_M = 1000
// Far ends of an out and back through a place, around the place's bearing, one per seed.
const VIA_SPREAD = [0, 25, -25]
// An out and back reaching less than this beyond its place stops at the place.
const MIN_LEG_M = 200

const round6 = (value: number) => Math.round(value * 1e6) / 1e6
const metres = (from: LngLat, to: LngLat) => distance(from, to, { units: 'meters' })
function move(from: LngLat, distanceM: number, bearingDeg: number): LngLat {
  const [lng, lat] = destination(from, distanceM, bearingDeg, { units: 'meters' }).geometry.coordinates
  return [round6(lng!), round6(lat!)]
}

// Consecutive seeds point in directions far apart: a bearing in [-180, 180).
export function seedBearing(seed: number): number {
  return ((seed * GOLDEN_ANGLE) % 360) - 180
}

// The side and opening of a loop's third corner, seen from the start: 35 to 145° off the place's bearing.
function seedAngle(seed: number): number {
  const opening = 35 + ((seed * GOLDEN_ANGLE) % 110)
  return seed % 2 ? opening : -opening
}

// The third corner of a loop through a place: angleDeg off the start's bearing to the place, as far as needed for
// the triangle start → place → corner → start to measure perimeterM as the crow flies (never less than going to
// the place and back).
export function loopCorner(start: LngLat, via: LngLat, perimeterM: number, angleDeg: number): LngLat {
  const d = metres(start, via)
  const k = Math.max(perimeterM - d, d)
  // The corner is at r from the start, with r + sqrt(r² + d² − 2rd·cos θ) = k.
  const denominator = 2 * (k - d * Math.cos(angleDeg * Math.PI / 180))
  const r = denominator > 0 ? (k * k - d * d) / denominator : 0
  return move(start, r, (d > 0 ? bearing(start, via) : 0) + angleDeg)
}

// Named: an inline type would hide the next export from the auto-imports (see CLAUDE.md).
type RoutedPoints = { points: LngLat[], radiuses: number[] }

// What OpenRouteService routes for a loop through a place or an out and back (#214), aiming at lengthM along
// paths, with each point's snapping radius; null for a plain loop, which is an ORS round trip. An out and back is
// routed on the way out only, to its far end.
export function loopRoutePoints(shape: LoopShape, start: LngLat, lengthM: number, seed: number, via?: LngLat): RoutedPoints | null {
  const crowM = lengthM / PATH_DETOUR
  if (shape === 'loop') {
    if (!via) return null
    // Already the shortest loop through the place: its third corner would be the start itself.
    if (isShortestThrough(shape, start, lengthM, via)) {
      return { points: [start, via, start], radiuses: [START_RADIUS_M, VIA_RADIUS_M, START_RADIUS_M] }
    }
    return {
      points: [start, via, loopCorner(start, via, crowM, seedAngle(seed)), start],
      radiuses: [START_RADIUS_M, VIA_RADIUS_M, -1, START_RADIUS_M],
    }
  }
  if (!via) return { points: [start, move(start, crowM / 2, seedBearing(seed))], radiuses: [START_RADIUS_M, -1] }
  const d = metres(start, via)
  if (isShortestThrough(shape, start, lengthM, via)) return { points: [start, via], radiuses: [START_RADIUS_M, VIA_RADIUS_M] }
  const end = move(start, crowM / 2, (d > 0 ? bearing(start, via) : 0) + VIA_SPREAD[seed % VIA_SPREAD.length]!)
  return { points: [start, via, end], radiuses: [START_RADIUS_M, VIA_RADIUS_M, -1] }
}

// True when the route asked for lengthM goes straight to the place and back: the shortest one through it, which
// asking less can't shorten.
export function isShortestThrough(shape: LoopShape, start: LngLat, lengthM: number, via: LngLat): boolean {
  const crowM = lengthM / PATH_DETOUR
  const d = metres(start, via)
  return shape === 'loop' ? crowM <= 2 * d : crowM / 2 <= d + MIN_LEG_M
}

// Named: an inline type would hide the next export from the auto-imports (see CLAUDE.md).
type RoutedTrack = { points: LngLatEle[], wayInfo: WayInfo | null }

// The way out, then the same way back: the far end isn't repeated, and the ways are mirrored.
export function outAndBack(points: LngLatEle[], wayInfo: WayInfo | null): RoutedTrack {
  const last = points.length - 1
  const mirror = (ranges: WayRange[]): WayRange[] => [
    ...ranges,
    ...ranges.map(([from, to, value]): WayRange => [2 * last - to, 2 * last - from, value]).reverse(),
  ]
  return {
    points: [...points, ...points.slice(0, -1).reverse()],
    wayInfo: wayInfo && {
      surface: mirror(wayInfo.surface),
      waytype: mirror(wayInfo.waytype),
      sac_scale: mirror(wayInfo.sac_scale),
      mtb_scale: mirror(wayInfo.mtb_scale),
    },
  }
}

// A place to go through (#214): the highest peak in reach, or a drinking water point.
export const LOOP_VIA_TYPES = ['peak', 'water'] as const
export type LoopViaType = typeof LOOP_VIA_TYPES[number]
// Overpass is asked around the start, at most this far.
export const VIA_SEARCH_MAX_M = 10_000

// The server only routes through a place the browser could have picked.
export function isViaInReach(start: LngLat, via: LngLat): boolean {
  return metres(start, via) <= VIA_SEARCH_MAX_M
}

// How far a place can be, as the crow flies, for going there and back to fit in the length.
export function viaSearchRadius(lengthM: number, tolerance: number): number {
  return Math.round(Math.min(lengthM * (1 + tolerance) / (2 * PATH_DETOUR), VIA_SEARCH_MAX_M))
}

// Overpass takes the latitude first. Peaks only count with an elevation, water as among a route's useful places
// (`osmPlaceType`: fountains, taps, wells and springs only with drinking_water=yes).
export function loopViaQuery(type: LoopViaType, [lng, lat]: LngLat, radiusM: number, timeoutS: number): string {
  const around = `(around:${radiusM},${lat},${lng})`
  if (type === 'peak') return `[out:json][timeout:${timeoutS}];node["natural"="peak"]["ele"]${around};out;`
  return `[out:json][timeout:${timeoutS}];(`
    + `nwr["amenity"="drinking_water"]${around};`
    + `nwr["drinking_water"="yes"][~"^(amenity|man_made|natural)$"~"^(fountain|water_tap|water_well|spring)$"]${around};`
    + ');out center;'
}

export function loopViaPlaces(elements: OverpassElement[]): OsmPlace[] {
  return elements.map(toOsmPlace).filter(place => place !== null)
}

// The highest peak within the radius; the water point nearest to halfway there, to fill up on the way rather
// than at the start.
export function pickLoopVia(type: LoopViaType, places: OsmPlace[], start: LngLat, radiusM: number): OsmPlace | null {
  const inReach = places
    .filter(place => place.type === type && (type !== 'peak' || place.ele !== undefined))
    .map(place => ({ place, distanceM: metres(start, place.coordinates) }))
    .filter(({ distanceM }) => distanceM <= radiusM)
  const score = ({ place, distanceM }: typeof inReach[number]) =>
    type === 'peak' ? -place.ele! : Math.abs(distanceM - radiusM / 2)
  return inReach.sort((a, b) => score(a) - score(b))[0]?.place ?? null
}

// Indices of the waypoints that split a loop into segments of about the same length, first and last point
// included: the chosen loop can then be edited like a drawn route.
export function loopWaypointIndices(coordinates: LngLat[]): number[] {
  const last = coordinates.length - 1
  if (last < 1) return [0, Math.max(last, 0)]
  const along = trackDistances(coordinates)
  const total = along[last]!
  const count = Math.min(last, Math.max(LOOP_MIN_SEGMENTS, Math.min(LOOP_MAX_SEGMENTS, Math.round(total / LOOP_SEGMENT_M))))
  const indices = [0]
  for (let k = 1; k < count; k++) {
    let i = indices.at(-1)! + 1
    while (i < last && along[i]! < (k * total) / count) i++
    if (i < last) indices.push(i)
  }
  indices.push(last)
  return indices
}
