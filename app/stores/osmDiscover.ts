import { type Bbox, bboxContains, fitsOsmSearch, OSM_KIND_SPORTS, type OsmRoute, type OsmRouteKind, osmSearchBbox, sortOsmRoutes } from '#shared/utils/osmRoutes'
import { activeOsmFilterCount, defaultOsmFilters, matchesOsmFilters, type OsmDiscoverState, type OsmRouteFilters } from '#shared/utils/osmFilters'
import type { OsmRouteElevation } from '#shared/types/osm'
import type { MapViewState } from '~/stores/routeSearch'

// What the list shows of a route's elevation gain (#71): known, being computed or waiting for it, or unknown (a route
// that can't be imported, or whose computation failed).
export type OsmElevationState = { status: 'known', gain_m: number } | { status: 'pending' | 'unknown' }

// Marked routes of OpenStreetMap around the map view (#69). Overpass is slow and allows few queries: the page searches
// when it opens and when the kind changes, then only when asked ("Chercher dans cette zone"). The store outlives the
// page, so coming back from the editor finds the same view and results. Quick filters (#70) only hide loaded routes.
// Elevation gains (#71) come from the family's cache, else are computed by the server one route at a time, while the
// page is open, for the complete routes the quick filters keep.
export const useOsmDiscoverStore = defineStore('osmDiscover', () => {
  // Not useI18n(): the store may first be used outside a component's setup.
  const { $i18n } = useNuxtApp()

  const kind = ref<OsmRouteKind>('foot')
  // Map view, restored when coming back; the pages opening this one set it to their own view.
  const view = ref<Omit<MapViewState, 'bounds'>>({ center: [2.35, 46.6], zoom: 5 })
  const bounds = ref<Bbox | null>(null)

  const routes = ref<OsmRoute[]>([])
  // Area and kind of the shown results.
  const searched = ref<{ bbox: Bbox, kind: OsmRouteKind } | null>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)
  const highlightedId = ref<number | null>(null)
  const selectedId = ref<number | null>(null)
  const filters = ref<OsmRouteFilters>(defaultOsmFilters())
  let controller: AbortController | undefined

  // By relation id, whatever its version: a newer version of the relation is computed again.
  const elevations = ref<Record<number, OsmRouteElevation>>({})
  // Relations whose cache entry was asked (the others wait for it), and those whose computation failed this search.
  const lookedUp = reactive(new Set<number>())
  const elevationFailed = reactive(new Set<number>())
  const computingElevationId = ref<number | null>(null)

  function elevationOf(route: OsmRoute): OsmRouteElevation | null {
    const known = elevations.value[route.id]
    return known && known.version === route.version ? known : null
  }
  const canHaveElevation = (route: OsmRoute) => route.complete && route.version !== null
  const needsElevation = (route: OsmRoute) => canHaveElevation(route) && lookedUp.has(route.id)
    && !elevationFailed.has(route.id) && !elevationOf(route)

  const tooWide = computed(() => !!bounds.value && !fitsOsmSearch(bounds.value))
  // The results cover the view: no need to offer a new search.
  const viewSearched = computed(() => !!bounds.value && !!searched.value && searched.value.kind === kind.value
    && bboxContains(searched.value.bbox, bounds.value))
  const shownRoutes = computed(() => routes.value.filter(route => matchesOsmFilters(route, filters.value, elevationOf(route))))
  const activeFilterCount = computed(() => activeOsmFilterCount(filters.value))

  function elevationState(route: OsmRoute): OsmElevationState {
    const known = elevationOf(route)
    if (known) return { status: 'known', gain_m: known.gain_m }
    const waiting = canHaveElevation(route) && !elevationFailed.has(route.id)
    return { status: waiting ? 'pending' : 'unknown' }
  }
  // Shown routes still waiting for their gain.
  const elevationsLeft = computed(() => shownRoutes.value.filter(route => elevationState(route).status === 'pending').length)

  // A route hidden by the filters is no longer selected.
  watch(shownRoutes, (shown) => {
    if (!shown.some(route => route.id === selectedId.value)) selectedId.value = null
  })

  async function search() {
    if (!bounds.value || tooWide.value) return
    // A newer search replaces the one still running.
    controller?.abort()
    controller = new AbortController()
    const { signal } = controller
    const bbox = osmSearchBbox(bounds.value)
    const searchedKind = kind.value
    loading.value = true
    error.value = null
    try {
      const found = await searchOsmRoutes(bbox, searchedKind, signal)
      routes.value = sortOsmRoutes(found, $i18n.locale.value)
      searched.value = { bbox, kind: searchedKind }
      highlightedId.value = null
      if (!found.some(route => route.id === selectedId.value)) selectedId.value = null
      elevationFailed.clear()
      lookUpElevations(found)
    }
    catch (caught) {
      if (!signal.aborted) error.value = caught
    }
    finally {
      if (!signal.aborted) loading.value = false
    }
  }

  // One request for what the family already computed.
  async function lookUpElevations(found: OsmRoute[]) {
    const ids = found.filter(route => canHaveElevation(route) && !lookedUp.has(route.id)).map(route => route.id)
    for (let i = 0; i < ids.length; i += MAX_OSM_ELEVATION_LOOKUP) {
      const batch = ids.slice(i, i + MAX_OSM_ELEVATION_LOOKUP)
      try {
        const rows = await $fetch<OsmRouteElevation[]>('/api/osm/elevations/lookup', { method: 'POST', body: { ids: batch } })
        for (const row of rows) elevations.value[row.relation_id] = row
      }
      catch {
        // They are computed instead: the server looks in the cache again before any call.
      }
      for (const id of batch) lookedUp.add(id)
    }
  }

  // Computes while the page is open: watching the shown routes (filters, new results, cache answers) restarts it.
  let computing = false
  let elevationsActive = false
  let changed = false
  watch([shownRoutes, () => lookedUp.size], () => {
    if (elevationsActive) computeElevations()
  })

  async function computeElevations() {
    if (computing) {
      changed = true
      return
    }
    computing = true
    try {
      do {
        changed = false
        await computeShownElevations()
      } while (changed && elevationsActive)
    }
    finally {
      computing = false
      computingElevationId.value = null
    }
  }

  // In list order. A failure (service busy or down) stops until the list changes, rather than trying every route.
  async function computeShownElevations() {
    let route: OsmRoute | undefined
    while (elevationsActive && (route = shownRoutes.value.find(needsElevation))) {
      computingElevationId.value = route.id
      try {
        const row = await $fetch<OsmRouteElevation>('/api/osm/elevations', {
          method: 'POST',
          body: { relation_id: route.id, version: route.version, coordinates: osmRouteTrack(route).coordinates },
        })
        elevations.value[row.relation_id] = row
        if (!elevationOf(route)) elevationFailed.add(route.id)
      }
      catch {
        elevationFailed.add(route.id)
        return
      }
    }
  }

  function startElevations() {
    elevationsActive = true
    computeElevations()
  }

  function stopElevations() {
    elevationsActive = false
  }

  function setView({ bounds: nextBounds, center, zoom }: MapViewState) {
    bounds.value = nextBounds
    view.value = { center, zoom }
  }

  // Opens on another page's view; the results of a previous visit stay until the next search.
  function startFrom(start: Omit<MapViewState, 'bounds'>) {
    view.value = { ...start }
    // Unknown until the map shows the new view.
    bounds.value = null
  }

  // Starts a new route in the editor from a complete marked route: its sport, and its source in the description
  // (with the attribution the ODbL asks for).
  function importIntoEditor(route: OsmRoute) {
    const editor = useRouteEditorStore()
    // A saved route being edited stays as it was.
    if (editor.editingId) editor.reset()
    editor.importTrack(osmRouteTrack(route))
    editor.details.sport_type = OSM_KIND_SPORTS[searched.value?.kind ?? kind.value]
    if (!editor.details.description) {
      editor.details.description = $i18n.t('discover.importedDescription', {
        name: route.name ?? route.ref ?? $i18n.t('discover.unnamed'),
        url: `https://www.openstreetmap.org/relation/${route.id}`,
      })
    }
  }

  // The page searches on its own when it opens, when nothing covers the view yet.
  function searchIfNeeded() {
    if (!viewSearched.value && !loading.value) search()
  }

  // The other kind's results would be misleading, even while the new ones load.
  function clearResults() {
    controller?.abort()
    loading.value = false
    error.value = null
    routes.value = []
    searched.value = null
    selectedId.value = null
    highlightedId.value = null
  }

  function setKind(next: OsmRouteKind) {
    if (next === kind.value) return
    kind.value = next
    clearResults()
    // Walking and MTB grades aren't on the same scale.
    filters.value.maxGrade = null
    search()
  }

  function resetFilters() {
    filters.value = defaultOsmFilters()
  }

  // The page's URL: a shared link, or the page found again in the history. The page searches once the map shows the
  // view.
  function applyState(state: OsmDiscoverState) {
    if (state.kind !== kind.value) {
      kind.value = state.kind
      clearResults()
    }
    filters.value = state.filters
    if (state.view) startFrom(state.view)
  }

  return {
    kind, view, bounds, routes, searched, loading, error, highlightedId, selectedId, filters, tooWide, viewSearched,
    shownRoutes, activeFilterCount, computingElevationId, elevationsLeft, search, setView, startFrom,
    searchIfNeeded, importIntoEditor, setKind, resetFilters, applyState, elevationState, startElevations,
    stopElevations,
  }
})
