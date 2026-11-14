<script setup lang="ts">
// The start of the automatic loops (#215, #234), shared by the loop and session modes of the Créer panel: the map's
// yellow square, "Ma position" and "Déplacer".
const props = defineProps<{
  // Locating the start for the panel itself (the session mode opened from the coach page)
  busy?: boolean
}>()

const loop = useLoopGeneratorStore()
const { t } = useI18n()
const { locating, locate } = useCurrentPosition()
</script>

<template>
  <!-- The start as on the map: the yellow square of a route's start. -->
  <div class="flex items-center gap-2.5 rounded-md border border-default bg-default py-2 ps-3 pe-2">
    <span class="size-3.5 shrink-0 rounded-[3px] border-2 border-(--sign-edge) bg-(--sign) dark:border-(--ui-border-inverted)" aria-hidden="true" />
    <p class="min-w-0 flex-1">
      <span class="block text-[0.6875rem] font-bold tracking-wider text-muted uppercase">{{ t('loop.start') }}</span>
      <span class="block text-sm font-semibold text-highlighted">{{ loop.start ? t('loop.startPlaced') : t('loop.noStart') }}</span>
    </p>
    <UTooltip :text="t('loop.myPosition')">
      <UButton
        icon="i-lucide-locate-fixed"
        color="neutral"
        variant="ghost"
        :aria-label="t('loop.myPosition')"
        :loading="locating || props.busy"
        @click="locate(loop.setStart)"
      />
    </UTooltip>
    <UButton
      v-if="loop.start && !loop.placingStart"
      :label="t('loop.pickOnMap')"
      color="neutral"
      variant="outline"
      class="ring-(--ui-border-inverted)"
      @click="loop.placingStart = true"
    />
  </div>
</template>
