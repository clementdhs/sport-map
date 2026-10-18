<script setup lang="ts">
// Track colours of the route page (#103), in the map's "Calques" panel (#104): what colours the track (slopes,
// surface, difficulty), and the legend of the colouring picked.
defineProps<{
  // 'none' first, then the colourings this route has
  items: { label: string, value: string }[]
  // Classes drawn on the track by the colouring picked, empty for none
  legend: { key: string, color: string, label: string }[]
}>()
const colouring = defineModel<string>({ required: true })

const { t } = useI18n()
</script>

<template>
  <div class="space-y-3">
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
