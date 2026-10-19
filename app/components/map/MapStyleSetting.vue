<script setup lang="ts">
import type { MapStyleChoice } from '~/utils/mapStyle'

// Light or dark MapTiler style, or the theme's (#151): in the maps' "Calques" panel and the settings. Kept in the
// member's account; every open map follows it (MapView).
defineProps<{
  size?: 'sm' | 'md'
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
    :ui="{ legend: 'text-sm font-medium mb-1.5' }"
    @update:model-value="mapStyle = $event as MapStyleChoice"
  />
</template>
