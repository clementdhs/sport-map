<script setup lang="ts">
import type { DropdownMenuItem, TabsItem } from '@nuxt/ui'
import type { FetchError } from 'ofetch'
import type { RouteDetail, RouteOuting, RoutePhoto, ViewerActivity } from '#shared/types/routes'
import type { ActivityType, LngLat, OutingTrackPoint } from '#shared/utils/routes'
import type { SheetSnap } from '~/components/MapSheetLayout.vue'

const { formatDistance, formatDate, formatShortDate, formatSpeed, formatNumber } = useFormat()

// Map page: MapSheetLayout brings its own header (md up), tab bar and floating top bar (phones).
definePageMeta({ layout: false })
const route = useRoute()
const user = useSupabaseUser()
const toast = useToast()
const { t, locale } = useI18n()

const { data: parcours, error } = await useFetch<RouteDetail>(`/api/routes/${route.params.id}`)
if (error.value || !parcours.value) {
  throw createError({
    statusCode: error.value?.statusCode ?? 404,
    statusMessage: error.value?.statusMessage ?? t('route.notFound'),
    fatal: true,
  })
}

const coordinates = computed(() => (parcours.value?.geometry.coordinates ?? []) as LngLat[])
const hoverPoint = ref<LngLat | null>(null)

// 3D flyover (#74) of the route, or of an outing from the Passages tab. On phones the sheet collapses meanwhile,
// leaving the map to the flyover and its controls, and comes back where it was afterwards.
const flyover = useFlyover()
const sheetSnap = ref<SheetSnap>('half')
let snapBeforeFlyover: SheetSnap | null = null
watch(() => !!flyover.subject, (active) => {
  if (active) {
    snapBeforeFlyover = sheetSnap.value
    sheetSnap.value = 'collapsed'
  }
  else if (snapBeforeFlyover) {
    sheetSnap.value = snapBeforeFlyover
    snapBeforeFlyover = null
  }
})
function flyOverRoute() {
  flyover.start({ kind: 'route', track: routeFlyover(coordinates.value, parcours.value?.elevation_profile) })
}
function replayOuting(id: string, track: OutingTrackPoint[]) {
  flyover.start({ kind: 'outing', id, track: outingFlyover(track) })
}
const replayed = computed(() => (flyover.subject?.kind === 'outing' && flyover.subject.id && flyover.along !== null
  ? { outingId: flyover.subject.id, along: flyover.along }
  : null))

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

// Surface and trail difficulty, for routes whose track was snapped to paths in the editor (#43).
const ways = computed(() => {
  const info = parcours.value?.way_info
  if (!info || coordinates.value.length < 2) return null
  const along = trackDistances(coordinates.value)
  const totalM = along.at(-1)!
  const surface = surfaceRuns(info, along)
  const scale = difficultyScale(parcours.value!.sport_type)
  const graded = info[`${scale}_scale`]
  const difficulty = hasDifficulty(graded) ? difficultyRuns(graded, along) : null
  return {
    surface: { shares: classShares(surface), gradient: classGradient(surface, SURFACE_CLASSES, totalM) },
    difficulty: difficulty && {
      scale,
      shares: classShares(difficulty),
      gradient: classGradient(difficulty, DIFFICULTY_CLASSES[scale], totalM),
    },
  }
})

