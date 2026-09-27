<script setup lang="ts">
import type { RouteDetail } from '#shared/types/routes'
import type { LngLat } from '#shared/utils/routes'

const route = useRoute()
const user = useSupabaseUser()

const { data: parcours, error } = await useFetch<RouteDetail>(`/api/routes/${route.params.id}`)
if (error.value || !parcours.value) {
  throw createError({
    statusCode: error.value?.statusCode ?? 404,
    statusMessage: error.value?.statusMessage ?? 'Parcours introuvable',
    fatal: true,
  })
}

const coordinates = computed(() => (parcours.value?.geometry.coordinates ?? []) as LngLat[])
const isOwner = computed(() => user.value?.sub === parcours.value?.owner_id)
const summary = computed(() => {
  const p = parcours.value!
  return `${SPORT_LABELS[p.sport_type]} · ${formatDistance(p.distance_m)}${p.description ? ` — ${p.description}` : ''}`
})

useSeoMeta({
  title: () => `${parcours.value?.name} — sport-map`,
  description: summary,
  ogTitle: () => parcours.value?.name,
  ogDescription: summary,
  ogType: 'article',
})
</script>

<template>
  <div v-if="parcours" class="flex h-[calc(100dvh-var(--ui-header-height))] flex-col md:flex-row">
    <div class="relative min-h-0 flex-1">
      <ClientOnly>
        <MapRouteDisplay :coordinates="coordinates" />
      </ClientOnly>
    </div>

    <aside class="max-h-[40dvh] shrink-0 space-y-4 overflow-y-auto border-t border-default p-4 md:max-h-none md:w-96 md:border-t-0 md:border-l">
      <div class="flex flex-wrap items-center gap-2">
        <UBadge :icon="SPORT_ICONS[parcours.sport_type]" :label="SPORT_LABELS[parcours.sport_type]" variant="subtle" />
        <UBadge v-if="!parcours.is_public" icon="i-lucide-lock" label="Privé" color="neutral" variant="subtle" />
      </div>

      <h1 class="text-2xl font-semibold">{{ parcours.name }}</h1>

      <p class="text-sm text-muted">
        Par <span class="font-medium text-default">{{ parcours.owner?.display_name ?? parcours.owner?.username }}</span>
        <span v-if="isOwner"> (toi)</span>
        · {{ formatDate(parcours.created_at) }}
      </p>

      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-lg bg-elevated p-3">
          <p class="text-sm text-muted">Distance</p>
          <p class="text-xl font-semibold tabular-nums">{{ formatDistance(parcours.distance_m) }}</p>
        </div>
        <div class="rounded-lg bg-elevated p-3">
          <p class="text-sm text-muted">Dénivelé +</p>
          <p class="text-xl font-semibold tabular-nums">
            {{ parcours.elevation_gain_m != null ? `${Math.round(parcours.elevation_gain_m)} m` : '—' }}
          </p>
        </div>
      </div>

      <p v-if="parcours.description" class="whitespace-pre-line">{{ parcours.description }}</p>
    </aside>
  </div>
</template>
