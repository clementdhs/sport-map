<script setup lang="ts">
import type { SportType } from '#shared/utils/routes'

// The sport of a route as a badge. Its color is set here only, so that it can follow the sport (#108).
defineProps<{
  sport: SportType
}>()
</script>

<template>
  <UBadge :icon="SPORT_ICONS[sport]" :label="$t(`sports.${sport}`)" color="neutral" variant="soft" size="md" class="whitespace-nowrap" />
</template>
