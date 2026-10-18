<script setup lang="ts">
import type { LiveDataPrefs, LiveField, LiveMode, LiveStats } from '~/utils/liveStats'

// The "data" screen of follow mode and outing recording: the chosen values, as big as the screen allows, to
// be read at arm's length while running or riding. The choice is kept on the device.
const props = defineProps<{
  mode: LiveMode
  stats: LiveStats
  // Pace (min/km) rather than speed (km/h) until the walker picks one
  defaultPace: boolean
}>()

const { t } = useI18n()
const { locale } = useFormat()

const PREFS_KEY = 'sport-map:live-data'
const prefs = ref<LiveDataPrefs>({})
onMounted(() => {
  try {
    prefs.value = parseLiveDataPrefs(localStorage.getItem(PREFS_KEY))
  }
  catch { /* storage blocked: the defaults */ }
})
function savePrefs(next: LiveDataPrefs) {
  prefs.value = next
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  }
  catch { /* storage full or blocked: kept until the page closes */ }
}

const fields = computed(() => prefs.value[props.mode] ?? DEFAULT_FIELDS[props.mode])
const pace = computed(() => prefs.value.pace ?? props.defaultPace)

const tiles = computed(() => fields.value.map(field => ({
  field,
  label: t(`liveData.fields.${field}`, { unit: pace.value ? t('liveData.pace') : t('liveData.speed') }),
  ...liveValue(field, props.stats, pace.value, locale()),
})))

// Settings
const settingsOpen = ref(false)
const fieldItems = computed(() => MODE_FIELDS[props.mode].map(field => ({
  value: field,
  label: t(`liveData.fields.${field}`, { unit: pace.value ? t('liveData.pace') : t('liveData.speed') }),
})))
const unitItems = computed(() => [
  { value: 'speed', label: t('liveData.speedUnit') },
  { value: 'pace', label: t('liveData.paceUnit') },
])

const chosenFields = computed({
  get: () => fields.value,
  // Kept in the order of the list, whatever the order of the clicks.
  set: (value: LiveField[]) => savePrefs({ ...prefs.value, [props.mode]: MODE_FIELDS[props.mode].filter(f => value.includes(f)) }),
})
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
      <div
        v-for="tile in tiles"
        :key="tile.field"
        class="@container flex min-h-0 flex-col items-center justify-center bg-default px-1 py-2 text-center last:odd:col-span-2"
        :data-field="tile.field"
      >
        <dt class="text-sm font-semibold tracking-wide text-toned uppercase">{{ tile.label }}</dt>
        <dd class="font-numbers leading-none font-semibold whitespace-nowrap text-highlighted tabular-nums">
          <span class="text-[min(22cqw,6rem)]" data-testid="live-value">{{ tile.value }}</span>
          <span v-if="tile.unit" class="ml-1 text-[min(9cqw,2rem)]">{{ tile.unit }}</span>
        </dd>
      </div>
    </dl>
    <p v-else class="flex flex-1 items-center justify-center p-4 text-center text-muted">{{ t('liveData.empty') }}</p>

    <div class="flex justify-end border-t border-default p-2">
      <UButton
        icon="i-lucide-settings-2"
        :label="t('liveData.customize')"
        color="neutral"
        variant="ghost"
        @click="settingsOpen = true"
      />
    </div>

    <UModal v-model:open="settingsOpen" :title="t('liveData.customizeTitle')" :description="t('liveData.customizeDescription')">
      <template #body>
        <div class="space-y-6">
          <UCheckboxGroup v-model="chosenFields" :items="fieldItems" :legend="t('liveData.fieldsLegend')" />
          <URadioGroup v-model="chosenUnit" :items="unitItems" :legend="t('liveData.unitLegend')" />
        </div>
      </template>
    </UModal>
  </div>
</template>
