import { distance, length, lineString, simplify } from '@turf/turf'
import type { LngLat, SportType } from './routes'

// Marked routes of OpenStreetMap (#69), searched with the Overpass API in the visible area. Trail running has no
// route type of its own in OSM: it uses the walking routes.
export const OSM_ROUTE_KINDS = ['foot', 'bicycle', 'mtb'] as const
export type OsmRouteKind = typeof OSM_ROUTE_KINDS[number]

// Values of the relation's `route` tag searched for each kind.
export const OSM_ROUTE_TAGS: Record<OsmRouteKind, string[]> = {
  foot: ['hiking', 'foot'],
  bicycle: ['bicycle'],
  mtb: ['mtb'],
}

// The app's sport closest to each kind: the editor's sport after an import, and the kind's icon.
export const OSM_KIND_SPORTS: Record<OsmRouteKind, SportType> = {
  foot: 'hiking',
  bicycle: 'cycling',
  mtb: 'mountain_biking',
}

export type Bbox = [minLng: number, minLat: number, maxLng: number, maxLat: number]

// Overpass answers in a few seconds for a forest the size of Fontainebleau's (~100 km²), with long-distance paths
// crossing it in full. Wider views are refused rather than risking its timeout.
export const OSM_SEARCH_MAX_KM2 = 600

const BBOX_STEP = 100 // 1 / 0.01°, about 1 km

// The searched area: the view rounded outwards to a 0.01° grid, so that it covers the whole view and that close
// views share the server cache.
export function osmSearchBbox([minLng, minLat, maxLng, maxLat]: Bbox): Bbox {
  // The epsilon keeps a value already on the grid there (2.72 * 100 = 272.00000000000003).
  const down = (value: number) => Math.floor(value * BBOX_STEP + 1e-9) / BBOX_STEP
  const up = (value: number) => Math.ceil(value * BBOX_STEP - 1e-9) / BBOX_STEP
  return [down(minLng), down(minLat), up(maxLng), up(maxLat)]
}

const KM_PER_DEGREE = 111.32

export function bboxAreaKm2([minLng, minLat, maxLng, maxLat]: Bbox): number {
  const midLat = (minLat + maxLat) / 2
  return (maxLat - minLat) * KM_PER_DEGREE * (maxLng - minLng) * KM_PER_DEGREE * Math.cos(midLat * Math.PI / 180)
}

export const fitsOsmSearch = (view: Bbox) => bboxAreaKm2(osmSearchBbox(view)) <= OSM_SEARCH_MAX_KM2

export interface OsmRoute {
  // OSM relation id
  id: number
  // The relation's `route` tag (hiking, foot, bicycle, mtb)
  route: string
  name: string | null
  ref: string | null
  // lwn / rwn / nwn / iwn for walking routes, lcn / rcn / ncn / icn for cycling ones
  network: string | null
  // The `roundtrip` tag, when the relation has one
  roundtrip: boolean | null
  // Whether its ways could be joined into a single line
  complete: boolean
  distance_m: number
  // One line when complete, the pieces that could be joined otherwise
  lines: LngLat[][]
}

// The parts of an Overpass answer (`out geom`) that are read.
export interface OverpassMember {
  type: 'node' | 'way' | 'relation'
  ref: number
  role: string
  // Missing nodes are null.
  geometry?: ({ lat: number, lon: number } | null)[]
}

export interface OverpassRelation {
  type: 'relation'
  id: number
  tags?: Record<string, string>
  members: OverpassMember[]
}

// Members that aren't part of the main itinerary: variants, side trips, access paths, signposts…
const IGNORED_ROLES = new Set(['alternative', 'excursion', 'approach', 'connection', 'link', 'platform', 'stop', 'guidepost'])

// Pieces whose ends are this close are joined by a straight line: mapping gaps at a road crossing, a bridge…
export const MAX_GAP_M = 30

const samePoint = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1]

// Chains the ways in the relation's order, each one turned to continue the chain; a way that doesn't touch the
// chain's end starts a new piece. The first way's direction is only known once the second one is met.
function chainInOrder(ways: LngLat[][]): LngLat[][] {
  const pieces: LngLat[][] = []
  let chain: LngLat[] | null = null
  let singleWay = false

  for (const way of ways) {
    if (!chain) {
      chain = [...way]
      singleWay = true
      continue
    }
    if (singleWay && !samePoint(way[0]!, chain.at(-1)!) && !samePoint(way.at(-1)!, chain.at(-1)!)
      && (samePoint(way[0]!, chain[0]!) || samePoint(way.at(-1)!, chain[0]!))) {
      chain.reverse()
    }
    const end = chain.at(-1)!
    if (samePoint(way[0]!, end)) {
      chain.push(...way.slice(1))
    }
    else if (samePoint(way.at(-1)!, end)) {
      chain.push(...[...way].reverse().slice(1))
    }
    else {
      pieces.push(chain)
      chain = [...way]
      singleWay = true
      continue
    }
    singleWay = false
  }
  if (chain) pieces.push(chain)
  return pieces
}

// Where a piece would join the line: at its end or start, the piece turned or not, and the gap between them.
interface Junction {
  index: number
  atEnd: boolean
  reversed: boolean
  gapM: number
}

