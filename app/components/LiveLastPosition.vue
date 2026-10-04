<script setup lang="ts">
// When a sharing member's latest position was taken, highlighted once it gets old (no network, phone stopped).
const props = defineProps<{
  lastFixedAt: string | null
  // Current time (ms), null until mounted: "x min ago" isn't rendered on the server.
  now: number | null
}>()
const { t } = useI18n()
const { formatTime } = useFormat()

const stale = computed(() => !!props.lastFixedAt && props.now !== null && liveIsStale(props.lastFixedAt, props.now))
const text = computed(() => {
  if (!props.lastFixedAt) return t('live.noPosition')
  const time = formatTime(props.lastFixedAt)
  if (props.now === null) return t('live.lastPositionAt', { time })
  const ago = formatElapsed(Math.max(0, props.now - Date.parse(props.lastFixedAt)) / 1000)
  return t('live.lastPosition', { time, ago })
})
</script>

<template>
  <p class="flex items-center gap-1.5 text-sm" :class="stale ? 'font-medium text-warning' : 'text-muted'" data-testid="live-last-position">
    <UIcon :name="stale ? 'i-lucide-triangle-alert' : 'i-lucide-clock'" class="size-4 shrink-0" />
    <span>{{ text }}</span>
  </p>
</template>
