<script setup lang="ts">
import { circle } from '@turf/turf'
import type { FeatureCollection, Polygon } from 'geojson'
import type { GeoJSONSource, Map, MapMouseEvent } from 'maplibre-gl'
import type { PrivacyZone, PrivacyZonesResult } from '#shared/types/account'
import { MAX_PRIVACY_ZONE_LABEL, MAX_PRIVACY_ZONES, PRIVACY_ZONE_RADII, type PrivacyZoneRadius } from '#shared/utils/privacyZones'
import type { LngLat } from '#shared/utils/routes'
import type { MapFocus } from '~/stores/routeSearch'

// "Confidentialité" in the settings (#254): the member's privacy zones. The start and end of their routes and
// outings inside one are hidden from the rest of the team; the server cuts the tracks again after each change.
const { t } = useI18n()
const toast = useToast()
const { formatDistance, formatNumber } = useFormat()
const errorMessage = useErrorMessage()
const search = useRouteSearchStore()

const { data, error, refresh } = await useFetch<PrivacyZone[]>('/api/profile/me/privacy-zones', { key: 'privacy-zones' })
// Its own state: useFetch data is a shallow ref, updated by the answers of each change.
const zones = ref<PrivacyZone[]>([])
watch(data, value => (zones.value = value ?? []), { immediate: true })

// Some routes kept their previous cut: offered again until it works.
const notApplied = ref(false)
const busy = ref(false)

const adding = ref(false)
const center = ref<LngLat>()
const radius = ref<PrivacyZoneRadius>(500)
const label = ref('')
const map = shallowRef<Map>()
const searchKey = ref(0)

// 1 km rather than "1,00 km".
const radiusLabel = (metres: number) => metres < 1000 ? formatDistance(metres) : `${formatNumber(metres / 1000)} km`
const radiusItems = computed(() => PRIVACY_ZONE_RADII.map(value => ({ label: radiusLabel(value), value })))

const SOURCE = 'privacy-zones'

function zonesData(): FeatureCollection<Polygon> {
  const shown = zones.value.map(zone => ({ center: zone.center, radius: zone.radius_m, pending: false }))
  if (center.value) shown.push({ center: center.value, radius: radius.value, pending: true })
  return {
    type: 'FeatureCollection',
    features: shown.map(zone => circle(zone.center, zone.radius, { units: 'meters', steps: 64, properties: { pending: zone.pending } })),
  }
}

