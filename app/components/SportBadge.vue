<script setup lang="ts">
import type { SportType } from '#shared/utils/routes'

// The sport of a route as a badge, in the sport's color (`sport-*` classes of main.css, #108).
defineProps<{
  sport: SportType
}>()
</script>

<template>
  <UBadge
    :icon="SPORT_ICONS[sport]"
    :label="$t(`sports.${sport}`)"
    color="neutral"
    variant="soft"
    size="md"
    class="bg-(--sport-soft) whitespace-nowrap text-(--sport-text)"
    :class="`sport-${sport}`"
  />
</template>
