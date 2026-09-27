<script setup lang="ts">
// Read-only stars, partially filled for averages (e.g. 4.3).
const props = defineProps<{
  value: number
}>()

const filled = computed(() => `${Math.max(0, Math.min(5, props.value)) * 20}%`)
</script>

<template>
  <span class="relative inline-block leading-none tracking-tight" role="img" :aria-label="`Note : ${formatRating(value)} sur 5`">
    <span class="text-muted/40" aria-hidden="true">★★★★★</span>
    <span class="absolute inset-y-0 left-0 overflow-hidden whitespace-nowrap text-amber-500" :style="{ width: filled }" aria-hidden="true">★★★★★</span>
  </span>
</template>
