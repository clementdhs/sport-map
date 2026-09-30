<script setup lang="ts">
// Map page layout. From md up: map beside a side panel. Below md: full-screen map under a bottom sheet with
// three positions (collapsed to its title, half height, full height), moved by dragging its header or with
// the expand / collapse buttons.
export type SheetSnap = 'collapsed' | 'half' | 'full'

const props = withDefaults(defineProps<{
  defaultSnap?: SheetSnap
}>(), {
  defaultSnap: 'half',
})

const { t } = useI18n()

const SNAPS: SheetSnap[] = ['collapsed', 'half', 'full']
// Sheet height per position; the collapsed one (header only) is also kept free under the map.
const SNAP_HEIGHTS: Record<SheetSnap, string> = {
  collapsed: 'var(--sheet-peek)',
  half: '50%',
  full: '100%',
}

const snap = ref<SheetSnap>(props.defaultSnap)
const index = computed(() => SNAPS.indexOf(snap.value))

function move(step: 1 | -1) {
  snap.value = SNAPS[Math.min(SNAPS.length - 1, Math.max(0, index.value + step))]!
}

// Below md the collapsed sheet hides its content: made inert so keyboard and screen reader users skip it.
const MOBILE_QUERY = '(max-width: 767.98px)'
const mobile = ref(false)
onMounted(() => {
  const query = window.matchMedia(MOBILE_QUERY)
  mobile.value = query.matches
  query.addEventListener('change', (event) => { mobile.value = event.matches })
})

const root = useTemplateRef('root')
const header = useTemplateRef('header')
// Height in pixels while dragging, null otherwise.
const dragHeight = ref<number | null>(null)
let drag: { pointerId: number, startY: number, startHeight: number, lastY: number, lastTime: number, velocity: number } | null = null

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 || (event.target as Element).closest('button')) return
  const sheet = header.value?.parentElement
  if (!sheet) return
  header.value!.setPointerCapture(event.pointerId)
  const height = sheet.getBoundingClientRect().height
  drag = { pointerId: event.pointerId, startY: event.clientY, startHeight: height, lastY: event.clientY, lastTime: event.timeStamp, velocity: 0 }
}

function onPointerMove(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId || !root.value) return
  const { peek, full } = measure()
  dragHeight.value = Math.min(full, Math.max(peek, drag.startHeight + drag.startY - event.clientY))
  const elapsed = event.timeStamp - drag.lastTime
  if (elapsed > 0) drag.velocity = (drag.lastY - event.clientY) / elapsed
  drag.lastY = event.clientY
  drag.lastTime = event.timeStamp
}

function onPointerUp(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return
  const { velocity, startY } = drag
  drag = null
  const height = dragHeight.value
  dragHeight.value = null
  // A tap (no real move) opens a collapsed sheet and collapses an open one.
  if (height === null || Math.abs(event.clientY - startY) < 6) {
    snap.value = snap.value === 'collapsed' ? 'half' : 'collapsed'
    return
  }
  // A flick goes one position further in its direction; a slow drag stops at the nearest position.
  if (Math.abs(velocity) > 0.5) {
    const heights = snapHeights()
    const next = velocity > 0
      ? SNAPS.find(s => heights[s] > height + 1) ?? 'full'
      : [...SNAPS].reverse().find(s => heights[s] < height - 1) ?? 'collapsed'
    snap.value = next
    return
  }
  const heights = snapHeights()
  snap.value = SNAPS.reduce((best, s) => Math.abs(heights[s] - height) < Math.abs(heights[best] - height) ? s : best)
}

function measure() {
  const full = root.value!.getBoundingClientRect().height
  const peek = header.value!.getBoundingClientRect().height
  return { peek, full }
}

function snapHeights(): Record<SheetSnap, number> {
  const { peek, full } = measure()
  return { collapsed: peek, half: full / 2, full }
}

// Maps frame routes and places above the open sheet. Its half height is used when full too: the map is
// hidden then, and a larger padding than the map itself would break the framing.
provide(MAP_INSET_KEY, () => {
  if (!root.value || !header.value || snap.value === 'collapsed' || !window.matchMedia(MOBILE_QUERY).matches) return 0
  return Math.max(0, root.value.getBoundingClientRect().height / 2 - header.value.getBoundingClientRect().height)
})

const sheetHeight = computed(() => dragHeight.value === null ? SNAP_HEIGHTS[snap.value] : `${dragHeight.value}px`)
</script>

<template>
  <div
    ref="root"
    class="relative flex h-[calc(100dvh-var(--ui-header-height))] flex-col [--sheet-peek:4rem] md:flex-row"
  >
    <div class="absolute inset-x-0 top-0 bottom-(--sheet-peek) md:static md:min-h-0 md:flex-1">
      <slot name="map" />
    </div>

    <aside
      class="absolute inset-x-0 bottom-0 z-10 flex h-(--sheet-height) flex-col rounded-t-xl border-t border-default bg-default shadow-lg md:static md:h-auto md:w-96 md:shrink-0 md:rounded-none md:border-t-0 md:border-l md:shadow-none"
      :class="{ 'transition-[height] duration-200 ease-out motion-reduce:transition-none': dragHeight === null }"
      :style="{ '--sheet-height': sheetHeight }"
      :data-sheet="snap"
    >
      <div
        ref="header"
        class="flex h-(--sheet-peek) shrink-0 cursor-grab touch-none flex-col px-4 select-none active:cursor-grabbing md:hidden"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <div class="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-accented" aria-hidden="true" />
        <div class="flex min-h-0 flex-1 items-center gap-2">
          <div class="min-w-0 flex-1 truncate font-medium">
            <slot name="title" />
          </div>
          <UButton
            icon="i-lucide-chevron-down"
            color="neutral"
            variant="ghost"
            :aria-label="t('sheet.collapse')"
            :disabled="snap === 'collapsed'"
            @click="move(-1)"
          />
          <UButton
            icon="i-lucide-chevron-up"
            color="neutral"
            variant="ghost"
            :aria-label="t('sheet.expand')"
            :disabled="snap === 'full'"
            @click="move(1)"
          />
        </div>
      </div>

      <div
        class="min-h-0 flex-1 space-y-4 overflow-y-auto border-t border-default p-4 md:border-t-0"
        :inert="mobile && snap === 'collapsed'"
      >
        <slot />
      </div>
    </aside>
  </div>
</template>
