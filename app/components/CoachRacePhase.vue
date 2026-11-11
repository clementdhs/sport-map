<script setup lang="ts">
import type { CoachGoal } from '#shared/types/account'
import { isTrailRace, racePhase } from '#shared/utils/racePhases'

// Where the member stands in their race preparation (#286), under the goal line of the coach page: the phase, its
// week, what it is about, and the days left to the race.
const props = defineProps<{
  goal: CoachGoal | null
}>()

const { t } = useI18n()
const phase = computed(() => racePhase(props.goal, localDate(new Date())))

const when = computed(() => {
  const p = phase.value
  if (!p) return ''
  if (p.weeks === null) return t('racePhase.untilBuild', { n: p.untilNext ?? 0 }, p.untilNext ?? 0)
  return t('racePhase.week', { week: p.week, weeks: p.weeks })
})
const hint = computed(() => {
  const p = phase.value
  if (!p || !props.goal) return ''
  if (p.name === 'build') return t(isTrailRace(props.goal) ? 'racePhase.hints.buildTrail' : 'racePhase.hints.buildRoad')
  return t(`racePhase.hints.${p.name}`)
})
</script>

<template>
  <section
    v-if="phase"
    class="flex items-center justify-between gap-3 rounded-lg border border-default bg-default px-3.5 py-3"
    data-testid="coach-race-phase"
    :data-phase="phase.name"
  >
    <div class="min-w-0">
      <p class="text-xs font-bold tracking-[0.08em] text-muted uppercase [font-family:var(--font-numbers)]">{{ t('racePhase.label') }}</p>
      <p class="mt-0.5 font-display text-xl leading-tight font-bold text-highlighted">
        {{ t(`racePhase.names.${phase.name}`) }} <span class="text-sm font-semibold text-toned [font-family:var(--font-sans)]">· {{ when }}</span>
      </p>
      <p class="mt-1 text-sm text-toned">{{ hint }}</p>
    </div>
    <p class="shrink-0 text-center" data-testid="coach-race-countdown">
      <span class="block font-numbers text-3xl leading-none font-bold tabular-nums">{{ t('racePhase.countdown', { n: phase.daysLeft }) }}</span>
      <span class="text-xs text-muted">{{ t('racePhase.daysLeft', phase.daysLeft) }}</span>
    </p>
  </section>
</template>
