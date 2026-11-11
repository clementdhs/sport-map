<script setup lang="ts">
import type { FetchError } from 'ofetch'
import type { LoopSentenceResponse } from '#shared/types/loopSentence'
import type { LoopSentenceSettings, LoopSentenceStart } from '#shared/utils/loopSentence'
import type { LngLat } from '#shared/utils/routes'
import type { LoopSentenceSetting } from '~/stores/loopGenerator'

// A loop described in one sentence (#216), at the top of the loop panel: the LLM's reading fills the panel's
// settings (never more than the panel can do by hand), "Compris" sums up what it understood, each chip leading to
// its setting, then the loops are generated as soon as the start is known. The sentence stays to be corrected.
const props = defineProps<{
  // Where the map looks: a named start is looked for around it.
  mapCenter?: LngLat | null
}>()
const emit = defineEmits<{
  // The settings the sentence changed, marked in the panel until the next sentence.
  marked: [settings: LoopSentenceSetting[]]
}>()

const loop = useLoopGeneratorStore()
const { t, locale } = useI18n()
const { maptilerKey } = useRuntimeConfig().public
const { locate } = useCurrentPosition()

type StartState = 'placed' | 'located' | 'found' | 'locating' | 'searching' | 'missing' | 'notFound'

const phrase = ref('')
const loading = ref(false)
const settings = ref<LoopSentenceSettings | null>(null)
const failure = ref<{ notUnderstood: boolean, message: string } | null>(null)
const startState = ref<StartState | null>(null)
const startName = ref('')
// The loops wait for a start the member places by hand.
let waitingForStart = false
let request = 0

const examples = computed(() => [t('loopSentence.examples.hike'), t('loopSentence.examples.run')])

async function submit() {
  const sentence = phrase.value.trim()
  if (!sentence || loading.value) return
  const current = ++request
  loading.value = true
  failure.value = null
  settings.value = null
  startState.value = null
  waitingForStart = false
  emit('marked', [])
  try {
    const result = await $fetch<LoopSentenceResponse>('/api/loops/understand', { method: 'POST', body: { sentence } })
    if (current !== request) return
    settings.value = result.settings
    emit('marked', loop.applySentence(result.settings))
    await applyStart(result.settings.start, current)
  }
  catch (error) {
    if (current !== request) return
    const { statusCode, data } = error as FetchError
    // Offline or no answer: no message of ours to show.
    failure.value = { notUnderstood: statusCode === 422, message: data?.statusMessage ?? t('api.loopSentenceFailed') }
  }
  finally {
    if (current === request) loading.value = false
  }
}

// Enter sends, Shift+Enter goes to the line; never while a keyboard is still composing a word.
function onEnter(event: KeyboardEvent) {
  if (event.isComposing) return
  event.preventDefault()
  submit()
}

function useExample(example: string) {
  phrase.value = example
  submit()
}

// "Mon point": the start already placed, else the device's position; a named place is looked for around the map.
async function applyStart(asked: LoopSentenceStart | null, current: number) {
  if (asked?.kind === 'place') {
    startName.value = asked.name
    startState.value = 'searching'
    const point = await geocode(asked.name)
    if (current !== request) return
    if (!point) {
      startState.value = 'notFound'
      waitingForStart = true
      return
    }
    loop.setStart(point)
    startState.value = 'found'
    generate()
    return
  }
  if (loop.start) {
    startState.value = 'placed'
    generate()
    return
  }
  startState.value = 'locating'
  locate((point) => {
    if (current !== request) return
    loop.setStart(point)
    startState.value = 'located'
    generate()
  }, () => {
    if (current !== request) return
    startState.value = 'missing'
    waitingForStart = true
  })
}

// Only when the sentence asks for it (MapTiler quota): the first place found near the map.
async function geocode(name: string): Promise<LngLat | null> {
  if (!maptilerKey) return null
  const center = props.mapCenter ?? loop.start
  try {
    const { features } = await $fetch<{ features: { center: LngLat }[] }>(
      `https://api.maptiler.com/geocoding/${encodeURIComponent(name)}.json`,
      { query: { key: maptilerKey, language: locale.value, limit: 1, ...(center ? { proximity: center.join(',') } : {}) } },
    )
    return features[0]?.center ?? null
  }
  catch {
    return null
  }
}

function generate() {
  if (loop.canGenerate) loop.generate()
}

// The start placed by hand after "à placer": the loops follow.
watch(() => loop.start, (start) => {
  if (!waitingForStart || !start) return
  waitingForStart = false
  startState.value = 'placed'
  generate()
})

function startFromPosition() {
  locate(loop.setStart)
}

// The setting each chip leads to (LoopGenerator.vue's ids).
const SETTING_IDS: Record<LoopSentenceSetting | 'start', string> = {
  sport: 'loop-setting-sport',
  target: 'loop-setting-target',
  precision: 'loop-setting-target',
  shape: 'loop-setting-target',
  climb: 'loop-setting-climb',
  start: 'loop-setting-start',
}

function showSetting(setting: LoopSentenceSetting | 'start') {
  const element = document.getElementById(SETTING_IDS[setting])
  if (!element) return
  element.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  // The chosen control first (the sport chip, the climbing tab), not the first of the row.
  const chosen = element.querySelector<HTMLElement>('[aria-checked="true"], [aria-selected="true"], [aria-pressed="true"], [data-state="checked"]')
  ;(chosen ?? element.querySelector<HTMLElement>('button, input, [tabindex="0"]'))?.focus({ preventScroll: true })
}

