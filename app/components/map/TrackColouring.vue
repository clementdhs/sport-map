<script setup lang="ts">
// "Couleurs du tracé" button of the map controls on the route page (#103): what colours the track (slopes, surface,
// difficulty), and the legend of the colouring picked. A popover beside the controls, on phones too, so that the
// map stays visible; it stays open while the map is moved.
defineProps<{
  // 'none' first, then the colourings this route has
  items: { label: string, value: string }[]
  // Classes drawn on the track by the colouring picked, empty for none
  legend: { key: string, color: string, label: string }[]
}>()
const colouring = defineModel<string>({ required: true })

const { t } = useI18n()

// Named after its title for screen readers (aria-label isn't in the content props' type, only passed through).
const content = computed(() => ({
  'side': 'left' as const,
  'align': 'start' as const,
  'aria-label': t('route.colouring.title'),
  'onInteractOutside': keepOpenOnMap,
}))

function keepOpenOnMap(event: CustomEvent<{ originalEvent: Event }>) {
  const target = event.detail.originalEvent.target
  if (target instanceof Element && target.closest('.maplibregl-map')) event.preventDefault()
}
</script>

<template>
  <UPopover :content="content">
    <button type="button" class="flex items-center justify-center" :title="t('route.colouring.title')" :aria-label="t('route.colouring.title')">
      <UIcon name="i-lucide-palette" class="size-4" :class="colouring === 'none' ? 'text-neutral-800' : 'text-primary'" />
    </button>
    <template #content>
      <div class="w-56 space-y-3 p-3">
        <URadioGroup
          v-model="colouring"
          :legend="t('route.colouring.title')"
          :items="items"
          size="sm"
          :ui="{ legend: 'text-sm font-medium mb-1.5' }"
        />
        <ul v-if="legend.length" class="space-y-1 text-xs text-muted" :aria-label="t('route.colouring.legend')">
          <li v-for="entry in legend" :key="entry.key" class="flex items-center gap-2">
            <span class="h-1 w-5 shrink-0 rounded-full" :style="{ backgroundColor: entry.color }" aria-hidden="true" />{{ entry.label }}
          </li>
        </ul>
      </div>
    </template>
  </UPopover>
</template>
