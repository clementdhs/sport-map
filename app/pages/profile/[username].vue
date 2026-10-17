<script setup lang="ts">
import type { PublicProfile } from '#shared/types/routes'

const { formatDate } = useFormat()

const route = useRoute()
const { t } = useI18n()

const { data, error } = await useFetch<PublicProfile>(`/api/profile/${encodeURIComponent(String(route.params.username))}`)
if (error.value || !data.value) {
  throw createError({
    statusCode: error.value?.statusCode ?? 404,
    statusMessage: error.value?.statusMessage ?? t('profile.notFound'),
    fatal: true,
  })
}

const displayName = computed(() => data.value!.profile.display_name ?? data.value!.profile.username)
const routeCount = computed(() => t('profile.publicRoutes', data.value!.routes.length))

useSeoMeta({
  title: () => `${displayName.value} — sport-map`,
  description: () => data.value?.profile.bio ?? t('profile.seoDescription', { routes: routeCount.value, name: displayName.value }),
  ogTitle: displayName,
  ogType: 'profile',
})
</script>

<template>
  <UContainer v-if="data" class="max-w-3xl space-y-6 py-8">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold">{{ displayName }}</h1>
      <p class="text-sm text-muted">
        @{{ data.profile.username }} · {{ t('profile.memberSince', { date: formatDate(data.profile.created_at) }) }} · {{ routeCount }}
      </p>
      <p v-if="data.profile.bio" class="whitespace-pre-line pt-2">{{ data.profile.bio }}</p>
    </div>

    <ul v-if="data.routes.length" class="space-y-2">
      <li v-for="item in data.routes" :key="item.id"><RouteCard :route="item" hide-owner /></li>
    </ul>
    <UEmpty v-else icon="i-lucide-route" :title="t('profile.noPublic')" />
  </UContainer>
</template>
