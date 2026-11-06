<script setup lang="ts">
import type { LiveShareSummary } from '#shared/types/live'

// The family members sharing their position during an outing (#46), refreshed while the page is in view.
const { t } = useI18n()
useSeoMeta({ title: () => `${t('live.title')} — sportmap` })

const { data: shares, refresh } = await useFetch<LiveShareSummary[]>('/api/live', { default: () => [] })
usePolling(refresh, LIVE_POLL_INTERVAL_S * 1000)

const now = ref<number | null>(null)
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  now.value = Date.now()
  clock = setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => clearInterval(clock))
</script>

<template>
  <UContainer class="max-w-2xl space-y-6 py-8">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold">{{ t('live.title') }}</h1>
      <p class="text-sm text-muted">{{ t('live.intro') }}</p>
    </div>

    <ul v-if="shares.length" class="space-y-2">
      <li v-for="share in shares" :key="share.id">
        <NuxtLink
          :to="`/live/${share.id}`"
          class="flex items-center gap-3 rounded-lg border border-default p-4 transition-colors hover:bg-elevated"
        >
          <MemberAvatar :name="share.user_name" :path="share.user_avatar_path" size="lg" />
          <div class="min-w-0 flex-1 space-y-1">
            <p class="flex items-center gap-1.5 font-medium">
              <UIcon name="i-lucide-radio" class="size-4 shrink-0 text-primary" aria-hidden="true" />
              {{ share.is_mine ? t('live.myOuting') : t('live.outingOf', { name: share.user_name }) }}
            </p>
            <p class="truncate text-sm">{{ share.route?.name ?? (share.follows_route ? t('live.privateRoute') : t('live.freeOuting')) }}</p>
            <LiveLastPosition :last-fixed-at="share.last_fixed_at" :now="now" />
          </div>
          <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted" />
        </NuxtLink>
      </li>
    </ul>
    <p v-else class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
      {{ t('live.none') }}
    </p>
  </UContainer>
</template>
