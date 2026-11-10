<script setup lang="ts">
// Follow mode's mini elevation profile (#235): the route's profile in rust, the covered part in a stronger rust (as
// on the map) and the walker's position in the GPS blue. No axes nor hover: it is read at a glance, the figures under
// it give the numbers. Its label says how far along the walker is.
const props = defineProps<{
  // Metres along the track and elevation at each point (same length)
  along: number[]
  elevations: number[]
  doneM: number | null
  label: string
}>()

const WIDTH = 1000
const HEIGHT = 100
// Margin above the highest point and below the lowest one, in plot units
const PAD = 8
const MAX_SAMPLES = 240

const samples = computed(() => {
  const step = Math.max(1, Math.ceil(props.along.length / MAX_SAMPLES))
  const picked: [number, number][] = []
  for (let i = 0; i < props.along.length; i += step) picked.push([props.along[i]!, props.elevations[i]!])
  const lastIndex = props.along.length - 1
  if (lastIndex > 0 && (lastIndex % step) !== 0) picked.push([props.along[lastIndex]!, props.elevations[lastIndex]!])
  return picked
})

const scale = computed(() => {
  const heights = samples.value.map(([, elevation]) => elevation)
  const min = Math.min(...heights)
  const range = Math.max(Math.max(...heights) - min, 20)
  const total = samples.value.at(-1)?.[0] || 1
  return {
    x: (m: number) => (m / total) * WIDTH,
    y: (elevation: number) => HEIGHT - PAD - ((elevation - min) / range) * (HEIGHT - 2 * PAD),
  }
})

function path(points: [number, number][]) {
  return points.map(([m, elevation], index) => `${index ? 'L' : 'M'}${scale.value.x(m).toFixed(1)} ${scale.value.y(elevation).toFixed(1)}`).join(' ')
}

// The elevation where the walker is, between two samples
function elevationAt(m: number) {
  const points = samples.value
  const after = points.findIndex(([at]) => at >= m)
  if (after <= 0) return points[after === 0 ? 0 : points.length - 1]![1]
  const [m0, e0] = points[after - 1]!
  const [m1, e1] = points[after]!
  return m1 === m0 ? e1 : e0 + ((m - m0) / (m1 - m0)) * (e1 - e0)
}

const line = computed(() => path(samples.value))
const area = computed(() => `${line.value} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`)
const here = computed(() => {
  if (props.doneM === null) return null
  return { x: scale.value.x(props.doneM), y: scale.value.y(elevationAt(props.doneM)) }
})
const done = computed(() => {
  if (props.doneM === null || !here.value) return null
  const before = samples.value.filter(([m]) => m < props.doneM!)
  return before.length ? path([...before, [props.doneM, elevationAt(props.doneM)]]) : null
})
</script>

<template>
  <div class="relative h-12">
    <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="none" class="absolute inset-0 size-full overflow-visible" role="img" :aria-label="label">
      <path :d="area" class="fill-(--map-track) opacity-15" />
      <path :d="line" fill="none" class="stroke-(--map-track)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
      <path v-if="done" :d="done" fill="none" class="stroke-(--map-track-done)" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
      <line v-if="here" :x1="here.x" :x2="here.x" y1="0" :y2="HEIGHT" :stroke="GPS_COLOR" stroke-width="1.5" vector-effect="non-scaling-stroke" />
    </svg>
    <!-- Outside the stretched svg, so that it stays round. -->
    <span
      v-if="here"
      class="absolute size-3 -translate-1/2 rounded-full border-2 border-white"
      :style="{ left: `${here.x / 10}%`, top: `${here.y}%`, backgroundColor: GPS_COLOR }"
      aria-hidden="true"
    />
  </div>
</template>
