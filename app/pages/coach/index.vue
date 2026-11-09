<script setup lang="ts">
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
</script>

<template>
  <UContainer class="max-w-2xl space-y-5 py-6 sm:py-8">
    <div class="space-y-1.5">
      <p class="text-sm font-bold tracking-[0.14em] text-muted uppercase [font-family:var(--font-sans)]" data-testid="coach-date">
        {{ today }}
      </p>
      <h1 class="text-[2.5rem] leading-none font-bold">{{ t('coach.title') }}</h1>
    </div>
    <CoachFormCard v-if="profile" :outings="profile.outings" />
  </UContainer>
</template>
