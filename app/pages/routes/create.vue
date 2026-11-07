<script setup lang="ts">
// Full-screen map page (the editor's MapSheetLayout): no header nor tab bar, a floating top bar.
definePageMeta({ layout: false })
const { t } = useI18n()
useSeoMeta({ title: () => `${t('header.create')} — sportmap` })

// The editor store may still hold a route being edited: start from a blank draft instead.
const editor = useRouteEditorStore()
if (editor.editingId) editor.reset()
</script>

<template>
  <RouteEditorWorkspace :submit-label="t('editor.submitCreate')" back="/" remember-mode />
</template>
