<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Créer un parcours — sport-map' })

// The editor store may still hold a route being edited: start from a blank draft instead.
const editor = useRouteEditorStore()
if (editor.editingId) editor.reset()
</script>

<template>
  <RouteEditorWorkspace submit-label="Enregistrer le parcours" />
</template>