const startLabel = computed(() => {
  switch (startState.value) {
    case 'placed': return t('loopSentence.startPlaced')
    case 'located': return t('loopSentence.startLocated')
    case 'found': return startName.value
    case 'locating':
    case 'searching': return t('loopSentence.startLooking')
    case 'missing':
    case 'notFound': return t('loopSentence.startToPlace')
    default: return null
  }
})

const chips = computed(() => {
  const understood = settings.value
  if (!understood) return []
  const list: { setting: LoopSentenceSetting | 'start', label: string, warn?: boolean }[] = []
  if (understood.sport) list.push({ setting: 'sport', label: t(`sportChips.${understood.sport}`) })
  if (understood.target) {
    list.push({
      setting: 'target',
      label: understood.target.kind === 'distance' ? `${understood.target.km} km` : formatDuration(understood.target.min),
    })
  }
  if (understood.precision) list.push({ setting: 'precision', label: t('loopSentence.approximate') })
  if (understood.shape) list.push({ setting: 'shape', label: t(understood.shape === 'out_and_back' ? 'loop.outAndBack' : 'loopSentence.loop') })
  if (understood.climb) list.push({ setting: 'climb', label: t(`loop.climbs.${understood.climb}`) })
  if (startLabel.value) {
    const warn = startState.value === 'missing' || startState.value === 'notFound'
    list.push({ setting: 'start', label: t('loopSentence.start', { start: startLabel.value }), warn })
  }
  return list
})
</script>

<template>
  <div class="space-y-2">
    <label for="loop-sentence" class="block text-[0.6875rem] font-bold tracking-wider text-muted uppercase">{{ t('loopSentence.label') }}</label>
    <div class="flex items-end gap-2 rounded-[14px] border-[1.5px] border-(--ui-border-inverted) bg-default py-2 ps-3 pe-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
      <textarea
        id="loop-sentence"
        v-model="phrase"
        rows="2"
        :maxlength="LOOP_SENTENCE_MAX_LENGTH"
        :placeholder="t('loopSentence.placeholder')"
        enterkeyhint="go"
        class="min-w-0 flex-1 resize-none bg-transparent py-0.5 text-base/snug text-highlighted outline-none placeholder:text-dimmed"
        @keydown.enter.exact="onEnter"
      />
      <UButton
        icon="i-lucide-arrow-right"
        :aria-label="t('loopSentence.submit')"
        :loading="loading"
        :disabled="!phrase.trim()"
        size="lg"
        square
        class="shrink-0"
        @click="submit()"
      />
    </div>

    <div v-if="!phrase && !loading && !settings && !failure" class="flex flex-wrap gap-1.5">
      <UButton
        v-for="example in examples"
        :key="example"
        :label="example"
        color="neutral"
        variant="outline"
        size="sm"
        class="rounded-full border border-dashed border-accented ring-0"
        @click="useExample(example)"
      />
    </div>

    <p v-if="loading" role="status" class="text-sm font-medium text-muted">{{ t('loopSentence.reading') }}</p>

    <div v-else-if="chips.length" role="status" class="flex flex-wrap items-center gap-1.5" data-testid="loop-sentence-understood">
      <span class="me-0.5 text-[0.6875rem] font-bold tracking-wider text-muted uppercase">{{ t('loopSentence.understood') }}</span>
      <button
        v-for="chip in chips"
        :key="chip.setting"
        type="button"
        class="inline-flex h-7.5 items-center rounded-full border border-(--ui-border-inverted) px-2.5 text-[0.8125rem] font-semibold text-highlighted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :class="chip.warn ? 'bg-(--sign) text-(--sign-text)' : 'bg-default hover:bg-elevated'"
        @click="showSetting(chip.setting)"
      >
        {{ chip.label }}
      </button>
    </div>

    <p v-for="part in settings?.ignored ?? []" :key="`${part.kind}-${part.text}`" class="flex items-start gap-2 text-sm text-muted">
      <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{{ t(`loopSentence.ignored.${part.kind}`, { text: part.text }) }}</span>
    </p>

    <div v-if="failure" role="alert" class="flex gap-2.5 rounded-md border border-accented bg-default px-3 py-2.5 text-sm">
      <UIcon name="i-lucide-circle-help" class="mt-0.5 size-4.5 shrink-0 text-highlighted" aria-hidden="true" />
      <p v-if="failure.notUnderstood">
        <strong class="font-semibold">{{ t('loopSentence.notUnderstood') }}</strong> {{ t('loopSentence.notUnderstoodHint') }}
      </p>
      <p v-else>
        <strong class="font-semibold">{{ failure.message }}</strong> {{ t('loopSentence.failedHint') }}
      </p>
    </div>

    <div
      v-if="(startState === 'missing' || startState === 'notFound') && !loop.start"
      class="space-y-2 rounded-md border-[1.5px] border-(--ui-border-inverted) bg-(--sign)/20 px-3 py-2.5 text-sm"
      data-testid="loop-sentence-start"
    >
      <p v-if="startState === 'notFound'">
        <strong class="font-semibold">{{ t('loopSentence.startNotFound', { name: startName }) }}</strong> {{ t('loopSentence.startNotFoundHint') }}
      </p>
      <p v-else>
        <strong class="font-semibold">{{ t('loopSentence.startMissing') }}</strong> {{ t('loopSentence.startMissingHint') }}
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton :label="t('loop.myPosition')" icon="i-lucide-locate-fixed" color="neutral" @click="startFromPosition()" />
        <UButton
          :label="t('loopSentence.placeOnMap')"
          color="neutral"
          variant="outline"
          class="ring-(--ui-border-inverted)"
          @click="loop.placingStart = true"
        />
      </div>
    </div>
  </div>
</template>