function drawZones() {
  (map.value?.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(zonesData())
}

watch([zones, center, radius], drawZones, { deep: true })

function onMapLoad(loaded: Map) {
  map.value = loaded
  const color = mapColor(loaded, 'track')
  loaded.addSource(SOURCE, { type: 'geojson', data: zonesData() })
  loaded.addLayer({ id: 'privacy-zones-fill', type: 'fill', source: SOURCE, paint: { 'fill-color': color, 'fill-opacity': 0.15 } })
  loaded.addLayer({ id: 'privacy-zones-line', type: 'line', source: SOURCE, filter: ['!', ['get', 'pending']], paint: { 'line-color': color, 'line-width': 2 } })
  // The zone being placed, dashed.
  loaded.addLayer({
    id: 'privacy-zones-pending',
    type: 'line',
    source: SOURCE,
    filter: ['get', 'pending'],
    paint: { 'line-color': color, 'line-width': 2, 'line-dasharray': [2, 2] },
  })
  loaded.on('click', (event: MapMouseEvent) => {
    center.value = [Number(event.lngLat.lng.toFixed(6)), Number(event.lngLat.lat.toFixed(6))]
  })
  if (zones.value.length) frame(zones.value[zones.value.length - 1]!.center)
}

function frame(point: LngLat) {
  map.value?.jumpTo({ center: point, zoom: 14 })
}

function pickPlace(focus: MapFocus) {
  center.value = focus.center
  frame(focus.center)
  searchKey.value++
}

function openForm() {
  adding.value = true
  center.value = undefined
  label.value = ''
  radius.value = 500
}

function closeForm() {
  adding.value = false
  center.value = undefined
  map.value = undefined
}

function applied(result: PrivacyZonesResult) {
  zones.value = result.zones
  notApplied.value = !result.applied
  if (!result.applied) toast.add({ title: t('settings.privacy.notApplied'), color: 'warning', icon: 'i-lucide-triangle-alert' })
}

async function change(request: () => Promise<PrivacyZonesResult>, done: string, failed: string): Promise<boolean> {
  busy.value = true
  try {
    applied(await request())
    toast.add({ title: t(done), color: 'success', icon: 'i-lucide-check' })
    return true
  }
  catch (changeError) {
    toast.add({ title: t(failed), description: errorMessage(changeError), color: 'error' })
    return false
  }
  finally {
    busy.value = false
  }
}

async function add() {
  if (!center.value) return
  const body = { center: center.value, radius_m: radius.value, label: label.value.trim() || undefined }
  const saved = await change(
    () => $fetch<PrivacyZonesResult>('/api/profile/me/privacy-zones', { method: 'POST', body }),
    'settings.privacy.added',
    'settings.privacy.addFailed',
  )
  if (saved) closeForm()
}

async function remove(zone: PrivacyZone) {
  if (!window.confirm(t('settings.privacy.removeConfirm', { name: zoneName(zone) }))) return
  await change(
    () => $fetch<PrivacyZonesResult>(`/api/profile/me/privacy-zones/${zone.id}`, { method: 'DELETE' }),
    'settings.privacy.removed',
    'settings.privacy.removeFailed',
  )
}

async function retry() {
  await change(
    () => $fetch<PrivacyZonesResult>('/api/profile/me/privacy-zones/apply', { method: 'POST' }),
    'settings.privacy.reapplied',
    'settings.privacy.notApplied',
  )
}

function zoneName(zone: PrivacyZone): string {
  return zone.label || t('settings.privacy.unnamed')
}
</script>

<template>
  <div class="space-y-3" data-privacy-zones>
    <UAlert v-if="error" color="error" variant="subtle" :title="t('settings.privacy.loadFailed')">
      <template #actions>
        <UButton color="neutral" variant="outline" size="sm" @click="refresh()">{{ t('settings.privacy.retry') }}</UButton>
      </template>
    </UAlert>
    <p v-else-if="!zones.length" class="text-sm text-muted">{{ t('settings.privacy.none') }}</p>
    <ul v-else class="divide-y divide-default">
      <li v-for="zone in zones" :key="zone.id" class="flex items-center gap-3 py-2" data-privacy-zone>
        <UIcon name="i-lucide-shield" class="size-5 shrink-0 text-muted" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ zoneName(zone) }}</p>
          <p class="text-xs text-muted">{{ t('settings.privacy.radius', { radius: radiusLabel(zone.radius_m) }) }}</p>
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-trash-2"
          :aria-label="t('settings.privacy.remove', { name: zoneName(zone) })"
          :disabled="busy"
          @click="remove(zone)"
        />
      </li>
    </ul>

    <UAlert v-if="notApplied" color="warning" variant="subtle" :title="t('settings.privacy.notApplied')">
      <template #actions>
        <UButton color="neutral" variant="outline" size="sm" :loading="busy" @click="retry">{{ t('settings.privacy.retry') }}</UButton>
      </template>
    </UAlert>

    <div v-if="adding" class="space-y-3">
      <SearchBox :key="searchKey" places-only @place="pickPlace" />
      <p class="text-sm text-muted">{{ t('settings.privacy.mapHint') }}</p>
      <div class="h-64 overflow-hidden rounded-md border border-default" :data-privacy-center="center?.join(',')">
        <ClientOnly>
          <MapView :center="search.view.center" :zoom="search.view.zoom" @load="onMapLoad" />
        </ClientOnly>
      </div>
      <UFormField :label="t('settings.privacy.radiusLabel')">
        <UTabs v-model="radius" :items="radiusItems" :content="false" size="sm" class="w-fit" />
      </UFormField>
      <UFormField :label="t('settings.privacy.label')" :hint="t('settings.privacy.optional')">
        <UInput v-model="label" :maxlength="MAX_PRIVACY_ZONE_LABEL" :placeholder="t('settings.privacy.labelPlaceholder')" class="w-full max-w-sm" />
      </UFormField>
      <div class="flex flex-wrap gap-2">
        <UButton icon="i-lucide-shield-plus" :disabled="!center" :loading="busy" @click="add">{{ t('settings.privacy.add') }}</UButton>
        <UButton color="neutral" variant="outline" :disabled="busy" @click="closeForm">{{ t('common.cancel') }}</UButton>
      </div>
    </div>
    <UButton
      v-else-if="!error && zones.length < MAX_PRIVACY_ZONES"
      color="neutral"
      variant="outline"
      icon="i-lucide-shield-plus"
      @click="openForm"
    >
      {{ t('settings.privacy.new') }}
    </UButton>
  </div>
</template>
