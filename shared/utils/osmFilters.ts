import { distance } from '@turf/turf'
import { OSM_ROUTE_KINDS, OSM_ROUTE_SCOPES, type OsmRoute, type OsmRouteKind, type OsmRouteScope, osmRouteScope } from './osmRoutes'
import type { LngLat } from './routes'

// Quick filters on the marked routes found (#70), computed on the loaded routes without any request, and kept in the
// page's URL with the kind and the map view so that a search can be shared.

export type OsmRouteShape = 'loop' | 'linear' | 'unknown'

// Start and end closer than this make a loop, when the relation doesn't say.
export const LOOP_MAX_GAP_M = 200

// The relation's roundtrip tag first; without it, where its line starts and ends. Unknown when its ways don't
// connect.
export function osmRouteShape(route: OsmRoute): OsmRouteShape {
  if (route.roundtrip !== null) return route.roundtrip ? 'loop' : 'linear'
  if (!route.complete) return 'unknown'
  const line = route.lines[0]!
  return distance(line[0]!, line.at(-1)!, { units: 'meters' }) <= LOOP_MAX_GAP_M ? 'loop' : 'linear'
}

export const OSM_SHAPE_FILTERS = ['all', 'loop', 'linear'] as const
export type OsmShapeFilter = typeof OSM_SHAPE_FILTERS[number]

// Top of the distance slider: selecting it means "no maximum".
export const OSM_DISTANCE_MAX_KM = 100

// Same for the elevation gain slider (#71).
export const OSM_GAIN_MAX_M = 2000
export const OSM_GAIN_STEP_M = 50

// What is known of a route's elevation (#71, `OsmRouteElevation`).
export interface OsmRouteGain {
  gain_m: number
  loss_m: number
}

// Hardest grades offered as a maximum, per kind: harder ones (T4 to T6, S3 to S6) are grouped, as on route pages, so
// picking none keeps them. Cycling routes have no grade.
export const OSM_GRADE_CHOICES: Record<OsmRouteKind, number[]> = {
  foot: [1, 2, 3],
  bicycle: [],
  mtb: [0, 1, 2],
}

export interface OsmRouteFilters {
  distanceKm: [number, number]
  // Elevation gain, in meters (#71).
  gainM: [number, number]
  // A linear route also counts at twice its length, and its gain plus its loss, walked or ridden there and back.
  outAndBack: boolean
  shape: OsmShapeFilter
  // Hardest grade kept (OsmRoute.grade); null keeps them all.
  maxGrade: number | null
  // Empty keeps every scope.
  scopes: OsmRouteScope[]
}

export const defaultOsmFilters = (): OsmRouteFilters =>
  ({ distanceKm: [0, OSM_DISTANCE_MAX_KM], gainM: [0, OSM_GAIN_MAX_M], outAndBack: false, shape: 'all', maxGrade: null, scopes: [] })

const hasDistanceFilter = ({ distanceKm: [min, max] }: OsmRouteFilters) => min > 0 || max < OSM_DISTANCE_MAX_KM
const hasGainFilter = ({ gainM: [min, max] }: OsmRouteFilters) => min > 0 || max < OSM_GAIN_MAX_M

const inRange = (values: number[], [min, max]: [number, number], top: number) =>
  values.some(value => value >= min && (max >= top || value <= max))

// The there-and-back option only changes the distance and gain filters: it isn't counted on its own.
export function activeOsmFilterCount(filters: OsmRouteFilters): number {
  return [hasDistanceFilter(filters), hasGainFilter(filters), filters.shape !== 'all', filters.maxGrade !== null,
    filters.scopes.length > 0].filter(Boolean).length
}

