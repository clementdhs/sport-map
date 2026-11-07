<script setup lang="ts">
// An estimated duration on a yellow direction sign (#229), as on hiking signposts. The text says it all (the
// yellow is only a reminder): screen readers hear "Durée estimée : 2 h 35". Nothing without a duration.
const props = withDefaults(defineProps<{
  minutes: number | null
  size?: 'sm' | 'md'
}>(), { size: 'md' })

const { t } = useI18n()
const label = computed(() => props.minutes === null ? '' : formatDuration(props.minutes))
</script>

<template>
  <span v-if="minutes !== null" class="duration-sign inline-block shrink-0 bg-(--sign-edge)" :class="size">
    <span class="flex items-center bg-(--sign) font-numbers font-bold whitespace-nowrap text-(--sign-text) tabular-nums">
      <span aria-hidden="true">{{ label }}</span>
      <span class="sr-only">{{ t('signage.duration', { duration: label }) }}</span>
    </span>
  </span>
</template>

<style scoped>
/* The ink outline is the outer shape showing 1.5px around the inner one. */
.duration-sign {
  --tip: 12px;
  padding: 1.5px;
  clip-path: polygon(0 0, calc(100% - var(--tip)) 0, 100% 50%, calc(100% - var(--tip)) 100%, 0 100%);
}
.duration-sign > span {
  height: 1.75rem;
  padding: 0 calc(var(--tip) + 0.375rem) 0 0.5rem;
  font-size: 1rem;
  clip-path: polygon(0 0, calc(100% - var(--tip) + 1px) 0, 100% 50%, calc(100% - var(--tip) + 1px) 100%, 0 100%);
}
.duration-sign.md {
  --tip: 14px;
}
.duration-sign.md > span {
  height: 2.125rem;
  padding: 0 calc(var(--tip) + 0.5rem) 0 0.625rem;
  font-size: 1.1875rem;
}
</style>
