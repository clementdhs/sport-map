<script setup lang="ts">
// Shortcut to outdoor readability (#149) in the top bar of follow mode and recording, where the sun bites.
const { t } = useI18n()
const { outdoor, setOutdoor } = useOutdoorReadability()
</script>

<template>
  <UButton
    icon="i-lucide-a-large-small"
    :aria-label="t('readability.label')"
    :title="t('readability.label')"
    :aria-pressed="outdoor"
    :color="outdoor ? 'primary' : 'neutral'"
    variant="solid"
    class="shrink-0 shadow-md"
    data-testid="outdoor-readability-toggle"
    @click="setOutdoor(!outdoor)"
  />
</template>
