<script setup lang="ts">
import type { PaceSuggestions } from '#shared/types/account'
import type { SportType } from '#shared/utils/routes'

// "Mes allures" in the settings (#146): the member's pace on the flat per sport, written as a pace for runners
// and as a speed for the others, which every estimated duration they look at uses. A field left empty keeps the
// default. "Calculer depuis mes sorties" offers the median pace of their latest GPS outings, kept only if they
// accept it.
const { t } = useI18n()
const { locale } = useFormat()
const toast = useToast()
const errorMessage = useErrorMessage()
const paces = usePreference('paces')

function format(sport: SportType, pace: number | undefined): string {
  return pace === undefined ? '' : formatPaceSetting(sport, pace, locale())
}
function unit(sport: SportType): string {
  return isPaceSetting(sport) ? t('settings.paces.paceUnit') : t('settings.paces.speedUnit')
}

const drafts = reactive(Object.fromEntries(SPORT_TYPES.map(sport => [sport, format(sport, paces.value[sport])])) as Record<SportType, string>)
const errors = reactive<Partial<Record<SportType, string>>>({})
// A draft as its field would show it once saved, in the current language; as typed when it isn't a pace.
function shown(sport: SportType): string {
  const typed = drafts[sport].trim()
  const pace = typed ? parsePaceSetting(sport, typed) : undefined
  return pace === null ? typed : format(sport, pace)
}
// The account loads after the page (and the default shows until mounted): fields the member hasn't touched follow.
watch(paces, (now, before) => {
  for (const sport of SPORT_TYPES) {
    if (shown(sport) === format(sport, before[sport])) drafts[sport] = format(sport, now[sport])
  }
})
// Speeds are written with the language's decimals.
watch(locale, () => {
  for (const sport of SPORT_TYPES) drafts[sport] = shown(sport)
})

function setPace(sport: SportType, pace: number | undefined) {
  delete errors[sport]
  drafts[sport] = format(sport, pace)
  if (pace === paces.value[sport]) return
  const changed = { ...paces.value }
  if (pace === undefined) delete changed[sport]
  else changed[sport] = pace
  paces.value = changed
}

function save(sport: SportType) {
  const typed = drafts[sport].trim()
  const pace = typed ? parsePaceSetting(sport, typed) : undefined
  if (pace === null) {
    errors[sport] = t(isPaceSetting(sport) ? 'settings.paces.invalidPace' : 'settings.paces.invalidSpeed', PACE_SETTING_LIMITS[SPORT_KINDS[sport]])
    return
  }
  setPace(sport, pace)
}

const suggestions = ref<PaceSuggestions | null>(null)
const suggesting = ref(false)
// Said once the answer comes back, not when the member has gone through every suggestion.
const noSuggestion = ref(false)

async function suggest() {
  suggesting.value = true
  try {
    suggestions.value = await $fetch<PaceSuggestions>('/api/profile/me/pace-suggestions')
    noSuggestion.value = !Object.keys(suggestions.value).length
  }
  catch (err) {
    toast.add({ title: t('settings.paces.suggestFailed'), description: errorMessage(err), color: 'error' })
  }
  finally {
    suggesting.value = false
  }
}

function dismiss(sport: SportType) {
  const others = { ...suggestions.value }
  delete others[sport]
  suggestions.value = others
}

function accept(sport: SportType, pace: number) {
  setPace(sport, pace)
  dismiss(sport)
}

const fields = computed(() => SPORT_TYPES.map(sport => ({ sport, suggestion: suggestions.value?.[sport] })))
</script>

<template>
  <div class="space-y-4">
    <!-- One ruled row per sport (#237): its mark and name on the left, the field on the right. -->
    <div class="divide-y divide-default rounded-lg border border-default bg-default px-3.5">
      <div v-for="{ sport, suggestion } in fields" :key="sport" class="py-3" :class="`sport-${sport}`">
        <UFormField
          :label="t(`sports.${sport}`)"
          :description="t('settings.paces.default', { value: `${format(sport, DEFAULT_PACES[sport])} ${unit(sport)}` })"
          :error="!!errors[sport]"
          orientation="horizontal"
          :ui="{ root: 'items-center', label: 'flex items-center gap-2.5 text-[0.9375rem]', description: 'ms-6.5 text-xs', container: 'w-32 shrink-0' }"
        >
          <template #label="{ label }">
            <SportMark :sport="sport" />
            {{ label }}
          </template>
          <!-- Fixed ids: the generated ones differ between the server and the browser on this page. -->
          <UInput
            :id="`pace-${sport}`"
            v-model="drafts[sport]"
            :placeholder="format(sport, DEFAULT_PACES[sport])"
            :inputmode="isPaceSetting(sport) ? undefined : 'decimal'"
            :aria-errormessage="errors[sport] ? `pace-${sport}-error` : undefined"
            autocomplete="off"
            class="w-full"
            :ui="{ base: 'font-numbers text-lg font-semibold tabular-nums' }"
            @change="save(sport)"
          >
            <template #trailing>
              <span class="text-xs text-muted">{{ unit(sport) }}</span>
            </template>
          </UInput>
        </UFormField>
        <!-- Under the row rather than in the narrow field column. -->
        <div aria-live="polite">
          <p v-if="errors[sport]" :id="`pace-${sport}-error`" class="mt-2 text-sm text-error">{{ errors[sport] }}</p>
        </div>
        <div v-if="suggestion" class="mt-2 space-y-1.5 text-sm" :data-pace-suggestion="sport">
          <p>{{ t('settings.paces.suggestion', { count: suggestion.outings, value: `${format(sport, suggestion.pace)} ${unit(sport)}` }, suggestion.outings) }}</p>
          <div class="flex gap-2">
            <UButton size="xs" :label="t('settings.paces.use')" @click="accept(sport, suggestion.pace)" />
            <UButton size="xs" color="neutral" variant="ghost" :label="t('settings.paces.ignore')" @click="dismiss(sport)" />
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-2">
      <UButton
        icon="i-lucide-history"
        color="neutral"
        variant="outline"
        :label="t('settings.paces.suggest')"
        :loading="suggesting"
        @click="suggest"
      />
      <p class="text-sm text-muted">{{ t('settings.paces.suggestHint', { distance: PACE_OUTING_MIN_M / 1000, minutes: PACE_OUTING_MIN_S / 60 }) }}</p>
      <p v-if="noSuggestion" class="text-sm" role="status">{{ t('settings.paces.noSuggestion') }}</p>
    </div>
  </div>
</template>
