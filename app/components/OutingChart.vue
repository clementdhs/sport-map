<script setup lang="ts">
import type { LngLat } from '#shared/utils/routes'
import type { SpeedSample } from '~/utils/splits'

// Speed (or pace) along an outing, drawn over its elevation profile, with the position under the cursor shown
// on the map like the route's elevation profile.
const props = defineProps<{
  samples: SpeedSample[]
  // Minutes per km rather than km/h; faster stays up
  pace: boolean
}>()

const emit = defineEmits<{
  hover: [point: LngLat | null]
}>()

const { t } = useI18n()
const { formatDistance, formatNumber } = useFormat()

// Plot space: x from 0 to WIDTH, y from 0 (top) to HEIGHT (bottom); stretched to the container.
const WIDTH = 1000
const HEIGHT = 100
// Seconds per km for paces, km/h for speeds
const PACE_STEPS = [10, 15, 30, 60, 120, 300, 600]
const SPEED_STEPS = [0.5, 1, 2, 5, 10, 20]
const MAX_INTERVALS = 3
// Share of the height the elevation profile may take, under the speed line.
const ELEVATION_SHARE = 0.6

// The plotted value: seconds per km for a pace, km/h for a speed.
function plotted(speedMs: number | null): number | null {
  if (speedMs === null) return null
  if (!props.pace) return speedMs * 3.6
  return speedMs >= MIN_PACE_SPEED_MS ? 1000 / speedMs : null
}
const values = computed(() => props.samples.map(sample => plotted(sample.speedMs)))
const totalM = computed(() => props.samples.at(-1)?.distanceM ?? 0)

// Bounds leave out the most extreme 2 % on each side (a GPS jump or a slow restart would flatten the line);
// the line is clipped to them.
const axis = computed(() => {
  const sorted = values.value.filter((v): v is number => v !== null).sort((a, b) => a - b)
  const min = sorted[Math.floor((sorted.length - 1) * 0.02)] ?? 0
  const max = sorted[Math.ceil((sorted.length - 1) * 0.98)] ?? 0
  const steps = props.pace ? PACE_STEPS : SPEED_STEPS
  const step = steps.find(s => (max - min) / s <= MAX_INTERVALS) ?? steps.at(-1)!
  const low = Math.floor(min / step) * step
  const high = Math.max(Math.ceil(max / step) * step, low + step)
  const ticks: number[] = []
  for (let value = low; value <= high + step / 2; value += step) ticks.push(value)
  return { low, high, ticks }
})

const toX = (meters: number) => (totalM.value ? (meters / totalM.value) * WIDTH : 0)
function toY(value: number): number {
  const { low, high } = axis.value
  const ratio = Math.min(1, Math.max(0, (value - low) / (high - low)))
  // Faster up: a low pace and a high speed
  return props.pace ? ratio * HEIGHT : HEIGHT - ratio * HEIGHT
}

// One piece per stretch with a speed: none where no moving time passed.
const speedPath = computed(() => {
  let d = ''
  let drawing = false
  values.value.forEach((value, i) => {
    if (value === null) {
      drawing = false
      return
    }
    d += `${drawing ? 'L' : 'M'}${toX(props.samples[i]!.distanceM).toFixed(1)},${toY(value).toFixed(1)}`
    drawing = true
  })
  return d
})

const elevation = computed(() => {
  const elevations = props.samples.map(sample => sample.elevationM)
  if (elevations.some(e => e === null)) return null
  const min = Math.min(...(elevations as number[]))
  // At least 50 m of range, so that a flat outing looks flat.
  const range = Math.max(Math.max(...(elevations as number[])) - min, 50)
  const toElevationY = (e: number) => HEIGHT - ((e - min) / range) * HEIGHT * ELEVATION_SHARE
  const line = props.samples
    .map((sample, i) => `${i ? 'L' : 'M'}${toX(sample.distanceM).toFixed(1)},${toElevationY(sample.elevationM!).toFixed(1)}`)
    .join('')
  return `${line}L${WIDTH},${HEIGHT}L0,${HEIGHT}Z`
})

const formatValue = (value: number) => (props.pace ? formatPace(1000 / value) : formatNumber(value, { maximumFractionDigits: 1 }))
const unit = computed(() => (props.pace ? '/km' : 'km/h'))

const plot = useTemplateRef('plot')
const activeIndex = ref<number | null>(null)

watch(activeIndex, index => emit('hover', index === null ? null : props.samples[index]!.position))
onBeforeUnmount(() => {
  if (activeIndex.value !== null) emit('hover', null)
})

