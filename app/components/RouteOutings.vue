<script setup lang="ts">
import type { RouteOuting } from '#shared/types/routes'
import type { SportType } from '#shared/utils/routes'

// "Outings" tab of a route page: the outings recorded with the GPS while following the route (or recording
// it), by everyone who can see it, with their moving time against the estimated duration.
const props = defineProps<{
  routeId: string
  sport: SportType
  distanceM: number
  elevationGainM: number | null
}>()
const outings = defineModel<RouteOuting[]>('outings', { required: true })

const { t } = useI18n()
const toast = useToast()
const errorMessage = useErrorMessage()
const { formatDate, formatDistance, formatSpeed } = useFormat()

const estimateMin = computed(() => estimateDurationMin(props.sport, props.distanceM, props.elevationGainM))

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
      <li v-for="outing in outings" :key="outing.id" class="flex items-start gap-3 py-3" data-testid="outing">
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
          <UBadge :label="gap(outing).label" :color="gap(outing).color" variant="subtle" />
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
      </li>
    </ul>
  </div>
</template>
