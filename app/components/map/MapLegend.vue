<script setup lang="ts">
import type { Map } from 'maplibre-gl'
import { UDrawer, UPopover } from '#components'
import type { Basemap } from '~/utils/basemaps'
import type { BasemapLegend } from '~/utils/mapLegend'

// Map legend (#76), opened from the "Calques" panel (#104): a popover beside its button on a computer, a drawer on a
// phone. Its basemap tab follows the basemap shown (MapTiler offline, whatever was picked), even while it is open.
const props = defineProps<{
  map?: Map
  basemap: Basemap
  // The "Calques" button: where the popover sits, and where focus goes back when it closes.
  reference?: HTMLElement
}>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const isDesktop = useIsDesktop()
const panelSlot = computed(() => isDesktop.value ? 'content' : 'body')

// Read from the loaded style while open (from the start: it mounts open), again when the style or its sprite arrive
// later.
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
}, { immediate: true })
onBeforeUnmount(stopReading)

const tab = ref('basemap')
const tabs = computed(() => [
  { label: t('mapLegend.basemapTab'), value: 'basemap', slot: 'basemap' as const },
  { label: t('mapLegend.appTab'), value: 'app', slot: 'app' as const },
])

// On a computer the legend stays open while the map is moved, to be read beside what it explains. Escape, the
// "Calques" button or a click elsewhere close it.
function keepOpenOnMap(event: CustomEvent<{ originalEvent: Event }>) {
  const target = event.detail.originalEvent.target
  if (target instanceof Element && target.closest('.maplibregl-map')) event.preventDefault()
}

// The drawer (vaul) leaves focus where it was, so as not to raise a phone's keyboard: here on the panel's
// "Légende" button, gone once the panel closed. Focus goes to the drawer instead, for keyboards and screen readers.
function focusDrawer(event: Event) {
  if (event.target instanceof HTMLElement) event.target.focus()
}

// Without a trigger of its own, focus goes back to the "Calques" button, unless a click elsewhere moved it.
function focusReference(event: Event) {
  event.preventDefault()
  const active = document.activeElement
  const inside = active && event.target instanceof Node && event.target.contains(active)
  if (!active || active === document.body || inside) props.reference?.focus()
}
</script>

<template>
  <component
    :is="isDesktop ? UPopover : UDrawer"
    v-model:open="open"
    v-bind="isDesktop
      ? { reference, content: { 'side': 'left', 'align': 'start', 'aria-label': t('mapLegend.title'), 'onInteractOutside': keepOpenOnMap, 'onCloseAutoFocus': focusReference } }
      : { title: t('mapLegend.title'), content: { onOpenAutoFocus: focusDrawer, onCloseAutoFocus: focusReference } }"
  >
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
