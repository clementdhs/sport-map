<script setup lang="ts">
import type { NuxtError } from '#app'
import { fr } from '@nuxt/ui/locale'

const props = defineProps<{ error: NuxtError }>()

useSeoMeta({ title: () => `${props.error.statusMessage ?? 'Erreur'} — sport-map` })
</script>

<template>
  <UApp :locale="fr">
    <AppHeader />
    <UError :error="error" />
  </UApp>
</template>
