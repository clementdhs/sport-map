<script setup lang="ts">
// Follow mode's signpost (#235): "Arrivée · 6,05 km · 1 h 57" on a yellow direction sign, like `DurationSign`, read
// at a glance while moving. Screen readers hear one sentence; the duration is left out when unknown or arrived.
const props = defineProps<{
  // What is left of the route, formatted
  distance: string
  minutes: number | null
}>()

const { t } = useI18n()
const duration = computed(() => (props.minutes === null ? null : formatDuration(props.minutes)))
</script>

<template>
  <p class="arrival-sign inline-block bg-(--sign-edge)">
    <span class="flex items-center gap-2 bg-(--sign) font-numbers text-lg font-bold whitespace-nowrap text-(--sign-text) tabular-nums" aria-hidden="true">
      <span class="font-sans text-sm font-semibold">{{ t('follow.arrival') }}</span>
      <span data-testid="remaining">{{ distance }}</span>
      <template v-if="duration">
        <span>·</span>
        <span>{{ duration }}</span>
      </template>
    </span>
    <span class="sr-only">{{ duration ? t('follow.arrivalIn', { distance, duration }) : t('follow.arrivalAt', { distance }) }}</span>
  </p>
</template>

<style scoped>
/* The ink outline is the outer shape showing 1.5px around the inner one, as on DurationSign. */
.arrival-sign {
  --tip: 16px;
  padding: 1.5px;
  clip-path: polygon(0 0, calc(100% - var(--tip)) 0, 100% 50%, calc(100% - var(--tip)) 100%, 0 100%);
}
.arrival-sign > span {
  height: 2.5rem;
  padding: 0 calc(var(--tip) + 0.625rem) 0 0.75rem;
  clip-path: polygon(0 0, calc(100% - var(--tip) + 1px) 0, 100% 50%, calc(100% - var(--tip) + 1px) 100%, 0 100%);
}
</style>
