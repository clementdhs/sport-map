<script setup lang="ts">
import { distance } from '@turf/turf'
import type { LngLat } from '#shared/utils/routes'
import { SLOPE_CLASSES, slopeClass } from '#shared/utils/slopes'

const props = defineProps<{
  coordinates: LngLat[]
  elevations: number[]
  // Signed grade (%) at each point: colours the line by slope and adds it to the tooltip
  grades?: number[] | null
}>()

const emit = defineEmits<{
  // Track position under the cursor, so the map can show it; null when leaving the profile.
  hover: [point: LngLat | null]
}>()

// Plot space: x from 0 to WIDTH, y from 0 (top) to HEIGHT (bottom); stretched to the container.
const WIDTH = 1000
const HEIGHT = 100
const NICE_STEPS = [5, 10, 20, 50, 100, 200, 250, 500, 1000, 2000]
const MAX_INTERVALS = 4

const distances = computed(() => {
  const result = [0]
  for (let i = 1; i < props.coordinates.length; i++) {
    result.push(result[i - 1]! + distance(props.coordinates[i - 1]!, props.coordinates[i]!, { units: 'meters' }))
  }
  return result
})
const totalM = computed(() => distances.value.at(-1) ?? 0)

const axis = computed(() => {
  const min = Math.min(...props.elevations)
  const max = Math.max(...props.elevations)
  const step = NICE_STEPS.find(s => (max - min) / s <= MAX_INTERVALS) ?? NICE_STEPS.at(-1)!
  const low = Math.floor(min / step) * step
  const high = Math.max(Math.ceil(max / step) * step, low + step)
  const ticks: number[] = []
  for (let value = low; value <= high; value += step) ticks.push(value)
  return { min, max, low, high, ticks }
})

const toX = (meters: number) => totalM.value ? (meters / totalM.value) * WIDTH : 0
const toY = (elevation: number) => HEIGHT - ((elevation - axis.value.low) / (axis.value.high - axis.value.low)) * HEIGHT

const linePath = computed(() => props.elevations
  .map((elevation, i) => `${i ? 'L' : 'M'}${toX(distances.value[i]!).toFixed(1)},${toY(elevation).toFixed(1)}`)
  .join(''))
// Line pieces of one slope class each, sharing their end points so the line stays continuous.
const slopePaths = computed(() => {
  const grades = props.grades
  if (!grades || grades.length !== props.elevations.length) return []
  const point = (i: number) => `${toX(distances.value[i]!).toFixed(1)},${toY(props.elevations[i]!).toFixed(1)}`
  const pieces: { color: string, d: string }[] = []
  let current = -1
  grades.forEach((grade, i) => {
    const cls = slopeClass(grade)
    if (cls !== current) {
      const last = pieces.at(-1)
      pieces.push({ color: SLOPE_CLASSES[cls]!.color, d: `M${point(i > 0 ? i - 1 : i)}` })
      if (last && i > 0) last.d += `L${point(i)}`
      current = cls
    }
    pieces.at(-1)!.d += `L${point(i)}`
  })
  return pieces
})

const areaPath = computed(() => `${linePath.value}L${WIDTH},${HEIGHT}L0,${HEIGHT}Z`)

const plot = useTemplateRef('plot')
const activeIndex = ref<number | null>(null)

watch(activeIndex, index => emit('hover', index === null ? null : props.coordinates[index]!))
onBeforeUnmount(() => {
  if (activeIndex.value !== null) emit('hover', null)
})

const active = computed(() => {
  if (activeIndex.value === null) return null
  const i = activeIndex.value
  return {
    elevation: props.elevations[i]!,
    distance: distances.value[i]!,
    grade: props.grades?.[i] ?? null,
    left: (toX(distances.value[i]!) / WIDTH) * 100,
    top: (toY(props.elevations[i]!) / HEIGHT) * 100,
  }
})

function nearestIndex(meters: number): number {
  let low = 0
  let high = distances.value.length - 1
  while (low < high) {
    const mid = (low + high) >> 1
    if (distances.value[mid]! < meters) low = mid + 1
    else high = mid
  }
  if (low > 0 && meters - distances.value[low - 1]! < distances.value[low]! - meters) return low - 1
  return low
}

function onPointerMove(event: PointerEvent) {
  const rect = plot.value!.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  activeIndex.value = nearestIndex(ratio * totalM.value)
}

function onKeydown(event: KeyboardEvent) {
  const last = props.elevations.length - 1
  const step = Math.max(1, Math.round(last / 50))
  const current = activeIndex.value ?? 0
  if (event.key === 'ArrowRight') activeIndex.value = Math.min(last, current + step)
  else if (event.key === 'ArrowLeft') activeIndex.value = Math.max(0, current - step)
  else if (event.key === 'Escape') activeIndex.value = null
  else return
  event.preventDefault()
}

const formatElevation = (meters: number) => `${Math.round(meters).toLocaleString('fr-FR')} m`
const summary = computed(() =>
  `Profil altimétrique : altitude de ${formatElevation(axis.value.min)} à ${formatElevation(axis.value.max)} sur ${formatDistance(totalM.value)}`)
</script>

<template>
  <figure class="space-y-1">
    <figcaption class="text-sm font-medium">Profil altimétrique</figcaption>

    <div class="flex gap-2">
      <div class="relative h-32 w-12 shrink-0 text-xs text-muted tabular-nums" aria-hidden="true">
        <span
          v-for="tick in axis.ticks"
          :key="tick"
          class="absolute right-0 -translate-y-1/2"
          :style="{ top: `${(toY(tick) / HEIGHT) * 100}%` }"
        >{{ formatElevation(tick) }}</span>
      </div>

      <div
        ref="plot"
        class="relative h-32 flex-1 touch-pan-y rounded-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-primary"
        tabindex="0"
        role="img"
        :aria-label="summary"
        @pointermove="onPointerMove"
        @pointerleave="activeIndex = null"
        @keydown="onKeydown"
        @blur="activeIndex = null"
      >
        <svg class="absolute inset-0 size-full overflow-visible" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="none" aria-hidden="true">
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
          <path :d="areaPath" :fill="ROUTE_COLOR" fill-opacity="0.1" />
          <path
            v-for="(piece, i) in slopePaths"
            :key="i"
            :d="piece.d"
            fill="none"
            :stroke="piece.color"
            stroke-width="3"
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />
          <path
            v-if="!slopePaths.length"
            :d="linePath"
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
            class="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-(--ui-bg)"
            :style="{ left: `${active.left}%`, top: `${active.top}%`, backgroundColor: ROUTE_COLOR }"
          />
          <div
            class="pointer-events-none absolute top-0 z-10 rounded-md border border-default bg-default px-2 py-1 text-xs whitespace-nowrap shadow-sm"
            :class="active.left > 60 ? '-translate-x-full -ml-2' : 'ml-2'"
            :style="{ left: `${active.left}%` }"
            aria-live="polite"
          >
            <p class="font-semibold text-highlighted tabular-nums">{{ formatElevation(active.elevation) }}</p>
            <p class="text-muted tabular-nums">à {{ formatDistance(active.distance) }}</p>
            <p v-if="active.grade !== null" class="text-muted tabular-nums">Pente : {{ Math.round(active.grade) }} %</p>
          </div>
        </template>
      </div>
    </div>

    <div class="ml-14 flex justify-between text-xs text-muted tabular-nums" aria-hidden="true">
      <span>0 km</span>
      <span>{{ formatDistance(totalM) }}</span>
    </div>
  </figure>
</template>
