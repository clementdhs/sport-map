<script setup lang="ts">
import type { LoopProposal } from '~/stores/loopGenerator'

// Automatic loop panel of the route editor (#50), in the topo look (#234): sport chips, shape, target, climbing and
// place to go through (#214), start on its yellow square, then the proposals drawn on the map
// (`useLoopGeneratorStore`), ranked by climbing, one of them picked to be chosen.
const editor = useRouteEditorStore()
const loop = useLoopGeneratorStore()
const { t } = useI18n()
const { formatDistance } = useFormat()

const sportChips = useSportChips()
const estimateDuration = useDurationEstimate()
const targetItems = computed(() => [
  { label: t('loop.distance'), value: 'distance' },
  { label: t('loop.duration'), value: 'duration' },
])

const climbItems = computed(() => LOOP_CLIMBS.map(value => ({ label: t(`loop.climbs.${value}`), value })))
const viaItems = computed(() => (['none', ...LOOP_VIA_TYPES] as const).map(value => ({ label: t(`loop.vias.${value}`), value })))
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
  const gain = Math.round(loop.gainPerKmM * loop.targetM / 1000)
  return loop.target === 'distance'
    ? t('loop.durationWithGain', { duration: formatDuration(estimateDuration(editor.details.sport_type, loop.targetM, gain)), gain })
    : t('loop.distanceWithGain', { distance: formatDistance(loop.targetM), gain })
})

// What came of the search for a place to go through.
const viaMessage = computed(() => {
  if (loop.via === 'none') return null
  const type = loop.via
  const radius = formatDistance(loop.viaRadiusM)
  switch (loop.viaStatus) {
    case 'searching': return t(`loop.viaSearching.${type}`, { radius })
    case 'none': return t(`loop.viaNone.${type}`, { radius })
    case 'failed': return t(`loop.viaFailed.${type}`)
    case 'found': {
      const place = loop.viaPlace!
      const name = place.name ?? t(`loop.viaUnnamed.${type}`)
      return place.ele === undefined ? t('loop.viaFound', { name }) : t('loop.viaFoundEle', { name, ele: place.ele })
    }
    default: return null
  }
})
// The slider holds the figure; it is written out above it, like the mockup's "15 km".
const target = computed(() => loop.target === 'distance'
  ? { model: 'distanceKm' as const, min: 1, max: 100, step: 1, value: String(loop.distanceKm), unit: 'km' }
  : { model: 'durationMin' as const, min: 10, max: 600, step: 5, value: formatDuration(loop.durationMin), unit: '' })
const targetValue = computed({
  get: () => loop[target.value.model],
  set: (value: number | undefined) => {
    if (value !== undefined) loop[target.value.model] = value
  },
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

    <SportChips v-model="editor.details.sport_type" :items="sportChips" :label="t('filters.sport')" />

    <div>
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
        :aria-label="loop.target === 'distance' ? t('loop.distanceKm') : t('loop.durationMin')"
        :aria-valuetext="loop.target === 'distance' ? formatDistance(loop.targetM) : formatDuration(loop.durationMin)"
        class="mt-3"
      />
      <p class="mt-2 text-sm text-muted">{{ targetHint }}</p>
      <div class="mt-3 space-y-2">
        <USwitch v-model="range" :label="t('loop.range')" :description="t('loop.rangeHint')" size="sm" />
        <USwitch v-model="outAndBack" :label="t('loop.outAndBack')" :description="t('loop.outAndBackHint')" size="sm" />
      </div>
    </div>

    <div>
      <p class="mb-1.5 text-[0.6875rem] font-bold tracking-wider text-muted uppercase">{{ t('loop.climb') }}</p>
      <UTabs v-model="loop.climb" :items="climbItems" :content="false" size="sm" :aria-label="t('loop.climb')" />
      <p class="mt-2 text-sm text-muted">{{ t('loop.climbHint') }}</p>
    </div>

    <UFormField :label="t('loop.via')" :ui="{ label: 'text-[0.6875rem] font-bold tracking-wider text-muted uppercase' }">
      <USelect v-model="loop.via" :items="viaItems" class="w-full" />
    </UFormField>

    <LoopStartRow />

    <p v-if="viaMessage" class="flex items-start gap-2 text-sm" :class="loop.viaStatus === 'found' ? 'text-highlighted' : 'text-muted'" role="status">
      <UIcon
        :name="loop.viaStatus === 'searching' ? 'i-lucide-loader-circle' : OSM_PLACE_ICONS[loop.via === 'peak' ? 'peak' : 'water']"
        class="mt-0.5 size-4 shrink-0"
        :class="{ 'animate-spin': loop.viaStatus === 'searching' }"
        aria-hidden="true"
      />
      <span>{{ viaMessage }}</span>
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
                <UBadge v-if="proposal.status === 'ready'" :label="proposalClimb(proposal)" color="neutral" variant="soft" size="sm" />
              </span>
              <span v-if="proposal.status === 'loading'" class="block text-sm text-muted">
                <UIcon name="i-lucide-loader-circle" class="mr-1 size-4 animate-spin align-text-bottom" />{{ t('editor.routing') }}
              </span>
              <span v-else-if="proposal.status === 'failed'" class="block text-sm text-muted">{{ proposal.error }}</span>
              <span v-else class="block font-numbers text-sm font-medium text-muted tabular-nums">{{ proposalFigures(proposal) }}</span>
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

