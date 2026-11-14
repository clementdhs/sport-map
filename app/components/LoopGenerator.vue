<script setup lang="ts">
import type { LngLat } from '#shared/utils/routes'
import type { NamedPlaceKind } from '#shared/utils/loops'
import type { LoopProposal, LoopSentenceSetting } from '~/stores/loopGenerator'

// Automatic loop panel of the route editor (#50), in the topo look (#234): sport chips, shape, target, climbing and
// place to go through (#214), paths (#295), start on its yellow square, then the proposals drawn on the map
// (`useLoopGeneratorStore`), ranked by climbing (or by path), one of them picked to be chosen. A sentence at the top (#216) can
// fill the settings, which it marks in yellow.
const props = defineProps<{
  mapCenter?: LngLat | null
}>()
const editor = useRouteEditorStore()
const loop = useLoopGeneratorStore()
const { t } = useI18n()
const { formatDistance, formatNumber } = useFormat()

const sportChips = useSportChips()

// The settings the last sentence changed, marked in yellow. Drawn by shadows around the block (a 6 px tint then a
// 2 px edge), which take no room: margins or padding would move the panel, and the negative margins of #216 made a
// marked block run into the next one (#308). The panel's 16 px gaps leave room for them.
const marked = ref<LoopSentenceSetting[]>([])
const markClass = (...settings: LoopSentenceSetting[]) => settings.some(setting => marked.value.includes(setting))
  ? 'rounded-xs bg-(--sign)/25 shadow-[0_0_0_6px_color-mix(in_srgb,var(--sign)_25%,transparent),0_0_0_8px_var(--sign)]'
  : ''
const estimateDuration = useDurationEstimate()
const targetItems = computed(() => [
  { label: t('loop.distance'), value: 'distance' },
  { label: t('loop.duration'), value: 'duration' },
  { label: t('loop.gain'), value: 'gain' },
])

const climbItems = computed(() => LOOP_CLIMBS.map(value => ({ label: t(`loop.climbs.${value}`), value })))
const viaItems = computed(() => (['none', ...LOOP_VIA_TYPES, 'named'] as const).map(value => ({ label: t(`loop.vias.${value}`), value })))
// A named place (#293) by its kind.
const NAMED_ICONS: Record<NamedPlaceKind, string> = {
  massif: 'i-lucide-mountain-snow',
  river: 'i-lucide-waves',
  lake: 'i-lucide-droplets',
  peak: 'i-lucide-mountain',
  village: 'i-lucide-house',
}
const range = computed({
  get: () => loop.precision === 'range',
  set: (value: boolean) => { loop.precision = value ? 'range' : 'precise' },
})
// A switch rather than tabs: the mode bar above already has a "Boucle" tab.
const outAndBack = computed({
  get: () => loop.shape === 'out_and_back',
  set: (value: boolean) => { loop.shape = value ? 'out_and_back' : 'loop' },
})

// The other side of the target: the duration of the distance, or the distance covered in the duration, with the
// gain the chosen climbing usually brings.
const targetHint = computed(() => {
  if (!loop.targetInRange) return t('loop.outOfRange', { min: formatDistance(LOOP_MIN_M), max: formatDistance(LOOP_MAX_M) })
  if (loop.target === 'gain') {
    const gain = loop.gainTargetM
    const duration = formatDuration(estimateDuration(editor.details.sport_type, loop.targetM, gain))
    return loop.gainWithDistance
      ? t('loop.durationWithGain', { duration, gain })
      : t('loop.lengthForGain', { distance: formatDistance(loop.targetM), duration, gain })
  }
  const gain = Math.round(loop.gainPerKmM * loop.targetM / 1000)
  return loop.target === 'distance'
    ? t('loop.durationWithGain', { duration: formatDuration(estimateDuration(editor.details.sport_type, loop.targetM, gain)), gain })
    : t('loop.distanceWithGain', { distance: formatDistance(loop.targetM), gain })
})

// A line said under the settings about the places to go through: what came of their search.
interface ViaLine {
  key: string
  icon: string
  text: string
  found: boolean
}