function nearestJunction(line: LngLat[], pieces: LngLat[][]): Junction {
  let best: Junction = { index: -1, atEnd: true, reversed: false, gapM: Number.POSITIVE_INFINITY }
  for (const [index, piece] of pieces.entries()) {
    const options = [
      { atEnd: true, reversed: false, from: line.at(-1)!, to: piece[0]! },
      { atEnd: true, reversed: true, from: line.at(-1)!, to: piece.at(-1)! },
      { atEnd: false, reversed: true, from: line[0]!, to: piece[0]! },
      { atEnd: false, reversed: false, from: line[0]!, to: piece.at(-1)! },
    ]
    for (const { atEnd, reversed, from, to } of options) {
      const gapM = distance(from, to, { units: 'meters' })
      if (gapM < best.gapM) best = { index, atEnd, reversed, gapM }
    }
  }
  return best
}

// Joins the other pieces to the first one, nearest ends first, as long as they are at most MAX_GAP_M away: this
// fixes members listed out of order. What stays apart is returned after the joined line.
function joinPieces([first, ...others]: LngLat[][]): LngLat[][] {
  let line = first!
  const rest = [...others]
  while (rest.length) {
    const { index, atEnd, reversed, gapM } = nearestJunction(line, rest)
    if (gapM > MAX_GAP_M) break
    const piece = reversed ? [...rest[index]!].reverse() : rest[index]!
    rest.splice(index, 1)
    if (atEnd) line = [...line, ...(samePoint(line.at(-1)!, piece[0]!) ? piece.slice(1) : piece)]
    else line = [...(samePoint(piece.at(-1)!, line[0]!) ? piece.slice(0, -1) : piece), ...line]
  }
  return [line, ...rest]
}

// The ways of a route relation as one line, or as the pieces that could be joined when they don't connect (a gap
// in the mapping, a route turning in the middle of a way, a branch).
export function stitchWays(ways: LngLat[][]): LngLat[][] {
  const usable = ways.filter(way => way.length >= 2)
  return usable.length ? joinPieces(chainInOrder(usable)) : []
}

// About 1 m: drops the points that don't change the drawn line, a third of them in Fontainebleau.
const SIMPLIFY_TOLERANCE = 0.00001
const round = (value: number) => Math.round(value * 1e6) / 1e6

function simplifyLine(line: LngLat[]): LngLat[] {
  const simplified = line.length > 2
    ? simplify(lineString(line), { tolerance: SIMPLIFY_TOLERANCE }).geometry.coordinates as LngLat[]
    : line
  return simplified.map(([lng, lat]) => [round(lng), round(lat)])
}

const tag = (tags: Record<string, string>, key: string) => tags[key]?.trim() || null

// A route relation from Overpass, or null when none of its ways has a geometry.
export function toOsmRoute(relation: OverpassRelation): OsmRoute | null {
  const ways = relation.members
    .filter(member => member.type === 'way' && !IGNORED_ROLES.has(member.role) && member.geometry)
    .map(member => member.geometry!
      .filter(point => point !== null)
      .map(({ lon, lat }): LngLat => [lon, lat]))
  const lines = stitchWays(ways).map(simplifyLine)
  if (!lines.length) return null

  const tags = relation.tags ?? {}
  const roundtrip = tag(tags, 'roundtrip')
  return {
    id: relation.id,
    route: tags.route ?? '',
    name: tag(tags, 'name'),
    ref: tag(tags, 'ref'),
    network: tag(tags, 'network'),
    roundtrip: roundtrip === 'yes' ? true : roundtrip === 'no' ? false : null,
    complete: lines.length === 1,
    distance_m: Math.round(lines.reduce((sum, line) => sum + length(lineString(line), { units: 'meters' }), 0)),
    lines,
  }
}

export const OSM_ROUTE_SCOPES = ['local', 'regional', 'national', 'international'] as const
export type OsmRouteScope = typeof OSM_ROUTE_SCOPES[number]

const SCOPE_LETTERS: Record<string, OsmRouteScope> = { l: 'local', r: 'regional', n: 'national', i: 'international' }

// The reach of a route from its `network` tag: lwn, rwn, nwn, iwn for walking, lcn… for cycling.
export function osmRouteScope(network: string | null): OsmRouteScope | null {
  const letter = network?.match(/^([lrni])[a-z]n$/)?.[1]
  return letter ? SCOPE_LETTERS[letter]! : null
}

// Complete routes first (only they can be imported), then the most local ones (family outings before long-distance
// paths), then by name, numbers in order (Sentier 2 before Sentier 10); routes without a name last.
export function sortOsmRoutes(routes: OsmRoute[], locale: string): OsmRoute[] {
  const scopeRank = (route: OsmRoute) => {
    const scope = osmRouteScope(route.network)
    return scope ? OSM_ROUTE_SCOPES.indexOf(scope) : OSM_ROUTE_SCOPES.length
  }
  const label = (route: OsmRoute) => route.name ?? route.ref
  return [...routes].sort((a, b) => Number(b.complete) - Number(a.complete)
    || scopeRank(a) - scopeRank(b)
    || Number(label(a) === null) - Number(label(b) === null)
    || (label(a) ?? '').localeCompare(label(b) ?? '', locale, { numeric: true }))
}

export function osmRouteBbox(route: OsmRoute): Bbox {
  const points = route.lines.flat()
  const lngs = points.map(([lng]) => lng)
  const lats = points.map(([, lat]) => lat)
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)]
}

export const bboxContains = (outer: Bbox, inner: Bbox) =>
  inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3]
