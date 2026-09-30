<script setup lang="ts">
const { t } = useI18n()
const items = useLanguageItems()
</script>

<template>
  <UDropdownMenu :items="items">
    <UButton icon="i-lucide-languages" color="neutral" variant="ghost" :aria-label="t('language.label')" />
  </UDropdownMenu>
</template>
