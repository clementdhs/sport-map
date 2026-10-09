<script setup lang="ts">
import type { OsmRoute, OsmRouteKind } from '#shared/utils/osmRoutes'
import type { MapFocus, MapViewState } from '~/stores/routeSearch'

// Marked routes of OpenStreetMap around the map view (#69). Map page: MapSheetLayout replaces the header with its
// floating top bar.
definePageMeta({ layout: false })
const { t } = useI18n()
const { formatDistance } = useFormat()
const errorMessage = useErrorMessage()
useSeoMeta({ title: () => `${t('discover.title')} — sport-map` })

const discover = useOsmDiscoverStore()
const focus = ref<MapFocus | null>(null)

// The URL holds the kind, the filters and the view (#70), to share a search. Without any (a link of the app), the
// page keeps the store's, then writes them.
const route = useRoute()
const router = useRouter()
if (Object.keys(route.query).length) discover.applyState(parseOsmDiscoverQuery(route.query))
const pageQuery = computed(() => JSON.stringify(osmDiscoverQuery({ kind: discover.kind, filters: discover.filters, view: discover.view })))
// Written with history.replaceState, not router.replace: a navigation at each map move would run the route
// middleware, and a navigateTo() called meanwhile ("Importer") would be dropped, Nuxt taking it for a middleware's
// redirect. vue-router keeps the URL of the current history entry in its state (`current`) and rewrites the entry
// with it when the page is left: it gets the new one too.
onMounted(() => {
  watch(pageQuery, (query) => {
    const { fullPath, href } = router.resolve({ path: route.path, query: JSON.parse(query) })
    window.history.replaceState({ ...window.history.state, current: fullPath }, '', href)
  }, { immediate: true })
})

const kindItems = computed(() => OSM_ROUTE_KINDS.map(value =>
  ({ value, label: t(`discover.kinds.${value}`), icon: SPORT_ICONS[OSM_KIND_SPORTS[value]] })))
const kind = computed({
  get: () => discover.kind,
  set: (value: OsmRouteKind) => discover.setKind(value),
})

const label = (route: OsmRoute) => route.name ?? route.ref ?? t('discover.unnamed')
const scopeOf = (route: OsmRoute) => osmRouteScope(route.network)
const shapeOf = (route: OsmRoute) => osmRouteShape(route)
const shownId = computed(() => discover.highlightedId ?? discover.selectedId)

// The first view of the map starts a search, unless results already cover it (coming back from the editor).
let viewKnown = false
function onViewChange(view: MapViewState) {
  discover.setView(view)
  if (!viewKnown) {
    viewKnown = true
    discover.searchIfNeeded()
  }
}

const statusLabel = computed(() => {
  if (discover.loading) return t('discover.searching')
  if (discover.error) return t('discover.failed')
  if (!discover.searched) return discover.tooWide ? t('discover.zoomIn') : t('discover.title')
  const count = discover.routes.length
  if (!count) return t('discover.none')
  const shown = discover.shownRoutes.length
  if (shown < count) return t('discover.shownCount', { shown, count }, shown)
  return t('discover.count', { count }, count)
})

// Picked in the list: framed on the map. Picked on the map: shown in the list.
function selectInList(route: OsmRoute) {
  discover.selectedId = route.id
  const bbox = osmRouteBbox(route)
  focus.value = { center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2], bbox }
}

const editor = useRouteEditorStore()
const toast = useToast()

async function importRoute(route: OsmRoute) {
  // A new route being drawn would be lost; a saved one being edited stays as it was.
  if (!editor.editingId && editor.waypoints.length && !window.confirm(t('discover.replaceDraft'))) return
  discover.importIntoEditor(route)
  toast.add({
    title: t('discover.imported'),
    description: t('discover.importedPoints', { count: editor.track.coordinates.length }),
    color: 'success',
    icon: 'i-lucide-file-check',
  })
  await navigateTo('/routes/create')
}

