import { distance, length, lineString } from '@turf/turf'
import type { FetchError } from 'ofetch'
import type { RouteDetail } from '#shared/types/routes'
import type { EditorState, LngLat, RouteDetails, RoutingMode, RoutingSegmentResponse, SegmentMode } from '#shared/utils/routes'
import type { ImportedTrack } from '~/utils/gpx'

// The track between two consecutive waypoints.
interface Segment {
  id: number
  // How the track was obtained. Imported and locked segments cannot be recomputed without losing their track.
  mode: SegmentMode
  coordinates: LngLat[]
  // null while loading, when the elevation service could not be reached, or for a GPX without elevation
  elevations: number[] | null
  loading: boolean
}

interface Snapshot {
  waypoints: LngLat[]
  segments: Segment[]
}

const MAX_HISTORY = 50
const LOOP_TOLERANCE_M = 30

const defaultDetails = (): RouteDetails => ({
  name: '',
  description: '',
  sport_type: 'running',
  is_public: true,
})

// ~10 cm precision is plenty and keeps payloads small.
const round = (value: number) => Math.round(value * 1e6) / 1e6
const roundPoint = ([lng, lat]: LngLat): LngLat => [round(lng), round(lat)]
const samePoint = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1]
const isLocked = (mode: SegmentMode) => mode === 'imported' || mode === 'locked'

// A saved editor state can only be trusted if it matches the saved track.
function isUsableState(state: EditorState | null, pointCount: number): state is EditorState {
  return !!state
    && state.segments.length === state.waypoints.length - 1
    && state.segments.every(s => s.start <= s.end && s.end < pointCount)
}

