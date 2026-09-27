import { length, lineString } from '@turf/turf'
import type { FetchError } from 'ofetch'
import type { LngLat, RouteDetails, RoutingSegmentResponse } from '#shared/utils/routes'

// The track between two consecutive waypoints.
interface Segment {
  id: number
  coordinates: LngLat[]
  // null while loading, or when the elevation service could not be reached
  elevations: number[] | null
  loading: boolean
}

const defaultDetails = (): RouteDetails => ({
  name: '',
  description: '',
  sport_type: 'running',
  is_public: true,
})

// ~10 cm precision is plenty and keeps payloads small.
const round = (value: number) => Math.round(value * 1e6) / 1e6
const samePoint = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1]

export const useRouteEditorStore = defineStore('routeEditor', () => {
  const toast = useToast()

  const waypoints = ref<LngLat[]>([])
  const segments = ref<Segment[]>([])
  const details = ref<RouteDetails>(defaultDetails())
  const snapToPaths = ref(true)
  let nextSegmentId = 0

  const track = computed(() => {
    if (!segments.value.length) return { coordinates: [...waypoints.value], elevations: null }

    const coordinates: LngLat[] = []
    const elevations: number[] = []
    let hasElevations = true
    for (const segment of segments.value) {
      // Segments share their junction point: keep it once.
      const skipFirst = coordinates.length > 0 && samePoint(coordinates.at(-1)!, segment.coordinates[0]!)
      coordinates.push(...segment.coordinates.slice(skipFirst ? 1 : 0))
      if (segment.elevations) elevations.push(...segment.elevations.slice(skipFirst ? 1 : 0))
      else hasElevations = false
    }
    return { coordinates, elevations: hasElevations ? elevations : null }
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

  async function addWaypoint([lng, lat]: LngLat) {
    const to: LngLat = [round(lng), round(lat)]
    waypoints.value.push(to)
    if (waypoints.value.length === 1) return

    // Start from where the previous segment really ends (a snapped point), to keep the track continuous.
    const previous = segments.value.at(-1)
    const from = previous && !previous.loading ? previous.coordinates.at(-1)! : waypoints.value.at(-2)!
    const mode = snapToPaths.value ? 'snap' : 'straight'
    const id = nextSegmentId++
    segments.value.push({ id, coordinates: [from, to], elevations: null, loading: true })

    try {
      const result = await $fetch<RoutingSegmentResponse>('/api/routing/segment', {
        method: 'POST',
        body: { from, to, mode, sport_type: details.value.sport_type },
      })
      const index = segments.value.findIndex(s => s.id === id)
      if (index === -1) return // undone while loading
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
      const segment = segments.value.find(s => s.id === id)
      if (segment) segment.loading = false
    }
  }

  function undo() {
    waypoints.value.pop()
    segments.value.pop()
  }

  function clearPoints() {
    waypoints.value = []
    segments.value = []
  }

  function reset() {
    clearPoints()
    details.value = defaultDetails()
  }

  async function save(): Promise<string> {
    const { id } = await $fetch<{ id: string }>('/api/routes', {
      method: 'POST',
      body: {
        ...details.value,
        coordinates: track.value.coordinates,
        elevations: track.value.elevations ?? undefined,
      },
    })
    reset()
    return id
  }

  return {
    waypoints, details, snapToPaths, track, distanceM, elevation, isRouting, canSave,
    addWaypoint, undo, clearPoints, reset, save,
  }
})