const active = computed(() => {
  if (activeIndex.value === null) return null
  const sample = props.samples[activeIndex.value]!
  const value = values.value[activeIndex.value] ?? null
  return {
    distance: sample.distanceM,
    value: value === null ? '—' : formatValue(value),
    elevation: sample.elevationM,
    left: (toX(sample.distanceM) / WIDTH) * 100,
    top: value === null ? null : (toY(value) / HEIGHT) * 100,
  }
})

function onPointerMove(event: PointerEvent) {
  const rect = plot.value!.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  activeIndex.value = Math.round(ratio * (props.samples.length - 1))
}

function onKeydown(event: KeyboardEvent) {
  const last = props.samples.length - 1
  const step = Math.max(1, Math.round(last / 50))
  const current = activeIndex.value ?? 0
  if (event.key === 'ArrowRight') activeIndex.value = Math.min(last, current + step)
  else if (event.key === 'ArrowLeft') activeIndex.value = Math.max(0, current - step)
  else if (event.key === 'Escape') activeIndex.value = null
  else return
  event.preventDefault()
}

const title = computed(() => t(props.pace ? 'outings.chart.pace' : 'outings.chart.speed'))
const summary = computed(() => {
  const shown = values.value.filter((v): v is number => v !== null)
  if (!shown.length) return title.value
  const [first, second] = [formatValue(Math.min(...shown)), formatValue(Math.max(...shown))]
  return t('outings.chart.summary', {
    title: title.value,
    // From the slowest to the fastest
    from: props.pace ? second : first,
    to: props.pace ? first : second,
    unit: unit.value,
    distance: formatDistance(totalM.value),
  })
})
</script>

<template>
  <figure class="space-y-1">
    <figcaption class="text-sm font-medium">{{ title }}</figcaption>

    <div class="flex gap-2">
      <div class="relative h-36 w-10 shrink-0 text-xs text-muted tabular-nums" aria-hidden="true">
        <span
          v-for="tick in axis.ticks"
          :key="tick"
          class="absolute right-0 -translate-y-1/2"
          :style="{ top: `${(toY(tick) / HEIGHT) * 100}%` }"
        >{{ formatValue(tick) }}</span>
      </div>

      <div
        ref="plot"
        class="relative h-36 flex-1 touch-pan-y rounded-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-primary"
        tabindex="0"
        role="img"
        :aria-label="summary"
        data-testid="outing-chart"
        @pointermove="onPointerMove"
        @pointerleave="activeIndex = null"
        @keydown="onKeydown"
        @blur="activeIndex = null"
      >
        <svg class="absolute inset-0 size-full overflow-visible" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="none" aria-hidden="true">
          <path v-if="elevation" :d="elevation" fill="var(--ui-text-dimmed)" fill-opacity="0.18" />
          <line
            v-for="tick in axis.ticks"
            :key="tick"
            x1="0"
            :x2="WIDTH"
            :y1="toY(tick)"
            :y2="toY(tick)"
            stroke="var(--ui-border)"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
          <path
            :d="speedPath"
            fill="none"
            :stroke="ROUTE_COLOR"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>

        <template v-if="active">
          <div class="pointer-events-none absolute inset-y-0 w-px bg-inverted/40" :style="{ left: `${active.left}%` }" />
          <div
            v-if="active.top !== null"
            class="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-(--ui-bg)"
            :style="{ left: `${active.left}%`, top: `${active.top}%`, backgroundColor: ROUTE_COLOR }"
          />
          <div
            class="pointer-events-none absolute top-0 z-10 rounded-md border border-default bg-default px-2 py-1 text-xs whitespace-nowrap shadow-sm"
            :class="active.left > 60 ? '-translate-x-full -ml-2' : 'ml-2'"
            :style="{ left: `${active.left}%` }"
            aria-live="polite"
          >
            <p class="font-semibold text-highlighted tabular-nums">{{ active.value }} {{ unit }}</p>
            <p class="text-muted tabular-nums">{{ t('elevationProfile.at', { distance: formatDistance(active.distance) }) }}</p>
            <p v-if="active.elevation !== null" class="text-muted tabular-nums">
              {{ t('outings.chart.altitude', { altitude: formatNumber(Math.round(active.elevation)) }) }}
            </p>
          </div>
        </template>
      </div>
    </div>

    <div class="ml-12 flex justify-between text-xs text-muted tabular-nums" aria-hidden="true">
      <span>0 km</span>
      <span>{{ formatDistance(totalM) }}</span>
    </div>
  </figure>
</template>
