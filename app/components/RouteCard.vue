<script setup lang="ts">
import type { RouteListItem } from '#shared/types/routes'

const { formatDistance, formatRating } = useFormat()
const { t } = useI18n()

const props = defineProps<{
  route: RouteListItem
  highlighted?: boolean
  // On the owner's profile, "by X" says nothing
  hideOwner?: boolean
  // Extra line, e.g. when the route was completed
  note?: string
}>()

const start = computed(() => props.route.thumbnail ? thumbnailStart(props.route.thumbnail) : null)

const stats = computed(() => {
  const { sport_type, distance_m, elevation_gain_m, is_loop } = props.route
  return [
    { icon: 'i-lucide-move-horizontal', label: formatDistance(distance_m) },
    ...elevation_gain_m != null ? [{ icon: 'i-lucide-trending-up', label: t('routeCard.gain', { gain: Math.round(elevation_gain_m) }) }] : [],
    { icon: 'i-lucide-clock', label: `~${formatDuration(estimateDurationMin(sport_type, distance_m, elevation_gain_m))}` },
    ...is_loop ? [{ icon: 'i-lucide-refresh-cw', label: t('routeCard.loop') }] : [],
  ]
})
</script>

<template>
  <NuxtLink
    :to="`/routes/${route.id}`"
    class="flex gap-3 rounded-lg border border-default p-3 transition-colors hover:bg-elevated focus-visible:bg-elevated"
    :class="[`sport-${route.sport_type}`, { 'bg-elevated': highlighted }]"
  >
    <div class="size-16 shrink-0 rounded-md bg-muted" aria-hidden="true">
      <svg v-if="route.thumbnail" :viewBox="`0 0 ${THUMBNAIL_SIZE} ${THUMBNAIL_SIZE}`" class="size-full text-(--sport)">
        <path :d="route.thumbnail" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        <circle v-if="start" :cx="start[0]" :cy="start[1]" r="6" fill="currentColor" class="stroke-(--ui-bg-muted)" stroke-width="2" />
      </svg>
      <UIcon v-else :name="SPORT_ICONS[route.sport_type]" class="m-5 size-6 text-(--sport)" />
    </div>

    <div class="min-w-0 flex-1">
      <p class="line-clamp-2 font-medium">
        {{ route.name }}
        <UIcon v-if="!route.is_public" name="i-lucide-lock" class="ml-1 size-3.5 align-baseline text-muted" :aria-label="$t('routeCard.private')" />
      </p>
      <div class="mt-1.5 flex flex-wrap gap-1">
        <SportBadge :sport="route.sport_type" />
        <UBadge v-for="stat in stats" :key="stat.icon" :icon="stat.icon" :label="stat.label" color="neutral" variant="outline" size="md" class="font-numbers text-sm whitespace-nowrap tabular-nums" />
      </div>
      <p v-if="route.rating_count || !hideOwner" class="mt-1.5 flex flex-wrap items-center gap-x-3 text-sm">
        <span v-if="route.rating_count" class="flex items-center gap-1.5">
          <RatingStars :value="route.rating_avg ?? 0" />
          <span class="font-medium">{{ formatRating(route.rating_avg ?? 0) }}</span>
          <span class="text-muted">({{ $t('routeCard.reviews', route.rating_count) }})</span>
        </span>
        <span v-if="!hideOwner" class="min-w-0 truncate text-muted">{{ $t('routeCard.by', { name: route.owner_name }) }}</span>
      </p>
      <p v-if="note" class="mt-1 text-sm text-muted">{{ note }}</p>
    </div>
  </NuxtLink>
</template>
