<script setup lang="ts">
// "Vous êtes ici · place · alt. 22 m" (#229), the plate of a trailhead sign board under a yellow band. The
// altitude is left out when unknown.
defineProps<{
  place: string
  altitudeM?: number | null
}>()

const { t } = useI18n()
</script>

<template>
  <p class="inline-flex flex-col overflow-hidden rounded-[3px] border border-(--mark-edge) bg-default text-highlighted">
    <span class="h-1 bg-(--sign)" aria-hidden="true" />
    <span class="px-2.5 py-1 text-xs font-medium">
      {{ t('signage.here') }} · <strong class="font-semibold">{{ place }}</strong><template v-if="altitudeM != null"> · {{ t('signage.altitude', { altitude: Math.round(altitudeM) }) }}</template>
    </span>
  </p>
</template>
