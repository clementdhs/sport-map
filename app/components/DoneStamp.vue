<script setup lang="ts">
// The member's "Fait ×N" stamp on a route they already did (#229), tilted like an ink stamp in a log book. N is
// their outings on it; nothing when they never did it. The parent places it (`absolute`, its corner); its ring
// is cut out of `--stamp-bg`, the surface under it (the card's surface by default).
withDefaults(defineProps<{
  count: number
  size?: 'md' | 'lg'
}>(), { size: 'md' })

const { t } = useI18n()
</script>

<template>
  <span
    v-if="count > 0"
    class="done-stamp flex rotate-12 flex-col items-center justify-center rounded-full border-2 border-(--stamp) font-display leading-none font-bold tracking-wide text-(--stamp) uppercase select-none"
    :class="size === 'lg' ? 'size-15.5 text-sm' : 'size-13.5 text-[0.8125rem]'"
  >
    <span aria-hidden="true">{{ t('signage.done') }}</span>
    <span aria-hidden="true" :class="size === 'lg' ? 'text-lg' : 'text-base'">×{{ count }}</span>
    <span class="sr-only">{{ t('signage.doneTimes', count) }}</span>
  </span>
</template>

<style scoped>
.done-stamp {
  background: var(--stamp-bg, var(--ui-bg));
  box-shadow: inset 0 0 0 3px var(--stamp-bg, var(--ui-bg)), inset 0 0 0 4px var(--stamp);
}
</style>
