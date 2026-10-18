<script setup lang="ts">
import type { SquareCrop } from '#shared/utils/avatars'

// Frames a chosen photo in a square (#150): drag it (or the arrow keys) to move it, the slider (or + and −) to
// zoom. Shown round, as the avatars are everywhere.
const props = defineProps<{
  image: ImageBitmap
}>()
const crop = defineModel<SquareCrop>({ required: true })

const { t } = useI18n()
const canvas = useTemplateRef('canvas')
// Displayed size, in CSS pixels (size-60)
const FRAME_PX = 240
const KEY_STEP_PX = 10

const zoom = computed({
  get: () => Math.min(props.image.width, props.image.height) / crop.value.size,
  set: value => (crop.value = zoomCrop(crop.value, props.image.width, props.image.height, value)),
})

function draw() {
  const element = canvas.value
  if (!element) return
  const context = element.getContext('2d')!
  context.imageSmoothingQuality = 'high'
  const { x, y, size } = crop.value
  // A transparent PNG would otherwise keep the previous frames.
  context.clearRect(0, 0, element.width, element.height)
  context.drawImage(props.image, x, y, size, size, 0, 0, element.width, element.height)
}
onMounted(() => {
  // Sized once: resizing clears and reallocates the canvas, at each step of a drag otherwise.
  const ratio = window.devicePixelRatio || 1
  canvas.value!.width = Math.round(FRAME_PX * ratio)
  canvas.value!.height = canvas.value!.width
  draw()
})
watch([crop, () => props.image], draw)

function pan(dx: number, dy: number) {
  crop.value = panCrop(crop.value, props.image.width, props.image.height, dx, dy, canvas.value?.clientWidth || FRAME_PX)
}

let last: { x: number, y: number } | null = null
function onPointerDown(event: PointerEvent) {
  last = { x: event.clientX, y: event.clientY }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function onPointerMove(event: PointerEvent) {
  if (!last) return
  pan(event.clientX - last.x, event.clientY - last.y)
  last = { x: event.clientX, y: event.clientY }
}
function onPointerUp() {
  last = null
}

const KEY_MOVES: Record<string, [number, number]> = {
  ArrowLeft: [KEY_STEP_PX, 0],
  ArrowRight: [-KEY_STEP_PX, 0],
  ArrowUp: [0, KEY_STEP_PX],
  ArrowDown: [0, -KEY_STEP_PX],
}
// The arrows move the framing the way they point (the photo the other way, as when dragging it).
function onKeydown(event: KeyboardEvent) {
  const move = KEY_MOVES[event.key]
  if (move) pan(...move)
  else if (event.key === '+' || event.key === '=') zoom.value += 0.25
  else if (event.key === '-') zoom.value -= 0.25
  else return
  event.preventDefault()
}
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <canvas
      ref="canvas"
      tabindex="0"
      role="img"
      :aria-label="t('settings.avatar.frameLabel')"
      class="size-60 cursor-move touch-none rounded-full bg-muted ring-1 ring-default outline-none focus-visible:ring-2 focus-visible:ring-primary"
      data-testid="avatar-crop"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKeydown"
    />
    <div class="flex w-full max-w-60 items-center gap-2">
      <UIcon name="i-lucide-zoom-out" class="size-4 shrink-0 text-muted" aria-hidden="true" />
      <USlider v-model="zoom" :min="1" :max="MAX_AVATAR_ZOOM" :step="0.01" :aria-label="t('settings.avatar.zoom')" />
      <UIcon name="i-lucide-zoom-in" class="size-4 shrink-0 text-muted" aria-hidden="true" />
    </div>
    <p class="text-center text-xs text-muted">{{ t('settings.avatar.frameHint') }}</p>
  </div>
</template>
