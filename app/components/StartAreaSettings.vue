<script setup lang="ts">
import type { Map } from 'maplibre-gl'
import type { Bounds, MapFocus } from '~/stores/routeSearch'
import type { StartArea } from '~/utils/startArea'

// "Ma zone de départ" in the settings (#147): the area the home page, the editor and /discover open on before they
// have a view of their own, rather than the whole of France. Picked by searching a place, or from a map's view: the
// map shown here opens on the zone, else on the home map's last view.
const { t } = useI18n()
const toast = useToast()
const startArea = usePreference('startArea')
const search = useRouteSearchStore()

// Emptied after each pick: the line above it names the zone.
const searchKey = ref(0)
const mapOpen = ref(false)
const map = shallowRef<Map>()
// The zone when the map opened: framed once, so that saving the map's own view doesn't frame it again.
const mapBounds = shallowRef<Bounds>()

const summary = computed(() => {
  if (!startArea.value) return t('settings.startArea.none')
  return startArea.value.name
    ? t('settings.startArea.current', { name: startArea.value.name })
    : t('settings.startArea.currentMapView')
})

function save(next: StartArea | null) {
  startArea.value = next
  toast.add({ title: t(next ? 'settings.startArea.saved' : 'settings.startArea.cleared'), color: 'success', icon: 'i-lucide-check' })
}

function pickPlace(focus: MapFocus, name: string) {
  save(startAreaFromPlace(focus, name))
  searchKey.value++
  map.value?.fitBounds(startArea.value!.bounds, { padding: 48, duration: 0 })
}

function takeMapView() {
  if (map.value) save({ bounds: mapViewState(map.value).bounds, name: null })
}

function openMap() {
  mapBounds.value = startArea.value?.bounds
  mapOpen.value = true
}

function closeMap() {
  mapOpen.value = false
  map.value = undefined
}
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm font-medium" data-start-area>{{ summary }}</p>
    <SearchBox :key="searchKey" places-only @place="pickPlace" />
    <div v-if="mapOpen" class="space-y-2">
      <p class="text-sm text-muted">{{ t('settings.startArea.mapHint') }}</p>
      <div class="h-64 overflow-hidden rounded-md border border-default">
        <ClientOnly>
          <MapView
            :center="search.view.center"
            :zoom="search.view.zoom"
            :bounds="mapBounds"
            @load="map = $event"
          />
        </ClientOnly>
      </div>
    </div>
    <div class="flex flex-wrap gap-2">
      <template v-if="mapOpen">
        <UButton icon="i-lucide-scan" :disabled="!map" @click="takeMapView">{{ t('settings.startArea.useMapView') }}</UButton>
        <UButton color="neutral" variant="outline" @click="closeMap">{{ t('settings.startArea.closeMap') }}</UButton>
      </template>
      <UButton v-else color="neutral" variant="outline" icon="i-lucide-map" @click="openMap">
        {{ t('settings.startArea.pickOnMap') }}
      </UButton>
      <UButton v-if="startArea" color="neutral" variant="ghost" icon="i-lucide-x" @click="save(null)">
        {{ t('settings.startArea.clear') }}
      </UButton>
    </div>
  </div>
</template>