// What came of the search for each named place (#293, several since #326): « Passage : Autrans, à 14,3 km. », a
// direction, a place set aside because the loop can't fit it, or not found.
const namedLines = computed((): ViaLine[] => {
  if (loop.viaStatus === 'searching') {
    return [{ key: 'searching', icon: 'i-lucide-loader-circle', text: t('loop.namedSearching', { name: loop.namedNames.join(', ') }), found: false }]
  }
  const plan = loop.namedPlan
  const isIn = (list: { id: string }[], id: string) => list.some(found => found.id === id)
  const several = loop.namedResults.length > 1
  const shown = new Set<string>()
  return loop.namedResults.flatMap(({ name, status, choice }, index): ViaLine[] => {
    const key = `${index}-${name}`
    if (status === 'vague') return [{ key, icon: 'i-lucide-map-pin-off', text: t('loop.namedVague', { name }), found: false }]
    // Among several places, only this one is missing.
    if (status === 'failed') return [{ key, icon: 'i-lucide-map-pin-off', text: several ? t('loop.namedFailedOne', { name }) : t('loop.namedFailed'), found: false }]
    if (status === 'none' || !choice) {
      return [{ key, icon: 'i-lucide-map-pin-off', text: t('loop.namedNone', { name, radius: `${formatNumber(NAMED_PLACE_SEARCH_M / 1000)} km` }), found: false }]
    }
    const { place } = choice
    // Two names of one place: said once.
    if (shown.has(place.id)) return []
    shown.add(place.id)
    const distance = formatDistance(place.distanceM)
    if (plan && isIn(plan.vias, place.id)) return [{ key, icon: NAMED_ICONS[place.kind], text: t('loop.namedVia', { name: place.name, distance }), found: true }]
    if (plan?.heading?.place.id === place.id) return [{ key, icon: 'i-lucide-compass', text: t('loop.namedHeading', { name: place.name, distance }), found: true }]
    // Set aside: too far for the length (a place gone through, or out of reach), or a massif beside places to go through.
    const text = place.kind === 'massif' ? t('loop.namedAsideHeading', { name: place.name }) : t('loop.namedTooFar', { name: place.name, distance })
    return [{ key, icon: 'i-lucide-map-pin-off', text, found: false }]
  })
})

// What came of the search for a place to go through.
const viaLines = computed((): ViaLine[] => {
  if (loop.via === 'none') return []
  if (loop.via === 'named') return namedLines.value
  const type = loop.via
  const radius = formatDistance(loop.viaRadiusM)
  const line = (text: string, icon = OSM_PLACE_ICONS[type]): ViaLine[] => [{ key: type, icon, text, found: loop.viaStatus === 'found' }]
  switch (loop.viaStatus) {
    case 'searching': return line(t(`loop.viaSearching.${type}`, { radius }), 'i-lucide-loader-circle')
    case 'none': return line(t(`loop.viaNone.${type}`, { radius }))
    case 'failed': return line(t(`loop.viaFailed.${type}`))
    case 'found': {
      const place = loop.viaPlace!
      const name = place.name ?? t(`loop.viaUnnamed.${type}`)
      return line(place.ele === undefined ? t('loop.viaFound', { name }) : t('loop.viaFoundEle', { name, ele: place.ele }))
    }
    default: return []
  }
})

// « Passer par » takes up to LOOP_MAX_VIAS names (#326), one field each.
function addNamedPlace() {
  if (loop.viaNames.length < LOOP_MAX_VIAS) loop.viaNames = [...loop.viaNames, '']
}
function removeNamedPlace(index: number) {
  loop.viaNames = loop.viaNames.length > 1 ? loop.viaNames.filter((_, i) => i !== index) : ['']
}
function setNamedPlace(index: number, value: string) {
  loop.viaNames = loop.viaNames.map((name, i) => (i === index ? value : name))
}

