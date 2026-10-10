<script setup lang="ts">
import type { Map } from 'maplibre-gl'
import { UDrawer, UPopover } from '#components'
import type { Basemap } from '~/utils/basemaps'
import type { BasemapLegend } from '~/utils/mapLegend'

// "Légende" button of the map controls (#76): a popover on a computer, a drawer on a phone. Its basemap tab
// follows the basemap shown (MapTiler offline, whatever was picked), even while it is open.
const props = defineProps<{
  map?: Map
  basemap: Basemap
}>()

const { t } = useI18n()
const isDesktop = useIsDesktop()
const open = ref(false)
const panelSlot = computed(() => isDesktop.value ? 'content' : 'body')

// Read from the loaded style while open, again when the style or its sprite arrive later.
const maptiler = shallowRef<BasemapLegend>()
let readStyle: (() => void) | undefined
function stopReading() {
  if (readStyle) props.map?.off('styledata', readStyle)
  readStyle = undefined
}
watch(open, (isOpen) => {
  stopReading()
  const map = props.map
  if (!isOpen || !map) return
  readStyle = () => {
    maptiler.value = maptilerLegend(map.getStyle(), (id, paint) => spriteImage(map, id, paint))
  }
  readStyle()
  map.on('styledata', readStyle)
})
onBeforeUnmount(stopReading)

const tab = ref('basemap')
const tabs = computed(() => [
  { label: t('mapLegend.basemapTab'), value: 'basemap', slot: 'basemap' as const },
  { label: t('mapLegend.appTab'), value: 'app', slot: 'app' as const },
])

// On a computer the legend stays open while the map is moved or its basemap changed (picker's menu included), to
// be read beside what it explains. Escape, its button or a click elsewhere close it.
function keepOpenOnMap(event: CustomEvent<{ originalEvent: Event }>) {
  const target = event.detail.originalEvent.target
  if (target instanceof Element && target.closest('.maplibregl-map, [role="menu"]')) event.preventDefault()
}
</script>

<template>
  <component
    :is="isDesktop ? UPopover : UDrawer"
    v-model:open="open"
    v-bind="isDesktop
      ? { content: { 'side': 'left', 'align': 'start', 'aria-label': t('mapLegend.title'), 'onInteractOutside': keepOpenOnMap } }
      : { title: t('mapLegend.title') }"
  >
    <button type="button" class="flex items-center justify-center" :title="t('mapLegend.title')" :aria-label="t('mapLegend.title')">
      <UIcon name="i-lucide-info" class="size-4 text-neutral-800" />
    </button>

    <template #[panelSlot]>
      <div :class="{ 'w-88 p-3': isDesktop }">
        <UTabs v-model="tab" :items="tabs" variant="link" size="sm" class="gap-3">
          <template #basemap>
            <div class="space-y-3" :class="{ 'max-h-[min(65vh,34rem)] overflow-y-auto pe-1': isDesktop }">
              <p class="text-sm font-medium">{{ t(`map.basemaps.${basemap}`) }}</p>
              <template v-if="basemap === 'ignPlan'">
                <!-- Width and height reserve its place: the image is 20 times taller than wide. -->
                <img
                  :src="IGN_PLAN_LEGEND_URL"
                  :alt="t('mapLegend.ignAlt')"
                  width="300"
                  height="6000"
                  class="mx-auto h-auto w-full max-w-75 rounded-sm bg-white"
                >
                <p class="text-xs text-muted">
                  © IGN ·
                  <ULink :to="IGN_PLAN_LEGEND_URL" target="_blank" class="underline">{{ t('mapLegend.ignOpen') }}</ULink>
                </p>
              </template>
              <template v-else-if="maptiler?.groups.length">
                <MapLegendGroups :groups="maptiler.groups" :background="maptiler.background" />
                <p class="text-xs text-muted">{{ t('mapLegend.maptilerNote') }}</p>
              </template>
              <p v-else class="text-sm text-muted">{{ t('mapLegend.noBasemapLegend') }}</p>
            </div>
          </template>
          <template #app>
            <div :class="{ 'max-h-[min(65vh,34rem)] overflow-y-auto pe-1': isDesktop }">
              <MapLegendGroups :groups="APP_LEGEND" :background="APP_LEGEND_BACKGROUND" />
            </div>
          </template>
        </UTabs>
      </div>
    </template>
  </component>
</template>
