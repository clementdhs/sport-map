<script setup lang="ts">
import type { MyProfile } from '#shared/types/routes'
import type { SportType } from '#shared/utils/routes'
import type { StatsBucket, StatsMetric, StatsPeriod } from '~/utils/activityStats'

// Statistics of the completed routes: totals and a chart by week, month or year. Computed in the browser from
// the profile's completed routes, so switching period, sport or measure is instant.
const props = defineProps<{
  completed: MyProfile['completed']
}>()

const period = ref<StatsPeriod>('week')
const sport = ref<SportType | 'all'>('all')
const metric = ref<StatsMetric>('distance')

const periodItems = [
  { label: 'Semaines', value: 'week' },
  { label: 'Mois', value: 'month' },
  { label: 'Années', value: 'year' },
]
const metricItems = [
  { label: 'Distance', value: 'distance' },
  { label: 'Dénivelé', value: 'gain' },
  { label: 'Temps', value: 'time' },
]
const sportItems = [
  { value: 'all', label: 'Tous les sports', icon: 'i-lucide-list' },
  ...SPORT_TYPES.map(value => ({ value, label: SPORT_LABELS[value], icon: SPORT_ICONS[value] })),
]
const RANGE_LABELS: Record<StatsPeriod, string> = {
  week: `Sur les ${WEEKS_SHOWN} dernières semaines`,
  month: `Sur les ${MONTHS_SHOWN} derniers mois`,
  year: `Sur les ${YEARS_SHOWN} dernières années`,
}

const buckets = computed(() => activityStats(props.completed, period.value, sport.value))
const totals = computed(() => buckets.value.reduce((sum, b) => ({
  outings: sum.outings + b.outings,
  distanceM: sum.distanceM + b.distanceM,
  gainM: sum.gainM + b.gainM,
  movingS: sum.movingS + b.movingS,
}), { outings: 0, distanceM: 0, gainM: 0, movingS: 0 }))

function formatMetric(bucket: StatsBucket, which: StatsMetric): string {
  if (which === 'distance') return formatDistance(bucket.distanceM)
  if (which === 'gain') return `${Math.round(bucket.gainM).toLocaleString('fr-FR')} m`
  return bucket.movingS ? formatElapsed(bucket.movingS) : '—'
}

// Clean axis: 0 and 3 to 5 round steps above the tallest bar.
const axis = computed(() => {
  const max = Math.max(...buckets.value.map(b => metricValue(b, metric.value)), 0)
  if (!max) return { top: 1, ticks: [0] }
  const magnitude = 10 ** Math.floor(Math.log10(max / 4))
  const step = [1, 2, 2.5, 5, 10].map(f => f * magnitude).find(s => max / s <= 4)!
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(Math.round(value * 100) / 100)
  return { top, ticks }
})
const UNITS: Record<StatsMetric, string> = { distance: 'km', gain: 'm', time: 'h' }

const hovered = ref<number | null>(null)
// Show every label when they fit, every other one on the 12-bar periods on narrow screens.
const everyOther = computed(() => buckets.value.length > 6)
</script>

