<script setup lang="ts">
import type { OsmRoute, OsmRouteKind } from '#shared/utils/osmRoutes'
import type { MapFocus, MapViewState } from '~/stores/routeSearch'
import type { ImportedTrack } from '~/utils/gpx'

// Marked routes of OpenStreetMap around the map view (#69). Map page: MapSheetLayout brings its own header (md up),
// tab bar and floating top bar (phones).
definePageMeta({ layout: false })
const { t } = useI18n()
const { formatDistance, formatNumber } = useFormat()
const errorMessage = useErrorMessage()
useSeoMeta({ title: () => `${t('discover.title')} — sport-map` })

const discover = useOsmDiscoverStore()
// A section of a marked route being chosen (#72): the panel and the map show only that route.
const sectionStore = useOsmSectionStore()
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
  // Elevation gains (#71) are computed while the page is open.
  discover.startElevations()
})
onBeforeUnmount(() => discover.stopElevations())

const kindItems = computed(() => OSM_ROUTE_KINDS.map(value =>
  ({ value, label: t(`discover.kinds.${value}`), icon: SPORT_ICONS[OSM_KIND_SPORTS[value]] })))
const kind = computed({
  get: () => discover.kind,
  set: (value: OsmRouteKind) => discover.setKind(value),
})

const label = (route: OsmRoute) => route.name ?? route.ref ?? t('discover.unnamed')
const scopeOf = (route: OsmRoute) => osmRouteScope(route.network)
const shapeOf = (route: OsmRoute) => osmRouteShape(route)
// Elevation gain (#71): known, being computed (or waiting for it), or unknown.
function gainLabel(route: OsmRoute): string {
  const state = discover.elevationState(route)
  if (state.status === 'known') return t('discover.gain', { gain: formatNumber(state.gain_m) })
  return t(state.status === 'pending' ? 'discover.gainPending' : 'discover.gainUnknown')
}
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

function frame(route: OsmRoute) {
  const bbox = osmRouteBbox(route)
  focus.value = { center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2], bbox }
}

// Picked in the list: framed on the map. Picked on the map: shown in the list.
function selectInList(route: OsmRoute) {
  discover.selectedId = route.id
  frame(route)
}

function startSection(route: OsmRoute) {
  sectionStore.start(route)
  frame(route)
}

const sectionLayer = computed(() => sectionStore.ends && { coordinates: sectionStore.coordinates, ...sectionStore.ends })
// Title of the collapsed sheet on phones.
const sectionTitle = computed(() => {
  const gain = sectionStore.gainStatus === 'known'
    ? t('discover.gain', { gain: sectionStore.gain })
    : t(sectionStore.gainStatus === 'pending' ? 'discover.gainPending' : 'discover.gainUnknown')
  return t('discover.section.summary', { distance: formatDistance(sectionStore.length), gain })
})
const km = (meters: number) => formatNumber(meters / 1000, { maximumFractionDigits: 1 })

const editor = useRouteEditorStore()
const toast = useToast()

async function importRoute(route: OsmRoute, track?: ImportedTrack) {
  // A new route being drawn would be lost; a saved one being edited stays as it was.
  if (!editor.editingId && editor.waypoints.length && !window.confirm(t('discover.replaceDraft'))) return
  discover.importIntoEditor(route, track)
  sectionStore.stop()
  toast.add({
    title: t(track ? 'discover.section.imported' : 'discover.imported'),
    description: t('discover.importedPoints', { count: editor.track.coordinates.length }),
    color: 'success',
    icon: 'i-lucide-file-check',
  })
  await navigateTo('/routes/create')
}

function importSection() {
  const route = sectionStore.route
  const { from = 0, to = 0 } = sectionStore.section ?? {}
  const track = sectionStore.track(t('discover.section.name', { name: route ? label(route) : '', from: km(from), to: km(to) }))
  if (route && track) importRoute(route, track)
}

