<script setup lang="ts">
import type { PublicProfile } from '#shared/types/routes'

const route = useRoute()

const { data, error } = await useFetch<PublicProfile>(`/api/profile/${encodeURIComponent(String(route.params.username))}`)
if (error.value || !data.value) {
  throw createError({
    statusCode: error.value?.statusCode ?? 404,
    statusMessage: error.value?.statusMessage ?? 'Profil introuvable',
    fatal: true,
  })
}

const displayName = computed(() => data.value!.profile.display_name ?? data.value!.profile.username)
const routeCount = computed(() => {
  const count = data.value!.routes.length
  return count === 1 ? '1 parcours public' : `${count} parcours publics`
})

useSeoMeta({
  title: () => `${displayName.value} — sport-map`,
  description: () => data.value?.profile.bio ?? `${routeCount.value} de ${displayName.value} sur sport-map.`,
  ogTitle: displayName,
  ogType: 'profile',
})
</script>

<template>
  <UContainer v-if="data" class="max-w-3xl space-y-6 py-8">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold">{{ displayName }}</h1>
      <p class="text-sm text-muted">
        @{{ data.profile.username }} · membre depuis le {{ formatDate(data.profile.created_at) }} · {{ routeCount }}
      </p>
      <p v-if="data.profile.bio" class="whitespace-pre-line pt-2">{{ data.profile.bio }}</p>
    </div>

    <ul v-if="data.routes.length" class="space-y-2">
      <li v-for="item in data.routes" :key="item.id"><RouteCard :route="item" /></li>
    </ul>
    <UEmpty v-else icon="i-lucide-route" title="Aucun parcours public pour l'instant" />
  </UContainer>
</template>
