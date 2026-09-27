<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { RouteDetail } from '#shared/types/routes'
import type { ActivityType, LngLat } from '#shared/utils/routes'

const route = useRoute()
const user = useSupabaseUser()
const toast = useToast()

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

const errorMessage = (error: unknown) => (error as FetchError).data?.statusMessage ?? (error as Error).message

const viewer = computed(() => parcours.value?.viewer ?? { saved: false, completed_at: null })
const pendingActivity = ref<ActivityType | null>(null)

async function toggleActivity(type: ActivityType) {
  if (!user.value) return navigateTo({ path: '/login', query: { redirect: route.fullPath } })

  const active = type === 'saved' ? viewer.value.saved : !!viewer.value.completed_at
  pendingActivity.value = type
  try {
    await $fetch(`/api/routes/${parcours.value!.id}/activity/${type}`, { method: active ? 'DELETE' : 'PUT' })
    parcours.value!.viewer = type === 'saved'
      ? { ...viewer.value, saved: !active }
      : { ...viewer.value, completed_at: active ? null : new Date().toISOString() }
  }
  catch (error) {
    toast.add({ title: 'Action impossible', description: errorMessage(error), color: 'error' })
  }
  finally {
    pendingActivity.value = null
  }
}

const deleteOpen = ref(false)
const deleting = ref(false)

async function deleteRoute() {
  deleting.value = true
  try {
    await $fetch(`/api/routes/${parcours.value!.id}`, { method: 'DELETE' })
    toast.add({ title: 'Parcours supprimé', color: 'success', icon: 'i-lucide-check' })
    await navigateTo('/profile')
  }
  catch (error) {
    toast.add({ title: 'Suppression impossible', description: errorMessage(error), color: 'error' })
    deleting.value = false
  }
}

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
        <UBadge v-if="parcours.source === 'gpx_import'" icon="i-lucide-file-up" label="Importé d'un GPX" color="neutral" variant="subtle" />
      </div>

      <h1 class="text-2xl font-semibold">{{ parcours.name }}</h1>

      <p class="text-sm text-muted">
        Par
        <ULink v-if="parcours.owner" :to="`/profile/${parcours.owner.username}`" class="font-medium text-default hover:underline">
          {{ parcours.owner.display_name ?? parcours.owner.username }}
        </ULink>
        <span v-if="isOwner"> (toi)</span>
        · {{ formatDate(parcours.created_at) }}
      </p>

      <div class="grid grid-cols-2 gap-2">
        <UButton
          :icon="viewer.saved ? 'i-lucide-bookmark-check' : 'i-lucide-bookmark'"
          :label="viewer.saved ? 'Sauvegardé' : 'Sauvegarder'"
          :color="viewer.saved ? 'primary' : 'neutral'"
          :variant="viewer.saved ? 'soft' : 'outline'"
          :loading="pendingActivity === 'saved'"
          block
          @click="toggleActivity('saved')"
        />
        <UButton
          :icon="viewer.completed_at ? 'i-lucide-circle-check' : 'i-lucide-flag'"
          :label="viewer.completed_at ? `Fait le ${formatShortDate(viewer.completed_at)}` : 'Je l\'ai fait'"
          :color="viewer.completed_at ? 'primary' : 'neutral'"
          :variant="viewer.completed_at ? 'soft' : 'outline'"
          :loading="pendingActivity === 'completed'"
          block
          @click="toggleActivity('completed')"
        />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-lg bg-elevated p-3">
          <p class="text-sm text-muted">Distance</p>
          <p class="text-lg font-semibold">{{ formatDistance(parcours.distance_m) }}</p>
        </div>
        <DurationEstimate
          class="rounded-lg bg-elevated p-3"
          :sport="parcours.sport_type"
          :distance-m="parcours.distance_m"
          :elevation-gain-m="parcours.elevation_gain_m"
        />
        <div class="rounded-lg bg-elevated p-3">
          <p class="text-sm text-muted">Dénivelé +</p>
          <p class="text-lg font-semibold">
            {{ parcours.elevation_gain_m != null ? `${Math.round(parcours.elevation_gain_m)} m` : '—' }}
          </p>
        </div>
        <div class="rounded-lg bg-elevated p-3">
          <p class="text-sm text-muted">Dénivelé −</p>
          <p class="text-lg font-semibold">
            {{ parcours.elevation_loss_m != null ? `${Math.round(parcours.elevation_loss_m)} m` : '—' }}
          </p>
        </div>
      </div>

      <ElevationProfile
        v-if="parcours.elevation_profile?.length === coordinates.length"
        :coordinates="coordinates"
        :elevations="parcours.elevation_profile"
      />

      <p v-if="parcours.description" class="whitespace-pre-line">{{ parcours.description }}</p>

      <UButton
        v-if="isOwner"
        :to="`/routes/${parcours.id}/edit`"
        icon="i-lucide-pencil"
        label="Modifier le parcours"
        color="neutral"
        variant="outline"
        block
      />

      <UButton
        :to="`/api/routes/${parcours.id}/gpx`"
        external
        download
        icon="i-lucide-download"
        label="Exporter en GPX"
        color="neutral"
        variant="outline"
        block
      />

      <UModal
        v-if="isOwner"
        v-model:open="deleteOpen"
        title="Supprimer ce parcours ?"
        description="Il disparaîtra aussi des parcours sauvegardés et réalisés des autres utilisateurs. Cette action est définitive."
      >
        <UButton label="Supprimer le parcours" icon="i-lucide-trash-2" color="error" variant="ghost" block />
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton label="Annuler" color="neutral" variant="outline" @click="deleteOpen = false" />
            <UButton label="Supprimer" icon="i-lucide-trash-2" color="error" :loading="deleting" @click="deleteRoute" />
          </div>
        </template>
      </UModal>
    </aside>
  </div>
</template>
