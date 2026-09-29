<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { RouteDetail, RoutePhoto, ViewerActivity } from '#shared/types/routes'
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
const hoverPoint = ref<LngLat | null>(null)

// Slopes, when the route has elevations: steepest grade, main climb, and colours for the map and the profile.
const slopes = computed(() => {
  const elevations = parcours.value?.elevation_profile
  if (!elevations || elevations.length !== coordinates.value.length || coordinates.value.length < 2) return null
  const profile = slopeProfile(coordinates.value, elevations)
  return {
    profile,
    steepest: steepestGrade(profile),
    climb: mainClimb(coordinates.value, elevations, profile.along),
    gradient: slopeGradient(slopeRuns(profile), profile.along.at(-1)!),
  }
})
const showSlopes = ref(false)
// Own state for what the page changes: useFetch data is a shallow ref, so changing a property of
// parcours (photos, viewer) would not re-render the page.
const photos = ref<RoutePhoto[]>(parcours.value.photos)
const viewer = ref<ViewerActivity>(parcours.value.viewer ?? { saved: false, completed_at: null, duration_s: null, moving_s: null })

// In the order they come along the track.
const pois = computed(() => {
  if (coordinates.value.length < 2) return []
  return (parcours.value?.pois ?? [])
    .map(poi => ({ ...poi, distanceM: snapToTrack(coordinates.value, poi.coordinates).distanceM }))
    .sort((a, b) => a.distanceM - b.distanceM)
})
const isOwner = computed(() => user.value?.sub === parcours.value?.owner_id)
const summary = computed(() => {
  const p = parcours.value!
  return `${SPORT_LABELS[p.sport_type]} · ${formatDistance(p.distance_m)}${p.description ? ` — ${p.description}` : ''}`
})

const errorMessage = (error: unknown) => (error as FetchError).data?.statusMessage ?? (error as Error).message

const pendingActivity = ref<ActivityType | null>(null)

