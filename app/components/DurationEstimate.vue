<script setup lang="ts">
import type { SportType } from '#shared/utils/routes'

const props = defineProps<{
  sport: SportType
  distanceM: number
  elevationGainM: number | null
  // Smaller, for a row of key figures
  compact?: boolean
}>()

const { t } = useI18n()
const minutes = computed(() => estimateDurationMin(props.sport, props.distanceM, props.elevationGainM))
const method = computed(() => props.elevationGainM === null
  ? `${DURATION_METHODS[props.sport]} ${t('duration.unknownGain')}`
  : DURATION_METHODS[props.sport])
</script>

<template>
  <div>
    <p class="flex items-center gap-1 text-muted" :class="compact ? 'text-xs' : 'text-sm'">
      {{ compact ? t('duration.short') : t('duration.estimated') }}
      <UTooltip :text="method" :ui="{ content: 'h-auto max-w-64 py-1.5', text: 'whitespace-normal' }">
        <UIcon name="i-lucide-info" class="size-3.5" tabindex="0" :aria-label="method" />
      </UTooltip>
    </p>
    <p class="font-semibold" :class="compact ? 'text-base' : 'text-lg'">~{{ formatDuration(minutes) }}</p>
  </div>
</template>
