<script setup lang="ts">
import { GAUGE_ZONES, gaugePosition } from '#shared/utils/trainingForm'

// The three zones of the form (#263) and where the member stands, as on the mockup's gauge: recovery, progress,
// overload, each one written under its zone so the colour is never the only information.
const props = defineProps<{
  ratio: number
}>()

const { t } = useI18n()
const { formatNumber } = useFormat()
const zones = ['recovery', 'progress', 'overload'] as const
const columns = `${GAUGE_ZONES.recovery}fr ${GAUGE_ZONES.progress}fr ${GAUGE_ZONES.overload}fr`
const position = computed(() => gaugePosition(props.ratio))
</script>

<template>
  <div
    role="meter"
    :aria-valuenow="Math.min(2, Math.round(ratio * 100) / 100)"
    aria-valuemin="0"
    aria-valuemax="2"
    :aria-valuetext="t('coachForm.ratioValue', { ratio: formatNumber(ratio, { maximumFractionDigits: 2 }) })"
    :aria-label="t('coachForm.gauge')"
  >
    <div class="relative">
      <div class="grid h-2.5 gap-[3px]" :style="{ gridTemplateColumns: columns }">
        <div class="rounded-s-[3px] bg-(--form-recovery)" />
        <div class="bg-(--form-progress)" />
        <div class="rounded-e-[3px] bg-(--form-overload)" />
      </div>
      <div
        class="absolute -top-[5px] h-5 w-1 -translate-x-1/2 rounded-[2px] bg-inverted ring-2 ring-(--ui-bg)"
        :style="{ left: `${position}%` }"
        data-testid="form-gauge-needle"
      />
    </div>
    <div class="mt-1.5 grid gap-[3px] text-xs text-muted" :style="{ gridTemplateColumns: columns }" aria-hidden="true">
      <span v-for="zone in zones" :key="zone" :class="{ 'text-center': zone === 'progress', 'text-end': zone === 'overload' }">
        {{ t(`coachForm.zones.${zone}`) }}
      </span>
    </div>
  </div>
</template>
