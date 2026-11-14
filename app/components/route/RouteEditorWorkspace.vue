<script setup lang="ts">
import type { LngLat } from '#shared/utils/routes'
import type { MapFocus, MapViewState } from '~/stores/routeSearch'
import type { CreateMode } from '~/utils/createMode'
import type { SheetSnap } from '~/components/map/MapSheetLayout.vue'
import type { KeyFigure } from '~/utils/keyFigures'

const { formatDistance } = useFormat()

// Map + side panel of the route editor, shared by the create and edit pages.
const props = defineProps<{
  submitLabel: string
  // Fallback of the top bar's back button.
  back: string
  // Create page: opens in the mode of the link (`?mode=loop`) or the last one picked, and keeps it in the URL.
  rememberMode?: boolean
}>()

const editor = useRouteEditorStore()
const loop = useLoopGeneratorStore()
// The store outlives the page: leaving the editor closes the loop proposals.
onBeforeUnmount(() => loop.leave())

// One panel, two modes (#215): an automatic loop, or a track drawn point by point. They share the start. The
// create page has a third, the route of the coach's session of the day (#266).
const route = useRoute()
const router = useRouter()
const mode = computed<CreateMode>(() => loop.open ? (loop.forSession ? 'session' : 'loop') : 'manual')
const modeItems = computed(() => [
  { label: t('editor.modes.loop'), value: 'loop' },
  { label: t('editor.modes.manual'), value: 'manual' },
  ...(props.rememberMode ? [{ label: t('editor.modes.session'), value: 'session' }] : []),
])

function openMode(next: CreateMode) {
  if (next === 'loop') loop.show()
  else if (next === 'session') loop.showSession()
  else loop.switchToManual()
}

function setMode(value: string | number) {
  const next = parseCreateMode(value)
  if (!next || next === mode.value) return
  openMode(next)
  if (props.rememberMode) saveCreateMode(next)
}

const askedMode = props.rememberMode ? parseCreateMode(route.query.mode) : null
if (askedMode === 'loop' || askedMode === 'session') openMode(askedMode)
// The remembered mode is only on the device, and never hides a draft (a track imported from the marked routes).
onMounted(() => {
  if (props.rememberMode && !askedMode && !editor.waypoints.length && loadCreateMode() === 'loop') loop.show()
})
watch(mode, (value) => {
  // Never while leaving: the router already points at the next page.
  if (!props.rememberMode || router.currentRoute.value.path !== route.path || route.query.mode === value) return
  router.replace({ query: { ...route.query, mode: value } })
})

// The next click on the map places the start: said once, over the map, which a full sheet would hide on a phone.
const placingStart = computed(() => loop.open ? loop.placingStart : !editor.waypoints.length)
// A loop's start already placed is moved, and the move can be cancelled.
const movingStart = computed(() => loop.open && !!loop.start)
const snap = ref<SheetSnap>('half')
watch(placingStart, (placing) => {
  if (placing && snap.value === 'full') snap.value = 'half'
})
const { locating, locate } = useCurrentPosition()

// The position may be off screen, like a loop's start (RouteEditor.vue).
function startHere(point: LngLat) {
  if (editor.waypoints.length) return
  editor.addWaypoint(point)
  focus.value = { center: point }
}
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

// A new route starts with the member's default sport (#148), still theirs to change.
const defaultSport = usePreference('defaultSport')
watch(defaultSport, sport => editor.preselectSport(sport), { immediate: true })

const sportLabel = computed(() => t(`sports.${editor.details.sport_type}`))
const sportChips = useSportChips()

