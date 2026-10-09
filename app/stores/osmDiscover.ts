import { type Bbox, bboxContains, fitsOsmSearch, OSM_KIND_SPORTS, type OsmRoute, type OsmRouteKind, osmSearchBbox, sortOsmRoutes } from '#shared/utils/osmRoutes'
import { activeOsmFilterCount, defaultOsmFilters, matchesOsmFilters, type OsmDiscoverState, type OsmRouteFilters } from '#shared/utils/osmFilters'
import type { MapViewState } from '~/stores/routeSearch'

// Marked routes of OpenStreetMap around the map view (#69). Overpass is slow and allows few queries: the page searches
// when it opens and when the kind changes, then only when asked ("Chercher dans cette zone"). The store outlives the
// page, so coming back from the editor finds the same view and results. Quick filters (#70) only hide loaded routes.
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

  const tooWide = computed(() => !!bounds.value && !fitsOsmSearch(bounds.value))
  // The results cover the view: no need to offer a new search.
  const viewSearched = computed(() => !!bounds.value && !!searched.value && searched.value.kind === kind.value
    && bboxContains(searched.value.bbox, bounds.value))
  const shownRoutes = computed(() => routes.value.filter(route => matchesOsmFilters(route, filters.value)))
  const activeFilterCount = computed(() => activeOsmFilterCount(filters.value))

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
    }
    catch (caught) {
      if (!signal.aborted) error.value = caught
    }
    finally {
      if (!signal.aborted) loading.value = false
    }
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
    shownRoutes, activeFilterCount, search, setView, startFrom, searchIfNeeded, importIntoEditor, setKind, resetFilters,
    applyState,
  }
})
