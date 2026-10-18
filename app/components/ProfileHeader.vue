<script setup lang="ts">
import type { ProfileInfo, ProfileSummary } from '#shared/types/routes'

// Top of a profile, the member's own or another one's: initials avatar, name, and the current year's totals.
const props = defineProps<{
  profile: ProfileInfo
  summary: ProfileSummary
  // Appended to the "@username · member since" line
  detail?: string
}>()

const { t } = useI18n()
const { formatDate, formatDistance, formatNumber } = useFormat()

const name = computed(() => props.profile.display_name ?? props.profile.username)
const summaryTitleId = useId()
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-4">
      <!-- Accent colour, like the solid buttons. The name is the heading next to it. -->
      <span class="flex shrink-0" aria-hidden="true" data-testid="profile-avatar">
        <UAvatar :text="initials(name)" size="3xl" :ui="{ root: 'bg-primary', fallback: 'text-inverted' }" />
      </span>
      <div class="min-w-0 flex-1 space-y-1">
        <h1 class="text-2xl font-semibold break-words">{{ name }}</h1>
        <p class="text-sm text-muted">
          @{{ profile.username }} · {{ t('profile.memberSince', { date: formatDate(profile.created_at) }) }}<template v-if="detail"> · {{ detail }}</template>
        </p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 gap-2 self-start">
        <slot name="actions" />
      </div>
    </div>

    <section :aria-labelledby="summaryTitleId" data-testid="profile-summary">
      <h2 :id="summaryTitleId" class="mb-1 text-xs font-medium text-muted">{{ t('profile.summary.title', { year: summary.year }) }}</h2>
      <dl class="grid grid-cols-3 gap-2">
        <div class="rounded-lg bg-elevated p-3">
          <dt class="text-xs text-muted">{{ t('profile.summary.distance') }}</dt>
          <dd class="font-numbers text-xl font-semibold tabular-nums">{{ formatDistance(summary.distance_m) }}</dd>
        </div>
        <div class="rounded-lg bg-elevated p-3">
          <dt class="text-xs text-muted">{{ t('profile.summary.outings') }}</dt>
          <dd class="font-numbers text-xl font-semibold tabular-nums">{{ summary.outings }}</dd>
        </div>
        <div class="rounded-lg bg-elevated p-3">
          <dt class="text-xs text-muted">{{ t('profile.summary.gain') }}</dt>
          <dd class="font-numbers text-xl font-semibold tabular-nums">{{ formatNumber(Math.round(summary.elevation_gain_m)) }} m</dd>
        </div>
      </dl>
    </section>

    <p v-if="profile.bio" class="whitespace-pre-line">{{ profile.bio }}</p>
  </div>
</template>
