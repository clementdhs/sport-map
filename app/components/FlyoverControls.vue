<script setup lang="ts">
import type { Flyover } from '~/composables/useFlyover'

// Controls of the route page's flyover (#74), floating over the map: play / pause, speed, stop, and a small
// elevation profile where the moving point advances, dragged (or moved with the arrow keys) to jump elsewhere.
// Without elevations, a plain progress bar.
const props = defineProps<{
  flyover: Flyover
}>()

const { t } = useI18n()
const { formatDistance, formatNumber } = useFormat()

const WIDTH = 1000
const HEIGHT = 100

const track = computed(() => props.flyover.subject!.track)
const outing = computed(() => props.flyover.subject?.kind === 'outing')
const color = computed(() => (outing.value ? GPS_COLOR : TRACK_CSS_COLOR))
const length = computed(() => track.value.line.length)
const along = computed(() => props.flyover.along ?? 0)
const ended = computed(() => props.flyover.progress >= 1)

const samples = computed(() => profileSamples(track.value))
const scale = computed(() => {
  const elevations = samples.value.map(([, elevation]) => elevation)
  const low = Math.min(...elevations)
  // A flat route stays a line at mid-height.
  return { low, span: Math.max(Math.max(...elevations) - low, 20) }
})
const toX = (meters: number) => (length.value ? (meters / length.value) * WIDTH : 0)
// The top fifth stays free for the point.
const toY = (elevation: number) => HEIGHT - 4 - ((elevation - scale.value.low) / scale.value.span) * (HEIGHT * 0.75)
const linePath = computed(() => samples.value
  .map(([meters, elevation], i) => `${i ? 'L' : 'M'}${toX(meters).toFixed(1)},${toY(elevation).toFixed(1)}`)
  .join(''))
const areaPath = computed(() => `${linePath.value}L${WIDTH},${HEIGHT}L0,${HEIGHT}Z`)

// The moving point, in % of the profile.
const marker = computed(() => {
  const left = (toX(along.value) / WIDTH) * 100
  if (!samples.value.length) return { left, top: 50 }
  const i = samples.value.findIndex(([meters]) => meters >= along.value)
  const [m1, e1] = samples.value[Math.max(0, i)] ?? samples.value.at(-1)!
  const [m0, e0] = samples.value[Math.max(0, i - 1)]!
  const elevation = m1 > m0 ? e0 + ((e1 - e0) * (along.value - m0)) / (m1 - m0) : e1
  return { left, top: (toY(elevation) / HEIGHT) * 100 }
})

const readout = computed(() => {
  const distances = `${formatDistance(along.value)} / ${formatDistance(length.value)}`
  return outing.value ? `${distances} · ${formatElapsed(flyoverTime(track.value, props.flyover.progress))}` : distances
})

const bar = useTemplateRef('bar')
let dragging = false

function seekTo(event: PointerEvent) {
  const rect = bar.value!.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  props.flyover.seek(flyoverProgress(track.value, ratio * length.value))
}

function onPointerDown(event: PointerEvent) {
  dragging = true
  bar.value!.setPointerCapture(event.pointerId)
  seekTo(event)
}

function onPointerMove(event: PointerEvent) {
  if (dragging) seekTo(event)
}

function onKeydown(event: KeyboardEvent) {
  const step = event.shiftKey ? 0.1 : 0.01
  const current = flyoverProgress(track.value, along.value)
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') props.flyover.seek(current + step)
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') props.flyover.seek(current - step)
  else if (event.key === 'Home') props.flyover.seek(0)
  else if (event.key === 'End') props.flyover.seek(1)
  else return
  event.preventDefault()
}

function toggle() {
  if (props.flyover.playing) props.flyover.pause()
  else props.flyover.play()
}

const card = useTemplateRef('card')
onMounted(() => props.flyover.setControls(card.value ?? undefined))
onBeforeUnmount(() => props.flyover.setControls(undefined))
</script>

<template>
  <div
    ref="card"
    class="w-full max-w-md space-y-1 rounded-xl border border-default bg-default/95 p-2 shadow-lg backdrop-blur"
    role="group"
    :aria-label="t('flyover.controls')"
    data-testid="flyover-controls"
  >
    <div class="flex items-center gap-1">
      <UButton
        :icon="flyover.playing ? 'i-lucide-pause' : ended ? 'i-lucide-rotate-ccw' : 'i-lucide-play'"
        :aria-label="flyover.playing ? t('flyover.pause') : ended ? t('flyover.replay') : t('flyover.play')"
        color="neutral"
        variant="ghost"
        @click="toggle"
      />
      <UButton
        :label="`×${formatNumber(flyover.speed)}`"
        :aria-label="t('flyover.speed', { speed: formatNumber(flyover.speed) })"
        color="neutral"
        variant="ghost"
        class="min-w-12 justify-center tabular-nums"
        @click="flyover.nextSpeed()"
      />
      <p class="ml-auto truncate text-sm text-muted tabular-nums">{{ readout }}</p>
      <UButton icon="i-lucide-square" :aria-label="t('flyover.stop')" color="neutral" variant="ghost" @click="flyover.stop()" />
    </div>

    <div
      ref="bar"
      class="relative mx-1 h-10 cursor-pointer touch-none rounded-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
      role="slider"
      tabindex="0"
      :aria-label="t('flyover.position')"
      aria-valuemin="0"
      :aria-valuemax="Math.round(length)"
      :aria-valuenow="Math.round(along)"
      :aria-valuetext="formatDistance(along)"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="dragging = false"
      @pointercancel="dragging = false"
      @keydown="onKeydown"
    >
      <svg
        v-if="samples.length"
        class="absolute inset-0 size-full overflow-visible"
        :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path :d="areaPath" :fill="color" fill-opacity="0.12" />
        <path :d="linePath" fill="none" :stroke="color" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      </svg>
      <template v-else>
        <div class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-accented" />
        <div class="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full" :style="{ width: `${marker.left}%`, backgroundColor: color }" />
      </template>
      <div class="pointer-events-none absolute inset-y-0 w-px bg-inverted/30" :style="{ left: `${marker.left}%` }" />
      <div
        class="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-(--ui-bg)"
        :style="{ left: `${marker.left}%`, top: `${marker.top}%`, backgroundColor: color }"
      />
    </div>
  </div>
</template>
