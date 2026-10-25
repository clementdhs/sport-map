<script setup lang="ts">
import type { NuxtError } from '#app'
import { en, fr } from '@nuxt/ui/locale'

const props = defineProps<{ error: NuxtError }>()

const { t, locale } = useI18n()
const uiLocales = { fr, en }
useSeoMeta({ title: () => `${props.error.statusMessage ?? t('error.title')} — sportmap` })
</script>

<template>
  <UApp :locale="uiLocales[locale]">
    <AppHeader />
    <UError :error="error" class="max-md:pb-[calc(4rem+env(safe-area-inset-bottom))]" />
    <AppTabBar class="fixed inset-x-0 bottom-0 z-40 md:hidden" />
  </UApp>
</template>
