<script setup lang="ts">
import type { RecordOuting } from '#shared/types/routes'
import type { SportType } from '#shared/utils/routes'
import type { StatsBucket, StatsMetric, StatsPeriod } from '~/utils/activityStats'
import type { KeyFigure } from '~/utils/keyFigures'

const { formatDistance, formatNumber, locale } = useFormat()

// Statistics of the outings: totals and a chart by week, month or year. Computed in the browser from the
// profile's outings (each one recorded with the GPS, and the routes only marked as done), so switching period,
// sport or measure is instant. The records below follow the same sport.
const props = defineProps<{
  outings: RecordOuting[]
}>()

const { t } = useI18n()
const period = ref<StatsPeriod>('week')
const sport = ref<SportType | 'all'>('all')
const metric = ref<StatsMetric>('distance')

const periodItems = computed(() => [
  { label: t('stats.periods.week'), value: 'week' },
  { label: t('stats.periods.month'), value: 'month' },
  { label: t('stats.periods.year'), value: 'year' },
])
const metricItems = computed(() => [
  { label: t('stats.metrics.distance'), value: 'distance' },
  { label: t('stats.metrics.gain'), value: 'gain' },
  { label: t('stats.metrics.time'), value: 'time' },
])
const sports = useSportItems()
const sportItems = computed(() => [
  { value: 'all', label: t('filters.allSports'), icon: 'i-lucide-list' },
  ...sports.value,
])
const SHOWN: Record<StatsPeriod, number> = { week: WEEKS_SHOWN, month: MONTHS_SHOWN, year: YEARS_SHOWN }
const rangeLabel = computed(() => t(`stats.ranges.${period.value}`, { count: SHOWN[period.value] }))

const buckets = computed(() => activityStats(props.outings, period.value, sport.value, new Date(), locale()))
const bucketTitle = (bucket: StatsBucket) => (period.value === 'week' ? t('stats.weekOf', { date: bucket.fullLabel }) : bucket.fullLabel)
const totals = computed(() => buckets.value.reduce((sum, b) => ({
  outings: sum.outings + b.outings,
  distanceM: sum.distanceM + b.distanceM,
  gainM: sum.gainM + b.gainM,
  movingS: sum.movingS + b.movingS,
}), { outings: 0, distanceM: 0, gainM: 0, movingS: 0 }))

// The range's totals in the key figures cartouche (#236).
const totalFigures = computed<KeyFigure[]>(() => {
  const [distance, unit] = splitUnit(formatDistance(totals.value.distanceM))
  return [
    { label: t('stats.outings'), value: String(totals.value.outings) },
    { label: t('route.distance'), value: distance, unit },
    { label: t('route.gain'), value: formatNumber(Math.round(totals.value.gainM)), unit: 'm' },
    { label: t('stats.movingTime'), value: totals.value.movingS ? formatElapsed(totals.value.movingS) : '—' },
  ]
})

