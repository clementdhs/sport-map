<script setup lang="ts">
import type { LiveDataPrefs, LiveField, LiveMode, MeasuredStats } from '~/utils/liveStats'

// The "data" screen of follow mode and outing recording: the chosen values in the chosen order, as big as the
// screen allows, to be read at arm's length while running or riding. The choice is kept in the member's account.
const props = defineProps<{
  mode: LiveMode
  stats: MeasuredStats
  // Pace (min/km) rather than speed (km/h) until the walker picks one
  defaultPace: boolean
}>()
// "Tour" pressed: the page starts a new lap.
const emit = defineEmits<{ lap: [] }>()

const { t } = useI18n()
const { locale } = useFormat()
const toast = useToast()
const battery = useBattery()

const prefs = usePreference('liveData')
function savePrefs(next: LiveDataPrefs) {
  prefs.value = next
}

// The battery is only offered where the browser tells it; a choice made on another phone is kept, not shown.
const available = computed(() => MODE_FIELDS[props.mode].filter(field => field !== 'battery' || battery.supported.value))
const fields = computed(() => prefs.value[props.mode] ?? DEFAULT_FIELDS[props.mode])
const shown = computed(() => fields.value.filter(field => available.value.includes(field)))
const pace = computed(() => prefs.value.pace ?? props.defaultPace)

function label(field: LiveField) {
  return t(`liveData.fields.${field}`, { unit: pace.value ? t('liveData.pace') : t('liveData.speed') })
}

const tiles = computed(() => {
  const stats = { ...props.stats, batteryLevel: battery.level.value }
  return shown.value.map(field => ({ field, label: label(field), ...liveValue(field, stats, pace.value, locale()) }))
})

// Laps: the button only shows with a lap value on screen, so that it isn't pressed by mistake.
const lapShown = computed(() => shown.value.includes('lapTime') || shown.value.includes('lapDistance'))
// The new lap's number once the page has counted it (its props are updated on the next tick).
async function startLap() {
  emit('lap')
  navigator.vibrate?.(100)
  await nextTick()
  const lap = props.stats.lapNumber
  if (lap) toast.add({ title: t('liveData.lapStarted', { lap }), icon: 'i-lucide-flag', duration: 2000 })
}

// Settings: the chosen values first, in their order, then the others.
const settingsOpen = ref(false)
const rows = computed(() => [
  ...shown.value.map((field, index) => ({ field, label: label(field), index })),
  ...available.value.filter(field => !shown.value.includes(field)).map(field => ({ field, label: label(field), index: -1 })),
])
function setField(field: LiveField, on: boolean) {
  savePrefs({ ...prefs.value, [props.mode]: toggleField(fields.value, field, on) })
}
function move(index: number, step: -1 | 1) {
  // Moved among the values shown; one hidden here (the battery) keeps its place at the end.
  const hidden = fields.value.filter(field => !shown.value.includes(field))
  savePrefs({ ...prefs.value, [props.mode]: [...moveField(shown.value, index, step), ...hidden] })
}

const unitItems = computed(() => [
  { value: 'speed', label: t('liveData.speedUnit') },
  { value: 'pace', label: t('liveData.paceUnit') },
])
const chosenUnit = computed({
  get: () => (pace.value ? 'pace' : 'speed'),
  set: (value: string) => savePrefs({ ...prefs.value, pace: value === 'pace' }),
})
</script>

<template>
  <div class="flex h-full flex-col bg-default">
    <!-- Strongest text color on the plain background: the most contrast in bright sunlight. -->
    <dl
      v-if="tiles.length"
      class="grid min-h-0 flex-1 auto-rows-fr gap-px overflow-hidden bg-(--ui-border-accented)"
      :class="tiles.length > 1 ? 'grid-cols-2' : 'grid-cols-1'"
      data-testid="live-data"
    >
      <!-- Sized by both sides of the tile: many values make short tiles. -->
      <div
        v-for="tile in tiles"
        :key="tile.field"
        class="flex min-h-0 flex-col items-center justify-center overflow-hidden bg-default px-1 py-1 text-center [container-type:size] last:odd:col-span-2"
        :data-field="tile.field"
      >
        <dt class="truncate text-sm font-semibold tracking-wide text-toned uppercase">{{ tile.label }}</dt>
        <dd class="font-numbers leading-none font-semibold whitespace-nowrap text-highlighted tabular-nums">
          <span class="text-[min(22cqw,55cqh,6rem)]" data-testid="live-value">{{ tile.value }}</span>
          <span v-if="tile.unit" class="ml-1 text-[min(9cqw,22cqh,2rem)]">{{ tile.unit }}</span>
        </dd>
      </div>
    </dl>
    <p v-else class="flex flex-1 items-center justify-center p-4 text-center text-muted">{{ t('liveData.empty') }}</p>

    <div class="flex items-center justify-between gap-2 border-t border-default p-2">
      <UButton
        v-if="lapShown"
        icon="i-lucide-flag"
        :label="t('liveData.lap')"
        color="neutral"
        variant="outline"
        @click="startLap"
      />
      <UButton
        icon="i-lucide-settings-2"
        :label="t('liveData.customize')"
        color="neutral"
        variant="ghost"
        class="ml-auto"
        @click="settingsOpen = true"
      />
    </div>

    <UModal v-model:open="settingsOpen" :title="t('liveData.customizeTitle')" :description="t('liveData.customizeDescription')">
      <template #body>
        <div class="space-y-6">
          <fieldset>
            <legend class="mb-1 text-sm font-medium">{{ t('liveData.fieldsLegend') }}</legend>
            <p class="mb-2 text-sm text-muted">{{ t('liveData.fieldsHint') }}</p>
            <ul class="divide-y divide-(--ui-border)" data-testid="live-data-fields">
              <li v-for="row in rows" :key="row.field" class="flex items-center gap-1 py-1" :data-field="row.field">
                <UCheckbox
                  :model-value="row.index >= 0"
                  :label="row.label"
                  class="flex-1 py-1"
                  @update:model-value="setField(row.field, $event === true)"
                />
                <template v-if="row.index >= 0">
                  <UButton
                    icon="i-lucide-chevron-up"
                    :aria-label="t('liveData.moveUp', { field: row.label })"
                    color="neutral"
                    variant="ghost"
                    :disabled="row.index === 0"
                    @click="move(row.index, -1)"
                  />
                  <UButton
                    icon="i-lucide-chevron-down"
                    :aria-label="t('liveData.moveDown', { field: row.label })"
                    color="neutral"
                    variant="ghost"
                    :disabled="row.index === shown.length - 1"
                    @click="move(row.index, 1)"
                  />
                </template>
              </li>
            </ul>
          </fieldset>
          <URadioGroup v-model="chosenUnit" :items="unitItems" :legend="t('liveData.unitLegend')" />
        </div>
      </template>
    </UModal>
  </div>
</template>
