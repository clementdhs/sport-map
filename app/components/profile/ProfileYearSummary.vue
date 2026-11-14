<script setup lang="ts">
import type { ProfileSummary } from '#shared/types/routes'
import type { KeyFigure } from '~/utils/keyFigures'

// The current year's distance, outings and gain of a profile, in the key figures cartouche (#236).
const props = defineProps<{
  summary: ProfileSummary
}>()

const { t } = useI18n()
const { formatDistance, formatNumber } = useFormat()
const titleId = useId()

const figures = computed<KeyFigure[]>(() => {
  const [distance, unit] = splitUnit(formatDistance(props.summary.distance_m))
  return [
    { label: t('profile.summary.distance'), value: distance, unit },
    { label: t('profile.summary.outings'), value: String(props.summary.outings) },
    { label: t('profile.summary.gain'), value: formatNumber(Math.round(props.summary.elevation_gain_m)), unit: 'm' },
  ]
})
</script>

<template>
  <section :aria-labelledby="titleId" data-testid="profile-summary">
    <h2 :id="titleId" class="mb-2 font-display text-2xl font-bold">{{ t('profile.summary.title', { year: summary.year }) }}</h2>
    <KeyFigures :figures="figures" />
  </section>
</template>
