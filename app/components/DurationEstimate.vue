<script setup lang="ts">
import type { SportType } from '#shared/utils/routes'

const props = defineProps<{
  sport: SportType
  distanceM: number
  elevationGainM: number | null
}>()

const minutes = computed(() => estimateDurationMin(props.sport, props.distanceM, props.elevationGainM))
const method = computed(() => props.elevationGainM === null
  ? `${DURATION_METHODS[props.sport]} Dénivelé inconnu : non pris en compte.`
  : DURATION_METHODS[props.sport])
</script>

<template>
  <div>
    <p class="flex items-center gap-1 text-sm text-muted">
      Durée estimée
      <UTooltip :text="method" :ui="{ content: 'h-auto max-w-64 py-1.5', text: 'whitespace-normal' }">
        <UIcon name="i-lucide-info" class="size-3.5" tabindex="0" :aria-label="method" />
      </UTooltip>
    </p>
    <p class="text-lg font-semibold">~{{ formatDuration(minutes) }}</p>
  </div>
</template>
