<script setup lang="ts">
import type { OutingDetail } from '#shared/types/routes'
import type { LngLat, OutingTrackPoint, SportType } from '#shared/utils/routes'
import type { Split } from '~/utils/splits'

// Detail of an outing, opened from the route's Passages tab: its speed (or pace) along the way over the
// elevation profile, and its moving time per kilometre. Its GPS points are only loaded now, and can be replayed
// in a 3D flyover (#74) by the route page.
const props = defineProps<{
  routeId: string
  outingId: string
  sport: SportType
  // Metres along this outing of the flyover replaying it
  marker?: number | null
}>()

const emit = defineEmits<{
  hover: [point: LngLat | null]
  replay: [track: OutingTrackPoint[]]
}>()

const { t } = useI18n()
const { formatDistance, formatNumber, formatSpeed } = useFormat()
const errorMessage = useErrorMessage()

const { data, status, error } = useLazyFetch<OutingDetail>(`/api/routes/${props.routeId}/outings/${props.outingId}`, {
  server: false,
})

// Runners and walkers read a pace, cyclists a speed.
const pace = computed(() => SPORT_KINDS[props.sport] !== 'ride')
const splits = computed(() => (data.value ? outingSplits(data.value.track) : []))
const fastest = computed(() => fastestSplit(splits.value))
const samples = computed(() => (data.value && splits.value.length ? speedProfile(data.value.track) : []))
const withElevation = computed(() => splits.value[0]?.gainM != null)

function splitSpeed(split: Split): string {
  return pace.value
    ? `${formatPace(split.movingS ? split.distanceM / split.movingS : 0)} /km`
    : formatSpeed(split.distanceM, split.movingS)
}
// Full kilometres by number, the last stretch by its length.
const splitLabel = (split: Split, i: number) => (split.distanceM === 1000 ? String(i + 1) : formatDistance(split.distanceM))
const formatElevation = (meters: number | null) => `${formatNumber(Math.round(meters ?? 0))} m`
</script>

<template>
  <div class="space-y-4" data-testid="outing-detail">
    <USkeleton v-if="status === 'pending' || status === 'idle'" class="h-40 w-full" />
    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="t('outings.detailFailed')"
      :description="errorMessage(error)"
    />
    <p v-else-if="!splits.length" class="text-sm text-muted">{{ t('outings.tooShort') }}</p>
    <template v-else>
      <UButton
        icon="i-lucide-drone"
        :label="t('outings.replay3d')"
        color="neutral"
        variant="outline"
        size="sm"
        @click="emit('replay', data!.track)"
      />
      <OutingChart :samples="samples" :pace="pace" :marker="marker" @hover="emit('hover', $event)" />

      <div class="space-y-2">
        <p class="text-sm font-medium">{{ t('outings.splits.title') }}</p>
        <p v-if="fastest !== null" class="text-sm text-muted">
          {{ t('outings.splits.fastest', { km: fastest + 1, value: splitSpeed(splits[fastest]!) }) }}
        </p>
        <table class="w-full text-sm tabular-nums">
          <thead class="text-left text-xs text-muted">
            <tr>
              <th scope="col" class="py-1 font-normal">{{ t('outings.splits.km') }}</th>
              <th scope="col" class="py-1 font-normal">{{ t(pace ? 'outings.splits.pace' : 'outings.splits.speed') }}</th>
              <template v-if="withElevation">
                <th scope="col" class="py-1 text-right font-normal">{{ t('outings.splits.gain') }}</th>
                <th scope="col" class="py-1 text-right font-normal">{{ t('outings.splits.loss') }}</th>
              </template>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr
              v-for="(split, i) in splits"
              :key="i"
              :class="i === fastest ? 'bg-success/10 font-semibold' : ''"
              data-testid="split"
            >
              <th scope="row" class="py-1 pl-1 text-left" :class="i === fastest ? 'font-semibold' : 'font-normal'">
                {{ splitLabel(split, i) }}
                <template v-if="i === fastest">
                  <UIcon name="i-lucide-zap" class="size-3.5 align-[-2px] text-success" />
                  <span class="sr-only">{{ t('outings.splits.fastestBadge') }}</span>
                </template>
              </th>
              <td class="py-1">{{ splitSpeed(split) }}</td>
              <template v-if="withElevation">
                <td class="py-1 text-right">{{ formatElevation(split.gainM) }}</td>
                <td class="py-1 pr-1 text-right">{{ formatElevation(split.lossM) }}</td>
              </template>
            </tr>
          </tbody>
        </table>
        <p class="text-xs text-muted">{{ t('outings.splits.movingOnly') }}</p>
      </div>
    </template>
  </div>
</template>
