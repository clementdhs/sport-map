<script setup lang="ts">
import type { MapStyleChoice } from '~/utils/mapStyle'

// Light or dark MapTiler style, or the theme's (#151): in the maps' "Calques" panel and the settings. Kept in the
// member's account; every open map follows it (MapView).
// `inline` (the settings' appearance rows, #237): the choices side by side under the legend.
defineProps<{
  size?: 'sm' | 'md'
  inline?: boolean
}>()

const { t } = useI18n()
const mapStyle = usePreference('mapStyle')

const items = computed(() => MAP_STYLE_CHOICES.map(value => ({ label: t(`map.styles.${value}`), value })))
</script>

<template>
  <URadioGroup
    :model-value="mapStyle"
    :legend="t('map.style')"
    :items="items"
    :size="size"
    :orientation="inline ? 'horizontal' : 'vertical'"
    :ui="{ legend: 'text-sm font-medium mb-1.5' }"
    @update:model-value="mapStyle = $event as MapStyleChoice"
  />
</template>
