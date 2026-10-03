<script setup lang="ts">
// Map page layout, without the app header. From md up: map beside a side panel. Below md: full-screen map
// under a bottom sheet with three positions (collapsed to its title, half height, full height, which stops
// under the floating top bar), moved by dragging its header or with the expand / collapse buttons.
// The `actions` slot (main buttons) floats above the sheet on phones and tops the side panel from md up.
export type SheetSnap = 'collapsed' | 'half' | 'full'

const props = withDefaults(defineProps<{
  defaultSnap?: SheetSnap
  // Fallback of MapTopBar's back button; no back button without it.
  back?: string
}>(), {
  defaultSnap: 'half',
  back: undefined,
})

const { t } = useI18n()

const SNAPS: SheetSnap[] = ['collapsed', 'half', 'full']
// Sheet height per position; the collapsed one (header only) is also kept free under the map.
const SNAP_HEIGHTS: Record<SheetSnap, string> = {
  collapsed: 'var(--sheet-peek)',
  half: '50%',
  full: 'calc(100% - var(--sheet-top))',
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
const topBar = useTemplateRef('topBar')
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

// Map height hidden by the top bar, from the top of the page.
function topInset() {
  if (!root.value || !topBar.value) return 0
  return topBar.value.getBoundingClientRect().bottom - root.value.getBoundingClientRect().top
}

function measure() {
  // Same gap under the top bar as --sheet-top.
  const full = root.value!.getBoundingClientRect().height - topInset() - 8
  const peek = header.value!.getBoundingClientRect().height
  return { peek, full }
}

function snapHeights(): Record<SheetSnap, number> {
  const { peek, full } = measure()
  return { collapsed: peek, half: full / 2, full }
}

// Maps frame routes and places under the top bar and above the open sheet. The sheet's half height is used
// when full too: the map is hidden then, and a larger padding than the map itself would break the framing.
provide(MAP_INSET_KEY, () => {
  const top = topInset()
  if (!root.value || !header.value || snap.value === 'collapsed' || !window.matchMedia(MOBILE_QUERY).matches) return { top, bottom: 0 }
  return { top, bottom: Math.max(0, root.value.getBoundingClientRect().height / 2 - header.value.getBoundingClientRect().height) }
})

const sheetHeight = computed(() => dragHeight.value === null ? SNAP_HEIGHTS[snap.value] : `${dragHeight.value}px`)
// The floating actions leave when the sheet covers the map, and while it is dragged above half height.
const actionsHidden = computed(() => dragHeight.value === null
  ? snap.value === 'full'
  : dragHeight.value > root.value!.getBoundingClientRect().height / 2 + 1)
</script>

<template>
  <div
    ref="root"
    class="relative flex h-dvh flex-col [--sheet-peek:4rem] [--sheet-top:calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)] md:flex-row"
    :style="{ '--sheet-height': sheetHeight }"
  >
    <div class="absolute inset-x-0 top-0 bottom-(--sheet-peek) md:static md:min-h-0 md:flex-1">
      <slot name="map" />
    </div>

    <!-- Top left of the map: MapLibre's controls are on the right, the scale and attribution at the bottom. -->
    <div ref="topBar" class="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 z-10">
      <MapTopBar :back="back" />
    </div>

    <!-- Following the sheet's edge, high enough to clear the scale and attribution when it is collapsed. -->
    <div
      v-if="$slots.actions"
      v-show="!actionsHidden"
      class="absolute right-3 bottom-[max(calc(var(--sheet-height)+0.75rem),calc(var(--sheet-peek)+2.5rem))] z-10 flex gap-2 *:rounded-full *:shadow-md md:hidden"
      :class="{ 'transition-[bottom] duration-200 ease-out motion-reduce:transition-none': dragHeight === null }"
    >
      <slot name="actions" />
    </div>

    <aside
      class="absolute inset-x-0 bottom-0 z-10 flex h-(--sheet-height) flex-col rounded-t-xl border-t border-default bg-default shadow-lg md:static md:h-auto md:w-96 md:shrink-0 md:rounded-none md:border-t-0 md:border-l md:shadow-none"
      :class="{ 'transition-[height] duration-200 ease-out motion-reduce:transition-none': dragHeight === null }"
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
        <div v-if="$slots.actions" class="flex gap-2 *:flex-1 *:justify-center max-md:hidden">
          <slot name="actions" />
        </div>
        <slot />
      </div>
    </aside>
  </div>
</template>
