<script setup lang="ts">
import type { SportType } from '#shared/utils/routes'

// The sport of a route as a badge, in the sport's color (`sport-*` classes of main.css, #108), led by its mark.
defineProps<{
  sport: SportType
}>()
</script>

<template>
  <UBadge
    :label="$t(`sports.${sport}`)"
    color="neutral"
    variant="soft"
    size="md"
    class="gap-1.5 bg-(--sport-soft) whitespace-nowrap text-(--sport-text)"
    :class="`sport-${sport}`"
  >
    <template #leading>
      <SportMark :sport="sport" />
    </template>
  </UBadge>
</template>
