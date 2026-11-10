<script setup lang="ts">
import type { SportType } from '#shared/utils/routes'

// "Sport par défaut" in the settings (#148): preselected in the editor and when saving an outing, offered as a
// quick filter on the home page, or none.
const { t } = useI18n()
const defaultSport = usePreference('defaultSport')
const sports = useSportItems()
// The select can't hold null.
const NONE = 'none'
const items = computed(() => [{ value: NONE, label: t('settings.defaultSport.none'), icon: 'i-lucide-circle-off' }, ...sports.value])
const selected = computed({
  get: () => defaultSport.value ?? NONE,
  set: (value: SportType | typeof NONE) => {
    defaultSport.value = value === NONE ? null : value
  },
})
</script>

<template>
  <UFormField :label="t('settings.defaultSport.label')" orientation="horizontal" :ui="{ root: 'flex-wrap items-center' }">
    <USelect id="default-sport" v-model="selected" :items="items" class="w-56 max-w-full" />
  </UFormField>
</template>
