<script setup lang="ts">
import type { SportType } from '#shared/utils/routes'

// The sport as a trail blaze (#229): a white bar ringed with ink over a bar in the sport's color (`sport-*`
// classes of main.css). Decorative: the sport's name is always written next to it.
defineProps<{
  sport: SportType
}>()
</script>

<template>
  <span class="inline-flex shrink-0 flex-col gap-0.5" :class="`sport-${sport}`" aria-hidden="true">
    <span class="block h-1.25 w-4 bg-(--mark-top) shadow-[inset_0_0_0_1px_var(--mark-edge)]" />
    <span class="block h-1.25 w-4 bg-(--sport)" />
  </span>
</template>
