<script setup lang="ts">
import type { LiveShareSummary } from '#shared/types/live'

// On the home page: the family members out right now and sharing their position (#46), checked again every
// minute while the page is in view.
const { t } = useI18n()
const { data: shares, refresh } = useFetch<LiveShareSummary[]>('/api/live', { default: () => [], server: false, lazy: true })
usePolling(refresh, 60_000)

const others = computed(() => shares.value.filter(share => !share.is_mine))
</script>

<template>
  <ul v-if="others.length" class="space-y-2">
    <li v-for="share in others" :key="share.id">
      <NuxtLink
        :to="`/live/${share.id}`"
        class="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm transition-colors hover:bg-primary/15"
      >
        <UIcon name="i-lucide-radio" class="size-5 shrink-0 animate-pulse text-primary" />
        <span class="min-w-0 flex-1 truncate font-medium">{{ t('live.banner', { name: share.user_name }) }}</span>
        <span class="shrink-0 text-primary">{{ t('live.bannerLink') }}</span>
      </NuxtLink>
    </li>
  </ul>
</template>
