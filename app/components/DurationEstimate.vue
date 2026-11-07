<script setup lang="ts">
import type { SportType } from '#shared/utils/routes'

const props = defineProps<{
  sport: SportType
  distanceM: number
  elevationGainM: number | null
}>()

const { t } = useI18n()
const estimateDuration = useDurationEstimate()
const minutes = computed(() => estimateDuration(props.sport, props.distanceM, props.elevationGainM))
const method = useDurationMethod(() => props.sport, () => props.elevationGainM)
</script>

<template>
  <div>
    <p class="flex items-center gap-1 text-sm text-muted">
      {{ t('duration.estimated') }}
      <UTooltip :text="method" :ui="{ content: 'h-auto max-w-64 py-1.5', text: 'whitespace-normal' }">
        <UIcon name="i-lucide-info" class="size-3.5" tabindex="0" :aria-label="method" />
      </UTooltip>
    </p>
    <p class="font-numbers text-xl font-semibold tabular-nums">~{{ formatDuration(minutes) }}</p>
  </div>
</template>
