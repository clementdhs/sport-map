import type { EditorState, LngLat, RouteSource } from '../shared/utils/routes'
import { elevationStats, MAX_ROUTE_POINTS } from '../shared/utils/routes'
import { type ElevationSources, trackElevationsFrom } from '../shared/utils/trackElevation'

// Recomputing the elevations of saved routes with the IGN (#177): see recompute-route-elevations.ts.

export interface SavedRoute {
  id: string
  source: RouteSource
  coordinates: LngLat[]
  elevations: number[] | null
  gain: number | null
  loss: number | null
  editorState: EditorState | null
}

// Modes whose points came from OpenRouteService (directions, or its elevation service for straight lines).
const ROUTED_MODES = new Set(['snap', 'straight'])

// The index ranges [start, end] of a route's track whose elevations came from OpenRouteService.
// - drawn routes: the whole track, locked segments included (drawn before the editor state was saved).
// - GPX imports (files and OSM routes from Discover) and recordings keep their source when segments are added in the
//   editor: only those segments are recomputed, without the junction points they share with the file's or the
//   recording's points. Without an editor state, nothing tells them apart: nothing is recomputed.
export function routedRanges(route: Pick<SavedRoute, 'source' | 'coordinates' | 'editorState'>): [number, number][] {
  const last = route.coordinates.length - 1
  if (route.source === 'drawn') return last > 0 ? [[0, last]] : []
  const segments = route.editorState?.segments ?? []
  if (segments.some(segment => segment.start > segment.end || segment.end > last)) return []

  const ranges: [number, number][] = []
  for (let i = 0; i < segments.length; i++) {
    if (!ROUTED_MODES.has(segments[i]!.mode)) continue
    let j = i
    while (j + 1 < segments.length && ROUTED_MODES.has(segments[j + 1]!.mode)) j++
    const before = segments[i - 1]
    const after = segments[j + 1]
    const start = before && before.end >= segments[i]!.start ? before.end + 1 : segments[i]!.start
    const end = after && after.start <= segments[j]!.end ? after.start - 1 : segments[j]!.end
    if (start <= end) ranges.push([start, end])
    i = j
  }
  return ranges
}

export type RecomputeResult
  = | { status: 'changed' | 'unchanged', elevations: number[], gain: number, loss: number }
    | { status: 'skipped', reason: string }

const sameElevations = (a: number[] | null, b: number[]) => a?.length === b.length && a.every((value, i) => value === b[i])
const sameFigure = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-6

// A route's new elevations and figures, computed as the app does when it saves a route (routeRowFromPayload).
export async function recomputeRoute(route: SavedRoute, sources: ElevationSources): Promise<RecomputeResult> {
  const { coordinates } = route
  if (coordinates.length < 2 || coordinates.length > MAX_ROUTE_POINTS) return { status: 'skipped', reason: 'points' }
  const ranges = routedRanges(route)
  if (!ranges.length) return { status: 'skipped', reason: 'no routed segment' }
  const whole = ranges.length === 1 && ranges[0]![0] === 0 && ranges[0]![1] === coordinates.length - 1
  // Only part of the track is recomputed: the rest keeps the elevations it has.
  if (!whole && route.elevations?.length !== coordinates.length) return { status: 'skipped', reason: 'no elevations' }

  const elevations = whole ? [] : [...route.elevations!]
  for (const [start, end] of ranges) {
    const measured = await trackElevationsFrom(coordinates.slice(start, end + 1), sources)
    elevations.splice(start, measured.length, ...measured)
  }

  const { gain, loss } = elevationStats(coordinates, elevations)
  const unchanged = sameElevations(route.elevations, elevations) && sameFigure(route.gain, gain) && sameFigure(route.loss, loss)
  return { status: unchanged ? 'unchanged' : 'changed', elevations, gain, loss }
}
