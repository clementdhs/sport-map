<script setup lang="ts">
import type { LngLat } from '#shared/utils/routes'
import type { MapFocus, MapViewState } from '~/stores/routeSearch'

const { formatDistance } = useFormat()

// Map + side panel of the route editor, shared by the create and edit pages.
defineProps<{
  submitLabel: string
  // Fallback of the top bar's back button.
  back: string
}>()

const editor = useRouteEditorStore()
const loop = useLoopGeneratorStore()
// The store outlives the page: leaving the editor closes the loop proposals.
onBeforeUnmount(() => loop.hide())
const hasLockedTrack = computed(() => editor.segments.some(segment => segment.mode === 'locked'))
const hoverPoint = ref<LngLat | null>(null)
// Where the editor's map is looking: the marked routes page opens there.
const mapView = ref<Omit<MapViewState, 'bounds'> | null>(null)
const discover = useOsmDiscoverStore()

function openDiscover() {
  if (mapView.value) discover.startFrom(mapView.value)
  navigateTo('/discover')
}
const focus = ref<MapFocus | null>(null)
const toast = useToast()
const { t } = useI18n()
const routeDetailsSchemaLocalized = useLocalizedSchema(routeDetailsSchema)
const errorMessage = useErrorMessage()
const saving = ref(false)

const sportItems = computed(() => SPORT_TYPES.map(value => ({ value, label: t(`sports.${value}`), icon: SPORT_ICONS[value] })))
const poiItems = computed(() => POI_TYPES.map(value => ({ value, label: t(`pois.${value}`), icon: POI_ICONS[value] })))

const gpxInput = useTemplateRef('gpxInput')
const importing = ref(false)

function onGpxSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-selecting the same file
  if (file) importGpx(file)
}

// Dropping a file on the map imports it like the button. dragenter / dragleave fire for every child
// crossed, hence the counter.
const dragDepth = ref(0)
const draggingFile = computed(() => dragDepth.value > 0)
const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false

function onDragEnter(event: DragEvent) {
  if (carriesFiles(event)) dragDepth.value++
}

function onDragLeave(event: DragEvent) {
  if (carriesFiles(event)) dragDepth.value = Math.max(0, dragDepth.value - 1)
}

function onDrop(event: DragEvent) {
  dragDepth.value = 0
  const files = [...event.dataTransfer?.files ?? []]
  if (!files.length) return
  if (files.length > 1) {
    toast.add({ title: t('editor.importFailed'), description: t('errors.gpxOneFile'), color: 'error' })
    return
  }
  if (!files[0]!.name.toLowerCase().endsWith('.gpx')) {
    toast.add({ title: t('editor.importFailed'), description: t('errors.gpxNotGpx'), color: 'error' })
    return
  }
  importGpx(files[0]!)
}

async function importGpx(file: File) {
  if (editor.waypoints.length && !window.confirm(t('editor.replaceWithGpx'))) return

  importing.value = true
  try {
    const track = await readGpxFile(file)
    editor.importTrack(track)
    toast.add({
      title: t('editor.imported'),
      description: track.elevations
        ? t('editor.importedPoints', { count: track.coordinates.length })
        : t('editor.importedNoElevation', { count: track.coordinates.length }),
      color: 'success',
      icon: 'i-lucide-file-check',
    })
  }
  catch (error) {
    toast.add({ title: t('editor.importFailed'), description: errorMessage(error), color: 'error' })
  }
  finally {
    importing.value = false
  }
}

