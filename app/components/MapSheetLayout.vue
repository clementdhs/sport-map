<script setup lang="ts">
// Map page layout, without the app header. From md up: map beside a side panel. Below md: full-screen map
// under a bottom sheet with three positions (collapsed to its title, half height, full height, which stops
// under the floating top bar), moved by dragging its header or with the expand / collapse buttons.
// The `actions` slot (main buttons) floats above the sheet on phones and tops the side panel from md up.
// From md up the side panel can be collapsed (the map takes the whole width and the title floats over it) and resized.
import type { ComponentPublicInstance } from 'vue'

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

// Side panel from md up (no effect on phones), remembered on the device: collapsed or not, and its width, set by
// dragging its left edge or with the arrow keys on it. Focus follows the button that replaces the one just clicked.
const panelId = useId()
const panel = ref<SidePanelState>({ ...DEFAULT_SIDE_PANEL })
// Unknown until mounted: the server renders the saved width's default.
const windowWidth = ref(Number.POSITIVE_INFINITY)
const panelWidth = computed(() => sidePanelWidth(panel.value.width, windowWidth.value))
const panelMaxWidth = computed(() => maxSidePanelWidth(windowWidth.value))
const collapseButton = useTemplateRef<ComponentPublicInstance>('collapseButton')
const showButton = useTemplateRef<ComponentPublicInstance>('showButton')

function updateWindowWidth() {
  windowWidth.value = window.innerWidth
}

onMounted(() => {
  panel.value = loadSidePanel()
  updateWindowWidth()
  window.addEventListener('resize', updateWindowWidth)
})
onBeforeUnmount(() => window.removeEventListener('resize', updateWindowWidth))

async function setPanelCollapsed(collapsed: boolean) {
  panel.value = { ...panel.value, collapsed }
  saveSidePanel(panel.value)
  await nextTick()
  ;(collapsed ? showButton : collapseButton).value?.$el.focus()
}

function setPanelWidth(width: number) {
  panel.value = { ...panel.value, width: sidePanelWidth(width, windowWidth.value) }
}

const RESIZE_STEP = 16
const resizing = ref(false)
let resize: { pointerId: number, startX: number, startWidth: number } | null = null

function onResizeStart(event: PointerEvent) {
  if (event.button !== 0) return
  // No text selection while dragging.
  event.preventDefault()
  ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  resize = { pointerId: event.pointerId, startX: event.clientX, startWidth: panelWidth.value }
  resizing.value = true
}

function onResizeMove(event: PointerEvent) {
  if (!resize || event.pointerId !== resize.pointerId) return
  // The panel is on the right: dragging its edge to the left widens it.
  setPanelWidth(resize.startWidth + resize.startX - event.clientX)
}

function onResizeEnd(event: PointerEvent) {
  if (!resize || event.pointerId !== resize.pointerId) return
  resize = null
  resizing.value = false
  saveSidePanel(panel.value)
}

// Window splitter keys: arrows move the edge (Shift for bigger steps), Home and End give the narrowest and widest panel.
function onResizeKey(event: KeyboardEvent) {
  const step = event.shiftKey ? RESIZE_STEP * 4 : RESIZE_STEP
  const width = {
    ArrowLeft: panelWidth.value + step,
    ArrowRight: panelWidth.value - step,
    Home: SIDE_PANEL_WIDTH.min,
    End: panelMaxWidth.value,
  }[event.key]
  if (width === undefined) return
  event.preventDefault()
  setPanelWidth(width)
  saveSidePanel(panel.value)
}

const root = useTemplateRef('root')
const header = useTemplateRef('header')
const topBar = useTemplateRef('topBar')
const topArea = useTemplateRef('topArea')
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

