<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { LivePoint, LiveShareDetail } from '#shared/types/live'
import type { LngLat } from '#shared/utils/routes'
import type { GpsPosition } from '~/utils/routeLayers'

// A member's outing seen by the family (#46), full screen: the route they follow, the track covered and their
// latest position, with the time it was taken. New points are fetched while the page is in view; once the
// share is over (stopped, or 12 hours later), the page says so.
definePageMeta({ layout: false })

const route = useRoute()
const { t } = useI18n()
const { formatTime } = useFormat()
const id = route.params.id as string

const { data: share, error } = await useFetch<LiveShareDetail>(`/api/live/${id}`)
if (error.value && error.value.statusCode !== 404) {
  throw createError({ statusCode: error.value.statusCode ?? 500, statusMessage: error.value.statusMessage, fatal: true })
}
const ended = ref(!share.value)

useSeoMeta({
  title: () => `${share.value ? t('live.outingOf', { name: share.value.user_name }) : t('live.title')} — sportmap`,
})

// The track grows with each fetch (useFetch data is a shallow ref).
const points = shallowRef<LivePoint[]>(share.value?.points ?? [])
const routeLine = computed(() => (share.value?.route_geometry?.coordinates as LngLat[] | undefined) ?? null)
const track = computed(() => points.value.map(point => [point.lng, point.lat] as LngLat))
const last = computed(() => points.value.at(-1) ?? null)
const position = computed<GpsPosition | null>(() =>
  last.value ? { position: [last.value.lng, last.value.lat], accuracyM: last.value.accuracy_m ?? 0 } : null)

async function fetchNewPoints() {
  if (ended.value) return
  try {
    const after = last.value?.fixed_at
    const next = await $fetch<LiveShareDetail>(`/api/live/${id}`, { query: after ? { after } : {} })
    points.value = mergeLivePoints(points.value, next.points)
  }
  catch (fetchError) {
    // Over; otherwise no network on this side: next time.
    if ((fetchError as FetchError).statusCode === 404) ended.value = true
  }
}
usePolling(fetchNewPoints, LIVE_POLL_INTERVAL_S * 1000)

const now = ref<number | null>(null)
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  now.value = Date.now()
  clock = setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => clearInterval(clock))

const follow = ref(false)
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden">
    <div class="relative min-h-0 flex-1">
      <ClientOnly>
        <MapLiveShare
          v-if="share"
          :route="routeLine"
          :track="track"
          :position="position"
          :follow="follow"
          @stop-follow="follow = false"
        />
      </ClientOnly>

      <!-- Right padding: the map controls stay reachable. -->
      <div class="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 pr-14">
        <div class="pointer-events-auto flex items-center gap-2">
          <UButton to="/live" icon="i-lucide-arrow-left" :label="t('live.title')" color="neutral" variant="ghost" class="map-float h-10 font-semibold" />
        </div>
      </div>

      <UButton
        v-if="!follow && position && !ended"
        icon="i-lucide-locate-fixed"
        :label="t('live.centerOn')"
        color="neutral"
        variant="solid"
        class="absolute right-3 bottom-9 shadow-md"
        @click="follow = true"
      />
    </div>

    <!-- The paper of the map sheets (#231), with a shadow upwards; not over the map, whose attribution and scale stay in view. -->
    <div class="relative z-10 shrink-0 space-y-2 border-t border-default bg-paper p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgb(29_37_32/0.12)]" aria-live="polite">
      <template v-if="share">
        <div class="flex items-center gap-3">
          <MemberAvatar :name="share.user_name" :path="share.user_avatar_path" size="xl" />
          <div class="min-w-0 flex-1">
            <h1 class="flex items-center gap-2 text-2xl leading-tight font-bold">
              <span v-if="!ended" class="size-2.5 shrink-0 animate-pulse rounded-full bg-(--gps) shadow-[0_0_0_4px_color-mix(in_srgb,var(--gps)_20%,transparent)]" :style="{ '--gps': GPS_COLOR }" aria-hidden="true" />
              <span class="truncate">{{ share.is_mine ? t('live.myOuting') : t('live.outingOf', { name: share.user_name }) }}</span>
            </h1>
            <p class="truncate text-sm">
              <ULink v-if="share.route" :to="`/routes/${share.route.id}`" class="font-semibold text-primary">{{ share.route.name }}</ULink>
              <template v-else>{{ share.follows_route ? t('live.privateRoute') : t('live.freeOuting') }}</template>
            </p>
          </div>
        </div>
        <LiveLastPosition :last-fixed-at="last?.fixed_at ?? null" :now="now" />
        <p class="text-xs text-muted">{{ t('live.since', { time: formatTime(share.started_at) }) }}</p>
      </template>
      <UAlert
        v-if="ended"
        color="neutral"
        variant="subtle"
        icon="i-lucide-radio"
        :title="t('live.endedTitle')"
        :description="share ? t('live.endedDescription', { name: share.user_name }) : undefined"
        :actions="[{ label: t('live.seeAll'), to: '/live', color: 'neutral', variant: 'outline' }]"
      />
    </div>
  </div>
</template>