export const useRouteEditorStore = defineStore('routeEditor', () => {
  const toast = useToast()

  const waypoints = ref<LngLat[]>([])
  const segments = ref<Segment[]>([])
  const details = ref<RouteDetails>(defaultDetails())
  const snapToPaths = ref(true)
  // Incremented when the whole track is replaced, so the map can frame it.
  const replacedCount = ref(0)
  const history = shallowRef<Snapshot[]>([])
  // Set when editing a saved route: saving then updates it instead of creating a new one.
  const editingId = ref<string | null>(null)
  const editingSource = ref<'drawn' | 'gpx_import'>('drawn')
  let nextSegmentId = 0
  // Segments with a routing request in flight: lets undo restart the ones whose request already finished.
  const inFlight = new Set<number>()

  // ranges[i] locates segment i in the track, so the editor state can be saved without duplicating coordinates.
  const track = computed(() => {
    if (!segments.value.length) return { coordinates: [...waypoints.value], elevations: null, ranges: [] }

    const coordinates: LngLat[] = []
    const elevations: number[] = []
    const ranges: { start: number, end: number }[] = []
    let hasElevations = true
    for (const segment of segments.value) {
      // Segments share their junction point: keep it once.
      const skipFirst = coordinates.length > 0 && samePoint(coordinates.at(-1)!, segment.coordinates[0]!)
      const start = skipFirst ? coordinates.length - 1 : coordinates.length
      coordinates.push(...segment.coordinates.slice(skipFirst ? 1 : 0))
      ranges.push({ start, end: coordinates.length - 1 })
      if (segment.elevations) elevations.push(...segment.elevations.slice(skipFirst ? 1 : 0))
      else hasElevations = false
    }
    return { coordinates, elevations: hasElevations ? elevations : null, ranges }
  })

  // Client-side estimate for live feedback; the database computes the stored distance.
  const distanceM = computed(() =>
    track.value.coordinates.length < 2 ? 0 : length(lineString(track.value.coordinates), { units: 'meters' }),
  )
  const elevation = computed(() =>
    track.value.elevations ? elevationStats(track.value.coordinates, track.value.elevations) : null,
  )
  const isRouting = computed(() => segments.value.some(segment => segment.loading))
  const canSave = computed(() =>
    !isRouting.value
    && track.value.coordinates.length >= 2
    && track.value.coordinates.length <= MAX_ROUTE_POINTS,
  )
  const canUndo = computed(() => history.value.length > 0)
  // Snapping can leave the end a few meters from the start of a closed loop.
  const isLoop = computed(() => waypoints.value.length >= 3
    && distance(waypoints.value[0]!, waypoints.value.at(-1)!, { units: 'meters' }) < LOOP_TOLERANCE_M)
  const canFinish = computed(() => waypoints.value.length >= 2 && !isLoop.value && !isRouting.value)

  function saveSnapshot() {
    const snapshot: Snapshot = JSON.parse(JSON.stringify({ waypoints: waypoints.value, segments: segments.value }))
    history.value = [...history.value.slice(-(MAX_HISTORY - 1)), snapshot]
  }

  function newSegment(from: LngLat, to: LngLat, mode: RoutingMode): Segment {
    return { id: nextSegmentId++, mode, coordinates: [from, to], elevations: null, loading: true }
  }

  // Fetches the track of a segment. Every edit replaces segments with new ids, so a late answer for
  // a segment that no longer exists is simply ignored.
  async function routeSegment({ id, mode, coordinates }: Segment) {
    if (isLocked(mode)) return
    const from = coordinates[0]!
    const to = coordinates.at(-1)!
    inFlight.add(id)
    try {
      const result = await $fetch<RoutingSegmentResponse>('/api/routing/segment', {
        method: 'POST',
        body: { from, to, mode, sport_type: details.value.sport_type },
      })
      const index = segments.value.findIndex(s => s.id === id)
      if (index === -1) return
      const segment = segments.value[index]!
      segment.coordinates = result.coordinates
      segment.elevations = result.elevations
      // Snapping moves the ends onto the nearest path: keep the markers on the track.
      waypoints.value[index + 1] = result.coordinates.at(-1)!
      if (index === 0) waypoints.value[0] = result.coordinates[0]!
      if (mode === 'snap' && !result.snapped) {
        toast.add({
          title: 'Aucun chemin trouvé',
          description: 'Ce segment est tracé en ligne droite.',
          color: 'warning',
          icon: 'i-lucide-route-off',
        })
      }
    }
    catch (error) {
      if (!segments.value.some(s => s.id === id)) return
      toast.add({
        title: "Calcul de l'itinéraire impossible",
        description: `${(error as FetchError).data?.statusMessage ?? (error as Error).message}. Le segment reste en ligne droite, sans dénivelé.`,
        color: 'error',
      })
    }
    finally {
      inFlight.delete(id)
      const segment = segments.value.find(s => s.id === id)
      if (segment) segment.loading = false
    }
  }

  // Waypoints at the end of a locked segment stay put.
  function canEditWaypoint(index: number): boolean {
    const before = segments.value[index - 1]
    const after = segments.value[index]
    return !(before && isLocked(before.mode)) && !(after && isLocked(after.mode))
  }

  function canInsertInSegment(index: number): boolean {
    const segment = segments.value[index]
    return !!segment && !isLocked(segment.mode) && !segment.loading
  }

  function addWaypoint(point: LngLat) {
    saveSnapshot()
    const to = roundPoint(point)
    waypoints.value.push(to)
    if (waypoints.value.length === 1) return
    const segment = newSegment(waypoints.value.at(-2)!, to, snapToPaths.value ? 'snap' : 'straight')
    segments.value.push(segment)
    routeSegment(segment)
  }

  // Each adjacent segment keeps its own mode.
  function moveWaypoint(index: number, point: LngLat) {
    if (!canEditWaypoint(index)) return
    saveSnapshot()
    const moved = roundPoint(point)
    waypoints.value[index] = moved
    const recomputed: Segment[] = []
    const before = segments.value[index - 1]
    if (before) {
      const segment = newSegment(waypoints.value[index - 1]!, moved, before.mode as RoutingMode)
      segments.value[index - 1] = segment
      recomputed.push(segment)
    }
    const after = segments.value[index]
    if (after) {
      const segment = newSegment(moved, waypoints.value[index + 1]!, after.mode as RoutingMode)
      segments.value[index] = segment
      recomputed.push(segment)
    }
    recomputed.forEach(routeSegment)
  }

  // Splits a segment in two at a new waypoint; both halves keep the segment's mode.
  function insertWaypoint(segmentIndex: number, point: LngLat) {
    if (!canInsertInSegment(segmentIndex)) return
    saveSnapshot()
    const inserted = roundPoint(point)
    const mode = segments.value[segmentIndex]!.mode as RoutingMode
    waypoints.value.splice(segmentIndex + 1, 0, inserted)
    const halves = [
      newSegment(waypoints.value[segmentIndex]!, inserted, mode),
      newSegment(inserted, waypoints.value[segmentIndex + 2]!, mode),
    ]
    segments.value.splice(segmentIndex, 1, ...halves)
    halves.forEach(routeSegment)
  }

  // A middle waypoint's two segments merge into one, in the mode of the first.
  function removeWaypoint(index: number) {
    if (!canEditWaypoint(index)) return
    saveSnapshot()
    const last = waypoints.value.length - 1
    if (index === 0) {
      waypoints.value.shift()
      segments.value.shift()
    }
    else if (index === last) {
      waypoints.value.pop()
      segments.value.pop()
    }
    else {
      const mode = segments.value[index - 1]!.mode as RoutingMode
      waypoints.value.splice(index, 1)
      const merged = newSegment(waypoints.value[index - 1]!, waypoints.value[index]!, mode)
      segments.value.splice(index - 1, 2, merged)
      routeSegment(merged)
    }
  }

  // Routed like any new segment, in the current mode.
  function returnToStart() {
    if (!canFinish.value) return
    addWaypoint(waypoints.value[0]!)
  }

  // Appends the track reversed: segments are reused as they are (same mode, no routing request), and the
  // turnaround becomes an ordinary waypoint.
  function outAndBack() {
    if (!canFinish.value) return
    saveSnapshot()
    const reversed = [...segments.value].reverse().map(segment => ({
      ...segment,
      id: nextSegmentId++,
      coordinates: [...segment.coordinates].reverse(),
      elevations: segment.elevations ? [...segment.elevations].reverse() : null,
    }))
    waypoints.value = [...waypoints.value, ...waypoints.value.slice(0, -1).reverse()]
    segments.value = [...segments.value, ...reversed]
  }

  // The imported track becomes a single segment: the user can extend it by clicking, or undo the import.
  function importTrack({ name, coordinates, elevations }: ImportedTrack) {
    saveSnapshot()
    waypoints.value = [coordinates[0]!, coordinates.at(-1)!]
    segments.value = [{ id: nextSegmentId++, mode: 'imported', coordinates, elevations, loading: false }]
    if (name && !details.value.name) details.value.name = name.slice(0, 120)
    replacedCount.value++
  }

  function undo() {
    const previous = history.value.at(-1)
    if (!previous) return
    history.value = history.value.slice(0, -1)
    waypoints.value = previous.waypoints
    segments.value = previous.segments
    // A segment saved while loading whose request has since finished would otherwise stay loading forever.
    for (const segment of segments.value) {
      if (segment.loading && !inFlight.has(segment.id)) routeSegment(segment)
    }
  }

  function clearPoints() {
    saveSnapshot()
    waypoints.value = []
    segments.value = []
  }

  function reset() {
    waypoints.value = []
    segments.value = []
    history.value = []
    details.value = defaultDetails()
    editingId.value = null
    editingSource.value = 'drawn'
  }

  // Routes saved before the editor state existed come back as one locked segment: they can be
  // extended, or cleared and redrawn.
  function loadRoute(route: RouteDetail) {
    reset()
    editingId.value = route.id
    editingSource.value = route.source
    details.value = {
      name: route.name,
      description: route.description ?? '',
      sport_type: route.sport_type,
      is_public: route.is_public,
    }

    const coordinates = route.geometry.coordinates as LngLat[]
    const elevations = route.elevation_profile?.length === coordinates.length ? route.elevation_profile : null
    const slice = (start: number, end: number) => ({
      coordinates: coordinates.slice(start, end + 1),
      elevations: elevations?.slice(start, end + 1) ?? null,
    })

    if (isUsableState(route.editor_state, coordinates.length)) {
      waypoints.value = route.editor_state.waypoints
      segments.value = route.editor_state.segments.map(({ mode, start, end }) =>
        ({ id: nextSegmentId++, mode, loading: false, ...slice(start, end) }))
    }
    else {
      waypoints.value = [coordinates[0]!, coordinates.at(-1)!]
      segments.value = [{ id: nextSegmentId++, mode: 'locked', loading: false, ...slice(0, coordinates.length - 1) }]
    }
    replacedCount.value++
  }

  // A locked segment keeps the source of the route it comes from.
  const source = computed(() => {
    if (segments.value.some(segment => segment.mode === 'imported')) return 'gpx_import'
    if (segments.value.some(segment => segment.mode === 'locked')) return editingSource.value
    return 'drawn'
  })

  async function save(): Promise<string> {
    const body = {
      ...details.value,
      coordinates: track.value.coordinates,
      elevations: track.value.elevations ?? undefined,
      source: source.value,
      editor_state: {
        waypoints: waypoints.value,
        segments: segments.value.map((segment, i) => ({ mode: segment.mode, ...track.value.ranges[i]! })),
      } satisfies EditorState,
    }
    const { id } = editingId.value
      ? await $fetch<{ id: string }>(`/api/routes/${editingId.value}`, { method: 'PUT', body })
      : await $fetch<{ id: string }>('/api/routes', { method: 'POST', body })
    reset()
    return id
  }

  return {
    waypoints, segments, details, snapToPaths, track, distanceM, elevation, isRouting, canSave, canUndo, replacedCount,
    editingId, isLoop, canFinish,
    canEditWaypoint, canInsertInSegment,
    addWaypoint, moveWaypoint, insertWaypoint, removeWaypoint, returnToStart, outAndBack,
    importTrack, loadRoute, undo, clearPoints, reset, save,
  }
})