function formatMetric(bucket: StatsBucket, which: StatsMetric): string {
  if (which === 'distance') return formatDistance(bucket.distanceM)
  if (which === 'gain') return `${formatNumber(Math.round(bucket.gainM))} m`
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
// The current week, month or year: the last bar, in ink with its value written above it.
const current = computed(() => buckets.value.length - 1)
const currentValue = computed(() => {
  const bucket = buckets.value[current.value]
  if (!bucket) return ''
  const value = metricValue(bucket, metric.value)
  return formatNumber(value, { maximumFractionDigits: metric.value === 'gain' || value >= 10 ? 0 : 1 })
})
// Show every label when they fit, every other one on the 12-bar periods on narrow screens.
const everyOther = computed(() => buckets.value.length > 6)
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-3">
      <h2 class="font-display text-2xl font-bold">{{ rangeLabel }}</h2>
      <div class="flex flex-wrap items-center gap-2">
        <USelect v-model="sport" :items="sportItems" :aria-label="t('filters.sport')" class="w-44" />
        <UTabs v-model="period" :items="periodItems" :content="false" size="sm" :aria-label="t('stats.period')" />
        <UTabs v-model="metric" :items="metricItems" :content="false" size="sm" :aria-label="t('stats.metric')" />
      </div>
    </div>

    <p v-if="!outings.length" class="text-sm text-muted">
      {{ t('stats.empty') }}
    </p>

    <template v-else>
      <div data-testid="stats-totals">
        <KeyFigures :figures="totalFigures" />
        <p v-if="metric === 'time'" class="mt-2 text-xs text-muted">
          {{ t('stats.timeHint') }}
        </p>
      </div>

      <!-- Bar chart: one bar per week, month or year, in rust, the current one in ink. Values stay available in the
           table below it. -->
      <figure class="space-y-1" aria-hidden="true">
        <figcaption class="text-right text-xs text-muted">{{ t('stats.unit', { unit: UNITS[metric] }) }}</figcaption>
        <div class="relative mt-5 h-44 pl-8 lg:h-52" @mouseleave="hovered = null">
          <div
            v-for="tick in axis.ticks"
            :key="tick"
            class="absolute inset-x-0 border-t border-dashed border-accented"
            :style="{ bottom: `${(tick / axis.top) * 100}%` }"
          >
            <span class="absolute -top-2 left-0 w-6 text-right font-numbers text-[11px] text-muted tabular-nums">
              {{ formatNumber(tick) }}
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
                class="relative w-full max-w-8 rounded-t-[4px] transition-opacity"
                :class="[i === current ? 'bg-(--chart-current)' : 'bg-(--chart-bar)', { 'opacity-60': hovered !== null && hovered !== i }]"
                :style="{ height: `${(metricValue(bucket, metric) / axis.top) * 100}%` }"
              >
                <span
                  v-if="i === current && hovered === null"
                  class="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 font-numbers text-xs font-semibold whitespace-nowrap text-highlighted tabular-nums"
                >{{ currentValue }}</span>
              </div>
              <div
                v-if="hovered === i"
                class="pointer-events-none absolute bottom-full z-10 mb-1 w-max max-w-48 rounded-md border border-default bg-default px-2 py-1 text-xs shadow-md"
                :class="i < buckets.length / 2 ? 'left-0' : 'right-0'"
              >
                <p class="font-medium">{{ bucketTitle(bucket) }}</p>
                <p class="text-muted">
                  {{ t('stats.outingCount', bucket.outings) }} · {{ formatMetric(bucket, 'distance') }}
                  · {{ t('stats.gainValue', { gain: formatMetric(bucket, 'gain') }) }} · {{ formatMetric(bucket, 'time') }}
                </p>
              </div>
            </div>
          </div>
        </div>
        <!-- Labels may run over their neighbours' empty cells (every other one is hidden on phones); the current
             one keeps to the right edge. -->
        <div class="flex h-4 gap-0.5 pl-8">
          <span
            v-for="(bucket, i) in buckets"
            :key="bucket.key"
            class="relative flex-1 text-[11px]"
            :class="[i === current ? 'font-semibold text-highlighted' : 'text-muted', { 'invisible sm:visible': everyOther && i % 2 === 1 && i !== current, 'invisible': everyOther && i === current - 1 }]"
          >
            <span class="absolute top-0 whitespace-nowrap" :class="i === current ? 'right-0' : 'left-1/2 -translate-x-1/2'">{{ bucket.label }}</span>
          </span>
        </div>
      </figure>
      <!-- In a box: an sr-only table keeps its width and widens the page. -->
      <div class="sr-only">
        <table>
          <caption>{{ t('stats.caption', { range: rangeLabel.toLowerCase() }) }}</caption>
          <thead>
            <tr><th>{{ t('stats.period') }}</th><th>{{ t('stats.outings') }}</th><th>{{ t('route.distance') }}</th><th>{{ t('route.gain') }}</th><th>{{ t('stats.movingTime') }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="bucket in buckets" :key="bucket.key">
              <td>{{ bucketTitle(bucket) }}</td>
              <td>{{ bucket.outings }}</td>
              <td>{{ formatMetric(bucket, 'distance') }}</td>
              <td>{{ formatMetric(bucket, 'gain') }}</td>
              <td>{{ formatMetric(bucket, 'time') }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <ProfileRecords :outings="outings" :sport="sport" class="border-t border-default pt-5" />
    </template>
  </div>
</template>
