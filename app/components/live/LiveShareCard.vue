<script setup lang="ts">
import type { LiveShareListItem } from '#shared/types/live'

// An outing in progress in the /live list (#237): its mini-map (route followed in the map's rust, track covered in
// the GPS blue, latest position as the GPS dot), then the member, the sport, the route and the distance covered.
const props = defineProps<{
  share: LiveShareListItem
  // Current time (ms), null until mounted
  now: number | null
}>()
const { t } = useI18n()
const { formatDistance, formatTime } = useFormat()

const distance = computed(() => splitUnit(formatDistance(props.share.distance_m)))
const what = computed(() => props.share.route?.name
  ?? (props.share.follows_route ? t('live.privateRoute') : t('live.freeOuting')))
</script>

<template>
  <NuxtLink
    :to="`/live/${share.id}`"
    class="block overflow-hidden rounded-lg border border-default bg-default transition-colors hover:border-accented focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ui-primary)"
  >
    <svg
      :viewBox="`0 0 ${LIVE_THUMBNAIL_WIDTH} ${LIVE_THUMBNAIL_HEIGHT}`"
      preserveAspectRatio="xMidYMid meet"
      class="block h-30 w-full bg-elevated"
      aria-hidden="true"
      data-testid="live-thumbnail"
    >
      <g fill="none" class="stroke-(--contour)" stroke-width="1">
        <path d="M-10 40 C80 20 160 60 250 40 S340 20 360 30" />
        <path d="M-10 90 C80 70 160 110 250 90 S340 70 360 80" />
      </g>
      <template v-if="share.thumbnail">
        <path v-if="share.thumbnail.route" :d="share.thumbnail.route" fill="none" class="stroke-(--map-track)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.6" />
        <path v-if="share.thumbnail.track" :d="share.thumbnail.track" fill="none" :stroke="GPS_COLOR" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
        <template v-if="share.thumbnail.position">
          <circle :cx="share.thumbnail.position[0]" :cy="share.thumbnail.position[1]" r="13" :fill="GPS_COLOR" fill-opacity="0.18" />
          <circle :cx="share.thumbnail.position[0]" :cy="share.thumbnail.position[1]" r="6" :fill="GPS_COLOR" stroke="#fff" stroke-width="2.5" />
        </template>
      </template>
    </svg>
    <div class="flex items-center gap-3 px-3.5 py-3">
      <MemberAvatar :name="share.user_name" :path="share.user_avatar_path" size="xl" />
      <div class="min-w-0 flex-1">
        <p class="flex min-w-0 flex-wrap items-center gap-x-2">
          <span class="font-display truncate text-lg leading-tight font-bold">
            {{ share.is_mine ? t('live.myOuting') : t('live.outingOf', { name: share.user_name }) }}
          </span>
          <span v-if="share.sport" class="inline-flex items-center gap-1.5 text-sm font-semibold text-(--sport-text)" :class="`sport-${share.sport}`">
            <SportMark :sport="share.sport" />
            {{ t(`sports.${share.sport}`) }}
          </span>
        </p>
        <p class="truncate text-sm text-muted">{{ what }} · {{ t('live.startedAt', { time: formatTime(share.started_at) }) }}</p>
      </div>
      <div class="shrink-0 text-right">
        <p><span class="font-numbers text-lg font-semibold tabular-nums">{{ distance[0] }}</span> <span class="text-sm text-muted">{{ distance[1] }}</span></p>
        <LiveLastPosition :last-fixed-at="share.last_fixed_at" :now="now" compact />
      </div>
    </div>
  </NuxtLink>
</template>