// What colours the track on the map (and, for slopes, the elevation profile): none, slopes, surface or difficulty.
const colouring = ref('none')
const colouringItems = computed(() => [
  { label: t('route.colouring.none'), value: 'none' },
  ...(slopes.value ? [{ label: t('route.colouring.slopes'), value: 'slopes' }] : []),
  ...(ways.value ? [{ label: t('route.colouring.surface'), value: 'surface' }] : []),
  ...(ways.value?.difficulty ? [{ label: t('route.colouring.difficulty'), value: 'difficulty' }] : []),
])
// Legend of the colouring picked, beside its choice on the map: every slope class, the surface and difficulty
// classes found on this route.
const colouringLegend = computed(() => {
  const entries = (classes: readonly { key: string, color: string }[], labels: string, present?: { cls: number }[]) =>
    (present ? present.map(({ cls }) => classes[cls]!) : classes)
      .map(({ key, color }) => ({ key, color, label: t(`${labels}.${key}`) }))
  const difficulty = ways.value?.difficulty
  switch (colouring.value) {
    case 'slopes': return entries(SLOPE_CLASSES, 'slopes')
    case 'surface': return ways.value ? entries(SURFACE_CLASSES, 'ways.surface', ways.value.surface.shares) : []
    case 'difficulty': return difficulty
      ? entries(DIFFICULTY_CLASSES[difficulty.scale], `ways.${difficulty.scale}`, difficulty.shares)
      : []
    default: return []
  }
})
const trackGradient = computed(() => {
  switch (colouring.value) {
    case 'slopes': return slopes.value?.gradient ?? null
    case 'surface': return ways.value?.surface.gradient ?? null
    case 'difficulty': return ways.value?.difficulty?.gradient ?? null
    default: return null
  }
})
// Own state for what the page changes: useFetch data is a shallow ref, so changing a property of
// parcours (photos, viewer) would not re-render the page.
const photos = ref<RoutePhoto[]>(parcours.value.photos)
const outings = ref<RouteOuting[]>(parcours.value.outings)
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
  return `${t(`sports.${p.sport_type}`)} · ${formatDistance(p.distance_m)}${p.description ? ` — ${p.description}` : ''}`
})

const errorMessage = (error: unknown) => (error as FetchError).data?.statusMessage ?? (error as Error).message

const pendingActivity = ref<ActivityType | null>(null)

async function toggleActivity(type: ActivityType) {
  if (!user.value) return navigateTo({ path: '/login', query: { redirect: route.fullPath } })

  const active = type === 'saved' ? viewer.value.saved : !!viewer.value.completed_at
  pendingActivity.value = type
  try {
    await $fetch(`/api/routes/${parcours.value!.id}/activity/${type}`, { method: active ? 'DELETE' : 'PUT' })
    // "saved" is the "À faire" list, which a route leaves once done (the server takes it off too).
    viewer.value = type === 'saved'
      ? { ...viewer.value, saved: !active }
      : { ...viewer.value, saved: viewer.value.saved && active, completed_at: active ? null : new Date().toISOString(), duration_s: null, moving_s: null }
  }
  catch (error) {
    toast.add({ title: t('route.actionFailed'), description: errorMessage(error), color: 'error' })
  }
  finally {
    pendingActivity.value = null
  }
}

// Secondary actions: icon above a short label, sharing the row evenly ("Fait le 18 oct." may take two lines).
const actionUi = { base: 'flex-col justify-center gap-1 px-1 py-2 text-xs', leadingIcon: 'size-5', label: 'max-w-full text-center leading-tight' }

const collectionsOpen = ref(false)
const deleteOpen = ref(false)
const deleting = ref(false)
const offline = useTemplateRef('offline')

