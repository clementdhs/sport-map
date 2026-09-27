import type { RouteSummary } from '#shared/types/routes'
import type { LngLat, RouteSearchQuery, SportType } from '#shared/utils/routes'

export type Bounds = [minLng: number, minLat: number, maxLng: number, maxLat: number]

export interface MapViewState {
  bounds: Bounds
  center: LngLat
  zoom: number
}

// Where to move the map, e.g. a place picked in the search box.
export interface MapFocus {
  center: LngLat
  bbox?: Bounds
}

// Top of the distance slider: selecting it means "no maximum".
export const DISTANCE_FILTER_MAX_KM = 100

export const useRouteSearchStore = defineStore('routeSearch', () => {
  const sport = ref<SportType | 'all'>('all')
  const distanceKm = ref<[number, number]>([0, DISTANCE_FILTER_MAX_KM])
  // Last map view, restored when coming back to the page.
  const view = ref<Omit<MapViewState, 'bounds'>>({ center: [2.35, 46.6], zoom: 5 })
  const bounds = ref<Bounds | null>(null)

  const results = ref<RouteSummary[]>([])
  const loading = ref(false)
  const failed = ref(false)
  let latestRequest = 0
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  const query = computed<RouteSearchQuery | null>(() => {
    if (!bounds.value) return null
    const [minLng, minLat, maxLng, maxLat] = bounds.value
    const [minKm, maxKm] = distanceKm.value
    return {
      minLng, minLat, maxLng, maxLat,
      sport: sport.value === 'all' ? undefined : sport.value,
      minKm: minKm > 0 ? minKm : undefined,
      maxKm: maxKm < DISTANCE_FILTER_MAX_KM ? maxKm : undefined,
    }
  })

  async function search() {
    if (!query.value) return
    // Map moves can overlap: only the latest request may update the results.
    const request = ++latestRequest
    loading.value = true
    try {
      const data = await $fetch<RouteSummary[]>('/api/routes', { query: query.value })
      if (request === latestRequest) {
        results.value = data
        failed.value = false
      }
    }
    catch {
      if (request === latestRequest) failed.value = true
    }
    finally {
      if (request === latestRequest) loading.value = false
    }
  }

  // Slider drags and map moves come in bursts.
  watch(query, () => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(search, 250)
  })

  function setView({ bounds: nextBounds, center, zoom }: MapViewState) {
    bounds.value = nextBounds
    view.value = { center, zoom }
  }

  return { sport, distanceKm, view, results, loading, failed, setView }
})
