<script setup lang="ts">
// "Importer des sorties" (#268): a UButton (its props through $attrs) that picks GPX, FIT or TCX files and imports
// each as an outing (`OutingImport`), with `drop` also from files dropped on the page (#138). The page's data is
// fetched again once the summary is closed, so its statistics and the coach's form count the new outings.
defineOptions({ inheritAttrs: false })
defineProps<{ drop?: boolean }>()

const outingImport = useTemplateRef('outingImport')
</script>

<template>
  <UButton v-bind="$attrs" :loading="outingImport?.running" @click="outingImport?.pick()" />
  <OutingImport ref="outingImport" :drop="drop" @imported="refreshNuxtData()" />
</template>