// Secondary actions, in the "…" menu next to the main ones.
const moreActions = computed(() => {
  const id = parcours.value!.id
  const actions: DropdownMenuItem[][] = [[
    {
      label: t('route.addToCollection'),
      icon: 'i-lucide-folder-plus',
      onSelect: () => user.value
        ? (collectionsOpen.value = true)
        : navigateTo({ path: '/login', query: { redirect: route.fullPath } }),
    },
    { label: t('route.exportGpx'), icon: 'i-lucide-download', to: `/api/routes/${id}/gpx`, external: true, download: true },
  ]]
  if (offline.value?.supported && !offline.value.available) {
    actions[0]!.push({
      label: t('route.prepareOffline'),
      description: t('route.prepareOfflineHint'),
      icon: 'i-lucide-cloud-download',
      disabled: offline.value.preparing,
      ui: { itemDescription: 'whitespace-normal' },
      onSelect: () => offline.value?.prepare(),
    })
  }
  if (isOwner.value) {
    actions.push([
      { label: t('route.edit'), icon: 'i-lucide-pencil', to: `/routes/${id}/edit` },
      { label: t('route.delete'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => (deleteOpen.value = true) },
    ])
  }
  return actions
})

const tabs = computed(() => [
  { label: t('route.tabs.overview'), value: 'overview', slot: 'overview' as const },
  ...(photos.value.length || isOwner.value
    ? [{ label: t('route.tabs.photos'), value: 'photos', slot: 'photos' as const, badge: photos.value.length || undefined }]
    : []),
  { label: t('route.tabs.reviews'), value: 'reviews', slot: 'reviews' as const, badge: parcours.value?.rating_count || undefined },
  ...(outings.value.length
    ? [{ label: t('route.tabs.outings'), value: 'outings', slot: 'outings' as const, badge: outings.value.length }]
    : []),
] satisfies TabsItem[])
// The open tab is kept in the URL (?tab=reviews), so that a reload or a shared link shows it.
const activeTab = computed({
  get: () => tabs.value.find(tab => tab.value === route.query.tab)?.value ?? 'overview',
  set: tab => navigateTo({ query: { ...route.query, tab: tab === 'overview' ? undefined : tab } }, { replace: true }),
})

async function deleteRoute() {
  deleting.value = true
  try {
    await $fetch(`/api/routes/${parcours.value!.id}`, { method: 'DELETE' })
    toast.add({ title: t('route.deleted'), color: 'success', icon: 'i-lucide-check' })
    await navigateTo('/profile')
  }
  catch (error) {
    toast.add({ title: t('route.deleteFailed'), description: errorMessage(error), color: 'error' })
    deleting.value = false
  }
}

// Link previews need an absolute image URL. Private routes have no image (the endpoint refuses them),
// ?v= makes caches fetch a new image once the route is edited, and ?lang= draws it in the page's language.
const origin = useRequestURL().origin
const ogImage = computed(() => parcours.value?.is_public
  ? `${origin}/api/routes/${parcours.value.id}/og.png?v=${Date.parse(parcours.value.updated_at)}&lang=${locale.value}`
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
  ogImageAlt: () => (ogImage.value ? t('route.ogImageAlt', { name: parcours.value?.name }) : undefined),
  twitterCard: () => (ogImage.value ? 'summary_large_image' : 'summary'),
})
</script>

