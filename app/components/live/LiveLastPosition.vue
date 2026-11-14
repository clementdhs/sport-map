<script setup lang="ts">
// When a sharing member's latest position was taken, highlighted once it gets old (no network, phone stopped).
// `compact` (the /live cards, #237) only says how long ago, the time staying in the tooltip.
const props = defineProps<{
  lastFixedAt: string | null
  // Current time (ms), null until mounted: "x min ago" isn't rendered on the server.
  now: number | null
  compact?: boolean
}>()
const { t } = useI18n()
const { formatTime } = useFormat()

const stale = computed(() => !!props.lastFixedAt && props.now !== null && liveIsStale(props.lastFixedAt, props.now))
const time = computed(() => (props.lastFixedAt ? formatTime(props.lastFixedAt) : null))
const ago = computed(() => (props.lastFixedAt && props.now !== null
  ? formatElapsed(Math.max(0, props.now - Date.parse(props.lastFixedAt)) / 1000)
  : null))
const text = computed(() => {
  if (!time.value) return t('live.noPosition')
  if (props.compact) return ago.value ? t('live.ago', { ago: ago.value }) : time.value
  if (!ago.value) return t('live.lastPositionAt', { time: time.value })
  return t('live.lastPosition', { time: time.value, ago: ago.value })
})
</script>

<template>
  <p
    class="flex items-center gap-1.5"
    :class="[stale ? 'font-medium text-warning' : 'text-muted', compact ? 'justify-end text-xs' : 'text-sm']"
    :title="compact && time ? t('live.lastPositionAt', { time }) : undefined"
    data-testid="live-last-position"
  >
    <UIcon v-if="!compact || stale" :name="stale ? 'i-lucide-triangle-alert' : 'i-lucide-clock'" :class="compact ? 'size-3.5 shrink-0' : 'size-4 shrink-0'" />
    <span>{{ text }}</span>
  </p>
</template>