// Map height hidden by an element at the top (the bar, or the bar with the search slot), from the top of the page.
function topInset(element = topBar.value) {
  if (!root.value || !element) return 0
  return element.getBoundingClientRect().bottom - root.value.getBoundingClientRect().top
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

// Maps frame routes and places under the top bar (and search) and above the open sheet. The sheet's half height is used
// when full too: the map is hidden then, and a larger padding than the map itself would break the framing.
provide(MAP_INSET_KEY, () => {
  const top = topInset(topArea.value)
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
    :style="{ '--sheet-height': sheetHeight, '--panel-width': `${panelWidth}px` }"
  >
    <div class="absolute inset-x-0 top-0 bottom-(--sheet-peek) md:static md:min-h-0 md:flex-1">
      <slot name="map" />
    </div>

    <!-- Top left of the map: MapLibre's controls are on the right, the scale and attribution at the bottom.
         The search slot goes under the bar, or beside it when the map is wide enough. -->
    <div
      ref="topArea"
      class="pointer-events-none absolute top-[max(0.75rem,env(safe-area-inset-top))] right-12 left-3 z-10 flex flex-col items-start gap-2 *:pointer-events-auto md:right-auto lg:flex-row lg:items-center"
    >
      <div ref="topBar">
        <MapTopBar :back="back" />
      </div>
      <div v-if="$slots.search" class="w-full md:w-72 lg:w-80">
        <slot name="search" />
      </div>
    </div>

    <!-- Collapsed side panel: its title stays over the map, left of MapLibre's controls, and reopens it. -->
    <div
      v-if="panel.collapsed"
      class="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-14 z-10 hidden max-w-xs items-center gap-1 rounded-lg border border-default bg-default py-1 pr-1 pl-3 shadow-md md:flex"
    >
      <div class="min-w-0 flex-1 truncate font-medium">
        <slot name="title" />
      </div>
      <UButton
        ref="showButton"
        icon="i-lucide-panel-right-open"
        color="neutral"
        variant="ghost"
        :aria-label="t('sheet.show')"
        aria-expanded="false"
        :aria-controls="panelId"
        @click="setPanelCollapsed(false)"
      />
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
      :id="panelId"
      class="absolute inset-x-0 bottom-0 z-10 flex h-(--sheet-height) flex-col rounded-t-xl border-t border-default bg-default shadow-lg md:relative md:h-auto md:w-(--panel-width) md:shrink-0 md:rounded-none md:border-t-0 md:border-l md:shadow-none"
      :class="{ 'transition-[height] duration-200 ease-out motion-reduce:transition-none': dragHeight === null, 'md:hidden': panel.collapsed }"
      :data-sheet="snap"
      :data-panel="panel.collapsed ? 'collapsed' : 'expanded'"
    >
      <!-- Left edge resizing the panel from md up, dragged or moved with the arrow keys; highlighted when used. -->
      <div
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        :aria-label="t('sheet.resize')"
        :aria-controls="panelId"
        :aria-valuenow="panelWidth"
        :aria-valuemin="SIDE_PANEL_WIDTH.min"
        :aria-valuemax="panelMaxWidth"
        class="absolute inset-y-0 -left-1.5 hidden w-3 cursor-col-resize touch-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:transition-colors hover:after:bg-primary focus-visible:after:w-1 focus-visible:after:bg-primary md:block"
        :class="{ 'after:bg-primary': resizing }"
        @pointerdown="onResizeStart"
        @pointermove="onResizeMove"
        @pointerup="onResizeEnd"
        @pointercancel="onResizeEnd"
        @keydown="onResizeKey"
      />

      <!-- Tab on the panel's edge, over the map, collapsing it from md up. -->
      <UButton
        ref="collapseButton"
        icon="i-lucide-chevron-right"
        color="neutral"
        variant="outline"
        class="absolute top-1/2 right-full hidden h-12 -translate-y-1/2 rounded-r-none bg-default px-1 shadow-md ring-default md:flex"
        :aria-label="t('sheet.collapse')"
        aria-expanded="true"
        :aria-controls="panelId"
        @click="setPanelCollapsed(true)"
      />

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
