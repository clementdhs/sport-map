<script setup lang="ts">
import type { RouteListItem } from '#shared/types/routes'

const { formatDistance, formatRating } = useFormat()

defineProps<{
  route: RouteListItem
  highlighted?: boolean
  // Extra line, e.g. when the route was completed
  note?: string
}>()
</script>

<template>
  <NuxtLink
    :to="`/routes/${route.id}`"
    class="block rounded-lg border border-default p-3 transition-colors hover:bg-elevated focus-visible:bg-elevated"
    :class="{ 'bg-elevated': highlighted }"
  >
    <div class="flex items-start justify-between gap-2">
      <p class="font-medium">
        {{ route.name }}
        <UIcon v-if="!route.is_public" name="i-lucide-lock" class="ml-1 size-3.5 align-baseline text-muted" :aria-label="$t('routeCard.private')" />
      </p>
      <UIcon :name="SPORT_ICONS[route.sport_type]" class="size-5 shrink-0 text-muted" :aria-label="$t(`sports.${route.sport_type}`)" />
    </div>
    <p class="mt-1 text-sm text-muted">
      {{ formatDistance(route.distance_m) }}
      <template v-if="route.is_loop"> · <UIcon name="i-lucide-refresh-cw" class="size-3.5 align-[-0.15em]" aria-hidden="true" /> {{ $t('routeCard.loop') }}</template>
      <template v-if="route.elevation_gain_m != null"> · {{ $t('routeCard.gain', { gain: Math.round(route.elevation_gain_m) }) }}</template>
      · ~{{ formatDuration(estimateDurationMin(route.sport_type, route.distance_m, route.elevation_gain_m)) }}
      · {{ $t('routeCard.by', { name: route.owner_name }) }}
    </p>
    <p v-if="route.rating_count" class="mt-1 flex items-center gap-1.5 text-sm">
      <RatingStars :value="route.rating_avg ?? 0" />
      <span class="font-medium">{{ formatRating(route.rating_avg ?? 0) }}</span>
      <span class="text-muted">({{ $t('routeCard.reviews', route.rating_count) }})</span>
    </p>
    <p v-if="note" class="mt-1 text-sm text-muted">{{ note }}</p>
  </NuxtLink>
</template>
