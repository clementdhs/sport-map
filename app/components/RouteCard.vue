<script setup lang="ts">
import type { RouteSummary } from '#shared/types/routes'

defineProps<{
  route: RouteSummary
  highlighted?: boolean
}>()
</script>

<template>
  <NuxtLink
    :to="`/routes/${route.id}`"
    class="block rounded-lg border border-default p-3 transition-colors hover:bg-elevated focus-visible:bg-elevated"
    :class="{ 'bg-elevated': highlighted }"
  >
    <div class="flex items-start justify-between gap-2">
      <p class="font-medium">{{ route.name }}</p>
      <UIcon :name="SPORT_ICONS[route.sport_type]" class="size-5 shrink-0 text-muted" :aria-label="SPORT_LABELS[route.sport_type]" />
    </div>
    <p class="mt-1 text-sm text-muted">
      {{ formatDistance(route.distance_m) }}
      <template v-if="route.elevation_gain_m != null"> · D+ {{ Math.round(route.elevation_gain_m) }} m</template>
      · par {{ route.owner_username }}
    </p>
  </NuxtLink>
</template>