async function onSubmit() {
  saving.value = true
  try {
    const id = await editor.save()
    toast.add({ title: t('editor.saved'), color: 'success', icon: 'i-lucide-check' })
    // Replacing the editor: going back from the saved route leads where the editor was opened from.
    await navigateTo(`/routes/${id}`, { replace: true })
  }
  catch (error) {
    toast.add({
      title: t('editor.saveFailed'),
      description: errorMessage(error),
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <MapSheetLayout :back="back" fullscreen>
    <template #map>
      <div
        class="relative size-full"
        data-gpx-dropzone
        @dragenter.prevent="onDragEnter"
        @dragover.prevent
        @dragleave="onDragLeave"
        @drop.prevent="onDrop"
      >
        <ClientOnly>
          <MapRouteEditor :hover-point="hoverPoint" :focus="focus" @view-change="mapView = $event" />
        </ClientOnly>
        <div
          v-if="draggingFile"
          class="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[1px]"
        >
          <p class="flex items-center gap-2 rounded-md bg-default px-4 py-2 font-medium shadow">
            <UIcon name="i-lucide-file-up" class="size-5 text-primary" />{{ t('editor.dropGpx') }}
          </p>
        </div>
      </div>
    </template>

    <template #search>
      <SearchBox places-only @place="focus = $event" />
    </template>

    <template #title>
      {{ loop.open ? t('loop.title') : formatDistance(editor.distanceM) }}
    </template>

    <LoopGenerator v-if="loop.open" />

    <template v-else>
      <div class="flex items-center justify-between gap-4">
        <USwitch
          v-model="editor.snapToPaths"
          :label="t('editor.snap')"
          :description="editor.snapToPaths
            ? t('editor.snapOn', { sport: t(`sports.${editor.details.sport_type}`) })
            : t('editor.snapOff')"
        />
        <div class="flex gap-2">
          <!-- Without a track, the panel shows the same action as a full-width button. -->
          <UTooltip v-if="editor.waypoints.length >= 2" :text="t('loop.open')">
            <UButton
              icon="i-lucide-wand-sparkles"
              color="neutral"
              variant="outline"
              :aria-label="t('loop.open')"
              @click="loop.show()"
            />
          </UTooltip>
          <UTooltip :text="t('editor.importGpx')">
            <UButton
              icon="i-lucide-upload"
              color="neutral"
              variant="outline"
              :aria-label="t('editor.importGpx')"
              :loading="importing"
              @click="gpxInput?.click()"
            />
          </UTooltip>
          <input ref="gpxInput" type="file" accept=".gpx,application/gpx+xml" class="hidden" @change="onGpxSelected">
          <UTooltip :text="t('editor.undo')">
            <UButton
              icon="i-lucide-undo-2"
              color="neutral"
              variant="outline"
              :aria-label="t('editor.undo')"
              :disabled="!editor.canUndo"
              @click="editor.undo()"
            />
          </UTooltip>
          <UTooltip :text="t('editor.clear')">
            <UButton
              icon="i-lucide-trash-2"
              color="neutral"
              variant="outline"
              :aria-label="t('editor.clear')"
              :disabled="!editor.waypoints.length"
              @click="editor.clearPoints()"
            />
          </UTooltip>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="col-span-3">
          <p class="flex items-center gap-2 text-sm text-muted">
            {{ t('route.distance') }}
            <UIcon v-if="editor.isRouting" name="i-lucide-loader-circle" class="size-4 animate-spin" :aria-label="t('editor.routing')" />
          </p>
          <p class="text-3xl font-semibold">{{ formatDistance(editor.distanceM) }}</p>
        </div>
        <div>
          <p class="text-sm text-muted">{{ t('route.gain') }}</p>
          <p class="text-lg font-semibold">{{ editor.elevation ? `${Math.round(editor.elevation.gain)} m` : '—' }}</p>
        </div>
        <div>
          <p class="text-sm text-muted">{{ t('route.loss') }}</p>
          <p class="text-lg font-semibold">{{ editor.elevation ? `${Math.round(editor.elevation.loss)} m` : '—' }}</p>
        </div>
        <DurationEstimate
          v-if="editor.distanceM > 0"
          :sport="editor.details.sport_type"
          :distance-m="editor.distanceM"
          :elevation-gain-m="editor.elevation?.gain ?? null"
        />
      </div>

      <ElevationProfile
        v-if="editor.track.elevations && editor.track.coordinates.length >= 2"
        :coordinates="editor.track.coordinates"
        :elevations="editor.track.elevations"
        @hover="hoverPoint = $event"
      />

      <template v-if="editor.waypoints.length < 2">
        <p class="text-sm text-muted">
          <UIcon name="i-lucide-mouse-pointer-click" class="mr-1 align-text-bottom" />
          {{ t('editor.start') }}
        </p>
        <UButton
          icon="i-lucide-wand-sparkles"
          :label="t('loop.open')"
          color="neutral"
          variant="outline"
          block
          @click="loop.show()"
        />
        <UButton
          icon="i-lucide-signpost"
          :label="t('editor.fromOsm')"
          color="neutral"
          variant="outline"
          block
          @click="openDiscover()"
        />
      </template>
      <UAlert
        v-if="editor.routingQuotaReached"
        color="warning"
        variant="subtle"
        icon="i-lucide-gauge"
        :title="t('editor.quotaReached')"
        :description="t('editor.quotaReachedHint')"
      />
      <p
        v-else-if="editor.routingQuotaRemaining !== null && editor.routingQuotaRemaining <= ROUTING_QUOTA_WARNING"
        class="text-sm text-warning"
      >
        <UIcon name="i-lucide-gauge" class="mr-1 align-text-bottom" />
        {{ t('editor.quotaLeft', editor.routingQuotaRemaining) }}
      </p>
      <UAlert
        v-if="hasLockedTrack"
        color="neutral"
        variant="subtle"
        icon="i-lucide-lock"
        :title="t('editor.locked')"
        :description="t('editor.lockedHint')"
      />
      <div v-if="editor.waypoints.length >= 2" class="grid grid-cols-2 gap-2">
        <UButton
          icon="i-lucide-rotate-ccw"
          :label="t('editor.returnToStart')"
          color="neutral"
          variant="outline"
          block
          :disabled="!editor.canFinish"
          @click="editor.returnToStart()"
        />
        <UButton
          icon="i-lucide-arrow-left-right"
          :label="t('editor.outAndBack')"
          color="neutral"
          variant="outline"
          block
          :disabled="!editor.canFinish"
          @click="editor.outAndBack()"
        />
      </div>
      <p v-if="editor.isLoop" class="-mt-3 text-sm text-muted">
        <UIcon name="i-lucide-circle-check" class="mr-1 align-text-bottom" />{{ t('editor.isLoop') }}
      </p>
      <ul v-if="editor.waypoints.length >= 2" class="space-y-1 text-sm text-muted">
        <li><UIcon name="i-lucide-move" class="mr-1 align-text-bottom" />{{ t('editor.hintMove') }}</li>
        <li><UIcon name="i-lucide-git-commit-horizontal" class="mr-1 align-text-bottom" />{{ t('editor.hintInsert') }}</li>
        <li><UIcon name="i-lucide-x" class="mr-1 align-text-bottom" />{{ t('editor.hintDelete') }}</li>
      </ul>

      <section v-if="editor.track.coordinates.length >= 2" class="space-y-3" aria-labelledby="pois-title">
        <div class="flex items-center justify-between gap-2">
          <h2 id="pois-title" class="font-medium">{{ t('route.pois') }}</h2>
          <UButton
            v-if="!editor.placingPoi"
            icon="i-lucide-map-pin-plus"
            :label="t('editor.addPoi')"
            size="sm"
            color="neutral"
            variant="outline"
            :disabled="editor.pois.length >= MAX_POIS"
            @click="editor.placingPoi = true"
          />
          <UButton v-else :label="t('common.cancel')" size="sm" color="neutral" variant="ghost" @click="editor.placingPoi = false" />
        </div>
        <p v-if="editor.placingPoi" class="text-sm text-primary">
          <UIcon name="i-lucide-mouse-pointer-click" class="mr-1 align-text-bottom" />{{ t('editor.placePoi') }}
        </p>
        <p v-else-if="!editor.pois.length" class="text-sm text-muted">
          {{ t('editor.poisHint') }}
        </p>
        <ul v-if="editor.pois.length" class="space-y-3">
          <li
            v-for="(poi, i) in editor.pois"
            :key="i"
            class="grid grid-cols-[1fr_auto] gap-2"
            @mouseenter="hoverPoint = poi.coordinates"
            @mouseleave="hoverPoint = null"
          >
            <USelect
              v-model="poi.type"
              :items="poiItems"
              :icon="POI_ICONS[poi.type]"
              :aria-label="t('editor.poiType', { n: i + 1 })"
              class="w-full"
            />
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              :aria-label="t('editor.poiDelete', { n: i + 1 })"
              @click="editor.removePoi(i)"
            />
            <UInput
              v-model="poi.note"
              :placeholder="t('editor.poiNote')"
              :maxlength="MAX_POI_NOTE_LENGTH"
              :aria-label="t('editor.poiNoteLabel', { n: i + 1 })"
              class="col-span-2 w-full"
            />
          </li>
        </ul>
      </section>

      <USeparator />

      <UForm :schema="routeDetailsSchemaLocalized" :state="editor.details" class="space-y-4" @submit="onSubmit">
        <UFormField :label="t('collections.name')" name="name" required>
          <UInput v-model="editor.details.name" :placeholder="t('editor.namePlaceholder')" class="w-full" />
        </UFormField>

        <UFormField :label="t('filters.sport')" name="sport_type">
          <USelect v-model="editor.details.sport_type" :items="sportItems" class="w-full" />
        </UFormField>

        <UFormField :label="t('collections.description')" name="description">
          <UTextarea v-model="editor.details.description" :rows="3" autoresize class="w-full" />
        </UFormField>

        <UFormField name="is_public">
          <USwitch
            v-model="editor.details.is_public"
            :label="t('editor.public')"
            :description="t('editor.publicHint')"
          />
        </UFormField>

        <UButton
          type="submit"
          :label="submitLabel"
          icon="i-lucide-save"
          block
          :loading="saving"
          :disabled="!editor.canSave"
        />
      </UForm>
    </template>
  </MapSheetLayout>
</template>
