<script setup lang="ts">
import type { RecordBreakers, RouteOuting } from '#shared/types/routes'
import type { RecordKind } from '#shared/utils/personalRecords'
import type { LngLat, OutingTrackPoint, SportType } from '#shared/utils/routes'

// "Outings" tab of a route page: the outings recorded with the GPS while following the route (or recording
// it), by everyone who can see it, with their moving time against the estimated duration. Outings whose GPS
// points were kept open a detail (OutingDetail), one at a time.
const props = defineProps<{
  routeId: string
  sport: SportType
  distanceM: number
  elevationGainM: number | null
  // The outing a flyover replays (#74), and metres along it of its moving point
  replay?: { outingId: string, along: number } | null
}>()
const outings = defineModel<RouteOuting[]>('outings', { required: true })

const emit = defineEmits<{
  // Position under the cursor on an outing's chart, for the map
  hover: [point: LngLat | null]
  replay: [outingId: string, track: OutingTrackPoint[]]
}>()

// A record of the profile links to its outing's detail (?tab=outings&outing=…, #140).
const route = useRoute()
const linked = typeof route.query.outing === 'string' ? route.query.outing : null
const opened = ref<string | null>(outings.value.some(o => o.id === linked && o.has_track) ? linked : null)
function toggle(outing: RouteOuting) {
  opened.value = opened.value === outing.id ? null : outing.id
}

const { t } = useI18n()

// The viewer's outings that beat one of their records: a bonus, loaded once the tab shows (it stays mounted
// behind the others) and again after a deletion, and nothing is said when it fails (offline).
const breakers = ref<RecordBreakers>({})
let breakersLoaded = false
async function loadBreakers() {
  breakersLoaded = true
  if (!outings.value.some(o => o.is_mine)) return
  try {
    breakers.value = await $fetch<RecordBreakers>('/api/profile/me/record-breakers')
  }
  catch {
    // The record badges are a bonus: without them the outings list as usual.
  }
}
onMounted(() => {
  if (opened.value) document.querySelector(`[data-outing-id="${opened.value}"]`)?.scrollIntoView({ block: 'start' })
  watch(() => route.query.tab === 'outings', (shown) => {
    if (shown && !breakersLoaded) loadBreakers()
  }, { immediate: true })
})
const recordLabels = (kinds: RecordKind[]) => kinds.map(kind => t(recordLabelKey(kind))).join(', ')
const toast = useToast()
const errorMessage = useErrorMessage()
const { formatDate, formatDistance, formatSpeed } = useFormat()

const estimateDuration = useDurationEstimate()
const estimateMin = computed(() => estimateDuration(props.sport, props.distanceM, props.elevationGainM))

function gap(outing: RouteOuting) {
  const minutes = estimateGapMin(outing.moving_s, estimateMin.value)
  if (!minutes) return { label: t('outings.asEstimated'), color: 'neutral' as const }
  return minutes < 0
    ? { label: t('outings.faster', { duration: formatDuration(-minutes) }), color: 'success' as const }
    : { label: t('outings.slower', { duration: formatDuration(minutes) }), color: 'neutral' as const }
}

const deleting = ref<string | null>(null)
async function remove(outing: RouteOuting) {
  if (!window.confirm(t('outings.deleteConfirm'))) return
  deleting.value = outing.id
  try {
    await $fetch(`/api/routes/${props.routeId}/outings/${outing.id}`, { method: 'DELETE' })
    outings.value = outings.value.filter(o => o.id !== outing.id)
    // Without it, a later outing may now beat nothing.
    if (breakersLoaded) loadBreakers()
  }
  catch (error) {
    toast.add({ title: t('outings.deleteFailed'), description: errorMessage(error), color: 'error' })
  }
  finally {
    deleting.value = null
  }
}
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm text-muted">
      {{ t('outings.estimate', { duration: formatDuration(estimateMin) }) }}
    </p>
    <ul class="divide-y divide-default">
      <li v-for="outing in outings" :key="outing.id" class="space-y-3 py-3" data-testid="outing" :data-outing-id="outing.id">
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1 space-y-1 text-sm">
            <p>
              <ULink v-if="outing.user" :to="`/profile/${outing.user.username}`" class="font-medium hover:underline">
                {{ outing.user.display_name ?? outing.user.username }}
              </ULink>
              <span class="text-muted"> · {{ formatDate(outing.started_at) }}</span>
            </p>
            <p>
              {{ t('outings.times', { total: formatElapsed(outing.duration_s), moving: formatElapsed(outing.moving_s) }) }}
              <span class="text-muted">· {{ formatDistance(outing.distance_m) }} · {{ formatSpeed(outing.distance_m, outing.moving_s) }}</span>
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :label="gap(outing).label" :color="gap(outing).color" variant="subtle" />
              <template v-if="breakers[outing.id]">
                <UBadge :label="t('records.badge')" icon="i-lucide-trophy" color="warning" variant="subtle" />
                <span class="text-xs text-muted">{{ recordLabels(breakers[outing.id]!) }}</span>
              </template>
              <UButton
                v-if="outing.has_track"
                :label="t('outings.detail')"
                :trailing-icon="opened === outing.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                :aria-expanded="opened === outing.id"
                color="neutral"
                variant="link"
                size="sm"
                class="px-0"
                @click="toggle(outing)"
              />
            </div>
          </div>
          <UButton
            v-if="outing.is_mine"
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            :loading="deleting === outing.id"
            :aria-label="t('outings.delete')"
            @click="remove(outing)"
          />
        </div>
        <OutingDetail
          v-if="opened === outing.id"
          :route-id="routeId"
          :outing-id="outing.id"
          :sport="sport"
          :marker="replay?.outingId === outing.id ? replay.along : null"
          @hover="emit('hover', $event)"
          @replay="emit('replay', outing.id, $event)"
        />
      </li>
    </ul>
  </div>
</template>