// The slider holds the figure; it is written out above it, like the mockup's "15 km". A gain (#294) has its own
// slider, bounded by the sport, and the distance's under it when it is kept too.
const DISTANCE_SLIDER = { model: 'distanceKm' as const, ...LOOP_SENTENCE_DISTANCE_KM, step: 1 }
const target = computed(() => {
  if (loop.target === 'gain') return { ...loopGainRange(editor.details.sport_type), model: 'gainM' as const, value: String(loop.gainTargetM), unit: 'm' }
  return loop.target === 'distance'
    ? { ...DISTANCE_SLIDER, value: String(loop.distanceKm), unit: 'km' }
    : { model: 'durationMin' as const, min: 10, max: 600, step: 5, value: formatDuration(loop.durationMin), unit: '' }
})
const targetValue = computed({
  get: () => loop.target === 'gain' ? loop.gainTargetM : loop[target.value.model],
  set: (value: number | undefined) => {
    if (value !== undefined) loop[target.value.model] = value
  },
})
const targetLabel = computed(() => loop.target === 'distance'
  ? { label: t('loop.distanceKm'), text: formatDistance(loop.targetM) }
  : loop.target === 'duration'
  ? { label: t('loop.durationMin'), text: formatDuration(loop.durationMin) }
  : { label: t('loop.gainM'), text: `${loop.gainTargetM} m` })
const gainDistance = computed({
  get: () => loop.distanceKm,
  set: (value: number | undefined) => {
    if (value !== undefined) loop.distanceKm = value
  },
})

// No proposal near the gain asked for (#294): the terrain around the start doesn't allow it, said rather than forced.
const gainMissedMessage = computed(() => {
  const missed = loop.gainMissed
  return missed ? t(`loop.gainMissed.${missed.direction}`, { gain: loop.gainTargetM, closest: missed.closestM }) : null
})

// On a phone, new proposals would stay below the fold of the bottom sheet.
const list = useTemplateRef('list')
watch(() => loop.proposals.length, async (count, before) => {
  if (!count || before) return
  await nextTick()
  list.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})

// The picked proposal (the store's): the one highlighted, else the first one ready.
const picked = computed(() => loop.picked)

function choose() {
  if (picked.value === null) return
  if (editor.waypoints.length && !window.confirm(t('loop.replaceConfirm'))) return
  loop.choose(picked.value)
}

function proposalFigures({ distanceM, gainM }: LoopProposal) {
  return t('loop.summary', { distance: formatDistance(distanceM), gain: Math.round(gainM ?? 0) })
}

const proposalClimb = ({ distanceM, gainM }: LoopProposal) => t(`loop.climbs.${climbOf(editor.details.sport_type, distanceM, gainM)}`)

function proposalMinutes({ distanceM, gainM }: LoopProposal) {
  return estimateDuration(editor.details.sport_type, distanceM, gainM)
}
</script>

