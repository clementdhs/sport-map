<script setup lang="ts">
import type { KeyFigure } from '~/utils/keyFigures'

// A route's key figures in a ruled cartouche, as on the legend of a topographic map (#229). One cell can be
// highlighted on the yellow of the signs (the duration): its label still says what it is.
// `columns`: cells wrap onto rows of that many (one row by default). `fill` (the live data screen, #235): rows share
// the cartouche's height and figures grow with their cell, read at arm's length.
const props = defineProps<{
  figures: KeyFigure[]
  columns?: number
  fill?: boolean
}>()

const perRow = computed(() => props.columns ?? props.figures.length)
// Ruled between columns and between rows; the last cell of an odd count of two columns takes the whole row.
function cellClass(index: number) {
  return [
    index % perRow.value !== 0 && 'border-s',
    index >= perRow.value && 'border-t',
    perRow.value === 2 && index === props.figures.length - 1 && index % 2 === 0 && 'col-span-2',
  ]
}
</script>

<template>
  <dl
    class="grid overflow-hidden rounded-[4px] border-[1.5px] border-(--mark-edge) bg-default"
    :class="fill && 'auto-rows-fr'"
    :style="{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }"
  >
    <div
      v-for="(figure, index) in figures"
      :key="figure.label"
      class="flex min-w-0 flex-col gap-0.5 border-accented ps-2.5 pe-1"
      :class="[
        cellClass(index),
        figure.highlight ? 'bg-(--sign) text-(--sign-text)' : 'text-highlighted',
        fill ? 'min-h-0 justify-center overflow-hidden py-1 [container-type:size]' : 'justify-between py-2',
      ]"
      :data-field="figure.id"
    >
      <dt
        class="flex items-center gap-1 leading-tight font-bold tracking-wide uppercase"
        :class="[figure.highlight ? 'text-(--sign-text)' : 'text-muted', fill ? 'text-[min(0.875rem,14cqh)]' : 'text-[0.625rem]']"
      >
        <span class="min-w-0 break-words" :class="fill && 'truncate'">{{ figure.label }}</span>
        <UTooltip v-if="figure.hint" :text="figure.hint" :ui="{ content: 'h-auto max-w-64 py-1.5', text: 'whitespace-normal' }">
          <UIcon name="i-lucide-info" class="size-3.5 shrink-0" tabindex="0" :aria-label="figure.hint" />
        </UTooltip>
      </dt>
      <!-- Where a long figure leaves no room (100 km and more, outdoor readability), the unit goes under it. The
           space between them only shows to screen readers and copies ("650 m"). Filling a cell, the figure is
           sized by both its width and height instead, on one line. -->
      <dd
        class="flex items-baseline gap-x-0.5 font-numbers leading-tight font-semibold tabular-nums"
        :class="fill ? 'text-[min(26cqw,48cqh,4rem)] leading-none whitespace-nowrap' : 'flex-wrap text-lg'"
      >
        <span data-testid="key-figure-value">{{ figure.value }}</span>{{ ' ' }}<span
          v-if="figure.unit"
          class="font-sans font-medium"
          :class="[figure.highlight ? 'text-(--sign-text)' : 'text-muted', fill ? 'text-[min(8cqw,16cqh,1.25rem)]' : 'text-sm']"
        >{{ figure.unit }}</span>
      </dd>
    </div>
  </dl>
</template>