async function toggleActivity(type: ActivityType) {
  if (!user.value) return navigateTo({ path: '/login', query: { redirect: route.fullPath } })

  const active = type === 'saved' ? viewer.value.saved : !!viewer.value.completed_at
  pendingActivity.value = type
  try {
    await $fetch(`/api/routes/${parcours.value!.id}/activity/${type}`, { method: active ? 'DELETE' : 'PUT' })
    viewer.value = type === 'saved'
      ? { ...viewer.value, saved: !active }
      : { ...viewer.value, completed_at: active ? null : new Date().toISOString(), duration_s: null, moving_s: null }
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

// Link previews need an absolute image URL. Private routes have no image (the endpoint refuses them),
// and ?v= makes caches fetch a new image once the route is edited.
const origin = useRequestURL().origin
const ogImage = computed(() => parcours.value?.is_public
  ? `${origin}/api/routes/${parcours.value.id}/og.png?v=${Date.parse(parcours.value.updated_at)}`
  : undefined)

useSeoMeta({
  title: () => `${parcours.value?.name} — sport-map`,
  description: summary,
  ogTitle: () => parcours.value?.name,
  ogDescription: summary,
  ogType: 'article',
  ogImage,
  ogImageType: () => (ogImage.value ? 'image/png' : undefined),
  ogImageWidth: () => (ogImage.value ? 1200 : undefined),
  ogImageHeight: () => (ogImage.value ? 630 : undefined),
  ogImageAlt: () => (ogImage.value ? `Tracé du parcours ${parcours.value?.name}` : undefined),
  twitterCard: () => (ogImage.value ? 'summary_large_image' : 'summary'),
})
</script>

<template>
  <div v-if="parcours" class="flex h-[calc(100dvh-var(--ui-header-height))] flex-col md:flex-row">
    <div class="relative min-h-0 flex-1">
      <ClientOnly>
        <MapRouteDisplay
          :coordinates="coordinates"
          :pois="parcours.pois"
          :slope-gradient="showSlopes ? slopes?.gradient : null"
          :hover-point="hoverPoint"
        />
      </ClientOnly>
    </div>

    <aside class="max-h-[40dvh] shrink-0 space-y-4 overflow-y-auto border-t border-default p-4 md:max-h-none md:w-96 md:border-t-0 md:border-l">
      <div class="flex flex-wrap items-center gap-2">
        <UBadge :icon="SPORT_ICONS[parcours.sport_type]" :label="SPORT_LABELS[parcours.sport_type]" variant="subtle" />
        <UBadge v-if="!parcours.is_public" icon="i-lucide-lock" label="Privé" color="neutral" variant="subtle" />
        <UBadge v-if="parcours.source === 'gpx_import'" icon="i-lucide-file-up" label="Importé d'un GPX" color="neutral" variant="subtle" />
        <UBadge v-if="parcours.source === 'recorded'" icon="i-lucide-satellite" label="Enregistré au GPS" color="neutral" variant="subtle" />
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

      <p v-if="viewer.completed_at && viewer.duration_s != null && viewer.moving_s != null" class="text-sm text-muted">
        <UIcon name="i-lucide-timer" class="mr-1 align-text-bottom" />
        Ta sortie : {{ formatElapsed(viewer.duration_s) }}, dont {{ formatElapsed(viewer.moving_s) }} en mouvement
        · {{ formatSpeed(parcours.distance_m, viewer.moving_s) }}
      </p>

      <UButton
        :to="`/routes/${parcours.id}/follow`"
        icon="i-lucide-navigation"
        label="Suivre le parcours"
        block
      />

      <RouteOffline :route-id="parcours.id" :name="parcours.name" :coordinates="coordinates" />

      <RouteWeather :route-id="parcours.id" />

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
        :grades="showSlopes ? slopes?.profile.grades : null"
        @hover="hoverPoint = $event"
      />

      <div v-if="slopes" class="space-y-2">
        <p class="text-sm text-muted">
          Pente max : <span class="font-medium text-default">{{ slopes.steepest }} %</span>
          <template v-if="slopes.climb">
            · Montée principale : <span class="font-medium text-default">{{ formatDistance(slopes.climb.endM - slopes.climb.startM) }}
              à {{ Math.round(slopes.climb.averageGrade) }} %</span> (+{{ Math.round(slopes.climb.gainM) }} m)
          </template>
        </p>
        <USwitch v-model="showSlopes" label="Pentes sur la carte et le profil" />
        <ul v-if="showSlopes" class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label="Légende des pentes">
          <li v-for="slopeClass in SLOPE_CLASSES" :key="slopeClass.label" class="flex items-center gap-1">
            <span class="h-1 w-4 rounded-full" :style="{ backgroundColor: slopeClass.color }" aria-hidden="true" />{{ slopeClass.label }}
          </li>
        </ul>
      </div>

      <p v-if="parcours.description" class="whitespace-pre-line">{{ parcours.description }}</p>

      <RoutePhotos v-model:photos="photos" :route-id="parcours.id" :is-owner="isOwner" />

      <section v-if="pois.length" class="space-y-2" aria-labelledby="pois-title">
        <h2 id="pois-title" class="font-medium">Points d'intérêt</h2>
        <ul class="space-y-1">
          <li
            v-for="(poi, i) in pois"
            :key="i"
            class="flex items-start gap-3 rounded-md p-2 hover:bg-elevated"
            @mouseenter="hoverPoint = poi.coordinates"
            @mouseleave="hoverPoint = null"
          >
            <span
              class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-white"
              :style="{ backgroundColor: POI_COLORS[poi.type] }"
            >
              <UIcon :name="POI_ICONS[poi.type]" class="size-4" />
            </span>
            <div class="min-w-0 text-sm">
              <p>
                <span class="font-medium">{{ POI_LABELS[poi.type] }}</span>
                <span class="text-muted"> · km {{ (poi.distanceM / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) }}</span>
              </p>
              <p v-if="poi.note" class="break-words text-muted">{{ poi.note }}</p>
            </div>
          </li>
        </ul>
      </section>

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

      <USeparator />

      <RouteReviews :route-id="parcours.id" :is-owner="isOwner" :is-public="parcours.is_public" />
    </aside>
  </div>
</template>
