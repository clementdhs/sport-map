<script setup lang="ts">
import type { PublicProfile } from '#shared/types/routes'

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
  title: () => `${displayName.value} — sportmap`,
  description: () => data.value?.profile.bio ?? t('profile.seoDescription', { routes: routeCount.value, name: displayName.value }),
  ogTitle: displayName,
  ogType: 'profile',
})
</script>

<template>
  <UContainer v-if="data" class="max-w-3xl space-y-6 py-8 lg:max-w-6xl">
    <ProfileHeader :profile="data.profile" :summary="data.summary" :detail="routeCount" />

    <ul v-if="data.routes.length" class="grid gap-2 lg:grid-cols-2">
      <li v-for="item in data.routes" :key="item.id"><RouteCard :route="item" hide-owner class="h-full" /></li>
    </ul>
    <UEmpty v-else icon="i-lucide-route" :title="t('profile.noPublic')" />
  </UContainer>
</template>
