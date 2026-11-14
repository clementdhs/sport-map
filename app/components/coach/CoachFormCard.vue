<script setup lang="ts">
import type { LoadOuting } from '#shared/utils/trainingForm'

// "Ta forme du moment" on the coach page (#263, mockup 1): the state, the three-zone gauge and a sentence on the
// last 7 days, linking to the detail page. While the coach is still learning, the start card instead, and the
// import of outings recorded elsewhere (#268, mockup 5) to get there sooner.
const props = defineProps<{
  outings: LoadOuting[]
}>()

const { t } = useI18n()
const form = computed(() => trainingForm(props.outings))
const sentence = useFormSentence(form)
</script>

<template>
  <template v-if="form.state === 'learning'">
    <CoachFormStart :form="form" />
    <CoachImport />
  </template>
  <NuxtLink
    v-else
    to="/coach/forme"
    class="block rounded-lg border border-default bg-default p-4 transition-colors hover:bg-elevated/50"
    data-testid="coach-form-card"
    :data-state="form.state"
  >
    <div class="flex items-baseline justify-between gap-2">
      <h2 class="text-xs font-bold tracking-[0.08em] text-muted uppercase [font-family:var(--font-numbers)]">
        {{ t('coachForm.title') }}
      </h2>
      <span class="text-sm font-semibold text-primary">{{ t('coachForm.details') }} ›</span>
    </div>
    <p class="mt-1 font-display text-3xl leading-tight font-bold text-highlighted">
      {{ t(`coachForm.states.${form.state}`) }}
    </p>
    <CoachFormGauge :ratio="form.ratio ?? 0" class="mt-3" />
    <p class="mt-2.5 text-sm text-toned">
      {{ sentence }}
    </p>
  </NuxtLink>
</template>
