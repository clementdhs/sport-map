<script setup lang="ts">
import type { LiveShareListItem } from '#shared/types/live'

// The family members sharing their position during an outing (#46), refreshed while the page is in view. Topo
// look (#237): the way to share one's own position on the ink, then the outings with their mini-maps.
const { t } = useI18n()
useSeoMeta({ title: () => `${t('live.title')} — sportmap` })

const { data: shares, refresh } = await useFetch<LiveShareListItem[]>('/api/live', { query: { map: true }, default: () => [] })
usePolling(refresh, LIVE_POLL_INTERVAL_S * 1000)
// Sharing starts from a recording (or follow mode), which offers it once started (`?share=1`, #262): offered here
// while the member isn't sharing already.
const sharing = computed(() => shares.value.some(share => share.is_mine))

const now = ref<number | null>(null)
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  now.value = Date.now()
  clock = setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => clearInterval(clock))
</script>

<template>
  <UContainer class="max-w-2xl space-y-5 py-6 sm:py-8">
    <div class="space-y-1.5">
      <h1 class="flex items-center gap-2.5 text-[2.5rem] leading-none font-bold">
        <span class="size-3 shrink-0 rounded-full bg-(--gps) shadow-[0_0_0_5px_color-mix(in_srgb,var(--gps)_20%,transparent)]" :style="{ '--gps': GPS_COLOR }" aria-hidden="true" />
        {{ t('live.heading') }}
      </h1>
      <p class="text-muted">{{ t('live.refreshed', { seconds: LIVE_POLL_INTERVAL_S }) }}</p>
    </div>

    <section v-if="!sharing" class="dark flex items-center gap-3 rounded-lg bg-(--ui-color-neutral-900) p-3.5 text-default" aria-labelledby="live-share-title">
      <UIcon name="i-lucide-radio" class="size-10 shrink-0 text-(--sign)" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <h2 id="live-share-title" class="text-lg leading-tight font-bold">{{ t('live.shareTitle') }}</h2>
        <p class="text-sm text-toned">{{ t('live.shareHint', { hours: LIVE_SHARE_MAX_HOURS }) }}</p>
      </div>
      <UButton
        to="/record?share=1"
        :label="t('live.shareAction')"
        size="lg"
        class="shrink-0 bg-(--sign) font-bold text-(--sign-text) hover:bg-(--sign)/85"
      />
    </section>

    <div class="flex items-center gap-2.5 pt-1">
      <h2 class="text-sm font-bold tracking-[0.14em] whitespace-nowrap text-muted uppercase [font-family:var(--font-sans)]">
        {{ shares.length ? t('live.count', { title: t('live.title'), count: shares.length }) : t('live.title') }}
      </h2>
      <span class="h-px flex-1 bg-(--ui-border-accented)" aria-hidden="true" />
    </div>

    <ul v-if="shares.length" class="space-y-3">
      <li v-for="share in shares" :key="share.id">
        <LiveShareCard :share="share" :now="now" />
      </li>
    </ul>
    <p v-else class="rounded-lg border border-dashed border-accented p-6 text-center text-sm text-muted">
      {{ t('live.none') }}
    </p>
  </UContainer>
</template>
