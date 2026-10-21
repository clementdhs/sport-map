import type { Ref } from 'vue'
import type { RouteOsmPlaces } from '#shared/types/routes'
import type { OsmPlace } from '#shared/utils/osmPlaces'
import type { LngLat } from '#shared/utils/routes'

// The useful places of a route (#52) on its page: those saved with it, searched in OpenStreetMap the first time
// the page shows a route without any (never searched, or its track changed since), then only on request. The
// answer is saved for every member and for follow mode, offline included.
export function useRouteOsmPlaces(routeId: string, coordinates: Ref<LngLat[]>, saved: RouteOsmPlaces | null) {
  const errorMessage = useErrorMessage()
  const places = ref<OsmPlace[]>(saved?.places ?? [])
  const searchedAt = ref<string | null>(saved?.searched_at ?? null)
  const searching = ref(false)
  const failure = ref<string | null>(null)
  let controller: AbortController | undefined

  async function search() {
    controller?.abort()
    const current = (controller = new AbortController())
    searching.value = true
    failure.value = null
    try {
      const found = await searchOsmPlaces(coordinates.value, current.signal)
      const result = await $fetch<RouteOsmPlaces>(`/api/routes/${routeId}/osm-places`, { method: 'PUT', body: { places: found } })
      places.value = result.places
      searchedAt.value = result.searched_at
      // A copy prepared for offline use would otherwise keep the old places.
      refreshOfflineRoutePages(routeId).catch(error => console.warn('[osm-places] offline copy', error))
    }
    catch (error) {
      if (current.signal.aborted) return
      failure.value = errorMessage(error)
    }
    finally {
      if (controller === current) searching.value = false
    }
  }

  onMounted(() => {
    if (!searchedAt.value && navigator.onLine && coordinates.value.length >= 2) search()
  })
  onBeforeUnmount(() => controller?.abort())

  return { places, searchedAt, searching, failure, search }
}
