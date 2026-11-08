<script setup lang="ts">
// "Lisibilité en extérieur" in the settings (#149): larger text and stronger contrast, kept in the account.
const { t } = useI18n()
const { outdoor, setOutdoor } = useOutdoorReadability()
</script>

<template>
  <USwitch
    :model-value="outdoor"
    :label="t('readability.label')"
    :description="t('readability.hint')"
    size="lg"
    :ui="{ root: 'flex-row-reverse justify-between gap-4', wrapper: 'ms-0' }"
    data-testid="outdoor-readability"
    @update:model-value="setOutdoor"
  />
</template>
