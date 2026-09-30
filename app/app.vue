<script setup lang="ts">
import { en, fr } from '@nuxt/ui/locale'

// Nuxt UI's own texts (date pickers, pagination…) and <html lang> follow the app's language.
const { locale } = useI18n()
const uiLocales = { fr, en }
useHead({ htmlAttrs: { lang: locale } })
</script>

<template>
  <UApp :locale="uiLocales[locale]">
    <NuxtPwaManifest />
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