// D+, D− and the duration in the route page's cartouche (#233, #234), the duration on the yellow.
const estimateDuration = useDurationEstimate()
const durationMethod = useDurationMethod(() => editor.details.sport_type, () => editor.elevation?.gain ?? null)
const figures = computed<KeyFigure[]>(() => {
  const metres = (value: number | undefined) => value === undefined ? '—' : String(Math.round(value))
  const unit = editor.elevation ? 'm' : undefined
  return [
    { label: t('route.gain'), value: metres(editor.elevation?.gain), unit },
    { label: t('route.loss'), value: metres(editor.elevation?.loss), unit },
    {
      label: t('duration.estimated'),
      value: editor.distanceM > 0 ? formatDuration(estimateDuration(editor.details.sport_type, editor.distanceM, editor.elevation?.gain ?? null)) : '—',
      highlight: editor.distanceM > 0,
      hint: durationMethod.value,
    },
  ]
})
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
    // The imported track is edited by hand.
    loop.hide()
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
  <MapSheetLayout v-model:snap="snap" :back="back" fullscreen>
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

    <!-- The live region stays in the page, so screen readers announce the instruction when it appears. -->
    <template #overlay>
      <div role="status">
        <!-- On the ink (#234): it reads on any part of the map, light or dark. -->
        <div v-if="placingStart" class="flex items-center gap-2 rounded-md bg-inverted py-1.5 ps-3.5 pe-1.5 text-sm font-medium text-inverted shadow-lg">
          <UIcon name="i-lucide-mouse-pointer-click" class="size-4 shrink-0" />
          <span :class="{ 'py-1 pe-2': !movingStart }">{{ movingStart ? t('loop.moveStart') : t('loop.placeStart') }}</span>
          <UButton
            v-if="movingStart"
            :label="t('common.cancel')"
            size="sm"
            color="neutral"
            variant="outline"
            class="bg-transparent text-inverted ring-current/40 hover:bg-transparent hover:ring-current active:bg-transparent"
            @click="loop.placingStart = false"
          />
        </div>
      </div>
    </template>

    <template #title>
      {{ mode === 'session' ? t('sessionRoute.title') : loop.open ? t('loop.title') : editor.waypoints.length >= 2 ? formatDistance(editor.distanceM) : editor.details.name.trim() || t('editor.newRoute') }}
    </template>

    <!-- A segmented control on the paper, the current mode on the surface (#234). -->
    <UTabs
      :model-value="mode"
      :items="modeItems"
      :content="false"
      color="neutral"
      class="w-full"
      :ui="{
        list: 'rounded-md bg-elevated p-1',
        indicator: 'rounded-[9px] bg-default shadow-sm',
        trigger: 'h-9 text-[0.9375rem] text-muted data-[state=active]:font-semibold data-[state=active]:text-highlighted',
      }"
      @update:model-value="setMode"
    />

    <SessionRoute v-if="mode === 'session'" />
    <LoopGenerator v-else-if="loop.open" :map-center="mapView?.center" />

    <template v-else>
      <!-- The sport comes first: it decides how the segments are routed. -->
      <SportChips v-model="editor.details.sport_type" :items="sportChips" :label="t('filters.sport')" />
      <div class="flex items-start gap-3">
        <USwitch
          v-model="editor.snapToPaths"
          :label="t('editor.snap')"
          :description="editor.snapToPaths ? t('editor.snapOn', { sport: sportLabel }) : t('editor.snapOff')"
          class="min-w-0 flex-1"
        />
        <div class="flex shrink-0 gap-2">
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
          <!-- Opened on click, not hover: phones have no hover, and the long press hint matters most there. -->
          <UPopover :content="{ align: 'end' }">
            <UTooltip :text="t('editor.help')">
              <UButton
                icon="i-lucide-circle-help"
                color="neutral"
                variant="outline"
                :aria-label="t('editor.help')"
              />
            </UTooltip>
            <template #content>
              <div class="max-w-72 space-y-2 p-3 text-sm">
                <p class="font-semibold">{{ t('editor.help') }}</p>
                <ul class="space-y-1 text-muted">
                  <li><UIcon name="i-lucide-move" class="mr-1 align-text-bottom" />{{ t('editor.hintMove') }}</li>
                  <li><UIcon name="i-lucide-git-commit-horizontal" class="mr-1 align-text-bottom" />{{ t('editor.hintInsert') }}</li>
                  <li><UIcon name="i-lucide-x" class="mr-1 align-text-bottom" />{{ t('editor.hintDelete') }}</li>
                </ul>
              </div>
            </template>
          </UPopover>
        </div>
      </div>
      <UAlert
        v-if="editor.outdatedSegmentCount"
        color="info"
        variant="subtle"
        icon="i-lucide-route"
        :title="t('editor.outdated', editor.outdatedSegmentCount)"
        :description="t('editor.outdatedHint', { sport: sportLabel })"
        :actions="[{
          label: t('editor.reroute', { sport: sportLabel }),
          icon: 'i-lucide-refresh-cw',
          color: 'info',
          variant: 'solid',
          disabled: editor.isRouting || editor.routingQuotaReached,
          onClick: () => editor.rerouteForSport(),
        }]"
        orientation="vertical"
      />

      <div class="space-y-2">
        <div>
          <p class="flex items-center gap-2 text-[0.6875rem] font-bold tracking-wider text-muted uppercase">
            {{ t('route.distance') }}
            <UIcon v-if="editor.isRouting" name="i-lucide-loader-circle" class="size-4 animate-spin" :aria-label="t('editor.routing')" />
          </p>
          <p class="font-numbers text-3xl font-semibold text-highlighted tabular-nums">{{ formatDistance(editor.distanceM) }}</p>
        </div>
        <KeyFigures :figures="figures" />
      </div>

      <ElevationProfile
        v-if="editor.track.elevations && editor.track.coordinates.length >= 2"
        :coordinates="editor.track.coordinates"
        :elevations="editor.track.elevations"
        @hover="hoverPoint = $event"
      />

      <template v-if="editor.waypoints.length < 2">
        <p v-if="editor.waypoints.length" class="text-sm text-muted">
          <UIcon name="i-lucide-mouse-pointer-click" class="mr-1 align-text-bottom" />
          {{ t('editor.next') }}
        </p>
        <UButton
          v-else
          icon="i-lucide-locate-fixed"
          :label="t('editor.startHere')"
          color="neutral"
          variant="outline"
          block
          class="ring-[1.5px] ring-(--ui-border-inverted)"
          :loading="locating"
          @click="locate(startHere)"
        />
        <UButton
          icon="i-lucide-signpost"
          :label="t('editor.fromOsm')"
          color="neutral"
          variant="outline"
          block
          class="ring-[1.5px] ring-(--ui-border-inverted)"
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
          class="ring-[1.5px] ring-(--ui-border-inverted) disabled:ring-accented"
          :disabled="!editor.canFinish"
          @click="editor.returnToStart()"
        />
        <UButton
          icon="i-lucide-arrow-left-right"
          :label="t('editor.outAndBack')"
          color="neutral"
          variant="outline"
          block
          class="ring-[1.5px] ring-(--ui-border-inverted) disabled:ring-accented"
          :disabled="!editor.canFinish"
          @click="editor.outAndBack()"
        />
      </div>
      <p v-if="editor.isLoop" class="-mt-3 text-sm text-muted">
        <UIcon name="i-lucide-circle-check" class="mr-1 align-text-bottom" />{{ t('editor.isLoop') }}
      </p>
      <section v-if="editor.track.coordinates.length >= 2" class="space-y-3" aria-labelledby="pois-title">
        <div class="flex items-center justify-between gap-2">
          <h2 id="pois-title" class="text-[0.6875rem] font-bold tracking-wider text-muted uppercase">{{ t('route.pois') }}</h2>
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

    <!-- Whatever the mode, a track can come from a file. -->
    <USeparator />
    <p class="flex flex-wrap items-center justify-center gap-x-2 text-sm text-muted">
      {{ t('editor.haveTrack') }}
      <UButton
        icon="i-lucide-upload"
        :label="t('editor.importGpx')"
        size="sm"
        color="neutral"
        variant="outline"
        :loading="importing"
        @click="gpxInput?.click()"
      />
    </p>
    <input ref="gpxInput" type="file" accept=".gpx,application/gpx+xml" class="hidden" @change="onGpxSelected">
  </MapSheetLayout>
</template>
