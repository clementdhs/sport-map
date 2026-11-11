import { bearing, destination, distance, lineString, nearestPointOnLine } from '@turf/turf'
import { type OsmPlace, toOsmPlace, type OverpassElement } from './osmPlaces'
import {
  estimateDurationMin, type LngLat, type LngLatEle, LOOP_MAX_M, LOOP_MIN_M, type LoopPrecision, type LoopShape,
  ROUTING_PROFILES, SPORT_KINDS, type SportType, trackDistances, type WayInfo, type WayRange,
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

// Items by score, lowest first, ties in their order.
function sortByScore<T>(items: T[], score: (item: T) => number): T[] {
  return items.map((item, index) => ({ item, index, score: score(item) }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ item }) => item)
}

// Proposals by score of their gain per km, lowest first; the missing ones last, in their order.
function rankBy<T extends RankedProposal>(proposals: T[], score: (perKm: number) => number): T[] {
  return sortByScore(proposals, proposal =>
    proposal.status === 'ready' ? score(gainPerKm(proposal.distanceM, proposal.gainM)) : Number.POSITIVE_INFINITY)
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

// Preferring paths (#295). OpenRouteService has no option to avoid tarmac: the loops go on a profile that takes
// more paths (hiking for runs, mountain bike for rides), then are ranked by their share of path. Road cycling keeps
// its road profile, so it isn't offered.
export function canPreferPaths(sport: SportType): boolean {
  return sport !== 'road_cycling'
}

export function loopProfile(sport: SportType, preferPaths: boolean): string {
  if (!preferPaths || !canPreferPaths(sport)) return ROUTING_PROFILES[sport]
  return SPORT_KINDS[sport] === 'ride' ? 'cycling-mountain' : 'foot-hiking'
}

// Under this share of path for every proposal, the panel says the option changed little (in town).
export const FEW_PATHS_SHARE = 0.1

// Named: an inline type would hide the next export from the auto-imports (see CLAUDE.md).
type PathRankedProposal = { status: string, pathShare: number | null }

// Proposals with the most path first, by tenths so that close ones keep their order (the climbing's); those
// without way info, then the failed ones, last.
export function rankByPaths<T extends PathRankedProposal>(proposals: T[]): T[] {
  return sortByScore(proposals, ({ status, pathShare }) =>
    status !== 'ready' ? 2 : pathShare === null ? 1 : -Math.round(pathShare * 10))
}

// Whether the proposals whose ways are known came back with hardly any path, though the member asked for paths.
export function fewPaths(proposals: PathRankedProposal[]): boolean {
  const known = proposals.filter(({ status, pathShare }) => status === 'ready' && pathShare !== null)
  return known.length > 0 && known.every(({ pathShare }) => pathShare! < FEW_PATHS_SHARE)
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
// routed on the way out only, to its far end. Towards a bearing (#293: a massif, a place out of reach), a loop goes
// first through a point a third of its perimeter away that way, an out and back ends that way; a place to go
// through wins over a bearing.
export function loopRoutePoints(shape: LoopShape, start: LngLat, lengthM: number, seed: number, via?: LngLat, headingDeg?: number): RoutedPoints | null {
  const crowM = lengthM / PATH_DETOUR
  if (!via && headingDeg !== undefined) {
    if (shape === 'out_and_back') {
      return { points: [start, move(start, crowM / 2, headingDeg + VIA_SPREAD[seed % VIA_SPREAD.length]!)], radiuses: [START_RADIUS_M, -1] }
    }
    const towards = move(start, crowM / 3, headingDeg)
    return {
      points: [start, towards, loopCorner(start, towards, crowM, seedAngle(seed)), start],
      radiuses: [START_RADIUS_M, -1, -1, START_RADIUS_M],
    }
  }
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

// A place the member names (#293): « autour de l'Isère », « en direction de la Chartreuse ». Overpass looks for it
// around the start, not in all of France (« Isère » is the river, not the département), and what it is decides
// its role: a river, lake, peak or village in reach is gone through at its point nearest to the start; a massif,
// or anything out of reach, only gives the loop its direction.
export const NAMED_PLACE_KINDS = ['massif', 'river', 'lake', 'peak', 'village'] as const
export type NamedPlaceKind = typeof NAMED_PLACE_KINDS[number]
// Wide enough to head for a massif whatever the length: a 100 km loop reaches about 38 km away.
export const NAMED_PLACE_SEARCH_M = 30_000

export interface NamedPlace {
  id: string
  name: string
  kind: NamedPlaceKind
  // The point nearest to the start of a river or a lake drawn as a line, else the place's node or centre
  coordinates: LngLat
  distanceM: number
}

export type NamedPlaceChoice = { role: 'via', place: NamedPlace } | { role: 'heading', place: NamedPlace, bearingDeg: number }

// Lines come with their geometry (`out geom`): a river's nearest point is on its line.
export type NamedOverpassElement = OverpassElement & { geometry?: { lat: number, lon: number }[] }

const ARTICLES = new Set(['l', 'le', 'la', 'les', 'd', 'de', 'du', 'des', 'the', 'of'])
// Words that only say what kind of place it is, with the kind they hint at (null: none in particular).
const GENERIC_WORDS: Record<string, NamedPlaceKind | null> = {
  lac: 'lake', lake: 'lake', etang: 'lake', barrage: 'lake', retenue: 'lake',
  massif: 'massif', chaine: 'massif', range: 'massif', mountains: 'massif', parc: null, naturel: null, regional: null,
  riviere: 'river', fleuve: 'river', river: 'river', ruisseau: 'river', torrent: 'river', canal: 'river',
  mont: 'peak', pic: 'peak', sommet: 'peak', mount: 'peak', peak: 'peak',
  village: 'village', ville: 'village', town: 'village',
}

// Words of a name without accents, case, quotes and brackets: « l'Isère » is « l », « isere ». Hyphens stay in their
// word: « Sappey-en-Chartreuse » is one.
function nameWords(name: string): string[] {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[’`]/g, '\'')
    .split(/[\s'"()[\]{},;:.!?«»]+/)
    .filter(Boolean)
}

// The name's own words, without articles and generic words: what two names of one place have in common
// (« Massif de la Chartreuse » and « la Chartreuse » are both « chartreuse »). Empty for « le lac ».
export function namedPlaceCore(name: string): string {
  return nameWords(name).filter(word => !ARTICLES.has(word) && !(word in GENERIC_WORDS)).join(' ')
}

// The core's words, hyphenated ones split and without their articles: « Saint-Pierre-de-Chartreuse » is the
// « Saint Pierre de Chartreuse » typed with spaces.
function coreWords(name: string): string[] {
  return namedPlaceCore(name).split(/[\s-]+/).filter(word => word && !ARTICLES.has(word))
}

// True when the words follow one another in the place's name: « chartreuse » is in « Sappey-en-Chartreuse », « ain »
// isn't in « Saint-Égrève ».
function containsWords(words: string[], part: string[]): boolean {
  return words.some((_, i) => part.every((word, j) => words[i + j] === word))
}

// The kind a generic word said with the name gives (« lac de Paladru »), else null.
export function namedPlaceKindHint(name: string): NamedPlaceKind | null {
  for (const word of nameWords(name)) {
    const kind = GENERIC_WORDS[word]
    if (kind) return kind
  }
  return null
}

const ACCENTED: Record<string, string> = { a: 'aàâä', e: 'eéèêë', i: 'iîï', o: 'oôö', u: 'uùûü', c: 'cç', y: 'yÿ' }

// The core as an Overpass regex, written as an Overpass string: `,i` only folds ASCII, so accented letters list
// their capitals; words in order with anything between them (« dent crolles » matches « Dent de Crolles »).
function namePattern(core: string): string {
  const letter = (char: string) => {
    const variants = ACCENTED[char]
    if (!variants) return char.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    return `(${[...variants, ...variants.toUpperCase()].join('|')})`
  }
  return core.split(' ').map(word => [...word].map(letter).join('')).join('.*').replace(/\\/g, '\\\\')
}

// A box NAMED_PLACE_SEARCH_M away from the start on each side (Overpass takes south, west, north, east): `around`
// that far, with a name regex, was cut by the timeout on a busy instance, a box answered. Lines (rivers, lakes
// drawn as ways) come with their geometry, the rest with their centre: a massif's boundary is too big to download.
// Never the administrative boundaries: « Isère » would be the département. Null for a place said by its kind only.
export function namedPlaceQuery(name: string, start: LngLat, timeoutS: number): string | null {
  const core = namedPlaceCore(name)
  if (!core) return null
  const [, south] = move(start, NAMED_PLACE_SEARCH_M, 180)
  const [, north] = move(start, NAMED_PLACE_SEARCH_M, 0)
  const [west] = move(start, NAMED_PLACE_SEARCH_M, -90)
  const [east] = move(start, NAMED_PLACE_SEARCH_M, 90)
  const filter = `["name"~"${namePattern(core)}",i]`
  return `[out:json][timeout:${timeoutS}][bbox:${south},${west},${north},${east}];`
    + `(way["waterway"~"^(river|stream|canal)$"]${filter};way["natural"="water"]${filter};);out tags geom;`
    + `(node["natural"="peak"]${filter};nwr["natural"="mountain_range"]${filter};relation["natural"="water"]${filter};`
    + `nwr["place"~"^(region|city|town|village|hamlet)$"]${filter};relation["boundary"="protected_area"]${filter};);out tags center;`
}

// What a place found is for a loop, or null when it is none of the kinds a loop can head for.
export function namedPlaceKind(tags: Record<string, string>): NamedPlaceKind | null {
  if (tags.place === 'region' || tags.natural === 'mountain_range' || tags.boundary === 'protected_area') return 'massif'
  if (['river', 'stream', 'canal'].includes(tags.waterway ?? '')) return 'river'
  if (tags.natural === 'water') return 'lake'
  if (tags.natural === 'peak') return 'peak'
  if (['city', 'town', 'village', 'hamlet'].includes(tags.place ?? '')) return 'village'
  return null
}

export function namedPlacesFrom(elements: NamedOverpassElement[], start: LngLat): NamedPlace[] {
  const places: NamedPlace[] = []
  for (const element of elements) {
    const tags = element.tags ?? {}
    const kind = namedPlaceKind(tags)
    const name = tags.name?.trim()
    if (!kind || !name) continue
    const line = (element.geometry ?? []).map(({ lon, lat }): LngLat => [lon, lat])
    let coordinates: LngLat
    if (line.length >= 2) {
      const [lng, lat] = nearestPointOnLine(lineString(line), start).geometry.coordinates
      coordinates = [round6(lng!), round6(lat!)]
    }
    else {
      const lat = element.lat ?? element.center?.lat ?? line[0]?.[1]
      const lon = element.lon ?? element.center?.lon ?? line[0]?.[0]
      if (lat === undefined || lon === undefined) continue
      coordinates = [round6(lon), round6(lat)]
    }
    places.push({ id: `${element.type[0]}${element.id}`, name, kind, coordinates, distanceM: Math.round(metres(start, coordinates)) })
  }
  return places
}

// A massif before a river of the same name, a river before a lake, a lake before a peak, a village last.
const KIND_RANK: Record<NamedPlaceKind, number> = { massif: 0, river: 1, lake: 2, peak: 3, village: 4 }

// The place meant, and its role. Among the places of that very name (else those containing it), of the kind said
// with it when there are some: the most significant kind, then the nearest. Gone through when it is a river, lake,
// peak or village within reachM, else only headed for. Null when none matches.
export function pickNamedPlace(name: string, places: NamedPlace[], start: LngLat, reachM: number): NamedPlaceChoice | null {
  const core = namedPlaceCore(name)
  if (!core) return null
  const asked = coreWords(name)
  const named = places.map(found => ({ found, words: coreWords(found.name) }))
  const matching = named.filter(({ words }) => containsWords(words, asked)).map(({ found, words }) => ({ found, exact: words.length === asked.length }))
  const exact = matching.filter(match => match.exact).map(({ found }) => found)
  let candidates = exact.length ? exact : matching.map(({ found }) => found)
  const hint = namedPlaceKindHint(name)
  if (hint && candidates.some(found => found.kind === hint)) candidates = candidates.filter(found => found.kind === hint)
  const best = [...candidates].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.distanceM - b.distanceM)[0]
  if (!best) return null
  if (best.kind !== 'massif' && best.distanceM <= reachM) return { role: 'via', place: best }
  return { role: 'heading', place: best, bearingDeg: Math.round(bearing(start, best.coordinates) * 10) / 10 }
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
