<script setup lang="ts">
import type { NuxtError } from '#app'
import { en, fr } from '@nuxt/ui/locale'

const props = defineProps<{ error: NuxtError }>()

const { t, locale } = useI18n()
const uiLocales = { fr, en }
useSeoMeta({ title: () => `${props.error.statusMessage ?? t('error.title')} — sport-map` })
</script>

<template>
  <UApp :locale="uiLocales[locale]">
    <AppHeader />
    <UError :error="error" />
  </UApp>
</template>
