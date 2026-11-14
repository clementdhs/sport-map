<script setup lang="ts" generic="T extends string">
import type { SportType } from '#shared/utils/routes'

// One-choice filter as a row of chips led by the sports' marks (#232), scrolled sideways when it overflows. The
// chosen chip is pressed, in ink; `toggle` lets a click on it go back to `toggle`'s value (e.g. every sport).
const model = defineModel<T>({ required: true })
const props = defineProps<{
  items: { value: T, label: string, sport?: SportType }[]
  label: string
  toggle?: T
}>()

function pick(value: T) {
  model.value = value === model.value && props.toggle !== undefined ? props.toggle : value
}
</script>

<template>
  <div role="group" :aria-label="label" class="-mx-1 flex gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none]">
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      :aria-pressed="item.value === model"
      class="flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="item.value === model
        ? 'border-(--ui-border-inverted) bg-inverted text-inverted'
        : 'border-accented bg-default text-highlighted hover:bg-elevated'"
      @click="pick(item.value)"
    >
      <SportMark v-if="item.sport" :sport="item.sport" />
      {{ item.label }}
    </button>
  </div>
</template>
