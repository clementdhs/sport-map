<script setup lang="ts">
// The language, on the settings page (visitors and the account menu use a dropdown).
const { t, locale, locales, setLocale } = useI18n()
const items = computed(() => locales.value.map(item => ({ label: item.name ?? item.code, value: item.code })))
</script>

<template>
  <UFormField :label="t('language.label')">
    <USelect :model-value="locale" :items="items" class="w-48" @update:model-value="setLocale" />
  </UFormField>
</template>
