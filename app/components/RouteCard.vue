<script setup lang="ts">
import type { RouteListItem } from '#shared/types/routes'

// A route in a list, as a trail log entry (#232): its outline in rust on contour lines, the sport's mark, the
// name, a member's quote (latest review with a comment), distance and D+, the estimated duration on its sign
// and the viewer's "Fait ×N" stamp.
const { formatDistance, formatRating } = useFormat()

const props = defineProps<{
  route: RouteListItem
  highlighted?: boolean
  // On the owner's profile, "by X" says nothing
  hideOwner?: boolean
  // Extra line, e.g. when the route was completed
  note?: string
}>()

const estimateDuration = useDurationEstimate()
const start = computed(() => props.route.thumbnail ? thumbnailStart(props.route.thumbnail) : null)

const minutes = computed(() => estimateDuration(props.route.sport_type, props.route.distance_m, props.route.elevation_gain_m))
const distance = computed(() => splitUnit(formatDistance(props.route.distance_m)))
const gain = computed(() => props.route.elevation_gain_m == null ? null : Math.round(props.route.elevation_gain_m))
</script>

<template>
  <NuxtLink
    :to="`/routes/${route.id}`"
    class="relative flex gap-3 rounded-lg border bg-default p-3 transition-colors hover:border-accented focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    :class="[`sport-${route.sport_type}`, highlighted ? 'border-primary' : 'border-default']"
  >
    <div class="relative size-18 shrink-0 overflow-hidden rounded-md bg-elevated" aria-hidden="true">
      <svg :viewBox="`0 0 ${THUMBNAIL_SIZE} ${THUMBNAIL_SIZE}`" class="size-full">
        <g fill="none" stroke-width="1" vector-effect="non-scaling-stroke" class="stroke-(--contour)">
          <path d="M-5 28 C20 14 42 42 66 28 S96 11 105 22" vector-effect="non-scaling-stroke" />
          <path d="M-5 56 C22 42 44 72 70 56 S96 42 105 53" vector-effect="non-scaling-stroke" />
          <path d="M-5 84 C25 72 47 97 72 84 S96 72 105 81" vector-effect="non-scaling-stroke" />
        </g>
        <template v-if="route.thumbnail">
          <path :d="route.thumbnail" fill="none" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" class="stroke-(--ui-bg)" />
          <path :d="route.thumbnail" data-testid="route-track" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" class="stroke-(--map-track)" />
          <circle v-if="start" :cx="start[0]" :cy="start[1]" r="5.5" stroke-width="2" vector-effect="non-scaling-stroke" class="fill-(--ui-text-highlighted) stroke-(--ui-bg)" />
        </template>
      </svg>
      <UIcon v-if="!route.thumbnail" :name="SPORT_ICONS[route.sport_type]" class="absolute inset-0 m-auto size-6 text-(--sport)" />
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <p class="flex items-center gap-2 text-[0.6875rem] font-bold tracking-widest text-(--sport-text) uppercase" :class="{ 'pe-12': route.done_count }">
        <SportMark :sport="route.sport_type" />
        <span class="min-w-0 truncate">
          {{ $t(`sports.${route.sport_type}`) }}<span v-if="route.is_loop" class="text-muted"> · {{ $t('routeCard.loop') }}</span>
        </span>
      </p>
      <p class="line-clamp-2 font-display text-xl leading-tight font-bold text-highlighted" :class="{ 'pe-12': route.done_count }">
        {{ route.name }}
        <UIcon v-if="!route.is_public" name="i-lucide-lock" class="ml-1 size-3.5 align-baseline text-muted" :aria-label="$t('routeCard.private')" />
      </p>
      <p v-if="route.quote" class="line-clamp-2 text-sm leading-snug text-muted italic" data-testid="route-quote">
        {{ $t('routeCard.quote', { comment: route.quote.comment, author: route.quote.author }) }}
      </p>
      <div class="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span class="flex items-baseline gap-3 whitespace-nowrap text-highlighted">
          <span><span class="font-numbers text-lg font-semibold tabular-nums">{{ distance[0] }}</span> <span class="text-sm text-muted">{{ distance[1] }}</span></span>
          <span v-if="gain != null"><span class="font-numbers text-lg font-semibold tabular-nums">{{ gain }}</span> <span class="text-sm text-muted">{{ $t('routeCard.gainUnit') }}</span></span>
        </span>
        <DurationSign :minutes="minutes" size="sm" />
      </div>
      <p v-if="route.rating_count || !hideOwner" class="flex flex-wrap items-center gap-x-3 text-xs">
        <span v-if="route.rating_count" class="flex items-center gap-1.5">
          <RatingStars :value="route.rating_avg ?? 0" />
          <span class="font-medium">{{ formatRating(route.rating_avg ?? 0) }}</span>
          <span class="text-muted">({{ $t('routeCard.reviews', route.rating_count) }})</span>
        </span>
        <span v-if="!hideOwner" class="flex min-w-0 items-center gap-1.5 text-muted">
          <MemberAvatar :name="route.owner_name" :path="route.owner_avatar_path" size="3xs" />
          <span class="truncate">{{ $t('routeCard.by', { name: route.owner_name }) }}</span>
        </span>
      </p>
      <p v-if="note" class="text-sm text-muted">{{ note }}</p>
    </div>

    <DoneStamp :count="route.done_count" class="absolute end-3 -top-2.5" />
  </NuxtLink>
</template>
