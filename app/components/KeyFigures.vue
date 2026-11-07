<script setup lang="ts">
import type { KeyFigure } from '~/utils/keyFigures'

// A route's key figures in a ruled cartouche, as on the legend of a topographic map (#229). One cell can be
// highlighted on the yellow of the signs (the duration): its label still says what it is.
defineProps<{
  figures: KeyFigure[]
}>()
</script>

<template>
  <dl
    class="grid overflow-hidden rounded-[4px] border-[1.5px] border-(--mark-edge) bg-default"
    :style="{ gridTemplateColumns: `repeat(${figures.length}, minmax(0, 1fr))` }"
  >
    <div
      v-for="figure in figures"
      :key="figure.label"
      class="flex min-w-0 flex-col justify-between gap-0.5 border-accented py-2 ps-2.5 pe-1 not-first:border-s"
      :class="figure.highlight ? 'bg-(--sign) text-(--sign-text)' : 'text-highlighted'"
    >
      <dt
        class="flex items-center gap-1 text-[0.625rem] leading-tight font-bold tracking-wide uppercase"
        :class="figure.highlight ? 'text-(--sign-text)' : 'text-muted'"
      >
        <span class="min-w-0 break-words">{{ figure.label }}</span>
        <UTooltip v-if="figure.hint" :text="figure.hint" :ui="{ content: 'h-auto max-w-64 py-1.5', text: 'whitespace-normal' }">
          <UIcon name="i-lucide-info" class="size-3.5 shrink-0" tabindex="0" :aria-label="figure.hint" />
        </UTooltip>
      </dt>
      <!-- Where a long figure leaves no room (100 km and more, outdoor readability), the unit goes under it. The
           space between them only shows to screen readers and copies ("650 m"). -->
      <dd class="flex flex-wrap items-baseline gap-x-0.5 font-numbers text-lg leading-tight font-semibold tabular-nums">
        <span>{{ figure.value }}</span>{{ ' ' }}<span
          v-if="figure.unit"
          class="font-sans text-sm font-medium"
          :class="figure.highlight ? 'text-(--sign-text)' : 'text-muted'"
        >{{ figure.unit }}</span>
      </dd>
    </div>
  </dl>
</template>