<template>
  <!-- The editor's mode bar names the panel and leaves it; the instruction to place the start floats on the map. -->
  <section class="space-y-4" aria-labelledby="loop-title">
    <h2 id="loop-title" class="sr-only">{{ t('loop.title') }}</h2>

    <LoopSentence :map-center="props.mapCenter" @marked="marked = $event" />

    <div id="loop-setting-sport" :class="markClass('sport')">
      <SportChips v-model="editor.details.sport_type" :items="sportChips" :label="t('filters.sport')" />
    </div>

    <div id="loop-setting-target" :class="markClass('target', 'gain', 'precision', 'shape')">
      <div class="flex items-center justify-between gap-3">
        <UTabs
          v-model="loop.target"
          :items="targetItems"
          :content="false"
          variant="link"
          size="xs"
          :aria-label="t('loop.target')"
          :ui="{ list: 'border-0 gap-3', trigger: 'px-0 text-xs font-bold tracking-wide uppercase', indicator: 'h-0.5' }"
        />
        <p class="font-numbers text-2xl leading-none font-semibold text-highlighted tabular-nums" aria-hidden="true">
          {{ target.value }}<span v-if="target.unit" class="ms-1 font-sans text-sm font-medium text-muted">{{ target.unit }}</span>
        </p>
      </div>
      <USlider
        v-model="targetValue"
        :min="target.min"
        :max="target.max"
        :step="target.step"
        :aria-label="targetLabel.label"
        :aria-valuetext="targetLabel.text"
        class="mt-3"
      />
      <template v-if="loop.target === 'gain'">
        <USwitch v-model="loop.gainWithDistance" :label="t('loop.gainWithDistance')" :description="t('loop.gainWithDistanceHint')" size="sm" class="mt-3" />
        <template v-if="loop.gainWithDistance">
          <p class="mt-3 text-end font-numbers text-lg leading-none font-semibold text-highlighted tabular-nums" aria-hidden="true">
            {{ loop.distanceKm }}<span class="ms-1 font-sans text-sm font-medium text-muted">km</span>
          </p>
          <USlider
            v-model="gainDistance"
            :min="DISTANCE_SLIDER.min"
            :max="DISTANCE_SLIDER.max"
            :step="DISTANCE_SLIDER.step"
            :aria-label="t('loop.distanceKm')"
            :aria-valuetext="formatDistance(loop.targetM)"
            class="mt-2"
          />
        </template>
      </template>
      <p class="mt-2 text-sm text-muted">{{ targetHint }}</p>
      <p v-if="loop.target === 'gain'" class="mt-1 text-sm text-muted">{{ t('loop.gainHint') }}</p>
      <div class="mt-3 space-y-2">
        <USwitch v-model="range" :label="t('loop.range')" :description="t('loop.rangeHint')" size="sm" />
        <USwitch v-model="outAndBack" :label="t('loop.outAndBack')" :description="t('loop.outAndBackHint')" size="sm" />
      </div>
    </div>

    <!-- The gain in metres (#294) replaces the climbing levels. -->
    <div v-if="loop.target !== 'gain'" id="loop-setting-climb" :class="markClass('climb')">
      <p class="mb-1.5 text-[0.6875rem] font-bold tracking-wider text-muted uppercase">{{ t('loop.climb') }}</p>
      <UTabs v-model="loop.climb" :items="climbItems" :content="false" size="sm" :aria-label="t('loop.climb')" />
      <p class="mt-2 text-sm text-muted">{{ t('loop.climbHint') }}</p>
    </div>

    <!-- Road cycling keeps to its roads (#295). -->
    <div v-if="canPreferPaths(editor.details.sport_type)" id="loop-setting-paths" :class="markClass('paths')">
      <USwitch v-model="loop.preferPaths" :label="t('loop.paths')" :description="t('loop.pathsHint')" size="sm" />
    </div>

    <div id="loop-setting-via" :class="markClass('via')">
      <UFormField :label="t('loop.via')" :ui="{ label: 'text-[0.6875rem] font-bold tracking-wider text-muted uppercase' }">
        <USelect v-model="loop.via" :items="viaItems" class="w-full" />
      </UFormField>
      <template v-if="loop.via === 'named'">
        <div v-for="(name, index) in loop.viaNames" :key="index" class="mt-2 flex items-center gap-1">
          <UInput
            :model-value="name"
            :placeholder="index ? t('loop.namedMorePlaceholder') : t('loop.namedPlaceholder')"
            :aria-label="index ? t('loop.namedMoreLabel', { n: index + 1 }) : t('loop.namedLabel')"
            icon="i-lucide-search"
            maxlength="200"
            class="min-w-0 flex-1"
            @update:model-value="setNamedPlace(index, String($event))"
          />
          <UButton
            v-if="loop.viaNames.length > 1"
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            :aria-label="t('loop.namedRemove', { name: name.trim() || index + 1 })"
            @click="removeNamedPlace(index)"
          />
        </div>
        <UButton
          v-if="loop.viaNames.length < LOOP_MAX_VIAS"
          icon="i-lucide-plus"
          color="neutral"
          variant="link"
          size="sm"
          class="mt-1 px-0"
          :label="t('loop.namedAdd')"
          @click="addNamedPlace"
        />
        <p class="mt-2 text-sm text-muted">{{ t('loop.namedHint') }}</p>
      </template>
    </div>

    <LoopStartRow id="loop-setting-start" />

    <p v-for="line in viaLines" :key="line.key" class="flex items-start gap-2 text-sm" :class="line.found ? 'text-highlighted' : 'text-muted'" role="status">
      <UIcon
        :name="line.icon"
        class="mt-0.5 size-4 shrink-0"
        :class="{ 'animate-spin': loop.viaStatus === 'searching' }"
        aria-hidden="true"
      />
      <span>{{ line.text }}</span>
    </p>

    <p v-if="gainMissedMessage" class="flex items-start gap-2 text-sm text-highlighted" role="status" data-testid="loop-gain-missed">
      <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{{ gainMissedMessage }}</span>
    </p>
    <p v-if="loop.pathsActive && !loop.generating && fewPaths(loop.proposals)" class="flex items-start gap-2 text-sm text-muted" role="status">
      <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{{ t('loop.fewPaths') }}</span>
    </p>

    <template v-if="!loop.proposals.length">
      <UButton
        icon="i-lucide-wand-sparkles"
        :label="t('loop.generate')"
        size="lg"
        block
        :loading="loop.generating"
        :disabled="!loop.canGenerate"
        @click="loop.generate()"
      />
    </template>

    <template v-else>
      <div class="flex items-center gap-2.5">
        <h3 id="loop-proposals" class="text-[0.6875rem] font-bold tracking-wider whitespace-nowrap text-muted uppercase">
          {{ t(outAndBack ? 'loop.outAndBackProposals' : 'loop.proposals') }}
        </h3>
        <span class="h-px flex-1 bg-accented" aria-hidden="true" />
      </div>
      <ul ref="list" class="space-y-2" aria-labelledby="loop-proposals" aria-live="polite">
        <li v-for="(proposal, i) in loop.proposals" :key="proposal.seed">
          <!-- A stroke of the proposal's colour on the map; its name says which one it is without the colour. -->
          <button
            type="button"
            :aria-pressed="picked === i"
            :disabled="proposal.status !== 'ready'"
            class="flex w-full items-center gap-3 rounded-[14px] border bg-default px-3 py-2.5 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary enabled:hover:bg-elevated"
            :class="picked === i ? 'border-primary ring-1 ring-primary' : 'border-default'"
            @click="loop.highlighted = i"
          >
            <span
              class="h-1.25 w-5.5 shrink-0 rounded-full bg-(--loop-light) dark:bg-(--loop-dark)"
              :style="{ '--loop-light': LOOP_COLORS[i % LOOP_COLORS.length]!.light, '--loop-dark': LOOP_COLORS[i % LOOP_COLORS.length]!.dark }"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-2 font-semibold text-highlighted">
                {{ t(outAndBack ? 'loop.outAndBackProposal' : 'loop.proposal', { n: i + 1 }) }}
                <UBadge v-if="proposal.status === 'ready' && loop.target !== 'gain'" :label="proposalClimb(proposal)" color="neutral" variant="soft" size="sm" />
              </span>
              <span v-if="proposal.status === 'loading'" class="block text-sm text-muted">
                <UIcon name="i-lucide-loader-circle" class="mr-1 size-4 animate-spin align-text-bottom" />{{ t('editor.routing') }}
              </span>
              <span v-else-if="proposal.status === 'failed'" class="block text-sm text-muted">{{ proposal.error }}</span>
              <span v-else class="block font-numbers text-sm font-medium text-muted tabular-nums">
                {{ proposalFigures(proposal) }}<template v-if="loop.pathsActive && proposal.pathShare !== null"> · {{ t('loop.pathShare', { share: Math.round(proposal.pathShare * 100) }) }}</template>
              </span>
            </span>
            <DurationSign v-if="proposal.status === 'ready'" :minutes="proposalMinutes(proposal)" size="sm" />
          </button>
        </li>
      </ul>
      <div class="grid grid-cols-2 gap-2">
        <UButton
          :label="t('loop.regenerate')"
          color="neutral"
          variant="outline"
          size="lg"
          block
          class="ring-[1.5px] ring-(--ui-border-inverted)"
          :loading="loop.generating"
          :disabled="!loop.canGenerate"
          @click="loop.generate()"
        />
        <UButton
          :label="t(outAndBack ? 'loop.chooseOutAndBack' : 'loop.choose')"
          size="lg"
          block
          :disabled="picked === null"
          @click="choose()"
        />
      </div>
    </template>
    <!-- Asking again costs as much: said under the button in both cases. -->
    <p class="-mt-2 text-xs text-muted">{{ t('loop.quotaHint', { attempts: LOOP_ATTEMPTS }) }}</p>
  </section>
</template>

