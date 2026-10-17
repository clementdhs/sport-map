<script setup lang="ts">
import type { ClassShare } from '#shared/utils/wayInfo'

// How a route's length splits between classes (surface, trail difficulty): a bar, and a legend that gives every
// class's name and share, so it reads without the colours.
const props = defineProps<{
  title: string
  classes: readonly { key: string, color: string }[]
  shares: ClassShare[]
  // Translation key prefix of the class names
  labels: string
}>()

const { t } = useI18n()
const { formatNumber } = useFormat()
const id = useId()

const items = computed(() => props.shares.map(({ cls, share }) => ({
  ...props.classes[cls]!,
  // Rounded: server and client compute the shares from distances that differ in the last float digits, and the full
  // value in the inline style would be a hydration mismatch.
  grow: Math.round(share * 10000) / 10000,
  // Under 1 %, "0 %" would read as absent.
  percent: share < 0.01 ? `< ${formatNumber(0.01, { style: 'percent' })}` : formatNumber(share, { style: 'percent', maximumFractionDigits: 0 }),
})))
</script>

<template>
  <section class="space-y-1.5" :aria-labelledby="id">
    <h2 :id="id" class="text-sm font-medium">{{ title }}</h2>
    <div class="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
      <span v-for="item in items" :key="item.key" class="min-w-0.5" :style="{ flex: `${item.grow} 1 0`, backgroundColor: item.color }" />
    </div>
    <ul class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      <li v-for="item in items" :key="item.key" class="flex items-center gap-1">
        <span class="h-1 w-4 rounded-full" :style="{ backgroundColor: item.color }" aria-hidden="true" />
        {{ t(`${labels}.${item.key}`) }}
        <span class="font-medium text-default">{{ item.percent }}</span>
      </li>
    </ul>
  </section>
</template>
