<script setup lang="ts">
import type { CoachGoal } from '#shared/types/account'
import type { MyProfile } from '#shared/types/routes'

// The coach (#261): the session of the day, chosen from the member's form, goal and time available. Its own tab
// in the main navigation since #262, in place of "En direct"; the other sub-issues of #261 fill the page.
const { t } = useI18n()
const { locale } = useFormat()
useSeoMeta({ title: () => `${t('coach.title')} — sportmap` })

// Today in the fixed time zone of the other dates, so the server and the client render the same day.
const today = computed(() => new Date().toLocaleDateString(locale(), {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Paris',
}))

// The form of the moment (#263) from the profile's outings, like the statistics. Without them (error) the page
// still shows, without the card.
const { data: profile } = await useFetch<MyProfile>('/api/profile/me')
const form = computed(() => profile.value ? trainingForm(profile.value.outings) : null)

// The coach's goal (#264), its own ref so that saving it shows at once (useFetch data is shallow). Without it
// (none chosen, or an error) the coach aims at progress.
const { data: savedGoal } = await useFetch<CoachGoal | null>('/api/profile/me/coach-goal')
const goal = ref<CoachGoal | null>(savedGoal.value ?? null)
watch(savedGoal, value => { goal.value = value ?? null })</script>

<template>
  <UContainer class="max-w-2xl space-y-5 py-6 sm:py-8">
    <div class="space-y-1.5">
      <p class="text-sm font-bold tracking-[0.14em] text-muted uppercase [font-family:var(--font-sans)]" data-testid="coach-date">
        {{ today }}
      </p>
      <h1 class="text-[2.5rem] leading-none font-bold">{{ t('coach.title') }}</h1>
    </div>
    <CoachGoalLine v-if="form?.state !== 'learning'" :goal="goal" @saved="goal = $event" />
    <CoachRacePhase :goal="goal" />
    <CoachFormCard v-if="profile" :outings="profile.outings" />
    <section v-if="form?.state === 'learning'" class="space-y-2.5" data-testid="coach-goal-start">
      <h2 class="text-lg font-bold [font-family:var(--font-numbers)]">{{ t('coachGoal.title') }}</h2>
      <CoachGoalForm :goal="goal" @saved="goal = $event" />
    </section>
    <CoachSessionCard v-if="profile && form" :outings="profile.outings" :goal="goal" />
  </UContainer>
</template>
