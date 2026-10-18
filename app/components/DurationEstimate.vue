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
const { locale } = useFormat()
const estimateDuration = useDurationEstimate()
const minutes = computed(() => estimateDuration(props.sport, props.distanceM, props.elevationGainM))
// The member's pace for the sport (#146), which the tooltip names, else the sport's default one.
const paces = usePreference('paces')
const pace = computed(() => paces.value[props.sport])
const method = computed(() => {
  const formula = pace.value === undefined
    ? t(`duration.methods.${props.sport}`)
    : t(`duration.myMethods.${props.sport}`, { value: formatPaceSetting(props.sport, pace.value, locale()) })
  return props.elevationGainM === null ? `${formula} ${t('duration.unknownGain')}` : formula
})
</script>

<template>
  <div>
    <p class="flex items-center gap-1 text-muted" :class="compact ? 'text-xs' : 'text-sm'">
      {{ compact ? t('duration.short') : t('duration.estimated') }}
      <UTooltip :text="method" :ui="{ content: 'h-auto max-w-64 py-1.5', text: 'whitespace-normal' }">
        <UIcon name="i-lucide-info" class="size-3.5" tabindex="0" :aria-label="method" />
      </UTooltip>
    </p>
    <p class="font-numbers font-semibold tabular-nums" :class="compact ? 'text-lg' : 'text-xl'">~{{ formatDuration(minutes) }}</p>
  </div>
</template>
