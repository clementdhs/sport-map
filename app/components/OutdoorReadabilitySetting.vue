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
    data-testid="outdoor-readability"
    @update:model-value="setOutdoor"
  />
</template>
