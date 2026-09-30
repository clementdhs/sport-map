<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { t } = useI18n()
useSeoMeta({ title: () => `${t('header.create')} — sport-map` })

// The editor store may still hold a route being edited: start from a blank draft instead.
const editor = useRouteEditorStore()
if (editor.editingId) editor.reset()
</script>

<template>
  <RouteEditorWorkspace :submit-label="t('editor.submitCreate')" />
</template>
