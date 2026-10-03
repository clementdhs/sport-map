<script setup lang="ts">
// Map page: MapSheetLayout replaces the header with its floating top bar.
definePageMeta({ layout: false })
const { t } = useI18n()
useSeoMeta({ title: () => `${t('header.create')} — sport-map` })

// The editor store may still hold a route being edited: start from a blank draft instead.
const editor = useRouteEditorStore()
if (editor.editingId) editor.reset()
</script>

<template>
  <RouteEditorWorkspace :submit-label="t('editor.submitCreate')" back="/" />
</template>
