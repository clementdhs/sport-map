import type { RouteSummary } from '#shared/types/routes'
import type { LngLat, RouteSearchQuery, SearchSort, SportType } from '#shared/utils/routes'

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

// Top of the distance and elevation sliders: selecting it means "no maximum".
export const DISTANCE_FILTER_MAX_KM = 100
export const GAIN_FILTER_MAX_M = 2000

export const useRouteSearchStore = defineStore('routeSearch', () => {
  const sport = ref<SportType | 'all'>('all')
  const distanceKm = ref<[number, number]>([0, DISTANCE_FILTER_MAX_KM])
  const gainM = ref<[number, number]>([0, GAIN_FILTER_MAX_M])
  const loopsOnly = ref(false)
  const passingThrough = ref(false)
  const sort = ref<SearchSort>('nearest')
  // Name or description; searched everywhere, not only in the map view.
  const text = ref('')
  const textQuery = computed(() => {
    const trimmed = text.value.trim()
    return trimmed.length >= MIN_SEARCH_TEXT_LENGTH ? trimmed : undefined
  })
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
    const [minGain, maxGain] = gainM.value
    return {
      minLng, minLat, maxLng, maxLat,
      sport: sport.value === 'all' ? undefined : sport.value,
      minKm: minKm > 0 ? minKm : undefined,
      maxKm: maxKm < DISTANCE_FILTER_MAX_KM ? maxKm : undefined,
      minGain: minGain > 0 ? minGain : undefined,
      maxGain: maxGain < GAIN_FILTER_MAX_M ? maxGain : undefined,
      loops: loopsOnly.value ? 'true' : undefined,
      through: passingThrough.value ? 'true' : undefined,
      sort: sort.value,
      q: textQuery.value,
    }
  })

  // The sort isn't a filter: it stays next to the results.
  const activeFilterCount = computed(() => [
    sport.value !== 'all',
    distanceKm.value[0] > 0 || distanceKm.value[1] < DISTANCE_FILTER_MAX_KM,
    gainM.value[0] > 0 || gainM.value[1] < GAIN_FILTER_MAX_M,
    loopsOnly.value,
    passingThrough.value,
  ].filter(Boolean).length)

  function resetFilters() {
    sport.value = 'all'
    distanceKm.value = [0, DISTANCE_FILTER_MAX_KM]
    gainM.value = [0, GAIN_FILTER_MAX_M]
    loopsOnly.value = false
    passingThrough.value = false
  }

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

  return {
    sport, distanceKm, gainM, loopsOnly, passingThrough, activeFilterCount, resetFilters,
    sort, text, textQuery, view, results, loading, failed, setView,
  }
})