<template>
  <div class="space-y-4 pt-2">
    <div class="flex flex-wrap items-center gap-2">
      <USelect v-model="sport" :items="sportItems" aria-label="Sport" class="w-44" />
      <UTabs v-model="period" :items="periodItems" :content="false" size="sm" aria-label="Période" />
      <UTabs v-model="metric" :items="metricItems" :content="false" size="sm" aria-label="Mesure" />
    </div>

    <p v-if="!completed.length" class="text-sm text-muted">
      Marque des parcours comme faits, ou enregistre une sortie, pour voir tes statistiques ici.
    </p>

    <template v-else>
      <div>
        <p class="mb-2 text-sm text-muted">{{ RANGE_LABELS[period] }}</p>
        <dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="rounded-lg bg-elevated p-3">
            <dt class="text-xs text-muted">Sorties</dt>
            <dd class="text-lg font-semibold">{{ totals.outings }}</dd>
          </div>
          <div class="rounded-lg bg-elevated p-3">
            <dt class="text-xs text-muted">Distance</dt>
            <dd class="text-lg font-semibold">{{ formatDistance(totals.distanceM) }}</dd>
          </div>
          <div class="rounded-lg bg-elevated p-3">
            <dt class="text-xs text-muted">Dénivelé +</dt>
            <dd class="text-lg font-semibold">{{ Math.round(totals.gainM).toLocaleString('fr-FR') }} m</dd>
          </div>
          <div class="rounded-lg bg-elevated p-3">
            <dt class="text-xs text-muted">Temps en mouvement</dt>
            <dd class="text-lg font-semibold">{{ totals.movingS ? formatElapsed(totals.movingS) : '—' }}</dd>
          </div>
        </dl>
        <p v-if="metric === 'time'" class="mt-2 text-xs text-muted">
          Le temps ne compte que les sorties enregistrées avec le GPS.
        </p>
      </div>

      <!-- Bar chart: one bar per week, month or year. Values stay available in the table below it. -->
      <figure class="space-y-1" aria-hidden="true">
        <div class="relative h-48 pl-10" @mouseleave="hovered = null">
          <div
            v-for="tick in axis.ticks"
            :key="tick"
            class="absolute inset-x-0 border-t border-default"
            :style="{ bottom: `${(tick / axis.top) * 100}%` }"
          >
            <span class="absolute -top-2 left-0 w-9 text-right text-[10px] text-muted tabular-nums">
              {{ tick.toLocaleString('fr-FR') }}
            </span>
          </div>
          <div class="relative flex h-full items-end gap-0.5">
            <div
              v-for="(bucket, i) in buckets"
              :key="bucket.key"
              class="relative flex h-full flex-1 cursor-default items-end justify-center"
              @mouseenter="hovered = i"
            >
              <div
                class="w-full max-w-6 rounded-t bg-primary transition-opacity"
                :class="{ 'opacity-60': hovered !== null && hovered !== i }"
                :style="{ height: `${(metricValue(bucket, metric) / axis.top) * 100}%` }"
              />
              <div
                v-if="hovered === i"
                class="pointer-events-none absolute bottom-full z-10 mb-1 w-max max-w-48 rounded-md border border-default bg-default px-2 py-1 text-xs shadow-md"
                :class="i < buckets.length / 2 ? 'left-0' : 'right-0'"
              >
                <p class="font-medium">{{ bucket.fullLabel }}</p>
                <p class="text-muted">
                  {{ bucket.outings }} sortie{{ bucket.outings > 1 ? 's' : '' }} · {{ formatMetric(bucket, 'distance') }}
                  · D+ {{ formatMetric(bucket, 'gain') }} · {{ formatMetric(bucket, 'time') }}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div class="flex gap-0.5 pl-10">
          <span
            v-for="(bucket, i) in buckets"
            :key="bucket.key"
            class="flex-1 truncate text-center text-[10px] text-muted"
            :class="{ 'invisible sm:visible': everyOther && i % 2 === 1 }"
          >
            {{ bucket.label }}
          </span>
        </div>
        <figcaption class="text-right text-xs text-muted">en {{ UNITS[metric] }}</figcaption>
      </figure>

      <table class="sr-only">
        <caption>Statistiques {{ RANGE_LABELS[period].toLowerCase() }}</caption>
        <thead>
          <tr><th>Période</th><th>Sorties</th><th>Distance</th><th>Dénivelé +</th><th>Temps en mouvement</th></tr>
        </thead>
        <tbody>
          <tr v-for="bucket in buckets" :key="bucket.key">
            <td>{{ bucket.fullLabel }}</td>
            <td>{{ bucket.outings }}</td>
            <td>{{ formatMetric(bucket, 'distance') }}</td>
            <td>{{ formatMetric(bucket, 'gain') }}</td>
            <td>{{ formatMetric(bucket, 'time') }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>