<template>
  <MapSheetLayout v-if="parcours" v-model:snap="sheetSnap" back="/">
    <template #map>
      <ClientOnly>
        <MapRouteDisplay
          :coordinates="coordinates"
          :pois="parcours.pois"
          :line-gradient="trackGradient"
          :hover-point="hoverPoint"
          :flyover="flyover"
        >
          <template v-if="colouringItems.length > 1" #controls>
            <MapTrackColouring v-model="colouring" :items="colouringItems" :legend="colouringLegend" />
          </template>
        </MapRouteDisplay>
      </ClientOnly>
    </template>

    <template v-if="flyover.subject" #overlay>
      <FlyoverControls :flyover="flyover" />
    </template>

    <template #title>
      {{ parcours.name }}
    </template>

    <div class="space-y-1">
      <div class="flex flex-wrap items-center gap-2">
        <SportBadge :sport="parcours.sport_type" />
        <UBadge v-if="!parcours.is_public" icon="i-lucide-lock" :label="t('routeCard.private')" color="neutral" variant="subtle" />
        <UBadge v-if="parcours.source === 'gpx_import'" icon="i-lucide-file-up" :label="t('route.importedGpx')" color="neutral" variant="subtle" />
        <UBadge v-if="parcours.source === 'recorded'" icon="i-lucide-satellite" :label="t('route.recordedGps')" color="neutral" variant="subtle" />
      </div>

      <!-- Phones: the sheet title already shows the name; the heading stays for screen readers. -->
      <h1 class="text-2xl font-semibold max-md:sr-only">{{ parcours.name }}</h1>

      <p class="text-sm text-muted">
        {{ t('route.by') }}
        <ULink v-if="parcours.owner" :to="`/profile/${parcours.owner.username}`" class="font-medium text-default hover:underline">
          {{ parcours.owner.display_name ?? parcours.owner.username }}
        </ULink>
        <span v-if="isOwner" class="ms-1">{{ t('route.you') }}</span>
        · {{ formatDate(parcours.created_at) }}
      </p>
    </div>

    <div class="grid grid-cols-4 divide-x divide-default rounded-lg bg-elevated py-2 text-center">
      <div class="px-1">
        <p class="text-xs text-muted">{{ t('route.distance') }}</p>
        <p class="font-numbers text-lg font-semibold tabular-nums">{{ formatDistance(parcours.distance_m) }}</p>
      </div>
      <DurationEstimate
        class="px-1"
        compact
        :sport="parcours.sport_type"
        :distance-m="parcours.distance_m"
        :elevation-gain-m="parcours.elevation_gain_m"
      />
      <div class="px-1">
        <p class="text-xs text-muted">{{ t('route.gain') }}</p>
        <p class="font-numbers text-lg font-semibold tabular-nums">{{ parcours.elevation_gain_m != null ? `${Math.round(parcours.elevation_gain_m)} m` : '—' }}</p>
      </div>
      <div class="px-1">
        <p class="text-xs text-muted">{{ t('route.loss') }}</p>
        <p class="font-numbers text-lg font-semibold tabular-nums">{{ parcours.elevation_loss_m != null ? `${Math.round(parcours.elevation_loss_m)} m` : '—' }}</p>
      </div>
    </div>

    <!-- One main action (#103), then the others as a row of icons with short labels. -->
    <div class="space-y-2">
      <UButton
        :to="`/routes/${parcours.id}/follow`"
        icon="i-lucide-navigation"
        :label="t('route.follow')"
        size="lg"
        block
      />
      <div class="grid grid-cols-4 gap-1">
        <UButton
          :icon="viewer.saved ? 'i-lucide-list-todo' : 'i-lucide-list-plus'"
          :label="t('route.todo')"
          :aria-label="viewer.saved ? t('route.todoRemove') : t('route.todoAdd')"
          :color="viewer.saved ? 'primary' : 'neutral'"
          variant="ghost"
          :loading="pendingActivity === 'saved'"
          :ui="actionUi"
          @click="toggleActivity('saved')"
        />
        <UButton
          :icon="viewer.completed_at ? 'i-lucide-circle-check' : 'i-lucide-flag'"
          :label="viewer.completed_at ? t('route.completedOn', { date: formatShortDate(viewer.completed_at) }) : t('route.completeShort')"
          :aria-label="viewer.completed_at ? undefined : t('route.complete')"
          :color="viewer.completed_at ? 'primary' : 'neutral'"
          variant="ghost"
          :loading="pendingActivity === 'completed'"
          :ui="actionUi"
          @click="toggleActivity('completed')"
        />
        <UButton
          icon="i-lucide-drone"
          :label="t('flyover.start')"
          color="neutral"
          variant="ghost"
          :ui="actionUi"
          :disabled="!flyover.ready || coordinates.length < 2"
          @click="flyOverRoute"
        />
        <UDropdownMenu :items="moreActions" :content="{ align: 'end' }" :ui="{ content: 'w-72' }">
          <UButton
            icon="i-lucide-ellipsis"
            :label="t('route.moreShort')"
            :aria-label="t('route.moreActions')"
            color="neutral"
            variant="ghost"
            :ui="actionUi"
          />
        </UDropdownMenu>
      </div>
    </div>

    <p v-if="viewer.completed_at && viewer.duration_s != null && viewer.moving_s != null" class="text-sm text-muted">
      <UIcon name="i-lucide-timer" class="mr-1 align-text-bottom" />
      {{ t('route.yourOuting', { total: formatElapsed(viewer.duration_s), moving: formatElapsed(viewer.moving_s) }) }}
      · {{ formatSpeed(parcours.distance_m, viewer.moving_s) }}
    </p>

    <RouteOffline ref="offline" :route-id="parcours.id" :name="parcours.name" :coordinates="coordinates" />

    <UTabs v-model="activeTab" :items="tabs" variant="link" :unmount-on-hide="false" class="gap-4">
      <template #overview>
        <div class="space-y-4">
          <p v-if="parcours.description" class="whitespace-pre-line">{{ parcours.description }}</p>

          <!-- Before the details: it is what one checks before setting off (#103). -->
          <RouteWeather :route-id="parcours.id" />

          <ElevationProfile
            v-if="parcours.elevation_profile?.length === coordinates.length"
            :coordinates="coordinates"
            :elevations="parcours.elevation_profile"
            :grades="colouring === 'slopes' ? slopes?.profile.grades : null"
            :marker="flyover.subject?.kind === 'route' ? flyover.along : null"
            @hover="hoverPoint = $event"
          />

          <p v-if="slopes" class="text-sm text-muted">
            {{ t('route.maxGrade') }} <span class="font-medium text-default">{{ slopes.steepest }} %</span>
            <template v-if="slopes.climb">
              · {{ t('route.mainClimb') }} <span class="font-medium text-default">{{ t('route.climbValue', {
                length: formatDistance(slopes.climb.endM - slopes.climb.startM),
                grade: Math.round(slopes.climb.averageGrade),
              }) }}</span> (+{{ Math.round(slopes.climb.gainM) }} m)
            </template>
          </p>

          <div v-if="ways" class="space-y-3">
            <RouteBreakdown :title="t('ways.surfaceTitle')" :classes="SURFACE_CLASSES" :shares="ways.surface.shares" labels="ways.surface" />
            <RouteBreakdown
              v-if="ways.difficulty"
              :title="t(`ways.${ways.difficulty.scale}Title`)"
              :classes="DIFFICULTY_CLASSES[ways.difficulty.scale]"
              :shares="ways.difficulty.shares"
              :labels="`ways.${ways.difficulty.scale}`"
            />
            <p class="text-xs text-muted">{{ t('ways.source') }}</p>
          </div>

          <section v-if="pois.length" class="space-y-2" aria-labelledby="pois-title">
            <h2 id="pois-title" class="text-base font-semibold">{{ t('route.pois') }}</h2>
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
                    <span class="font-medium">{{ t(`pois.${poi.type}`) }}</span>
                    <span class="text-muted"> · km {{ formatNumber(poi.distanceM / 1000, { maximumFractionDigits: 1 }) }}</span>
                  </p>
                  <p v-if="poi.note" class="break-words text-muted">{{ poi.note }}</p>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </template>

      <template #photos>
        <RoutePhotos v-model:photos="photos" :route-id="parcours.id" :is-owner="isOwner" />
      </template>

      <template #reviews>
        <RouteReviews :route-id="parcours.id" :is-owner="isOwner" :is-public="parcours.is_public" />
      </template>

      <template #outings>
        <RouteOutings
          v-model:outings="outings"
          :route-id="parcours.id"
          :sport="parcours.sport_type"
          :distance-m="parcours.distance_m"
          :elevation-gain-m="parcours.elevation_gain_m"
          :replay="replayed"
          @hover="hoverPoint = $event"
          @replay="replayOuting"
        />
      </template>
    </UTabs>

    <RouteCollections v-model:open="collectionsOpen" :route-id="parcours.id" />

    <UModal
      v-if="isOwner"
      v-model:open="deleteOpen"
      :title="t('route.deleteTitle')"
      :description="t('route.deleteDescription')"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton :label="t('common.cancel')" color="neutral" variant="outline" @click="deleteOpen = false" />
          <UButton :label="t('common.delete')" icon="i-lucide-trash-2" color="error" :loading="deleting" @click="deleteRoute" />
        </div>
      </template>
    </UModal>
  </MapSheetLayout>
</template>