async function selectOnMap(id: number) {
  discover.selectedId = id
  await nextTick()
  document.getElementById(`osm-route-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}
</script>

<template>
  <MapSheetLayout back="/">
    <template #map>
      <ClientOnly>
        <MapOsmRoutes
          :routes="discover.shownRoutes"
          :highlighted-id="shownId"
          :focus="focus"
          :center="discover.view.center"
          :zoom="discover.view.zoom"
          :label="label"
          @view-change="onViewChange"
          @hover="discover.highlightedId = $event"
          @select="selectOnMap"
        />
      </ClientOnly>
    </template>

    <template #search>
      <SearchBox places-only @place="focus = $event" />
    </template>

    <template #title>
      <span class="flex items-center gap-2">
        <span class="truncate">{{ statusLabel }}</span>
        <UIcon v-if="discover.loading" name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin text-muted" aria-hidden="true" />
      </span>
    </template>

    <h1 class="text-lg font-semibold max-md:sr-only">{{ t('discover.title') }}</h1>

    <UTabs v-model="kind" :items="kindItems" :content="false" size="sm" :aria-label="t('discover.kind')" />
    <div>
      <OsmRouteFilters />
    </div>

    <template v-if="!discover.viewSearched">
      <UButton
        icon="i-lucide-search"
        :label="t('discover.searchHere')"
        block
        :loading="discover.loading"
        :disabled="discover.tooWide"
        @click="discover.search()"
      />
      <p v-if="discover.tooWide" class="-mt-2 text-sm text-muted">
        <UIcon name="i-lucide-zoom-in" class="mr-1 align-text-bottom" />{{ t('discover.zoomInHint') }}
      </p>
    </template>

    <!-- Shown by the sheet title on mobile, still read out from here. -->
    <p class="flex items-center gap-2 text-sm text-muted max-md:sr-only" aria-live="polite">
      {{ statusLabel }}
      <UIcon v-if="discover.loading" name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />
    </p>

    <UAlert
      v-if="discover.error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('discover.failed')"
      :description="errorMessage(discover.error)"
      :actions="[{ label: t('discover.retry'), color: 'neutral', variant: 'outline', onClick: () => discover.search() }]"
    />

    <ul v-if="discover.shownRoutes.length" class="space-y-2" :class="{ 'opacity-60': discover.loading }" :aria-label="t('discover.results')">
      <li v-for="route in discover.shownRoutes" :id="`osm-route-${route.id}`" :key="route.id">
        <button
          type="button"
          class="w-full rounded-md border p-3 text-left"
          :class="shownId === route.id ? 'border-primary' : 'border-default'"
          :aria-pressed="discover.selectedId === route.id"
          @mouseenter="discover.highlightedId = route.id"
          @mouseleave="discover.highlightedId = null"
          @focus="discover.highlightedId = route.id"
          @blur="discover.highlightedId = null"
          @click="selectInList(route)"
        >
          <span class="block font-medium">{{ label(route) }}</span>
          <span class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{{ formatDistance(route.distance_m) }}</span>
            <span v-if="shapeOf(route) === 'linear'">· {{ t('discover.outAndBackDistance', { distance: formatDistance(2 * route.distance_m) }) }}</span>
            <UBadge v-if="shapeOf(route) !== 'unknown'" :label="t(`discover.shapes.${shapeOf(route)}`)" :icon="shapeOf(route) === 'loop' ? 'i-lucide-repeat' : 'i-lucide-move-right'" color="neutral" variant="subtle" size="sm" />
            <UBadge v-if="scopeOf(route)" :label="t(`discover.scopes.${scopeOf(route)}`)" color="neutral" variant="subtle" size="sm" />
            <UBadge v-if="route.name && route.ref" :label="route.ref" color="neutral" variant="outline" size="sm" />
            <UBadge v-if="!route.complete" :label="t('discover.incomplete')" icon="i-lucide-unlink" color="warning" variant="subtle" size="sm" />
          </span>
        </button>
        <template v-if="discover.selectedId === route.id">
          <UButton
            v-if="route.complete"
            icon="i-lucide-route"
            :label="t('discover.import')"
            :aria-label="t('discover.importLabel', { name: label(route) })"
            size="sm"
            block
            class="mt-2"
            @click="importRoute(route)"
          />
          <p v-else class="mt-1 px-1 text-sm text-muted">
            {{ t('discover.incompleteHint') }}
          </p>
        </template>
      </li>
    </ul>
    <div v-else-if="discover.routes.length" class="space-y-2">
      <p class="text-sm text-muted">{{ t('discover.noneFiltered') }}</p>
      <UButton :label="t('filters.reset')" icon="i-lucide-rotate-ccw" color="neutral" variant="outline" size="sm" @click="discover.resetFilters" />
    </div>
    <p v-else-if="discover.searched && !discover.loading && !discover.error" class="text-sm text-muted">
      {{ t('discover.noneHint') }}
    </p>

    <p class="text-xs text-muted">
      <i18n-t keypath="discover.attribution" scope="global">
        <template #link>
          <ULink to="https://www.openstreetmap.org/copyright" target="_blank" class="underline">{{ t('discover.osmContributors') }}</ULink>
        </template>
      </i18n-t>
    </p>
  </MapSheetLayout>
</template>