async function selectOnMap(id: number) {
  discover.selectedId = id
  await nextTick()
  document.getElementById(`osm-route-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}
</script>

<template>
  <MapSheetLayout>
    <template #map>
      <ClientOnly>
        <MapOsmRoutes
          :routes="sectionStore.route ? [sectionStore.route] : discover.shownRoutes"
          :highlighted-id="sectionStore.route ? null : shownId"
          :focus="focus"
          :center="discover.view.center"
          :zoom="discover.view.zoom"
          :label="label"
          :section="sectionLayer"
          @view-change="onViewChange"
          @hover="discover.highlightedId = $event"
          @select="selectOnMap"
          @pick="sectionStore.pick"
          @move-end="sectionStore.moveEnd"
        />
      </ClientOnly>
    </template>

    <template #search>
      <SearchBox places-only @place="focus = $event" />
    </template>

    <template #title>
      <span v-if="sectionStore.route" class="truncate">{{ sectionTitle }}</span>
      <span v-else class="flex items-center gap-2">
        <span class="truncate">{{ statusLabel }}</span>
        <UIcon v-if="discover.loading" name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin text-muted" aria-hidden="true" />
      </span>
    </template>

    <h1 class="text-2xl font-semibold max-md:sr-only">{{ t('discover.title') }}</h1>

    <OsmSectionPanel v-if="sectionStore.route" :name="label(sectionStore.route)" @import="importSection" />

    <template v-else>
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
      <p v-if="discover.computingElevationId !== null && discover.elevationsLeft" class="-mt-2 flex items-center gap-2 text-xs text-muted">
        <UIcon name="i-lucide-mountain" class="size-3.5" aria-hidden="true" />
        {{ t('discover.elevationsLeft', { count: discover.elevationsLeft }, discover.elevationsLeft) }}
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
              <span class="inline-flex items-center gap-1">
                · {{ gainLabel(route) }}
                <UIcon v-if="discover.computingElevationId === route.id" name="i-lucide-loader-circle" class="size-3.5 animate-spin" aria-hidden="true" />
              </span>
              <UBadge v-if="shapeOf(route) !== 'unknown'" :label="t(`discover.shapes.${shapeOf(route)}`)" :icon="shapeOf(route) === 'loop' ? 'i-lucide-repeat' : 'i-lucide-move-right'" color="neutral" variant="subtle" size="sm" />
              <UBadge v-if="scopeOf(route)" :label="t(`discover.scopes.${scopeOf(route)}`)" color="neutral" variant="subtle" size="sm" />
              <UBadge v-if="route.name && route.ref" :label="route.ref" color="neutral" variant="outline" size="sm" />
              <UBadge v-if="!route.complete" :label="t('discover.incomplete')" icon="i-lucide-unlink" color="warning" variant="subtle" size="sm" />
            </span>
          </button>
          <div v-if="discover.selectedId === route.id" class="mt-2 space-y-2">
            <UButton
              v-if="route.complete"
              icon="i-lucide-route"
              :label="t('discover.import')"
              :aria-label="t('discover.importLabel', { name: label(route) })"
              size="sm"
              block
              @click="importRoute(route)"
            />
            <p v-else class="px-1 text-sm text-muted">
              {{ t('discover.incompleteHint') }}
            </p>
            <!-- A long-distance path no filter keeps, or a piece of a route whose ways don't connect. -->
            <UButton
              icon="i-lucide-scissors"
              :label="t('discover.section.start')"
              :aria-label="t('discover.section.startLabel', { name: label(route) })"
              color="neutral"
              variant="outline"
              size="sm"
              block
              @click="startSection(route)"
            />
          </div>
        </li>
      </ul>
      <div v-else-if="discover.routes.length" class="space-y-2">
        <p class="text-sm text-muted">{{ t('discover.noneFiltered') }}</p>
        <UButton :label="t('filters.reset')" icon="i-lucide-rotate-ccw" color="neutral" variant="outline" size="sm" @click="discover.resetFilters" />
      </div>
      <p v-else-if="discover.searched && !discover.loading && !discover.error" class="text-sm text-muted">
        {{ t('discover.noneHint') }}
      </p>
    </template>

    <p class="text-xs text-muted">
      <i18n-t keypath="discover.attribution" scope="global">
        <template #link>
          <ULink to="https://www.openstreetmap.org/copyright" target="_blank" class="underline">{{ t('discover.osmContributors') }}</ULink>
        </template>
      </i18n-t>
      <!-- Licence Ouverte (IGN) and CC BY 4.0 (Open-Meteo) both ask for the source (#71). -->
      <i18n-t keypath="discover.elevationAttribution" scope="global" tag="span" class="block">
        <template #ign>
          <ULink to="https://geoservices.ign.fr/rgealti" target="_blank" class="underline">{{ t('discover.ignRgeAlti') }}</ULink>
        </template>
        <template #openMeteo>
          <ULink to="https://open-meteo.com/" target="_blank" class="underline">Open-Meteo.com</ULink>
        </template>
      </i18n-t>
    </p>
  </MapSheetLayout>
</template>