// What a filter can't know never hides a route: no grade, no network, an elevation gain not computed yet (the list
// marks it). A shape is only known when the relation says it or its ways connect: unknown ones only show without a
// shape filter.
export function matchesOsmFilters(route: OsmRoute, filters: OsmRouteFilters, elevation: OsmRouteGain | null = null): boolean {
  const shape = osmRouteShape(route)
  const outAndBack = filters.outAndBack && shape === 'linear'
  const km = route.distance_m / 1000
  if (!inRange(outAndBack ? [km, 2 * km] : [km], filters.distanceKm, OSM_DISTANCE_MAX_KM)) return false
  if (elevation) {
    const { gain_m: gain, loss_m: loss } = elevation
    if (!inRange(outAndBack ? [gain, gain + loss] : [gain], filters.gainM, OSM_GAIN_MAX_M)) return false
  }
  if (filters.shape !== 'all' && shape !== filters.shape) return false
  if (filters.maxGrade !== null && route.grade !== null && route.grade > filters.maxGrade) return false
  const scope = osmRouteScope(route.network)
  return !filters.scopes.length || !scope || filters.scopes.includes(scope)
}

export interface OsmMapView {
  center: LngLat
  zoom: number
}

export interface OsmDiscoverState {
  kind: OsmRouteKind
  filters: OsmRouteFilters
  view: OsmMapView | null
}

const round = (value: number, decimals: number) => Number(value.toFixed(decimals))

// Only what differs from the defaults, e.g.
// ?kind=mtb&km=5-20&dplus=200-&ar=1&shape=loop&grade=2&scope=local,regional&at=48.41,2.65,13
export function osmDiscoverQuery({ kind, filters, view }: OsmDiscoverState): Record<string, string> {
  const query: Record<string, string> = {}
  if (kind !== 'foot') query.kind = kind
  if (hasDistanceFilter(filters)) {
    const [min, max] = filters.distanceKm
    query.km = `${min > 0 ? min : ''}-${max < OSM_DISTANCE_MAX_KM ? max : ''}`
  }
  if (hasGainFilter(filters)) {
    const [min, max] = filters.gainM
    query.dplus = `${min > 0 ? min : ''}-${max < OSM_GAIN_MAX_M ? max : ''}`
  }
  if (filters.outAndBack) query.ar = '1'
  if (filters.shape !== 'all') query.shape = filters.shape
  if (filters.maxGrade !== null) query.grade = String(filters.maxGrade)
  if (filters.scopes.length) query.scope = filters.scopes.join(',')
  if (view) query.at = `${round(view.center[1], 5)},${round(view.center[0], 5)},${round(view.zoom, 2)}`
  return query
}

type QueryValue = string | null | undefined | (string | null)[]

const first = (value: QueryValue) => (Array.isArray(value) ? value[0] : value) ?? undefined

const isOneOf = <T extends string>(values: readonly T[], value: string | undefined): value is T =>
  values.includes(value as T)

// "5-20", "-20" or "5-", within 0..top.
function parseRange(value: string | undefined, top: number): [number, number] | null {
  const range = value?.match(/^(\d*)-(\d*)$/)
  if (!range) return null
  const min = Math.min(Number(range[1] || 0), top)
  const max = Math.min(Number(range[2] || top), top)
  return min <= max ? [min, max] : null
}

// The page's URL, a shared link: unknown or invalid values fall back to the defaults.
export function parseOsmDiscoverQuery(query: Record<string, QueryValue>): OsmDiscoverState {
  const kindValue = first(query.kind)
  const kind = isOneOf(OSM_ROUTE_KINDS, kindValue) ? kindValue : 'foot'
  const filters = defaultOsmFilters()

  filters.distanceKm = parseRange(first(query.km), OSM_DISTANCE_MAX_KM) ?? filters.distanceKm
  filters.gainM = parseRange(first(query.dplus), OSM_GAIN_MAX_M) ?? filters.gainM
  filters.outAndBack = first(query.ar) === '1'
  const shape = first(query.shape)
  if (isOneOf(OSM_SHAPE_FILTERS, shape)) filters.shape = shape
  const grade = Number(first(query.grade) ?? Number.NaN)
  if (OSM_GRADE_CHOICES[kind].includes(grade)) filters.maxGrade = grade
  filters.scopes = OSM_ROUTE_SCOPES.filter(scope => first(query.scope)?.split(',').includes(scope))

  const [lat, lng, zoom] = first(query.at)?.split(',').map(Number) ?? []
  const valid = lat !== undefined && lng !== undefined && zoom !== undefined && Math.abs(lat) <= 90
    && Math.abs(lng) <= 180 && zoom >= 0 && zoom <= 22
  return { kind, filters, view: valid ? { center: [lng, lat], zoom } : null }
}
